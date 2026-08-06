// 保存当前用户的聊天记录到独立集合 chat_history（一用户一文档，整包 upsert）。
// messages 由前端 store 已裁剪，这里再兜底裁一次，防止异常调用写入超大文档。
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

const CHAT_COLL = 'chat_history';
const MAX_MESSAGES = 60;
const MAX_CONTENT = 3000;

function trimStr(s) {
  if (typeof s !== 'string') return s;
  return s.length > MAX_CONTENT ? s.slice(0, MAX_CONTENT) + '…(截断)' : s;
}

function normalize(messages) {
  if (!Array.isArray(messages)) return [];
  return messages.slice(-MAX_MESSAGES).map(m => ({
    // 兼容早期格式：role 'ai'→'assistant'，正文字段 text→content
    role: m.role === 'ai' ? 'assistant' : m.role,
    content: trimStr(m.content != null ? m.content : m.text) || '',
    time: m.time
  }));
}

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();
  if (!OPENID) return { ok: false, error: 'no openid' };

  const messages = normalize(event && event.messages);
  const record = { messages: messages, updatedAt: new Date().toISOString() };

  try {
    const res = await db.collection(CHAT_COLL).doc(OPENID).update({ data: record });
    if (res && res.stats && res.stats.updated > 0) {
      return { ok: true, mode: 'update', count: messages.length };
    }
    await db.collection(CHAT_COLL).add({ data: Object.assign({ _id: OPENID }, record) });
    return { ok: true, mode: 'create', count: messages.length };
  } catch (e) {
    return { ok: false, error: e.errMsg || String(e) };
  }
};
