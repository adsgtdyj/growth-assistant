Component({
  data: {
    selected: 0,
    list: [
      { pagePath: '/pages/index/index',       key: 'index' },
      { pagePath: '/pages/calendar/calendar', key: 'calendar' },
      { pagePath: '/pages/assistant/assistant', key: 'assistant' },
      { pagePath: '/pages/analytics/analytics', key: 'analytics' },
      { pagePath: '/pages/stats/stats',       key: 'stats' }
    ]
  },
  methods: {
    switchTab(e) {
      const key = e.currentTarget.dataset.key;
      const idx = this.data.list.findIndex(i => i.key === key);
      if (idx < 0 || idx === this.data.selected) return;
      wx.switchTab({ url: this.data.list[idx].pagePath });
    }
  }
});
