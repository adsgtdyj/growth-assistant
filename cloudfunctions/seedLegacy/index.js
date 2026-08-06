const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const legacyData = require('./legacy-data.json');

const PASSWORDS = {
  admin: 'admin123456',
  test1: 'test123456',
  test2: 'test123456'
};

async function ensureCollection(name) {
  try {
    await db.createCollection(name);
  } catch (e) {
    // Already exists — that's fine
    if (!(e && (e.errCode === -501001 || (e.errMsg && e.errMsg.indexOf('exist') !== -1)))) {
      throw e;
    }
  }
}

exports.main = async () => {
  const collectionErrors = {};
  try {
    await ensureCollection('legacy_data');
  } catch (e) { collectionErrors.legacy_data = e.errMsg || String(e); }
  try {
    await ensureCollection('users_data');
  } catch (e) { collectionErrors.users_data = e.errMsg || String(e); }

  const users = legacyData.users || {};
  const results = {};
  for (const username of Object.keys(users)) {
    const record = users[username];
    const doc = {
      _id: username,
      username,
      password: PASSWORDS[username] || '',
      data: record.data || {},
      updatedAt: record.updatedAt || new Date().toISOString(),
      claimedBy: ''
    };
    try {
      try {
        await db.collection('legacy_data').doc(username).update({ data: doc });
      } catch (e) {
        await db.collection('legacy_data').add({ data: doc });
      }
      results[username] = 'ok';
    } catch (e) {
      results[username] = 'err: ' + (e.errMsg || String(e));
    }
  }
  return { ok: true, collectionErrors, results };
};
