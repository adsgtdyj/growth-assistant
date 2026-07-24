const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async () => {
  const { OPENID } = cloud.getWXContext();
  try {
    const res = await db.collection('users_data').doc(OPENID).get();
    return { ok: true, data: res.data };
  } catch (e) {
    // Doc not found — new user
    if (e && (e.errCode === -1 || (e.errMsg && e.errMsg.indexOf('not exist') !== -1))) {
      return { ok: true, needClaim: true, openid: OPENID };
    }
    return { ok: false, error: e.errMsg || String(e) };
  }
};
