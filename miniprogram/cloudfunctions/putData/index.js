const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();
  const data = event && event.data;
  if (!data || typeof data !== 'object') {
    return { ok: false, error: 'invalid data' };
  }
  const record = {
    habits: Array.isArray(data.habits) ? data.habits : [],
    checkins: Array.isArray(data.checkins) ? data.checkins : [],
    chatHistory: Array.isArray(data.chatHistory) ? data.chatHistory : [],
    settings: data.settings || {},
    taskLogs: Array.isArray(data.taskLogs) ? data.taskLogs : [],
    aiPlans: Array.isArray(data.aiPlans) ? data.aiPlans : [],
    fitnessSeedVersion: data.fitnessSeedVersion || 0,
    version: data.version || 13,
    updatedAt: new Date().toISOString()
  };
  try {
    const res = await db.collection('users_data').doc(OPENID).update({ data: record });
    if (res && res.stats && res.stats.updated > 0) {
      return { ok: true, mode: 'update' };
    }
    await db.collection('users_data').add({ data: Object.assign({ _id: OPENID }, record) });
    return { ok: true, mode: 'create' };
  } catch (e) {
    return { ok: false, error: e.errMsg || String(e) };
  }
};
