const https = require('https');
const { URL } = require('url');

const ARK_ENDPOINT = 'https://ark.cn-beijing.volces.com/api/v3/chat/completions';
function cleanApiKey(raw) {
  if (!raw) return '';
  let s = String(raw).replace(/[\r\n\t]/g, '').trim();
  s = s.replace(/^['"]+/, '').replace(/['"]+$/, '').trim();
  if (/^bearer\s+/i.test(s)) s = s.replace(/^bearer\s+/i, '').trim();
  return s;
}
const ARK_API_KEY = cleanApiKey(process.env.ARK_API_KEY);
const ARK_MODEL = (process.env.ARK_MODEL || 'ep-20260604101325-f2wcq').trim();

function todayStr() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function calcStats(habits, checkins) {
  const totalCheckins = checkins.length;
  const t = todayStr();
  let maxStreak = 0;
  const habitStreaks = {};
  for (const h of habits) {
    const hCheckins = checkins.filter(c => c.habitId === h.id);
    if (hCheckins.length === 0) { habitStreaks[h.id] = 0; continue; }
    const dates = [...new Set(hCheckins.map(c => c.date))].sort();
    let streak = 0;
    const d = new Date(t);
    while (dates.includes(d.toISOString().slice(0, 10))) {
      streak++;
      d.setDate(d.getDate() - 1);
    }
    habitStreaks[h.id] = streak;
    if (streak > maxStreak) maxStreak = streak;
  }
  return { totalCheckins, maxStreak, habitStreaks };
}

function buildSystemPrompt(habits, checkins, stats, settings) {
  const t = todayStr();
  const pending = habits.filter(h => !checkins.some(c => c.habitId === h.id && c.date === t));
  const tone = settings.aiTone || 'normal';
  const nickname = settings.nickname || '用户';

  const toneProfile = tone === 'sassy' ? {
    identity: '你是「AI成长助理」，一个犀利但靠谱的习惯打卡教练。',
    style: '毒舌模式：可以明显吐槽拖延和偷懒，语气更直接、更有压迫感，但不能人身攻击、羞辱身体或制造焦虑。',
    rules: '- 允许调侃和吐槽，但每次都要落到一个具体行动建议\n- 可以使用"别装死""少找借口"这类轻度刺激话术\n- 不要为了搞笑乱触发补签、打卡或改计划 action'
  } : (tone === 'mild' || tone === 'gentle') ? {
    identity: '你是「AI成长助理」，一个温和、支持型的习惯打卡教练。',
    style: '温和模式：鼓励、安抚、低压力，不毒舌、不讽刺、不挖苦。',
    rules: '- 禁止使用嘲讽表达\n- 用户输入不清楚时，温柔澄清'
  } : {
    identity: '你是「AI成长助理」，一个直接、清楚、靠谱的习惯打卡教练。',
    style: '正常模式：直给、简洁、轻微提醒，不毒舌，不夸张。',
    rules: '- 不要使用强嘲讽或威胁\n- 用户输入不清楚时直接问清楚'
  };

  return `${toneProfile.identity}

## 你的性格
- 称呼用户为「${nickname}」
- 语气风格：${toneProfile.style}
${toneProfile.rules}

## 当前用户数据（${t}）
- 习惯总数：${habits.length} 个
- 今日未打卡：${pending.length} 个${pending.length > 0 ? '（' + pending.map(h => (h.icon || '') + h.name).join('、') + '）' : ''}
- 今日已打卡：${checkins.filter(c => c.date === t).length} 个
- 最长连胜：${stats.maxStreak} 天
- 累计打卡：${stats.totalCheckins} 次

## 用户健身档案
${settings.fitnessProfile || '暂无健身档案'}

## 用户习惯列表
${habits.map(h => {
  const streak = (stats.habitStreaks && stats.habitStreaks[h.id]) || 0;
  const planStr = h.plan && h.plan.items ? JSON.stringify(h.plan.items) : '未设置';
  return `- ${h.icon || ''} ${h.name}（ID:${h.id}，当前连胜${streak}天，计划：${planStr}）`;
}).join('\n')}

## 今日打卡记录
${checkins.filter(c => c.date === t).map(c => {
  const h = habits.find(x => x.id === c.habitId);
  const items = Array.isArray(c.selectedItems) && c.selectedItems.length > 0
    ? '｜完成：' + c.selectedItems.map(s => s.text).join('、')
    : '';
  return `- ${h ? (h.icon || '') : ''} ${h ? h.name : ''}：${c.note || '已打卡'}${items}`;
}).join('\n') || '今日暂无打卡记录'}

## 近 7 天完成情况
${(() => {
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const dd = new Date(); dd.setDate(dd.getDate() - i);
    const ds = dd.toISOString().slice(0, 10);
    const cs = checkins.filter(c => c.date === ds);
    if (cs.length === 0) continue;
    const line = cs.map(c => {
      const h = habits.find(x => x.id === c.habitId);
      const items = Array.isArray(c.selectedItems) && c.selectedItems.length > 0
        ? '（完成：' + c.selectedItems.map(s => s.text).join('、') + '）'
        : '';
      return `${h ? h.name : '已删除'}${items}`;
    }).join('、');
    days.push(`${ds.slice(5)}：${line}`);
  }
  return days.join('\n') || '近 7 天无打卡';
})()}

## 回复格式（必须严格 JSON）
{
  "reply": "回复文本",
  "action": { "type": "checkin|cancel_checkin|plan_update|redirect", "data": {...} } 或 null,
  "quickReplies": ["选项1", "选项2"] 或 []
}

action 类型：
- checkin: data = { habitId, note, parsed?: { exercise, weight, sets, reps } }
- cancel_checkin: data = { habitId }
- create_habit: data = { name, icon, frequency, weekdays?, reminder?, plan? }
    · icon 从这些 key 里选一个：fitness/book/water/stretch/moon/music/pen/apple/run/palette/note/pill/leaf/sun/target/heart（读书→book，健身→fitness，喝水→water，跑步→run，拉伸/冥想→stretch，吃药→pill，写作→pen，其它选最贴切的，实在没有用 target）
    · frequency: "daily"（每天）| "weekly"（每周）| "custom"（自定义星期，此时 weekdays 填 1-7 的数组，1=周一）
    · reminder: "HH:MM" 提醒时间，用户没提就省略
    · plan.items: [{ text: "计划要点" }]，如"每天读10页"→[{ text: "每天读10页" }]
    · 不要自己编 ID，系统会自动分配
- plan_update: data = { habitId, plan: { items: [...] } }
- redirect: data = { page: "habit-edit"|"calendar"|"analytics", habitId? }

规则：
1. 涉及打卡/改计划/建习惯时 action 必须有值
2. 纯聊天时 action 为 null
3. 严格遵守语气模式
4. 只有真正输出了对应 action，才可以说"已帮你打卡""已建好习惯"这类话。做不到就绝不能假装完成——要么给出正确 action，要么如实说明还缺什么信息。
5. 用户要建习惯但没说清名称/频率时，先问清楚再建，不要凭空乱建。
6. 你只能做上面列出的 5 种 action。其他需求--例如"建一条备注/笔记/日志"、"修改打卡记录"、"删除习惯"、"改用户资料"、"查历史统计"、"导出数据"--你都没有对应 action，必须如实告诉用户去哪个页面手动操作（例如"在我的-数据管理里导出"），绝不能假装做完。
7. 当用户想跳转到某个页面（例如去建习惯、看日历、看分析），用 redirect action。`;
}

function parseAIResponse(content) {
  try {
    const parsed = JSON.parse(content);
    if (parsed.reply) return { reply: parsed.reply, action: parsed.action || null, quickReplies: parsed.quickReplies || [] };
  } catch (e) {}
  const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[1].trim());
      if (parsed.reply) return { reply: parsed.reply, action: parsed.action || null, quickReplies: parsed.quickReplies || [] };
    } catch (e) {}
  }
  return { reply: content.replace(/\[action:.*?\]/g, '').trim(), action: null, quickReplies: [] };
}

