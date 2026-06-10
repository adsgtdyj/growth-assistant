import 'dotenv/config';
import crypto from 'crypto';
import express from 'express';
import cookieParser from 'cookie-parser';
import { mkdir, readFile, writeFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const app = express();
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PORT = process.env.PORT || 3001;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'cloud-data.json');
const PUBLIC_DIR = path.join(__dirname, 'public');
const ARK_API_KEY = process.env.ARK_API_KEY;
const ARK_ENDPOINT = process.env.ARK_ENDPOINT || 'https://ark.cn-beijing.volces.com/api/v3/chat/completions';
const ARK_MODEL = process.env.ARK_MODEL || '';
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
const COOKIE_NAME = 'habit_session';
const sessions = new Map();

await mkdir(DATA_DIR, { recursive: true });

function hashToken(token) {
  return crypto.createHmac('sha256', SESSION_SECRET).update(token).digest('hex');
}

function createSession(username) {
  const token = crypto.randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30);
  sessions.set(hashToken(token), { username, expiresAt: expires.toISOString() });
  return { token, expires };
}

function getSessionUser(req) {
  const token = req.cookies?.[COOKIE_NAME];
  if (!token) return null;
  const session = sessions.get(hashToken(token));
  if (!session) return null;
  if (new Date(session.expiresAt).getTime() < Date.now()) {
    sessions.delete(hashToken(token));
    return null;
  }
  return { username: session.username };
}

function requireAuth(req, res, next) {
  const user = getSessionUser(req);
  if (!user) return res.status(401).json({ ok: false, message: '请先登录' });
  req.user = user;
  next();
}

function setSessionCookie(res, token, expires) {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    expires,
    path: '/'
  });
}

async function readCloudStore() {
  try {
    return JSON.parse(await readFile(DATA_FILE, 'utf8'));
  } catch {
    return { users: {} };
  }
}

async function writeCloudStore(store) {
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(DATA_FILE, JSON.stringify(store, null, 2), 'utf8');
}

app.use(cookieParser());
app.use(express.json({ limit: '5mb' }));
app.use(express.static(PUBLIC_DIR));

function buildSystemPrompt(habits, checkins, stats, settings) {
  const todayStr = new Date().toISOString().slice(0, 10);
  const pending = habits.filter(h => !checkins.some(c => c.habitId === h.id && c.date === todayStr));
  const tone = settings.aiTone || 'normal';
  const nickname = settings.nickname || '用户';

  return `你是「AI成长助理」，一个毒舌又靠谱的习惯打卡助手。

## 你的性格
- 说话直接，带点调侃和毒舌（特别是用户偷懒的时候）
- 但出发点是为用户好，像健身教练+损友的结合体
- 语气风格：${tone === 'sassy' ? '毒舌模式，加大力度嘲讽' : tone === 'mild' || tone === 'gentle' ? '温和模式，要多鼓励' : '正常模式，适度调侃'}
- 称呼用户为「${nickname}」

## 当前用户数据（${todayStr}）
- 习惯总数：${habits.length} 个
- 今日未打卡：${pending.length} 个${pending.length > 0 ? '（' + pending.map(h => h.icon + h.name).join('、') + '）' : ''}
- 今日已打卡：${checkins.filter(c => c.date === todayStr).length} 个
- 最长连胜：${stats.maxStreak} 天
- 累计打卡：${stats.totalCheckins} 次

## 用户健身档案
${settings.fitnessProfile || '暂无健身档案'}

## 用户习惯列表
${habits.map(h => {
  const streak = stats.habitStreaks?.[h.id] || 0;
  const planStr = h.plan && h.plan.items ? JSON.stringify(h.plan.items) : '未设置';
  return `- ${h.icon} ${h.name}（ID:${h.id}，当前连胜${streak}天，计划：${planStr}）`;
}).join('\n')}

## 今日打卡记录
${checkins.filter(c => c.date === todayStr).map(c => {
  const h = habits.find(x => x.id === c.habitId);
  return `- ${h ? h.icon : ''} ${h ? h.name : ''}：${c.note || '已打卡'}`;
}).join('\n') || '今日暂无打卡记录'}

## 你的能力
你可以做以下事情（通过返回 JSON action 块来执行操作）：

### 1. 记录打卡
当用户报告完成了某个习惯的训练内容时：
- 提取动作名称、组数、次数、重量等信息
- 生成打卡备注
- 返回 action 让前端确认后执行

### 2. 查询和调整计划
- 用户问"今天练什么"时，根据计划推荐
- 用户要求调整时，生成新的计划内容

### 3. 查看数据
- 回答用户关于打卡统计的问题
- 可以查总体数据或某个具体习惯的数据

### 4. 补签
- 用户想补签时引导到补签页面

### 5. 取消打卡
- 用户想撤销今日打卡时确认后执行

## 回复格式要求
你的回复必须是 JSON 格式，包含以下字段：
{
  "reply": "你生成的回复文本",
  "action": { "type": "动作类型", "data": { ... } } | null,
  "quickReplies": ["快捷选项1", "快捷选项2"] | []
}

动作类型说明：
- "checkin": 记录打卡。data = { "habitId": "习惯ID", "note": "备注内容", "parsed": { "exercise": "动作名", "weight": 12, "sets": 4, "reps": 10 } }
- "cancel_checkin": 取消打卡。data = { "habitId": "习惯ID" }
- "plan_update": 更新计划。data = { "habitId": "习惯ID", "plan": { "items": [...] } }
- "redirect": 跳转页面。data = { "page": "habit-edit" | "calendar" | "analytics" | "habit-detail", "habitId": "..." }
- null: 纯对话，不需要执行操作

重要规则：
1. 涉及打卡/改计划时，action 字段必须有值，让前端显示确认按钮
2. action 为 null 表示纯聊天
3. 快捷回复是文本数组，用户点击后作为新消息发送
4. 回复内容用中文，保持毒舌风格
5. 如果用户报告了训练内容（如"推胸12kg 4组"），提取结构化数据放到 action.data.parsed 中`;
}

