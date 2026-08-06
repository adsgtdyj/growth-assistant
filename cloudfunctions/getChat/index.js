// 读取当前用户的聊天记录（独立集合 chat_history，一用户一文档）。
// 懒迁移：chat_history 里没有该用户时，尝试从旧的 users_data.chatHistory 搬过来，
// 迁移成功后把 users_data 里的 chatHistory 清空，回收单文档空间。
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

const CHAT_COLL = 'chat_history';

function isNotFound(e) {
  return e && (e.errCode === -1 || (e.errMsg && e.errMsg.indexOf('not exist') !== -1));
}

exports.main = async () => {
  const { OPENID } = cloud.getWXContext();
  if (!OPENID) return { ok: false, error: 'no openid' };

  // 1) 优先读独立集合
  try {
    const res = await db.collection(CHAT_COLL).doc(OPENID).get();
    const messages = (res.data && Array.isArray(res.data.messages)) ? res.data.messages : [];
    return { ok: true, messages: messages };
  } catch (e) {
    if (!isNotFound(e)) {
      return { ok: false, error: e.errMsg || String(e) };
    }
  }

  // 2) 独立集合无记录 → 尝试从 users_data.chatHistory 懒迁移
  let legacyChat = [];
  try {
    const u = await db.collection('users_data').doc(OPENID).get();
    if (u.data && Array.isArray(u.data.chatHistory)) {
      legacyChat = u.data.chatHistory;
    }
  } catch (e) {
    // users_data 也不存在，纯新用户，返回空
    return { ok: true, messages: [] };
  }

  if (legacyChat.length === 0) {
    return { ok: true, messages: [] };
  }

  // 归一化早期格式：role 'ai'→'assistant'，正文字段 text→content，防止迁移丢正文
  const normalized = legacyChat.map(m => ({
    role: m.role === 'ai' ? 'assistant' : m.role,
    content: (m.content != null ? m.content : m.text) || '',
    time: m.time
  }));

  // 迁移：写入独立集合 + 清空旧字段（失败不阻塞返回）
  try {
    await db.collection(CHAT_COLL).add({
      data: { _id: OPENID, messages: normalized, updatedAt: new Date().toISOString() }
    });
    await db.collection('users_data').doc(OPENID).update({ data: { chatHistory: [] } });
  } catch (e) {
    console.error('[getChat] migrate failed:', e.errMsg || e);
  }

  return { ok: true, messages: normalized, migrated: true };
};
