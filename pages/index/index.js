const { TAB_MAP } = require('../../utils/constants.js');
const store = require('../../utils/store.js');
const subConfig = require('../../utils/subscribe-config.js');

const DUO_MESSAGES = {
  warm: [
    { msg: '今天还没打卡呢~', sub: '坚持就是胜利，你可以的！' },
    { msg: '想你了！', sub: '你的习惯在等你回来~' },
    { msg: '加油加油！', sub: '你已经坚持了{streak}天，别断哦~' }
  ],
  sassy: [
    { msg: '哦？又来了？', sub: '我还以为你已经放弃了呢~' },
    { msg: '你可真是个大忙人', sub: '连1分钟打卡的时间都没有？' },
    { msg: '连胜{streak}天呢', sub: '可惜今天就要归零了，呵~' }
  ],
  threat: [
    { msg: '你的连胜火焰快灭了！', sub: '{streak}天的努力，真的要放弃吗？' },
    { msg: '最后警告！', sub: '再不打卡，连胜就没了！' },
    { msg: '我数到3！', sub: '1... 2... 赶紧去打卡！' }
  ],
  celebrate: [
    { msg: '太棒了！！', sub: '又完成一天！你是最棒的！' },
    { msg: '连胜{streak}天！！', sub: '你简直是个自律机器！' },
    { msg: '哇哦~', sub: '今天的你也在闪闪发光！' }
  ]
};

