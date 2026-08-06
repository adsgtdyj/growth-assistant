// 01-today.spec.js
// 今日模块 - 新建任务到打卡，验证打卡数据正确

const SMOKE_HABIT_NAME = 'Smoke测试-今日';

module.exports = {
  name: '今日模块 - 新建任务到打卡',
  async run({ mp, helpers, report }) {
    await mp.reLaunch('/pages/index/index');
    let page = await mp.currentPage();
    await helpers.waitReady(page);

    let data = await page.data();
    const before = (data.habits || []).length;
    report.step('首页加载', 'pass', `当前 ${before} 个习惯`);

    const fab = await page.$('.fab-btn');
    if (!fab) { report.step('找新建按钮', 'fail', '.fab-btn 未找到'); return; }
    await fab.tap();
    const reachedEdit = await helpers.waitUntil(async () => {
      const stack = await mp.pageStack();
      return stack.some(p => p.path && p.path.includes('habit-edit'));
    }, { timeout: 6000 });
    if (!reachedEdit) { report.step('跳转 habit-edit', 'fail', '未跳转'); return; }
    report.step('点击新建按钮跳转', 'pass', '已进入 habit-edit');

    page = await mp.currentPage();

    const nameInput = await page.$('.form-input');
    if (!nameInput) { report.step('找名称输入框', 'fail', '.form-input 未找到'); return; }
    await nameInput.input(SMOKE_HABIT_NAME);
    report.step('填入习惯名称', 'pass', SMOKE_HABIT_NAME);

    const icons = await page.$$('.icon-item');
    if (!icons || icons.length === 0) { report.step('找图标', 'fail', '无 .icon-item'); return; }
    await icons[0].tap();
    report.step('选择图标', 'pass', `共 ${icons.length} 个，已选第 1 个`);

    const colors = await page.$$('.color-item');
    if (!colors || colors.length === 0) { report.step('找颜色', 'fail', '无 .color-item'); return; }
    await colors[0].tap();
    report.step('选择颜色', 'pass');

    const saveBtn = await page.$('.save-btn');
    if (!saveBtn) { report.step('找保存按钮', 'fail', '.save-btn 未找到'); return; }
    await saveBtn.tap();

    const backHome = await helpers.waitUntil(async () => {
      const stack = await mp.pageStack();
      return stack.length === 1 && stack[0].path.includes('index');
    }, { timeout: 10000 });
    if (!backHome) { report.step('返回首页', 'fail', '保存后未返回首页'); return; }

    page = await mp.currentPage();
    await helpers.waitReady(page);

    data = await page.data();
    const after = (data.habits || []).length;
    if (after !== before + 1) {
      report.step('习惯数校验', 'fail', `before=${before} after=${after}, 应+1`);
      return;
    }
    report.step('习惯数+1', 'pass', `before=${before} after=${after}`);

    const habit = (data.habits || []).find(h => h.name === SMOKE_HABIT_NAME);
    if (!habit) { report.step('查找新习惯', 'fail', '新习惯未出现在列表'); return; }
    if (habit.checkedToday !== false) {
      report.step('初始 checkedToday', 'warn', `应为 false，实际 ${habit.checkedToday}`);
    } else {
      report.step('初始 checkedToday', 'pass', 'false');
    }

    const cards = await page.$$('.habit-card');
    let target = null;
    for (const c of cards) {
      const id = await c.attribute('data-id');
      if (id === habit.id) { target = c; break; }
    }
    if (!target) { report.step('找新习惯卡片', 'fail', 'data-id 匹配失败'); return; }
    await target.tap();

    const checked = await helpers.waitUntil(async () => {
      const d = await page.data();
      const h = (d.habits || []).find(x => x.id === habit.id);
      return h && h.checkedToday === true;
    }, { timeout: 6000 });

    data = await page.data();
    const updated = (data.habits || []).find(h => h.id === habit.id);
    if (!checked || !updated || updated.checkedToday !== true) {
      report.step('打卡校验', 'fail', `checkedToday=${updated && updated.checkedToday}`);
      return;
    }
    if (updated.streak < 1) {
      report.step('streak 校验', 'warn', `streak=${updated.streak}, 应 >=1`);
    } else {
      report.step('streak 校验', 'pass', `streak=${updated.streak}`);
    }
    report.step('打卡成功', 'pass', `checkedToday=${updated.checkedToday} streak=${updated.streak}`);

    const shot = await helpers.screenshot('today-checkedin');
    if (shot) report.shot(shot);
  }
};
