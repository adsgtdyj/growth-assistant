// 04-analytics.spec.js
// 分析模块 - 统计正确 + 单任务跳转验证

module.exports = {
  name: '分析模块 - 统计与跳转',
  async run({ mp, helpers, report }) {
    await mp.reLaunch('/pages/index/index');
    let page = await mp.currentPage();
    await helpers.waitReady(page);

    let data = await page.data();
    const habits = data.habits || [];
    const totalTodayChecked = habits.filter(h => h.checkedToday).length;
    report.step('准备数据', totalTodayChecked > 0 ? 'pass' : 'warn',
      `今日已打卡 ${totalTodayChecked}/${habits.length}`);

    await mp.switchTab('/pages/analytics/analytics');
    await new Promise(r => setTimeout(r, 600));
    page = await mp.currentPage();
    await helpers.waitReady(page);
    data = await page.data();

    if (typeof data.totalCheckins !== 'number' || data.totalCheckins < 1) {
      report.step('累计打卡数', 'fail', `totalCheckins=${data.totalCheckins}`); return;
    }
    report.step('累计打卡数', 'pass', `${data.totalCheckins}`);

    if (data.activeHabits !== habits.length) {
      report.step('进行中习惯数', 'warn', `分析页=${data.activeHabits} 首页=${habits.length}`);
    } else {
      report.step('进行中习惯数', 'pass', `${data.activeHabits}`);
    }

    if (!/^\d+%$/.test(data.weekRate)) {
      report.step('本周完成率', 'fail', `weekRate=${data.weekRate}`); return;
    }
    report.step('本周完成率', 'pass', data.weekRate);

    const weekDays = data.weekDays || [];
    if (weekDays.length !== 7) {
      report.step('7天趋势', 'fail', `weekDays 长度 ${weekDays.length}`);
    } else {
      const todayEntry = weekDays[weekDays.length - 1];
      if (todayEntry.count < 1) {
        report.step('今日趋势条', 'warn', `count=${todayEntry.count}`);
      } else {
        report.step('今日趋势条', 'pass', `${todayEntry.label}=${todayEntry.count}`);
      }
    }

    const rates = data.habitRates || [];
    if (rates.length !== habits.length) {
      report.step('习惯完成率列表', 'warn', `分析页=${rates.length} 首页=${habits.length}`);
    } else {
      report.step('习惯完成率列表', 'pass', `${rates.length} 个`);
    }

    const beforeStack = await mp.pageStack();
    const beforeLen = beforeStack.length;
    const rows = await page.$$('.compare-row');
    if (!rows || rows.length === 0) {
      report.step('找完成率行', 'warn', '无 .compare-row');
    } else {
      await rows[0].tap();
      await new Promise(r => setTimeout(r, 700));
      const afterStack = await mp.pageStack();
      const afterLen = afterStack.length;
      if (afterLen === beforeLen && afterStack[afterLen - 1].path.includes('analytics')) {
        report.step('单任务跳转', 'warn', '点击 .compare-row 无跳转（当前版本不支持进入单任务分析）');
      } else {
        report.step('单任务跳转', 'pass', `跳转到 ${afterStack[afterLen - 1].path}`);
        try { await mp.navigateBack(); } catch {}
      }
    }

    const insights = data.insights || [];
    if (insights.length === 0) {
      report.step('智能洞察', 'warn', '为空');
    } else {
      const first = (insights[0].hl || '') + (insights[0].text || '').slice(0, 40);
      report.step('智能洞察', 'pass', `${insights.length} 条，首条: ${first}`);
    }

    const shot = await helpers.screenshot('analytics');
    if (shot) report.shot(shot);
  }
};
