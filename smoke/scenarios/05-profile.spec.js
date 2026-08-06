// 05-profile.spec.js
// 我的模块 - 个人信息、习惯增删、语气同步、退出重进

const SMOKE_EDIT_NAME = 'Smoke编辑后';

module.exports = {
  name: '我的模块 - 个人信息与习惯管理',
  async run({ mp, helpers, report }) {
    await mp.reLaunch('/pages/index/index');
    let page = await mp.currentPage();
    await helpers.waitReady(page);

    await mp.switchTab('/pages/stats/stats');
    await new Promise(r => setTimeout(r, 600));
    page = await mp.currentPage();
    await helpers.waitReady(page);
    let data = await page.data();

    const nickname = data.nickname;
    const slogan = data.slogan;
    if (!nickname) {
      report.step('昵称展示', 'warn', `nickname=${nickname}`);
    } else {
      report.step('昵称展示', 'pass', nickname);
    }
    if (!slogan) {
      report.step('标语展示', 'warn', `slogan=${slogan}`);
    } else {
      report.step('标语展示', 'pass', slogan);
    }

    const editBtn = await page.$('.edit-profile-btn');
    if (!editBtn) {
      report.step('编辑资料按钮', 'warn', '.edit-profile-btn 不存在');
    } else {
      const outer = await editBtn.outerWxml();
      const hasBindtap = /bindtap=/.test(outer);
      if (!hasBindtap) {
        report.step('编辑资料按钮', 'warn', '存在但无 bindtap（点击不会触发任何动作）');
      } else {
        const beforeStack = await mp.pageStack();
        await editBtn.tap();
        await new Promise(r => setTimeout(r, 700));
        const afterStack = await mp.pageStack();
        if (afterStack.length === beforeStack.length) {
          report.step('编辑资料按钮', 'warn', '点击后无跳转');
        } else {
          report.step('编辑资料按钮', 'pass', `跳转到 ${afterStack[afterStack.length - 1].path}`);
          try { await mp.navigateBack(); } catch {}
        }
      }
    }

    data = await page.data();
    const habits = data.habits || [];
    if (habits.length === 0) {
      report.step('习惯列表', 'warn', '为空，无法测试编辑/删除'); return;
    }
    report.step('习惯列表', 'pass', `${habits.length} 个`);

    const target = habits.find(h => h.name === 'Smoke测试-今日');
    if (!target) {
      report.step('找测试习惯', 'warn', '没找到 Smoke测试-今日，跳过编辑测试');
    } else {
      const editBtns = await page.$$('.habit-edit');
      let editBtn = null;
      for (const b of editBtns) {
        const id = await b.attribute('data-id');
        if (id === target.id) { editBtn = b; break; }
      }
      if (!editBtn) {
        report.step('找编辑按钮', 'warn', '无匹配 data-id');
      } else {
        await editBtn.tap();
        const reachedEdit = await helpers.waitUntil(async () => {
          const stack = await mp.pageStack();
          return stack.some(p => p.path && p.path.includes('habit-edit'));
        }, { timeout: 5000 });
        if (!reachedEdit) {
          report.step('进入编辑页', 'fail', '未跳转 habit-edit');
        } else {
          page = await mp.currentPage();
          const nameInput = await page.$('.form-input');
          if (nameInput) {
            await nameInput.input(SMOKE_EDIT_NAME);
          }
          const saveBtn = await page.$('.save-btn');
          if (saveBtn) { await saveBtn.tap(); }
          const back = await helpers.waitUntil(async () => {
            const stack = await mp.pageStack();
            return stack.length === 1 && stack[0].path.includes('stats');
          }, { timeout: 7000 });
          if (!back) {
            report.step('编辑保存返回', 'fail', '未返回 stats');
          } else {
            page = await mp.currentPage();
            await helpers.waitReady(page);
            data = await page.data();
            const renamed = (data.habits || []).find(h => h.id === target.id);
            if (renamed && renamed.name === SMOKE_EDIT_NAME) {
              report.step('编辑保存生效', 'pass', `name=${renamed.name}`);
            } else {
              report.step('编辑保存生效', 'fail', `期望 ${SMOKE_EDIT_NAME}, 实际 ${renamed && renamed.name}`);
            }
          }
        }
      }
    }

    page = await mp.currentPage();
    const sassyOpt = await page.$('.tone-option.sassy');
    if (!sassyOpt) {
      report.step('切毒舌', 'warn', '找不到 .tone-option.sassy');
    } else {
      await sassyOpt.tap();
      await helpers.waitUntil(async () => {
        const d = await page.data();
        return d.tone === 'sassy';
      }, { timeout: 3000 });
      await mp.switchTab('/pages/assistant/assistant');
      await new Promise(r => setTimeout(r, 600));
      page = await mp.currentPage();
      await helpers.waitReady(page);
      data = await page.data();
      if (data.tone === 'sassy' && data.toneLabel === '毒舌') {
        report.step('语气同步到教练页', 'pass', `tone=${data.tone} label=${data.toneLabel}`);
      } else {
        report.step('语气同步到教练页', 'fail', `tone=${data.tone} label=${data.toneLabel}`);
      }
      await mp.switchTab('/pages/stats/stats');
      await new Promise(r => setTimeout(r, 500));
      page = await mp.currentPage();
      const normalOpt = await page.$('.tone-option.normal');
      if (normalOpt) { await normalOpt.tap(); }
    }

    page = await mp.currentPage();
    await helpers.waitReady(page);
    try {
      await mp.mockWxMethod('showModal', (cfg) => {
        if (cfg && cfg.success) cfg.success({ confirm: true, cancel: false });
      });
    } catch (e) { /* mockWxMethod not supported */ }

    const settingItems = await page.$$('.setting-item');
    let logoutBtn = null;
    for (const it of settingItems) {
      const html = await it.outerWxml();
      if (/退出登录/.test(html)) { logoutBtn = it; break; }
    }
    if (!logoutBtn) {
      report.step('找退出按钮', 'warn', '未找到');
    } else {
      await logoutBtn.tap();
      const reachedLogin = await helpers.waitUntil(async () => {
        const stack = await mp.pageStack();
        return stack.length === 1 && stack[0].path.includes('login');
      }, { timeout: 6000 });
      if (!reachedLogin) {
        report.step('退出后到登录页', 'fail', '未跳转到 login');
      } else {
        report.step('退出后到登录页', 'pass', '已 reLaunch 到 /pages/login/login');
        await mp.reLaunch('/pages/index/index');
        await new Promise(r => setTimeout(r, 2000));
        page = await mp.currentPage();
        await helpers.waitReady(page);
        data = await page.data();
        const reloaded = (data.habits || []).length;
        if (reloaded > 0) {
          report.step('退出重进数据', 'pass', `重新加载到 ${reloaded} 个习惯`);
        } else {
          report.step('退出重进数据', 'warn', `habit 数 = 0`);
        }
      }
    }

    try { await mp.restoreWxMethod('showModal'); } catch {}

    const shot = await helpers.screenshot('profile-final');
    if (shot) report.shot(shot);
  }
};
