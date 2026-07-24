// 把用户设置的提醒时间 upsert 到 reminders 集合，同时叠加订阅额度 quota
// 也支持 delete: true 场景用来在删除习惯 / 清空提醒时清理
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();
  if (!OPENID) return { ok: false, error: 'no openid' };

  const { habitId, habitName, time, frequency, weekdays, addQuota, del } = event || {};
  if (!habitId) return { ok: false, error: 'missing habitId' };

  const db = cloud.database();
  const _ = db.command;
  const col = db.collection('reminders');

  // 用 openid + habitId 作为唯一键去 upsert
  const existing = await col
    .where({ _openid: OPENID, habitId: habitId })
    .limit(1)
    .get();

  if (del) {
    // 删除模式
    if (existing.data.length > 0) {
      await col.doc(existing.data[0]._id).remove();
    }
    return { ok: true, deleted: true };
  }

  if (!time) return { ok: false, error: 'missing time' };
  const now = Date.now();

  if (existing.data.length > 0) {
    const doc = existing.data[0];
    const patch = {
      habitName: habitName || doc.habitName || '',
      time: time,
      frequency: frequency || 'daily',
      weekdays: Array.isArray(weekdays) ? weekdays : (doc.weekdays || []),
      updatedAt: now
    };
    if (addQuota && addQuota > 0) {
      patch.quota = _.inc(addQuota);
    }
    await col.doc(doc._id).update({ data: patch });
    return { ok: true, updated: true, docId: doc._id };
  } else {
    const inserted = await col.add({
      data: {
        _openid: OPENID,
        habitId: habitId,
        habitName: habitName || '',
        time: time,
        frequency: frequency || 'daily',
        weekdays: Array.isArray(weekdays) ? weekdays : [],
        quota: addQuota && addQuota > 0 ? addQuota : 0,
        createdAt: now,
        updatedAt: now
      }
    });
    return { ok: true, inserted: true, docId: inserted._id };
  }
};
