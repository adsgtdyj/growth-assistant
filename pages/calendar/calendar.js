const { TAB_MAP } = require('../../utils/constants.js');
const store = require('../../utils/store.js');

Page({
  data: {
    statusH: '44px',
    active: 'calendar',
    year: 2026,
    month: 7,
    monthTitle: '',
    days: [],
    totalCheckins: 0,
    totalDays: 0,
    checkinRate: '0%',
    detailVisible: false,
    selectedDate: '',
    selectedDateLabel: '',
    detailCheckins: []
  },

  onLoad() {
    const sys = wx.getWindowInfo();
    const now = new Date();
    this.setData({
      statusH: (sys.statusBarHeight || 44) + 'px',
      year: now.getFullYear(),
      month: now.getMonth() + 1
    });
    this._buildCalendar();
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 1 });
    }
    this._buildCalendar();
  },

  prevMonth() {
    let { year, month } = this.data;
    month--;
    if (month < 1) { month = 12; year--; }
    this.setData({ year, month });
    this._buildCalendar();
  },

  nextMonth() {
    let { year, month } = this.data;
    month++;
    if (month > 12) { month = 1; year++; }
    this.setData({ year, month });
    this._buildCalendar();
  },

  _buildCalendar() {
    if (!getApp().globalData.ready) return;
    const { year, month } = this.data;
    const checkins = store.getCheckins();
    const habits = store.getHabits();
    const today = store.todayStr();
    const habitCount = habits.length;

    const prefix = year + '-' + String(month).padStart(2, '0') + '-';
    const dayCounts = {};
    checkins.forEach(c => {
      if (c.date.startsWith(prefix)) {
        dayCounts[c.date] = (dayCounts[c.date] || 0) + 1;
      }
    });

    const daysInMonth = new Date(year, month, 0).getDate();
    const firstDayOfWeek = new Date(year, month - 1, 1).getDay();
    const days = [];

    for (let i = 0; i < firstDayOfWeek; i++) {
      days.push({ day: '', dateStr: '', level: 0, isEmpty: true });
    }
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = prefix + String(d).padStart(2, '0');
      const count = dayCounts[dateStr] || 0;
      const rate = habitCount > 0 ? count / habitCount : 0;
      let level = 0;
      if (rate > 0 && rate <= 0.33) level = 1;
      else if (rate > 0.33 && rate <= 0.66) level = 2;
      else if (rate > 0.66) level = 3;
      days.push({
        day: d, dateStr: dateStr, level: level,
        isToday: dateStr === today,
        hasNote: checkins.some(c => c.date === dateStr && c.note)
      });
    }

    const activeDays = Object.keys(dayCounts).length;
    const rate = daysInMonth > 0 ? Math.round(activeDays / daysInMonth * 100) : 0;
    const totalChecks = Object.values(dayCounts).reduce((a, b) => a + b, 0);

    this.setData({
      days: days,
      monthTitle: year + '年' + month + '月',
      totalCheckins: totalChecks,
      totalDays: daysInMonth,
      checkinRate: rate + '%'
    });
  },

  onDayTap(e) {
    const dateStr = e.currentTarget.dataset.date;
    if (!dateStr) return;
    const detail = store.getCheckins()
      .filter(c => c.date === dateStr)
      .map(c => {
        const h = store.getHabits().find(x => x.id === c.habitId);
        let time = '';
        if (c.createdAt) {
          const d = new Date(c.createdAt);
          time = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
        }
        return {
          ...c,
          habitName: h ? h.name : '已删除',
          habitIcon: h ? store.habitEmoji(h.icon) : '🎯',
          habitColor: h ? h.color : '#94a3b8',
          time: time,
          selectedItems: Array.isArray(c.selectedItems) ? c.selectedItems : []
        };
      });
    const d = new Date(dateStr);
    const weekNames = ['日', '一', '二', '三', '四', '五', '六'];
    const label = (d.getMonth() + 1) + '月' + d.getDate() + '日 周' + weekNames[d.getDay()] + ' 打卡记录';
    this.setData({
      detailVisible: true,
      selectedDate: dateStr,
      selectedDateLabel: label,
      detailCheckins: detail
    });
  },

  onCloseDetail() {
    this.setData({ detailVisible: false, selectedDate: '', selectedDateLabel: '', detailCheckins: [] });
  },

  onTab(e) {
    const t = e.currentTarget.dataset.tab;
    if (t === this.data.active) return;
    wx.switchTab({ url: TAB_MAP[t] });
  }
});
