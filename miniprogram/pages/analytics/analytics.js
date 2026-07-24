const { TAB_MAP } = require('../../utils/constants.js');
const store = require('../../utils/store.js');

Page({
  data: {
    statusH: '44px',
    active: 'analytics',
    loading: true,
    weekRate: '0%',
    weekTrend: '',
    longestStreak: 0,
    totalCheckins: 0,
    monthCheckins: 0,
    activeHabits: 0,
    weekDays: [],
    habitRates: [],
    insights: []
  },

  onLoad() {
    const sys = wx.getWindowInfo();
    this.setData({ statusH: (sys.statusBarHeight || 44) + 'px' });
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 3 });
    }
    this._compute();
  },

  _compute() {
    if (!getApp().globalData.ready) return;
    const habits = store.getHabits();
    const checkins = store.getCheckins();
    const today = store.todayStr();

    const weekDays = this._buildWeek(checkins, habits);
    const weekTotal = weekDays.reduce((s, d) => s + d.count, 0);
    const weekPossible = habits.length * 7;
    const weekRate = weekPossible > 0 ? Math.round(weekTotal / weekPossible * 100) : 0;

    let longestStreak = 0;
    habits.forEach(h => {
      const ls = store.getLongestStreak(h.id);
      if (ls > longestStreak) longestStreak = ls;
    });

    const monthPrefix = today.slice(0, 7);
    const monthCount = checkins.filter(c => c.date.startsWith(monthPrefix)).length;

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const cutoff = thirtyDaysAgo.toISOString().slice(0, 10);
    const habitRates = habits.map(h => {
      const hc = checkins.filter(c => c.habitId === h.id && c.date >= cutoff);
      const createdAt = h.createdAt || today;
      const daysSince = Math.max(1, Math.ceil((new Date() - new Date(createdAt)) / 86400000));
      const possible = Math.min(30, daysSince);
      const rate = possible > 0 ? Math.round(hc.length / possible * 100) : 0;
      return {
        id: h.id,
        name: h.name,
        icon: store.habitEmoji(h.icon),
        color: h.color,
        rate: rate,
        pct: rate + '%'
      };
    });

    const insights = this._buildInsights(habits, checkins, habitRates, weekDays, weekRate, longestStreak);

    this.setData({
      loading: false,
      weekRate: weekRate + '%',
      longestStreak: longestStreak,
      totalCheckins: checkins.length,
      monthCheckins: monthCount,
      activeHabits: habits.length,
      weekDays: weekDays,
      habitRates: habitRates,
      insights: insights
    });
  },

  _buildInsights(habits, checkins, habitRates, weekDays, weekRate, longestStreak) {
    const list = [];
    if (!habits.length) {
      list.push({ hl: '', text: '还没有习惯，去首页添加一个开始打卡，看板才有数据可分析。' });
      return list;
    }

    // 1) 最稳 / 最需帮扶的习惯（近30天完成率）
    const sortedRates = habitRates.slice().sort((a, b) => b.rate - a.rate);
    const best = sortedRates[0];
    const worst = sortedRates[sortedRates.length - 1];
    if (best && best.rate >= 60) {
      const streak = store.calcStreak(habits.find(h => h.name === best.name).id);
      const streakStr = streak > 0 ? `连续 ${streak} 天没断过，` : '';
      list.push({ hl: best.name, text: `是你近 30 天最稳的习惯，${streakStr}完成率 ${best.pct}，保持这个节奏。` });
    }
    if (worst && sortedRates.length > 1 && worst.rate < 40 && worst.name !== (best && best.name)) {
      list.push({ hl: worst.name, text: `完成率只有 ${worst.pct}，可以把目标拆得再小一点，先把节奏稳住。` });
    }

    // 2) 工作日 vs 周末打卡对比
    const weekdayCount = weekDays.filter(d => d.label !== '六' && d.label !== '日').reduce((s, d) => s + d.count, 0);
    const weekendCount = weekDays.filter(d => d.label === '六' || d.label === '日').reduce((s, d) => s + d.count, 0);
    const weekdayAvg = weekdayCount / 5;
    const weekendAvg = weekendCount / 2;
    if (weekdayAvg > 0 || weekendAvg > 0) {
      if (weekendAvg > weekdayAvg * 1.3 && weekendAvg > 0) {
        list.push({ hl: '周末', text: '打卡明显比工作日多，工作日容易掉队，试着把动作放到早上或固定时段。' });
      } else if (weekdayAvg > weekendAvg * 1.3 && weekdayAvg > 0) {
        list.push({ hl: '工作日', text: '节奏稳，周末反而容易松懈，周末给自己留一个最低目标就够。' });
      }
    }

    // 3) 本周整体表现
    if (list.length < 3) {
      if (weekRate >= 80) {
        list.push({ hl: '', text: `本周完成率 ${weekRate}%，状态在线，继续保持这周的节奏。` });
      } else if (weekRate >= 50) {
        list.push({ hl: '', text: `本周完成率 ${weekRate}%，中规中矩，挑一个最想拿下的习惯今天先打上。` });
      } else if (weekRate > 0) {
        list.push({ hl: '', text: `本周完成率只有 ${weekRate}%，别追求全打，把 1-2 个核心习惯做完就是胜利。` });
      } else {
        list.push({ hl: '', text: '本周还没有打卡记录，先随便挑一个习惯，现在打一次，链条就起来了。' });
      }
    }

    // 4) 连胜提示
    if (list.length < 3 && longestStreak >= 7) {
      list.push({ hl: `${longestStreak} 天连胜`, text: '是你的历史最佳，别在今天断掉。' });
    }

    return list.slice(0, 3);
  },

  _buildWeek(checkins, habits) {
    const days = [];
    const dayNames = ['日','一','二','三','四','五','六'];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const ds = d.getFullYear() + '-' +
        String(d.getMonth()+1).padStart(2,'0') + '-' +
        String(d.getDate()).padStart(2,'0');
      const count = checkins.filter(c => c.date === ds).length;
      const max = habits.length;
      days.push({
        label: dayNames[d.getDay()],
        count: count,
        pct: max > 0 ? Math.round(count / max * 100) : 0
      });
    }
    return days;
  },

  onTab(e) {
    const t = e.currentTarget.dataset.tab;
    if (t === this.data.active) return;
    wx.switchTab({ url: TAB_MAP[t] });
  },

  onHabitDetail(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    wx.navigateTo({ url: '/pages/habit-detail/habit-detail?id=' + id });
  },

  onTrendTap() {
    wx.switchTab({ url: '/pages/calendar/calendar' });
  },

  onGoCalendar() {
    wx.switchTab({ url: '/pages/calendar/calendar' });
  },

  onAskCoachPlan() {
    getApp().globalData.pendingPrompt = '帮我看看最近记录，并给我下一步计划';
    wx.switchTab({ url: '/pages/assistant/assistant' });
  }
});
