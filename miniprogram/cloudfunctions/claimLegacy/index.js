const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

async function upsert(collection, id, record) {
  const res = await db.collection(collection).doc(id).update({ data: record });
  if (res && res.stats && res.stats.updated > 0) return { mode: 'update' };
  // Update didn't touch anything — doc doesn't exist. Create it.
  await db.collection(collection).add({ data: Object.assign({ _id: id }, record) });
  return { mode: 'create' };
}

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();
  const username = (event && event.username || '').trim();
  const password = (event && event.password) || '';
  if (!username || !password) return { ok: false, error: '请输入用户名和密码' };

  let legacy;
  try {
    const res = await db.collection('legacy_data').doc(username).get();
    legacy = res.data;
  } catch (e) {
    return { ok: false, error: '账号不存在' };
  }

  if (!legacy || legacy.password !== password) {
    return { ok: false, error: '账号或密码错误' };
  }

  if (legacy.claimedBy && legacy.claimedBy !== OPENID) {
    return { ok: false, error: '该账号已被其他微信号认领' };
  }

  const record = Object.assign({}, legacy.data || {}, {
    updatedAt: new Date().toISOString(),
    legacyUsername: username
  });

  try {
    const r = await upsert('users_data', OPENID, record);
    await db.collection('legacy_data').doc(username).update({ data: { claimedBy: OPENID } });
    return { ok: true, mode: r.mode, openid: OPENID };
  } catch (e) {
    return { ok: false, error: e.errMsg || String(e) };
  }
};