Page({
  data: {
    statusH: '44px',
    loading: true,
    todayStr: '',
    dateLabel: '',
    greeting: '',
    totalStreak: 0,
    uncheckedCount: 0,
    reminderText: '',
    habits: [],
    showEmpty: false,
    // 打卡弹窗
    checkinVisible: false,
    checkinHabit: null,
    checkinNote: '',
    checkinIsDone: false,
    currentCheckinId: '',
    checkinPlanItems: [],
    checkinSelectedItems: [],
    // 劝留弹窗
    duoVisible: false,
    duoMsg: '',
    duoSub: '',
    // 成功动效
    successVisible: false,
    successStreak: 0,
    successMsg: '',
    // 每日打卡引导弹窗
    reminderPromptVisible: false,
    reminderHabits: []
  },

  onLoad() {
    const sys = wx.getWindowInfo();
    this.setData({ statusH: (sys.statusBarHeight || 44) + 'px' });
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 0 });
    }
    const app = getApp();
    if (app.globalData.loggedIn) {
      this._refreshData();
      this._subscribeRefresh();
      return;
    }
    if (app.globalData.initPromise) {
      app.globalData.initPromise.then(res => {
        if (res && res.status === 'error') {
          wx.showToast({ title: res.message || '初始化失败', icon: 'none' });
        }
        this._refreshData();
        this._subscribeRefresh();
      });
    } else {
      this._refreshData();
      this._subscribeRefresh();
    }
  },

  onHide() {
    if (this._unsubscribeRefresh) {
      this._unsubscribeRefresh();
      this._unsubscribeRefresh = null;
    }
  },

  onUnload() {
    if (this._unsubscribeRefresh) {
      this._unsubscribeRefresh();
      this._unsubscribeRefresh = null;
    }
  },

  // 订阅服务端后台刷新：缓存秒开后，云端数据回来时自动重渲染
  _subscribeRefresh() {
    if (this._unsubscribeRefresh) return;
    this._unsubscribeRefresh = store.onRefreshed(() => {
      this._refreshData();
    });
  },

  _refreshData() {
    if (!getApp().globalData.ready) {
      this.setData({ loading: true });
      return;
    }
    const habits = store.getHabits();
    const today = store.todayStr();
    const enriched = habits.map(h => ({
      ...h,
      iconEmoji: store.habitEmoji(h.icon),
      streak: store.calcStreak(h.id),
      checkedToday: store.isCheckedInToday(h.id),
      lastNote: this._getLastNote(h.id)
    }));
    const maxStreak = Math.max(0, ...enriched.map(h => h.streak));
    const unchecked = enriched.filter(h => !h.checkedToday).length;
    const reminderHabits = habits.filter(h => h.reminder);
    const reminderText = reminderHabits.length > 0
      ? reminderHabits.map(h => h.reminder + ' ' + h.name).join(' · ')
      : '暂无提醒';

    this.setData({
      loading: false,
      habits: enriched,
      todayStr: today,
      dateLabel: this._fmtDate(),
      greeting: this._getGreeting(),
      totalStreak: maxStreak,
      uncheckedCount: unchecked,
      reminderText: reminderText,
      showEmpty: habits.length === 0
    });
    this._maybeShowReminderPrompt();
  },

  _getGreeting() {
    const h = new Date().getHours();
    if (h < 6) return '夜深了';
    if (h < 9) return '早上好';
    if (h < 12) return '上午好';
    if (h < 14) return '中午好';
    if (h < 18) return '下午好';
    return '晚上好';
  },

  _getLastNote(habitId) {
    const checkins = store.getCheckins()
      .filter(c => c.habitId === habitId)
      .sort((a, b) => b.date.localeCompare(a.date));
    if (checkins.length === 0) return '暂无记录';
    return '昨日记：' + (checkins[0].note || '无备注');
  },

  _fmtDate() {
    const d = new Date();
    const weekNames = ['日', '一', '二', '三', '四', '五', '六'];
    return (d.getMonth() + 1) + '月' + d.getDate() + '日 周' + weekNames[d.getDay()];
  },

  // ========== 打卡弹窗 ==========
  onHabitTap(e) {
    const habitId = e.currentTarget.dataset.id;
    this._openCheckinSheet(habitId);
  },

  onQuickCheckin(e) {
    const habitId = e.currentTarget.dataset.id;
    this._openCheckinSheet(habitId);
  },

  _openCheckinSheet(habitId) {
    const habit = this.data.habits.find(h => h.id === habitId);
    if (!habit) return;
    const today = store.todayStr();
    const todayCheckins = store.getCheckins().filter(c => c.habitId === habitId && c.date === today);
    const isDone = todayCheckins.length > 0;
    const planItems = (habit.plan && Array.isArray(habit.plan.items)) ? habit.plan.items : [];
    const existingSelected = (isDone && Array.isArray(todayCheckins[0].selectedItems)) ? todayCheckins[0].selectedItems : [];
    const selectedTexts = existingSelected.map(s => s.text);
    const planItemsView = planItems.map(p => ({
      text: p.text,
      color: p.color || '#6366f1',
      isSelected: selectedTexts.indexOf(p.text) !== -1
    }));
    this.setData({
      checkinVisible: true,
      checkinHabit: habit,
      checkinIsDone: isDone,
      checkinNote: isDone ? (todayCheckins[0].note || '') : '',
      currentCheckinId: isDone ? todayCheckins[0].id : '',
      checkinPlanItems: planItemsView,
      checkinSelectedItems: existingSelected
    });
  },

  onCheckinNoteInput(e) {
    this.setData({ checkinNote: e.detail.value });
  },

  onCheckinItemToggle(e) {
    const text = e.currentTarget.dataset.text;
    if (!text) return;
    const planItems = this.data.checkinPlanItems.map(p => {
      if (p.text === text) return Object.assign({}, p, { isSelected: !p.isSelected });
      return p;
    });
    const selectedItems = planItems.filter(p => p.isSelected).map(p => ({ text: p.text, color: p.color }));
    this.setData({ checkinPlanItems: planItems, checkinSelectedItems: selectedItems });
  },

  onCheckinConfirm() {
    const { checkinHabit, checkinNote, checkinIsDone, currentCheckinId, checkinSelectedItems } = this.data;
    if (!checkinHabit) return;
    if (checkinIsDone) {
      // 更新备注 + 完成项
      const data = store.getData();
      const c = data.checkins.find(x => x.id === currentCheckinId);
      if (c) {
        c.note = (checkinNote || '').trim();
        c.selectedItems = checkinSelectedItems || [];
        store.saveToServer().then(() => {
          wx.showToast({ title: '已更新', icon: 'success' });
          this.setData({ checkinVisible: false });
          this._refreshData();
        }).catch(() => wx.showToast({ title: '保存失败', icon: 'none' }));
      }
      return;
    }
    store.toggleCheckin(checkinHabit.id, (checkinNote || '').trim(), checkinSelectedItems || []).then(() => {
      this.setData({ checkinVisible: false });
      this._refreshData();
      this._showCheckinSuccess(checkinHabit.id);
      // 方案A：打卡后补一次订阅额度。放独立 try，避免拖累打卡主流程
      try {
        this._maybeRefillSubscribeQuota(checkinHabit);
      } catch (e) {
        console.warn('refill quota failed', e);
      }
    }).catch((err) => {
      console.error('checkin fail', err);
      wx.showToast({ title: '打卡失败', icon: 'none' });
    });
  },

  onCheckinUndo() {
    const { checkinHabit } = this.data;
    if (!checkinHabit) return;
    store.toggleCheckin(checkinHabit.id, '').then(() => {
      wx.showToast({ title: '已撤销今日打卡', icon: 'none' });
      this.setData({ checkinVisible: false });
      this._refreshData();
    }).catch(() => wx.showToast({ title: '操作失败', icon: 'none' }));
  },

  onCheckinAskCoach() {
    const { checkinHabit } = this.data;
    if (checkinHabit) getApp().globalData.pendingHabitId = checkinHabit.id;
    this.setData({ checkinVisible: false });
    wx.switchTab({ url: '/pages/assistant/assistant' });
  },

  onCheckinLater() {
    // 触发劝留弹窗
    const { checkinHabit } = this.data;
    const styles = ['warm', 'sassy', 'threat'];
    const style = styles[Math.floor(Math.random() * styles.length)];
    const msgs = DUO_MESSAGES[style];
    const msg = msgs[Math.floor(Math.random() * msgs.length)];
    const streak = checkinHabit ? store.calcStreak(checkinHabit.id) : 0;
    this.setData({
      checkinVisible: false,
      duoVisible: true,
      duoMsg: msg.msg.replace('{streak}', streak),
      duoSub: msg.sub.replace('{streak}', streak)
    });
  },

  onCheckinSkip() {
    this.setData({ checkinVisible: false });
  },

  onCheckinClose() {
    this.setData({ checkinVisible: false });
  },

  onDuoGoCheckin() {
    // 回到打卡弹窗
    this.setData({ duoVisible: false });
    if (this.data.checkinHabit) {
      this.setData({ checkinVisible: true });
    }
  },

  onDuoSkipToday() {
    this.setData({ duoVisible: false });
  },

  // ========== 成功动效 ==========
  _showCheckinSuccess(habitId) {
    const streak = store.calcStreak(habitId);
    const msgs = DUO_MESSAGES.celebrate;
    const msg = msgs[Math.floor(Math.random() * msgs.length)];
    this.setData({
      successVisible: true,
      successStreak: streak,
      successMsg: msg.sub.replace('{streak}', streak)
    });
    clearTimeout(this._successTimer);
    this._successTimer = setTimeout(() => {
      this.setData({ successVisible: false });
    }, 2400);
  },

  onSuccessTap() {
    clearTimeout(this._successTimer);
    this.setData({ successVisible: false });
  },

  // ========== 其他 ==========
  onAiLinkTap(e) {
    const habitId = e.currentTarget.dataset.id;
    if (habitId) getApp().globalData.pendingHabitId = habitId;
    wx.switchTab({ url: '/pages/assistant/assistant' });
  },

  onFabTap() {
    wx.navigateTo({ url: '/pages/habit-edit/habit-edit' });
  },

  onEmptyCreate() {
    wx.navigateTo({ url: '/pages/habit-edit/habit-edit' });
  },

  onTab(e) {
    const t = e.currentTarget.dataset.tab;
    if (t === 'index') return;
    wx.switchTab({ url: TAB_MAP[t] });
  },

  _noopTap() {},

  _maybeRefillSubscribeQuota(habit) {
    if (!habit || !habit.reminder) return;
    const tmplId = subConfig.REMINDER_TEMPLATE_ID;
    if (!tmplId) return;
    // 用 setTimeout 让打卡成功动效先展示出来，再弹订阅授权
    setTimeout(() => {
      wx.requestSubscribeMessage({
        tmplIds: [tmplId],
        success: (res) => {
          const status = res[tmplId];
          const accepted = status === 'accept' ? subConfig.SUBSCRIBE_BATCH : 0;
          if (accepted > 0) {
            store.saveReminderConfig(habit, accepted).catch(() => {});
          }
        },
        fail: () => {}
      });
    }, 1500);
  },

  // 每日首次打开：弹打卡引导（按提醒时间+当前时间筛当日未打卡习惯）
  _maybeShowReminderPrompt() {
    const today = store.todayStr();
    let lastPromptDate = '';
    try { lastPromptDate = wx.getStorageSync('habit_last_prompt_date') || ''; } catch (e) {}
    if (lastPromptDate === today) return;  // 今天已经弹过

    const now = new Date();
    const nowHM = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
    const habits = store.getHabits();
    const due = habits
      .filter(h => h.reminder && h.reminder <= nowHM && !store.isCheckedInToday(h.id))
      .map(h => ({
        id: h.id,
        name: h.name,
        iconEmoji: store.habitEmoji(h.icon),
        color: h.color || '#6366f1',
        reminder: h.reminder
      }));

    try { wx.setStorageSync('habit_last_prompt_date', today); } catch (e) {}
    if (due.length === 0) return;
    this.setData({ reminderPromptVisible: true, reminderHabits: due });
  },

  onReminderRowTap(e) {
    const id = e.currentTarget.dataset.id;
    this.setData({ reminderPromptVisible: false });
    if (id) this._openCheckinSheet(id);
  },

  onReminderPromptDismiss() {
    this.setData({ reminderPromptVisible: false });
  }
});
