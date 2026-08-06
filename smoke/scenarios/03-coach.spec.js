// 03-coach.spec.js
// 教练模块 - 默认语气、语气切换、会话返回

module.exports = {
  name: '教练模块 - 语气与对话',
  async run({ mp, helpers, report }) {
    await mp.reLaunch('/pages/index/index');
    let page = await mp.currentPage();
    await helpers.waitReady(page);

    await mp.switchTab('/pages/assistant/assistant');
    await new Promise(r => setTimeout(r, 600));
    page = await mp.currentPage();
    await helpers.waitReady(page);
    let data = await page.data();

    const defaultTone = data.tone;
    const defaultLabel = data.toneLabel;
    report.step('默认语气', 'pass', `tone=${defaultTone} label=${defaultLabel}`);

    const toneBadge = await page.$('.tone-badge');
    if (toneBadge) {
      const outer = await toneBadge.outerWxml();
      const cls = outer.match(/class="([^"]*)"/);
      const badgeClass = cls ? cls[1] : '';
      if (!badgeClass.includes(defaultTone)) {
        report.step('tone-badge 类名', 'warn', `期望含 ${defaultTone}, 实际 ${badgeClass}`);
      } else {
        report.step('tone-badge 类名', 'pass', badgeClass);
      }
    } else {
      report.step('tone-badge 类名', 'warn', '.tone-badge 未找到');
    }

    await mp.switchTab('/pages/stats/stats');
    await new Promise(r => setTimeout(r, 500));
    page = await mp.currentPage();
    await helpers.waitReady(page);

    const sassyOpt = await page.$('.tone-option.sassy');
    if (!sassyOpt) { report.step('找毒舌选项', 'fail', '.tone-option.sassy 未找到'); return; }
    await sassyOpt.tap();

    await helpers.waitUntil(async () => {
      const d = await page.data();
      return d.tone === 'sassy';
    }, { timeout: 3000 });
    report.step('切换到毒舌', 'pass', 'stats 页 tone=sassy');

    await mp.switchTab('/pages/assistant/assistant');
    await new Promise(r => setTimeout(r, 600));
    page = await mp.currentPage();
    await helpers.waitReady(page);
    data = await page.data();

    if (data.tone !== 'sassy') {
      report.step('教练页 tone 同步', 'fail', `期望 sassy, 实际 ${data.tone}`); return;
    }
    if (data.toneLabel !== '毒舌') {
      report.step('教练页 toneLabel 同步', 'fail', `期望 毒舌, 实际 ${data.toneLabel}`); return;
    }
    const welcomeHasCount = /\d+\s*个习惯/.test(data.welcomeText || '');
    report.step('毒舌欢迎语', welcomeHasCount ? 'pass' : 'warn', (data.welcomeText || '').slice(0, 80));

    const input = await page.$('.ai-input');
    if (!input) { report.step('找输入框', 'fail', '.ai-input 未找到'); return; }
    await input.input('今天还有几个没打？');

    const sendBtn = await page.$('.ai-send-btn');
    if (!sendBtn) { report.step('找发送按钮', 'fail', '.ai-send-btn 未找到'); return; }
    await sendBtn.tap();

    const sentCount = await helpers.waitUntil(async () => {
      const d = await page.data();
      const msgs = d.messages || [];
      return msgs.length > 0 && msgs.some(m => m.role === 'user' && (m.content || '').includes('今天还有几个没打'));
    }, { timeout: 3000 });
    if (!sentCount) { report.step('用户消息上屏', 'fail', '未出现在 messages'); return; }
    report.step('用户消息上屏', 'pass', 'ok');

    const replied = await helpers.waitUntil(async () => {
      const d = await page.data();
      return d.sending === false;
    }, { timeout: 30000 });
    if (!replied) { report.step('AI 回复', 'fail', 'sending 一直 true，30s 超时'); return; }

    data = await page.data();
    const msgs = data.messages || [];
    const lastAi = [...msgs].reverse().find(m => m.role === 'assistant');
    if (!lastAi || !lastAi.content) {
      report.step('AI 回复内容', 'fail', '最后一条 assistant 消息为空'); return;
    }
    if (lastAi.error === true) {
      report.step('AI 回复内容', 'fail', '返回错误：' + (lastAi.content || '').slice(0, 200));
      return;
    }
    if (lastAi.pending === true) {
      report.step('AI 回复内容', 'fail', '仍然 pending');
      return;
    }
    report.step('AI 回复内容', 'pass', (lastAi.content || '').slice(0, 80) + '...');

    const shot = await helpers.screenshot('coach-sassy-reply');
    if (shot) report.shot(shot);

    try {
      await mp.switchTab('/pages/stats/stats');
      await new Promise(r => setTimeout(r, 500));
      page = await mp.currentPage();
      const normalOpt = await page.$('.tone-option.normal');
      if (normalOpt) { await normalOpt.tap(); }
    } catch {}
  }
};
