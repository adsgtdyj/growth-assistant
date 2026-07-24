const api = require('./api.js');

// ----- In-memory state -----
let data = null;       // null until loaded from server

function getDefaultData() {
  return {
    habits: [],
    checkins: [],
    chatHistory: [],
    settings: {
      nickname: '',
      avatar: 'user',
      wxNickname: '',
      slogan: '',
      aiTone: 'normal',
      fitnessProfile: '',
      aiInputMode: 'text',
      reminderTimes: {}
    },
    taskLogs: [],
    aiPlans: [],
    fitnessSeedVersion: 0,
    version: 13
  };
}

function getData() { return data || getDefaultData(); }
function getHabits() { return getData().habits; }
function getCheckins() { return getData().checkins; }
function getSettings() { return getData().settings; }
function getChatHistory() { return getData().chatHistory; }

// ----- Helpers -----
function uid() {
  return 'id_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 9);
}

function todayStr() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function prevDay(dateStr) {
  const d = new Date(dateStr);
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

// ----- Persistence -----
// 微信 wx.cloud.callFunction 的 event 参数上限 1MB。data 里 chatHistory
// / taskLogs / aiPlans 会随时间无限增长，直接整包上传迟早撑爆。
// 上传前统一裁一次，保留最近的部分即可满足业务需求。
const UPLOAD_LIMITS = {
  chatHistory: 60,       // AI 上下文 + 用户翻看历史，60 条够 2 个月
  chatContentMax: 3000,  // 单条对话正文最长 3000 字符
  taskLogs: 150,
  aiPlans: 30,
  aiPlanContentMax: 6000 // 单个 aiPlan 序列化后最长 6KB
};

function trimStr(s, max) {
  if (typeof s !== 'string') return s;
  return s.length > max ? s.slice(0, max) + '…(截断)' : s;
}

const SETTINGS_LIMITS = {
  fitnessProfile: 20000,
  slogan: 1000,
  nickname: 100,
  wxNickname: 100,
  aiTone: 20,
  avatar: 100,
  aiInputMode: 20
  // reminderTimes 是对象，正常不会大；其他未知字符串字段兜底 5000
};

function trimSettings(settings) {
  if (!settings || typeof settings !== 'object') return settings;
  const out = Object.assign({}, settings);
  Object.keys(out).forEach(k => {
    if (typeof out[k] === 'string') {
      const max = SETTINGS_LIMITS[k] || 5000;
      out[k] = trimStr(out[k], max);
    }
  });
  return out;
}

function trimForUpload(src) {
  if (!src) return src;
  const out = Object.assign({}, src);

  if (out.settings) {
    out.settings = trimSettings(out.settings);
  }

  if (Array.isArray(out.chatHistory)) {
    const kept = out.chatHistory.slice(-UPLOAD_LIMITS.chatHistory);
    out.chatHistory = kept.map(m => ({
      role: m.role,
      content: trimStr(m.content, UPLOAD_LIMITS.chatContentMax),
      time: m.time
    }));
  }

  if (Array.isArray(out.taskLogs) && out.taskLogs.length > UPLOAD_LIMITS.taskLogs) {
    out.taskLogs = out.taskLogs.slice(-UPLOAD_LIMITS.taskLogs);
  }

  if (Array.isArray(out.aiPlans)) {
    const kept = out.aiPlans.slice(-UPLOAD_LIMITS.aiPlans);
    out.aiPlans = kept.map(p => {
      const s = JSON.stringify(p);
      if (s.length <= UPLOAD_LIMITS.aiPlanContentMax) return p;
      // 单个 plan 太大：只保留 id/createdAt/name/短文本
      return {
        id: p.id,
        createdAt: p.createdAt,
        name: p.name || '',
        summary: trimStr(typeof p.content === 'string' ? p.content : s, UPLOAD_LIMITS.aiPlanContentMax),
        _truncated: true
      };
    });
  }

  return out;
}

function estimateSize(obj) {
  try { return JSON.stringify(obj).length; } catch (e) { return -1; }
}

function saveToServer() {
  if (!data) return Promise.resolve();
  const payload = trimForUpload(data);
  // 本地内存也同步裁一次，避免每次都推被截掉的那部分
  if (payload.chatHistory !== data.chatHistory) data.chatHistory = payload.chatHistory;
  if (payload.taskLogs !== data.taskLogs) data.taskLogs = payload.taskLogs;
  if (payload.aiPlans !== data.aiPlans) data.aiPlans = payload.aiPlans;

  const size = estimateSize(payload);
  const settingsFieldSizes = payload.settings ? Object.keys(payload.settings).reduce((acc, k) => {
    acc[k] = estimateSize(payload.settings[k]);
    return acc;
  }, {}) : {};
  const fieldSizes = {
    habits: estimateSize(payload.habits),
    checkins: estimateSize(payload.checkins),
    chatHistory: estimateSize(payload.chatHistory),
    settings: estimateSize(payload.settings),
    settingsFields: settingsFieldSizes,
    taskLogs: estimateSize(payload.taskLogs),
    aiPlans: estimateSize(payload.aiPlans)
  };
  console.warn('[saveToServer] payload size', size, 'fields', fieldSizes);

  return api.putData(payload);
}

function loadFromServer() {
  return api.getData().then(res => {
    if (res.needClaim) {
      data = getDefaultData();
      return { needClaim: true, openid: res.openid };
    }
    data = mergeSeed(res.data || {});
    return { data: data };
  });
}

function mergeSeed(serverData) {
  const seed = getDefaultData();
  const merged = {
    habits: Array.isArray(serverData.habits) ? serverData.habits : seed.habits,
    checkins: Array.isArray(serverData.checkins) ? serverData.checkins : seed.checkins,
    chatHistory: Array.isArray(serverData.chatHistory) ? serverData.chatHistory : seed.chatHistory,
    settings: Object.assign({}, seed.settings, serverData.settings || {},
      { reminderTimes: Object.assign({}, seed.settings.reminderTimes, (serverData.settings || {}).reminderTimes || {}) }
    ),
    taskLogs: Array.isArray(serverData.taskLogs) ? serverData.taskLogs : seed.taskLogs,
    aiPlans: Array.isArray(serverData.aiPlans) ? serverData.aiPlans : seed.aiPlans,
    fitnessSeedVersion: seed.fitnessSeedVersion,
    version: serverData.version || seed.version
  };
  // 服务端数据加载后立即裁一次，防止之前已经写入的巨型 chatHistory/aiPlans/taskLogs
  // 撑爆本地内存或下次 saveToServer 时上传超 1MB
  const beforeSize = estimateSize(merged);
  const trimmed = trimForUpload(merged);
  merged.chatHistory = trimmed.chatHistory;
  merged.taskLogs = trimmed.taskLogs;
  merged.aiPlans = trimmed.aiPlans;
  const afterSize = estimateSize(merged);
  console.warn('[loadFromServer] size', beforeSize, '->', afterSize, {
    chat: (merged.chatHistory || []).length,
    tasks: (merged.taskLogs || []).length,
    plans: (merged.aiPlans || []).length
  });
  return merged;
}

// ----- Habit CRUD -----
function addHabit(habit) {
  if (!data) return Promise.reject(new Error('Data not loaded'));
  habit.id = habit.id || uid();
  habit.createdAt = habit.createdAt || todayStr();
  if (!habit.plan) habit.plan = { items: [] };
  if (!habit.weekdays) habit.weekdays = [];
  if (!habit.reminder) habit.reminder = '';
  if (!habit.frequency) habit.frequency = 'daily';
  data.habits.push(habit);
  return saveToServer();
}

function updateHabit(habitId, updates) {
  if (!data) return Promise.reject(new Error('Data not loaded'));
  const idx = data.habits.findIndex(h => h.id === habitId);
  if (idx === -1) return Promise.reject(new Error('Habit not found'));
  Object.assign(data.habits[idx], updates);
  return saveToServer();
}

function deleteHabit(habitId) {
  if (!data) return Promise.reject(new Error('Data not loaded'));
  data.habits = data.habits.filter(h => h.id !== habitId);
  data.checkins = data.checkins.filter(c => c.habitId !== habitId);
  // 顺便清掉云端 reminders 里对应记录（失败不阻塞主流程）
  api.saveReminder({ habitId: habitId, del: true }).catch(() => {});
  return saveToServer();
}

function saveReminderConfig(habit, addQuota) {
  return api.saveReminder({
    habitId: habit.id,
    habitName: habit.name,
    time: habit.reminder,
    frequency: habit.frequency || 'daily',
    weekdays: habit.weekdays || [],
    addQuota: addQuota || 0
  });
}

function removeReminderConfig(habitId) {
  return api.saveReminder({ habitId: habitId, del: true });
}

// ----- Checkin -----
function isCheckedInToday(habitId) {
  const t = todayStr();
  return data ? data.checkins.some(c => c.habitId === habitId && c.date === t) : false;
}

function toggleCheckin(habitId, note) {
  if (!data) return Promise.reject(new Error('Data not loaded'));
  const t = todayStr();
  const existingIdx = data.checkins.findIndex(c => c.habitId === habitId && c.date === t);
  if (existingIdx !== -1) {
    data.checkins.splice(existingIdx, 1);
  } else {
    data.checkins.push({
      id: uid(),
      habitId: habitId,
      date: t,
      note: note || '',
      createdAt: new Date().toISOString()
    });
  }
  return saveToServer();
}

function addCheckin(habitId, date, note) {
  if (!data) return Promise.reject(new Error('Data not loaded'));
  data.checkins.push({
    id: uid(),
    habitId: habitId,
    date: date,
    note: note || '',
    createdAt: new Date().toISOString(),
    isMakeup: date !== todayStr()
  });
  return saveToServer();
}

function deleteCheckin(checkinId) {
  if (!data) return Promise.reject(new Error('Data not loaded'));
  data.checkins = data.checkins.filter(c => c.id !== checkinId);
  return saveToServer();
}

// ----- Streak -----
function calcStreak(habitId) {
  if (!data) return 0;
  let streak = 0;
  const t = todayStr();
  const checkedToday = data.checkins.some(c => c.habitId === habitId && c.date === t);
  let cursor = checkedToday ? t : prevDay(t);
  while (data.checkins.some(c => c.habitId === habitId && c.date === cursor)) {
    streak++;
    cursor = prevDay(cursor);
  }
  return streak;
}

function getLongestStreak(habitId) {
  if (!data) return 0;
  const dates = [...new Set(
    data.checkins.filter(c => c.habitId === habitId).map(c => c.date)
  )].sort();
  if (dates.length === 0) return 0;
  let max = 1, cur = 1;
  for (let i = 1; i < dates.length; i++) {
    if (prevDay(dates[i]) === dates[i - 1]) {
      cur++;
      max = Math.max(max, cur);
    } else {
      cur = 1;
    }
  }
  return max;
}

function getMaxStreak() {
  if (!data) return 0;
  let max = 0;
  data.habits.forEach(h => { const s = calcStreak(h.id); if (s > max) max = s; });
  return max;
}

// ----- Settings -----
function updateSettings(updates) {
  if (!data) return Promise.reject(new Error('Data not loaded'));
  Object.assign(data.settings, updates);
  return saveToServer();
}

function resetData() {
  data = getDefaultData();
  return saveToServer();
}

function importData(newData) {
  if (!newData || typeof newData !== 'object') {
    return Promise.reject(new Error('数据格式不正确'));
  }
  const base = getDefaultData();
  const merged = Object.assign({}, base, newData, {
    habits: Array.isArray(newData.habits) ? newData.habits : [],
    checkins: Array.isArray(newData.checkins) ? newData.checkins : [],
    chatHistory: Array.isArray(newData.chatHistory) ? newData.chatHistory : [],
    settings: Object.assign({}, base.settings, newData.settings || {})
  });
  data = merged;
  return saveToServer();
}

// ----- AI Chat -----
function sendChatMessage(message) {
  if (!data) return Promise.reject(new Error('Data not loaded'));
  const payload = {
    message: message,
    habits: data.habits,
    checkins: data.checkins,
    settings: data.settings,
    chatHistory: data.chatHistory.slice(-20)  // last 20 messages for context
  };
  return api.sendChat(payload).then(response => {
    // Append to history
    data.chatHistory.push(
      { role: 'user', content: message, time: new Date().toISOString() },
      { role: 'assistant', content: response.reply, time: new Date().toISOString() }
    );
    // Process action
    if (response.action) {
      processAction(response.action);
    }
    // Trim history — 保持与 UPLOAD_LIMITS.chatHistory 一致
    if (data.chatHistory.length > UPLOAD_LIMITS.chatHistory) {
      data.chatHistory = data.chatHistory.slice(-UPLOAD_LIMITS.chatHistory);
    }
    return saveToServer().then(() => response);
  });
}

function processAction(action) {
  if (!data || !action) return;
  switch (action.type) {
    case 'checkin': {
      const hid = action.data && action.data.habitId;
      if (hid && !isCheckedInToday(hid)) {
        data.checkins.push({
          id: uid(),
          habitId: hid,
          date: todayStr(),
          note: (action.data && action.data.note) || '',
          createdAt: new Date().toISOString()
        });
      }
      break;
    }
    case 'cancel_checkin': {
      const cid = action.data && action.data.habitId;
      if (cid) {
        data.checkins = data.checkins.filter(
          c => !(c.habitId === cid && c.date === todayStr())
        );
      }
      break;
    }
    case 'plan_update': {
      if (action.data && action.data.habitId && action.data.plan) {
        const h = data.habits.find(h => h.id === action.data.habitId);
        if (h) h.plan = action.data.plan;
      }
      break;
    }
  }
}

// ----- Stress test (dev only) -----
// 给压测用：构造一份接近 / 超过 1MB 的数据，看 trimForUpload 能否压住。
// 默认 dry run：只看 trim 后大小，不真调 save、不写服务端。
// opts.realSave=true 时真调 saveToServer，前后备份恢复，服务端会被写一次假数据再恢复。
function __stressTest(opts) {
  opts = opts || {};
  if (!data) {
    console.warn('[stress] data not loaded, run loadFromServer first');
    return Promise.resolve({ error: 'data not loaded' });
  }
  const backup = JSON.parse(JSON.stringify(data));

  // 注入大数据：模拟真实膨胀场景，按放宽后的上限灌满
  data.settings = data.settings || {};
  data.settings.fitnessProfile = 'A'.repeat(200 * 1024);  // 200KB - 模拟 AI 写了超长档案
  data.settings.slogan = 'S'.repeat(10000);  // 10KB slogan

  data.chatHistory = [];
  for (let i = 0; i < 80; i++) {
    data.chatHistory.push({
      role: i % 2 === 0 ? 'user' : 'assistant',
      content: 'B'.repeat(4000),  // 4KB per msg
      time: new Date(Date.now() - i * 60000).toISOString()
    });
  }

  data.aiPlans = [];
  for (let i = 0; i < 50; i++) {
    data.aiPlans.push({
      id: 'plan_' + i,
      createdAt: new Date(Date.now() - i * 86400000).toISOString(),
      name: 'plan ' + i,
      content: 'C'.repeat(8000)  // 8KB per plan
    });
  }

  data.taskLogs = [];
  for (let i = 0; i < 200; i++) {
    data.taskLogs.push({
      id: 'log_' + i,
      action: 'D'.repeat(1000),
      time: new Date(Date.now() - i * 3600000).toISOString()
    });
  }

  const rawSize = estimateSize(data);
  console.warn('[stress] INJECTED raw size:', rawSize, '(' + (rawSize / 1024).toFixed(1) + ' KB)');

  const trimmed = trimForUpload(data);
  const trimmedSize = estimateSize(trimmed);
  console.warn('[stress] TRIMMED size:', trimmedSize, '(' + (trimmedSize / 1024).toFixed(1) + ' KB)');
  console.warn('[stress] TRIMMED fields:', {
    chatHistory: (trimmed.chatHistory || []).length + ' items',
    taskLogs: (trimmed.taskLogs || []).length + ' items',
    aiPlans: (trimmed.aiPlans || []).length + ' items',
    settings: estimateSize(trimmed.settings) + ' B',
    settingsFields: Object.keys(trimmed.settings || {}).reduce((acc, k) => {
      acc[k] = estimateSize(trimmed.settings[k]);
      return acc;
    }, {})
  });

  if (!opts.realSave) {
    data = backup;
    console.warn('[stress] DRY RUN done, no server write. data restored locally.');
    return Promise.resolve({ rawSize, trimmedSize, mode: 'dry' });
  }

  console.warn('[stress] REAL SAVE starting...');
  return saveToServer().then(
    () => {
      console.warn('[stress] REAL SAVE OK');
      data = backup;
      return saveToServer().then(() => {
        console.warn('[stress] data restored to server');
        return { rawSize, trimmedSize, mode: 'real', saveResult: 'ok' };
      });
    },
    (err) => {
      console.error('[stress] REAL SAVE FAILED:', err);
      data = backup;
      return saveToServer().then(() => {
        console.warn('[stress] data restored to server after failure');
        return { rawSize, trimmedSize, mode: 'real', saveResult: 'fail', error: err };
      });
    }
  );
}

const HABIT_EMOJIS = {fitness:'🏋️',book:'📖',water:'💧',stretch:'🧘',music:'🎵',pen:'✍️',moon:'🌙',apple:'🍎',run:'🏃',palette:'🎨',note:'📝',pill:'💊',leaf:'🌿',sun:'☀️',target:'🎯',heart:'❤️'};
function habitEmoji(value) { return HABIT_EMOJIS[value] || value || '🎯'; }

module.exports = {
  habitEmoji,
  getDefaultData,
  loadFromServer,
  saveToServer,
  getData, getHabits, getCheckins, getSettings, getChatHistory,
  addHabit, updateHabit, deleteHabit,
  isCheckedInToday, toggleCheckin, addCheckin, deleteCheckin,
  calcStreak, getLongestStreak, getMaxStreak,
  updateSettings,
  resetData, importData,
  sendChatMessage,
  saveReminderConfig, removeReminderConfig,
  todayStr,
  __stressTest
};