function callArk(messages, systemPrompt) {
  return new Promise((resolve, reject) => {
    if (!ARK_API_KEY) return reject(new Error('云函数缺少 ARK_API_KEY 环境变量，请在云开发控制台 chat 云函数「配置 > 环境变量」里添加'));
    if (ARK_API_KEY.length < 20) return reject(new Error('ARK_API_KEY 长度异常（仅 ' + ARK_API_KEY.length + ' 字符），请检查云函数环境变量是否完整'));
    if (!/^ark-/.test(ARK_API_KEY)) return reject(new Error('ARK_API_KEY 应以 "ark-" 开头，当前开头为：" ' + ARK_API_KEY.slice(0, 6) + ' "，请检查'));
    if (!ARK_MODEL) return reject(new Error('缺少 ARK_MODEL'));
    const u = new URL(ARK_ENDPOINT);
    const body = JSON.stringify({
      model: ARK_MODEL,
      messages: [{ role: 'system', content: systemPrompt }, ...messages],
      temperature: 0.8,
      max_tokens: 1024
    });
    const req = https.request({
      hostname: u.hostname,
      port: 443,
      path: u.pathname,
      method: 'POST',
      timeout: 45000,
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        'Authorization': 'Bearer ' + ARK_API_KEY
      }
    }, (res) => {
      let raw = '';
      res.setEncoding('utf8');
      res.on('data', chunk => raw += chunk);
      res.on('end', () => {
        let data;
        try { data = JSON.parse(raw); } catch (e) { return reject(new Error('Ark 返回非 JSON: ' + raw.slice(0, 200))); }
        if (res.statusCode < 200 || res.statusCode >= 300) {
          return reject(new Error((data.error && data.error.message) || data.message || 'Ark 状态码 ' + res.statusCode));
        }
        const content = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
        if (!content) return reject(new Error('Ark 未返回有效回复'));
        resolve(content);
      });
    });
    req.on('timeout', () => { req.destroy(new Error('Ark 请求超时')); });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

exports.main = async (event) => {
  const message = (event && event.message) || '';
  if (!message.trim()) return { reply: '你倒是说句话啊...', action: null, quickReplies: [] };

  const habits = (event && event.habits) || [];
  const checkins = (event && event.checkins) || [];
  const settings = (event && event.settings) || {};
  const chatHistory = (event && event.chatHistory) || [];

  try {
    const stats = calcStats(habits, checkins);
    const systemPrompt = buildSystemPrompt(habits, checkins, stats, settings);
    const recentHistory = chatHistory.slice(-10).map(m => ({
      role: m.role === 'ai' ? 'assistant' : m.role,
      content: m.text || m.content || ''
    }));
    const aiContent = await callArk([...recentHistory, { role: 'user', content: message }], systemPrompt);
    return parseAIResponse(aiContent);
  } catch (err) {
    console.error('chat error:', err);
    return {
      reply: '呃，我卡住了...（' + (err.message || err) + '）\n\n要不换个说法？',
      action: null,
      quickReplies: ['今天练什么', '打卡', '我的数据']
    };
  }
};
