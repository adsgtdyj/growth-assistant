// 定时扫描 reminders 集合，到点了给用户发订阅消息
// 微信云函数定时触发器每分钟触发一次
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const TEMPLATE_ID = (process.env.REMINDER_TEMPLATE_ID || '').trim();
const MINI_PROGRAM_STATE = process.env.MINI_PROGRAM_STATE || 'formal'; // formal / trial / developer

function pad2(n) { return String(n).padStart(2, '0'); }

function beijingNow() {
  return new Date(Date.now() + 8 * 3600 * 1000);
}

function nowHM() {
  const now = beijingNow();
  return pad2(now.getUTCHours()) + ':' + pad2(now.getUTCMinutes());
}

function todayWeekday() {
  const now = beijingNow();
  const d = now.getUTCDay(); // 0-6, 0=Sunday
  return d === 0 ? 7 : d;
}

function todayStr() {
  const now = beijingNow();
  return now.getUTCFullYear() + '-' + pad2(now.getUTCMonth() + 1) + '-' + pad2(now.getUTCDate());
}

// 计算连胜天数：从今天往前数连续打卡天数（今天没打卡就从昨天开始）
function calcStreak(checkins, habitId) {
  if (!checkins || checkins.length === 0) return 0;
  const dates = new Set(
    checkins.filter(c => c.habitId === habitId).map(c => c.date)
  );
  const today = todayStr();
  let streak = 0;
  const d = new Date(today);
  // 如果今天没打，从昨天开始算连胜
  if (!dates.has(today)) d.setDate(d.getDate() - 1);
  while (dates.has(d.toISOString().slice(0, 10))) {
    streak++;
    d.setDate(d.getDate() - 1);
  }
  return streak;
}

async function getUserData(db, openid) {
  try {
    const res = await db.collection('users_data').doc(openid).get();
    return res.data || {};
  } catch (e) {
    return {};
  }
}

exports.main = async () => {
  if (!TEMPLATE_ID) {
    console.error('缺少 REMINDER_TEMPLATE_ID 环境变量');
    return { ok: false, error: 'missing template id' };
  }

  const db = cloud.database();
  const _ = db.command;
  const col = db.collection('reminders');

  const hm = nowHM();
  const weekday = todayWeekday();
  const today = todayStr();

  const res = await col
    .where({
      time: hm,
      quota: _.gt(0)
    })
    .limit(500)
    .get();

  const items = res.data || [];
  const results = [];

  for (const item of items) {
    // custom 频率需匹配周几
    if (item.frequency === 'custom') {
      const wds = item.weekdays || [];
      if (wds.length > 0 && !wds.includes(weekday)) continue;
    }
    // 今天已经推过就跳过
    if (item.lastPushedDate === today) continue;

    // 拉用户数据算 streak，同时判断今天是否已经打卡
    const userData = await getUserData(db, item._openid);
    const checkins = Array.isArray(userData.checkins) ? userData.checkins : [];
    const alreadyToday = checkins.some(c => c.habitId === item.habitId && c.date === today);
    if (alreadyToday) {
      // 今天已经打卡了，不用再提醒
      await col.doc(item._id).update({
        data: { lastPushedDate: today, lastSkippedReason: 'already_checked' }
      });
      results.push({ id: item._id, skipped: 'already_checked' });
      continue;
    }
    const streak = calcStreak(checkins, item.habitId);

    try {
      await cloud.openapi.subscribeMessage.send({
        touser: item._openid,
        templateId: TEMPLATE_ID,
        page: 'pages/index/index',
        miniprogramState: MINI_PROGRAM_STATE,
        data: {
          thing1: { value: (item.habitName || '习惯').slice(0, 20) },
          time7: { value: item.time },
          number11: { value: streak },
          thing3: { value: streak > 0 ? `连胜${streak}天，别断啦` : '开个头，今天就打卡' }
        }
      });
      await col.doc(item._id).update({
        data: {
          quota: _.inc(-1),
          lastPushedDate: today,
          lastPushedAt: Date.now()
        }
      });
      results.push({ id: item._id, ok: true, streak });
    } catch (err) {
      console.error('push fail', item._id, err && err.errMsg);
      results.push({ id: item._id, ok: false, err: err && (err.errMsg || err.message) });
    }
  }

  return { ok: true, count: results.length, results };
};
