// 02-calendar.spec.js
// 日历模块 - 验证打卡数据正确

module.exports = {
  name: '日历模块 - 打卡数据正确',
  async run({ mp, helpers, report }) {
    await mp.reLaunch('/pages/index/index');
    let page = await mp.currentPage();
    await helpers.waitReady(page);

    const today = helpers.todayStr();
    let data = await page.data();
    const habits = data.habits || [];
    const unchecked = habits.filter(h => !h.checkedToday);
    if (unchecked.length > 0) {
      for (const h of unchecked) {
        try {
          await page.callMethod('onHabitTap', { currentTarget: { dataset: { id: h.id } } });
        } catch (e) { /* ignore */ }
      }
      await new Promise(r => setTimeout(r, 1000));
    }
    data = await page.data();
    const totalCheckinsToday = (data.habits || []).filter(h => h.checkedToday).length;
    report.step('今日打卡就绪', totalCheckinsToday > 0 ? 'pass' : 'warn',
      `今日已打卡 ${totalCheckinsToday}/${habits.length}`);

    await mp.switchTab('/pages/calendar/calendar');
    await new Promise(r => setTimeout(r, 600));
    page = await mp.currentPage();
    await helpers.waitReady(page);
    data = await page.data();

    if (!data.days || data.days.length === 0) {
      report.step('日历加载', 'fail', 'days 为空'); return;
    }
    report.step('日历加载', 'pass', `${data.days.length} 天`);

    const todayCell = (data.days || []).find(d => d.dateStr === today);
    if (!todayCell) { report.step('查找今日格子', 'fail', `未找到 ${today}`); return; }
    if (todayCell.level < 1) {
      report.step('今日 level', 'warn', `level=${todayCell.level}, 应 >=1`);
    } else {
      report.step('今日 level', 'pass', `level=${todayCell.level}`);
    }
    if (todayCell.isToday !== true) {
      report.step('今日 isToday', 'warn', `isToday=${todayCell.isToday}`);
    } else {
      report.step('今日 isToday', 'pass', 'true');
    }

    if (data.totalCheckins < 1) {
      report.step('月度打卡数', 'warn', `totalCheckins=${data.totalCheckins}`);
    } else {
      report.step('月度打卡数', 'pass', `${data.totalCheckins}/${data.totalDays} 天 (${data.checkinRate})`);
    }

    const cells = await page.$$('.cal-day');
    let target = null;
    for (const c of cells) {
      const d = await c.attribute('data-date');
      if (d === today) { target = c; break; }
    }
    if (!target) { report.step('找今日 cell', 'fail', 'data-date 匹配失败'); return; }
    await target.tap();

    const opened = await helpers.waitUntil(async () => {
      const d = await page.data();
      return d.detailVisible === true;
    }, { timeout: 3000 });
    if (!opened) {
      report.step('详情面板打开', 'fail', 'detailVisible 未变 true'); return;
    }
    data = await page.data();
    const detailList = data.detailCheckins || [];
    if (detailList.length === 0) {
      report.step('今日详情', 'warn', '详情列表为空');
    } else {
      const names = detailList.map(d => d.habitName).join(', ');
      report.step('今日详情', 'pass', `${detailList.length} 条：${names}`);
    }

    const shot = await helpers.screenshot('calendar-today');
    if (shot) report.shot(shot);

    try {
      const closeBtn = await page.$('.day-detail-close');
      if (closeBtn) { await closeBtn.tap(); }
    } catch {}
  }
};
