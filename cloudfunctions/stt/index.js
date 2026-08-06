const cloud = require('wx-server-sdk');
const WebSocket = require('ws');
const zlib = require('zlib');
const crypto = require('crypto');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

// 火山一句话识别 WebSocket 接口
const ASR_WSS_URL = 'wss://openspeech.bytedance.com/api/v2/asr';

function cleanEnv(raw) {
  if (!raw) return '';
  return String(raw).replace(/[\r\n\t]/g, '').trim();
}

const VOLC_ASR_APP_ID = cleanEnv(process.env.VOLC_ASR_APP_ID);
const VOLC_ASR_ACCESS_TOKEN = cleanEnv(process.env.VOLC_ASR_ACCESS_TOKEN);
const VOLC_ASR_CLUSTER = cleanEnv(process.env.VOLC_ASR_CLUSTER);

// 4 字节二进制 header
// byte0: version(4) | header_size(4) = 0x11
// byte1: message_type(4) | flags(4)
// byte2: serialization(4) | compression(4)
// byte3: reserved = 0x00
function buildHeader(messageType, flags, serialization, compression) {
  const b0 = 0x11;
  const b1 = ((messageType & 0x0F) << 4) | (flags & 0x0F);
  const b2 = ((serialization & 0x0F) << 4) | (compression & 0x0F);
  const b3 = 0x00;
  return Buffer.from([b0, b1, b2, b3]);
}

function buildMessage(messageType, flags, serialization, compression, payload) {
  const header = buildHeader(messageType, flags, serialization, compression);
  const size = Buffer.alloc(4);
  size.writeUInt32BE(payload.length, 0);
  return Buffer.concat([header, size, payload]);
}

async function recognize(audioBuffer, format, rate) {
  const reqid = crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36);

  const payloadObj = {
    app: {
      appid: VOLC_ASR_APP_ID,
      token: VOLC_ASR_ACCESS_TOKEN,
      cluster: VOLC_ASR_CLUSTER
    },
    user: { uid: 'habit-miniprogram' },
    audio: {
      format: format,
      rate: rate,
      bits: 16,
      channel: 1,
      language: 'zh-CN'
    },
    request: {
      reqid: reqid,
      workflow: 'audio_in,resample,partition,vad,fe,decode,itn,nlu_punctuate',
      sequence: 1,
      nbest: 1,
      show_utterances: true
    }
  };

  const jsonBuf = Buffer.from(JSON.stringify(payloadObj), 'utf8');
  const compressedJson = zlib.gzipSync(jsonBuf);

  console.log('asr request', {
    reqid: reqid,
    audioSize: audioBuffer.length,
    format: format,
    cluster: VOLC_ASR_CLUSTER,
    appIdConfigured: !!VOLC_ASR_APP_ID
  });

  return new Promise((resolve, reject) => {
    const ws = new WebSocket(ASR_WSS_URL, {
      headers: { 'Authorization': 'Bearer; ' + VOLC_ASR_ACCESS_TOKEN }
    });

    let finalText = '';
    let settled = false;
    let timeout;

    const finish = (fn) => {
      if (settled) return;
      settled = true;
      if (timeout) clearTimeout(timeout);
      try { ws.close(); } catch (e) {}
      fn();
    };

    timeout = setTimeout(() => finish(() => reject(new Error('ASR WebSocket 超时（25s）'))), 25000);

    ws.on('open', () => {
      console.log('ws open');
      // 1. 发送 full client request（JSON + Gzip）
      const fullReq = buildMessage(0x01, 0x00, 0x01, 0x01, compressedJson);
      ws.send(fullReq);

      // 2. 分片发送 audio only request，最后一包 flags=0x02
      const chunkSize = 8000;
      let offset = 0;
      while (offset < audioBuffer.length) {
        const end = Math.min(offset + chunkSize, audioBuffer.length);
        const chunk = audioBuffer.slice(offset, end);
        const isLast = end >= audioBuffer.length;
        const audioMsg = buildMessage(
          0x02,
          isLast ? 0x02 : 0x00,
          0x00,
          0x01,
          zlib.gzipSync(chunk)
        );
        ws.send(audioMsg);
        offset = end;
      }
      console.log('audio sent, chunks=', Math.ceil(audioBuffer.length / chunkSize));
    });

    ws.on('message', (data) => {
      const header = data.slice(0, 4);
      const msgType = (header[1] >> 4) & 0x0F;
      const serialization = (header[2] >> 4) & 0x0F;
      const compression = header[2] & 0x0F;

      if (msgType === 0x09) {
        // full server response
        const payloadSize = data.readUInt32BE(4);
        let payload = data.slice(8, 8 + payloadSize);
        if (compression === 0x01) {
          try { payload = zlib.gunzipSync(payload); } catch (e) {}
        }
        let json;
        try { json = JSON.parse(payload.toString('utf8')); }
        catch (e) {
          console.error('json parse fail:', payload.toString('utf8').slice(0, 200));
          return;
        }
        console.log('asr response', JSON.stringify(json).slice(0, 800));

        if (json.code === 1013) {
          // 1013 = 音频静音/无有效语音，正常情况，返回空文本
          if (json.sequence < 0) finish(() => resolve(''));
          return;
        }
        if (json.code !== 1000) {
          finish(() => reject(new Error(`ASR ${json.code}: ${json.message || ''}`)));
          return;
        }
        if (json.result && json.result.length > 0) {
          const r = json.result[0];
          if (r.text) finalText = r.text;
        }
        if (json.sequence < 0) {
          finish(() => resolve(finalText));
        }
      } else if (msgType === 0x0F) {
        // server error
        const errorCode = data.readUInt32BE(4);
        const errorMsgSize = data.readUInt32BE(8);
        const errorMsg = data.slice(12, 12 + errorMsgSize).toString('utf8');
        console.error('ws server error', { errorCode, errorMsg });
        finish(() => reject(new Error(`ASR 错误 ${errorCode}: ${errorMsg}`)));
      } else {
        console.log('unknown msg type:', msgType.toString(16));
      }
    });

    ws.on('error', (err) => {
      console.error('ws error:', err.message || err);
      finish(() => reject(err));
    });

    ws.on('close', (code, reason) => {
      console.log('ws close', { code, reason: reason.toString() });
      finish(() => {
        if (finalText) resolve(finalText);
        else reject(new Error(`ASR 连接关闭 code=${code} reason=${reason.toString()}`));
      });
    });
  });
}

exports.main = async (event) => {
  const fileID = event && event.fileID;
  if (!fileID) return { error: '缺少 fileID' };

  if (!VOLC_ASR_APP_ID || !VOLC_ASR_ACCESS_TOKEN) {
    return { error: '云函数缺少环境变量 VOLC_ASR_APP_ID / VOLC_ASR_ACCESS_TOKEN' };
  }
  if (!VOLC_ASR_CLUSTER) {
    return { error: '云函数缺少环境变量 VOLC_ASR_CLUSTER（即控制台 Cluster ID 字段）' };
  }

  try {
    const down = await cloud.downloadFile({ fileID });
    const buffer = down.fileContent;
    if (!buffer || buffer.length === 0) return { error: '语音文件为空' };

    const text = await recognize(buffer, 'mp3', 16000);
    if (text) return { text: text };
    return { error: '没有识别到内容' };
  } catch (err) {
    console.error('stt error:', err);
    return { error: err.message || String(err) };
  }
};