async function callArkAPI(messages, systemPrompt) {
  if (!ARK_API_KEY) throw new Error('缺少 ARK_API_KEY');
  if (!ARK_MODEL) throw new Error('缺少 ARK_MODEL，请填写火山方舟的推理接入点 ID');

  const response = await fetch(ARK_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${ARK_API_KEY}`
    },
    body: JSON.stringify({
      model: ARK_MODEL,
      messages: [{ role: 'system', content: systemPrompt }, ...messages],
      temperature: 0.8,
      max_tokens: 1024
    }),
    signal: AbortSignal.timeout(15000)
  });

  const text = await response.text();
  let data;
  try { data = JSON.parse(text); } catch { throw new Error(`API 返回内容不是 JSON，状态码 ${response.status}`); }
  if (!response.ok) throw new Error(data.error?.message || data.message || `API 请求失败，状态码 ${response.status}`);
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error('API 没有返回有效回复');
  return content;
}

function parseAIResponse(content) {
  try {
    const parsed = JSON.parse(content);
    if (parsed.reply) return { reply: parsed.reply, action: parsed.action || null, quickReplies: parsed.quickReplies || [] };
  } catch {}

  const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[1].trim());
      if (parsed.reply) return { reply: parsed.reply, action: parsed.action || null, quickReplies: parsed.quickReplies || [] };
    } catch {}
  }

  return { reply: content.replace(/\[action:.*?\]/g, '').trim(), action: null, quickReplies: [] };
}

function calcStats(habits, checkins) {
  const totalCheckins = checkins.length;
  const todayStr = new Date().toISOString().slice(0, 10);
  let maxStreak = 0;
  const habitStreaks = {};

  for (const h of habits) {
    const hCheckins = checkins.filter(c => c.habitId === h.id);
    if (hCheckins.length === 0) { habitStreaks[h.id] = 0; continue; }
    const dates = [...new Set(hCheckins.map(c => c.date))].sort();
    let streak = 0;
    let d = new Date(todayStr);
    while (dates.includes(d.toISOString().slice(0, 10))) {
      streak++;
      d.setDate(d.getDate() - 1);
    }
    habitStreaks[h.id] = streak;
    maxStreak = Math.max(maxStreak, streak);
  }

  return { totalCheckins, maxStreak, habitStreaks };
}

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', model: ARK_MODEL || '未配置' });
});

app.post('/api/login', (req, res) => {
  const { username, password } = req.body || {};
  if (!ADMIN_PASSWORD) return res.status(500).json({ ok: false, message: '管理员密码未设置' });
  if (username !== ADMIN_USERNAME || password !== ADMIN_PASSWORD) {
    return res.status(401).json({ ok: false, message: '账号或密码不正确' });
  }
  const session = createSession(username);
  setSessionCookie(res, session.token, session.expires);
  res.json({ ok: true, user: { username } });
});

app.post('/api/logout', (req, res) => {
  const token = req.cookies?.[COOKIE_NAME];
  if (token) sessions.delete(hashToken(token));
  res.clearCookie(COOKIE_NAME, { path: '/' });
  res.json({ ok: true });
});

app.get('/api/me', (req, res) => {
  const user = getSessionUser(req);
  if (!user) return res.status(401).json({ ok: false, message: '未登录' });
  res.json({ ok: true, user });
});

app.get('/api/data', requireAuth, async (req, res) => {
  const store = await readCloudStore();
  const row = store.users[req.user.username];
  res.json({ ok: true, data: row?.data || null, updatedAt: row?.updatedAt || null });
});

app.put('/api/data', requireAuth, async (req, res) => {
  const data = req.body;
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return res.status(400).json({ ok: false, message: '数据格式不正确' });
  }
  const store = await readCloudStore();
  const now = new Date().toISOString();
  store.users[req.user.username] = { data, updatedAt: now };
  await writeCloudStore(store);
  res.json({ ok: true, updatedAt: now });
});

app.post('/api/chat', requireAuth, async (req, res) => {
  try {
    const { message, habits = [], checkins = [], settings = {}, chatHistory = [] } = req.body;
    if (!message || !message.trim()) return res.json({ reply: '你倒是说句话啊...', action: null, quickReplies: [] });

    const stats = calcStats(habits, checkins);
    const systemPrompt = buildSystemPrompt(habits, checkins, stats, settings);
    const recentHistory = chatHistory.slice(-10).map(msg => ({
      role: msg.role === 'ai' ? 'assistant' : 'user',
      content: msg.text || msg.content || ''
    }));
    const aiContent = await callArkAPI([...recentHistory, { role: 'user', content: message }], systemPrompt);
    res.json(parseAIResponse(aiContent));
  } catch (err) {
    console.error('chat error:', err);
    res.json({
      reply: `呃，我卡住了...（${err.message}）\n\n要不换个说法试试？`,
      action: null,
      quickReplies: ['今天练什么', '打卡', '我的数据']
    });
  }
});

app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ ok: false, message: '接口不存在' });
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`AI成长助理云端服务已启动 → http://localhost:${PORT}`);
  console.log(`数据文件: ${DATA_FILE}`);
  console.log(`模型: ${ARK_MODEL || '未配置（请在 .env 中设置 ARK_MODEL）'}`);
});
