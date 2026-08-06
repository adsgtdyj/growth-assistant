const store = require('../../utils/store.js');

Page({
  data: {
    statusH: '44px',
    habitId: '',
    habit: null,
    habitIcon: '🎯',
    streak: 0,
    total: 0,
    maxStreak: 0,
    monthCheckins: 0,
    daysInMonth: 30,
    monthRate: 0,
    totalRate: 0,
    calYear: 2026,
    calMonth: 7,
    calTitle: '',
    days: [],
    // 备注面板
    noteVisible: false,
    noteDate: '',
    noteDateLabel: '',
    noteCheckins: [],
    canMakeup: false,
    canTodayCheckin: false,
    // 补签弹窗
    makeupVisible: false,
    makeupDate: '',
    makeupNote: ''
  },

  onLoad(options) {
    const sys = wx.getWindowInfo();
    const now = new Date();
    this.setData({
      statusH: (sys.statusBarHeight || 44) + 'px',
      habitId: options.id || '',
      calYear: now.getFullYear(),
      calMonth: now.getMonth() + 1
    });
    this._render();
  },

  onShow() {
    this._render();
  },

  _render() {
    if (!getApp().globalData.ready) return;
    const { habitId, calYear, calMonth } = this.data;
    const habit = store.getHabits().find(h => h.id === habitId);
    if (!habit) {
      wx.showToast({ title: '习惯不存在', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 800);
      return;
    }
    const today = store.todayStr();
    const habitCheckins = store.getCheckins().filter(c => c.habitId === habitId);
    const total = habitCheckins.length;
    const streak = store.calcStreak(habitId);
    const maxStreak = store.getLongestStreak(habitId);

    const monthPrefix = calYear + '-' + String(calMonth).padStart(2, '0');
    const monthCheckins = habitCheckins.filter(c => c.date.startsWith(monthPrefix)).length;
    const daysInMonth = new Date(calYear, calMonth, 0).getDate();
    const monthRate = daysInMonth > 0 ? Math.round(monthCheckins / daysInMonth * 100) : 0;

    const createdAt = habit.createdAt || today;
    const daysSince = Math.max(1, Math.ceil((new Date() - new Date(createdAt)) / 86400000));
    const totalRate = Math.min(100, Math.round(total / daysSince * 100));

    this.setData({
      habit: habit,
      habitIcon: store.habitEmoji(habit.icon),
      streak: streak,
      total: total,
      maxStreak: maxStreak,
      monthCheckins: monthCheckins,
      daysInMonth: daysInMonth,
      monthRate: monthRate,
      totalRate: totalRate
    });

    this._buildCalendar();
    this._showTodayNote();
  },

  _buildCalendar() {
    const { habitId, calYear, calMonth } = this.data;
    const habitCheckins = store.getCheckins().filter(c => c.habitId === habitId);
    const today = store.todayStr();
    const prefix = calYear + '-' + String(calMonth).padStart(2, '0') + '-';

    const dayCounts = {};
    habitCheckins.forEach(c => {
      if (c.date.startsWith(prefix)) {
        dayCounts[c.date] = (dayCounts[c.date] || 0) + 1;
      }
    });

    const daysInMonth = new Date(calYear, calMonth, 0).getDate();
    const firstDayOfWeek = new Date(calYear, calMonth - 1, 1).getDay();
    const days = [];

    for (let i = 0; i < firstDayOfWeek; i++) {
      days.push({ day: '', dateStr: '', level: 0, isEmpty: true });
    }
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = prefix + String(d).padStart(2, '0');
      const count = dayCounts[dateStr] || 0;
      let level = 0;
      if (count >= 3) level = 3;
      else if (count >= 2) level = 2;
      else if (count >= 1) level = 1;
      days.push({
        day: d,
        dateStr: dateStr,
        level: level,
        isToday: dateStr === today,
        hasNote: habitCheckins.some(c => c.date === dateStr && c.note)
      });
    }

    this.setData({
      days: days,
      calTitle: calYear + '年' + calMonth + '月'
    });
  },

  _showTodayNote() {
    const today = store.todayStr();
    this._showNote(today);
  },

  _showNote(dateStr) {
    const { habitId, habit } = this.data;
    const today = store.todayStr();
    const checkins = store.getCheckins().filter(c => c.habitId === habitId && c.date === dateStr);
    const d = new Date(dateStr);
    const weekNames = ['日', '一', '二', '三', '四', '五', '六'];
    const label = (d.getMonth() + 1) + '月' + d.getDate() + '日 周' + weekNames[d.getDay()];

    const detail = checkins.map(c => {
      let time = '';
      if (c.createdAt) {
        const dt = new Date(c.createdAt);
        time = String(dt.getHours()).padStart(2, '0') + ':' + String(dt.getMinutes()).padStart(2, '0');
      }
      return { id: c.id, note: c.note || '已完成', time: time, isMakeup: !!c.isMakeup, selectedItems: Array.isArray(c.selectedItems) ? c.selectedItems : [] };
    });

    this.setData({
      noteVisible: true,
      noteDate: dateStr,
      noteDateLabel: label,
      noteCheckins: detail,
      canTodayCheckin: dateStr === today && detail.length === 0,
      canMakeup: dateStr < today && detail.length === 0
    });
  },

  prevMonth() {
    let { calYear, calMonth } = this.data;
    calMonth--;
    if (calMonth < 1) { calMonth = 12; calYear--; }
    this.setData({ calYear, calMonth, noteVisible: false });
    this._buildCalendar();
  },

  nextMonth() {
    let { calYear, calMonth } = this.data;
    calMonth++;
    if (calMonth > 12) { calMonth = 1; calYear++; }
    this.setData({ calYear, calMonth, noteVisible: false });
    this._buildCalendar();
  },

  onDayTap(e) {
    const dateStr = e.currentTarget.dataset.date;
    if (!dateStr) return;
    this._showNote(dateStr);
  },

  onTodayCheckin() {
    const { habitId } = this.data;
    store.toggleCheckin(habitId, '').then(() => {
      wx.showToast({ title: '打卡成功', icon: 'success' });
      this._render();
    }).catch(err => {
      wx.showToast({ title: err.message || '失败', icon: 'none' });
    });
  },

  onMakeup() {
    const { noteDate } = this.data;
    this.setData({
      makeupVisible: true,
      makeupDate: noteDate,
      makeupNote: ''
    });
  },

  onMakeupDateChange(e) {
    this.setData({ makeupDate: e.detail.value });
  },

  onMakeupNoteInput(e) {
    this.setData({ makeupNote: e.detail.value });
  },

  onMakeupConfirm() {
    const { habitId, makeupDate, makeupNote } = this.data;
    const today = store.todayStr();
    if (!makeupDate) {
      wx.showToast({ title: '请选择日期', icon: 'none' });
      return;
    }
    if (makeupDate >= today) {
      wx.showToast({ title: '补签只能选过去日期', icon: 'none' });
      return;
    }
    const exists = store.getCheckins().some(c => c.habitId === habitId && c.date === makeupDate);
    if (exists) {
      wx.showToast({ title: '该日期已有记录', icon: 'none' });
      return;
    }
    store.addCheckin(habitId, makeupDate, makeupNote || '补签').then(() => {
      wx.showToast({ title: '补签成功', icon: 'success' });
      this.setData({ makeupVisible: false });
      this._render();
      this._showNote(makeupDate);
    }).catch(err => {
      wx.showToast({ title: err.message || '失败', icon: 'none' });
    });
  },

  onMakeupCancel() {
    this.setData({ makeupVisible: false });
  },

  onDeleteCheckin(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    wx.showModal({
      title: '删除记录',
      content: '确定删除这条打卡记录吗？',
      success: (res) => {
        if (!res.confirm) return;
        store.deleteCheckin(id).then(() => {
          wx.showToast({ title: '已删除', icon: 'success' });
          this._render();
          this._showNote(this.data.noteDate);
        }).catch(err => {
          wx.showToast({ title: err.message || '失败', icon: 'none' });
        });
      }
    });
  },

  onEditNote(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    const c = store.getCheckins().find(x => x.id === id);
    if (!c) return;
    wx.showModal({
      title: '编辑备注',
      editable: true,
      placeholderText: '写下今天的心得（选填）',
      content: c.note || '',
      confirmText: '保存',
      success: (res) => {
        if (!res.confirm) return;
        const data = store.getData();
        const target = data.checkins.find(x => x.id === id);
        if (!target) return;
        target.note = (res.content || '').trim();
        store.saveToServer().then(() => {
          wx.showToast({ title: '已保存', icon: 'success' });
          this._render();
          this._showNote(this.data.noteDate);
        }).catch(err => {
          wx.showToast({ title: err.message || '保存失败', icon: 'none' });
        });
      }
    });
  },

  onEditHabit() {
    wx.navigateTo({ url: '/pages/habit-edit/habit-edit?id=' + this.data.habitId });
  },

  onBack() {
    wx.navigateBack();
  }
});
