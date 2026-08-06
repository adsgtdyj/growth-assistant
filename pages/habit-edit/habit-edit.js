const store = require('../../utils/store.js');
const subConfig = require('../../utils/subscribe-config.js');

const ICONS = [
  {key:'fitness',emoji:'🏋️'},{key:'book',emoji:'📖'},{key:'water',emoji:'💧'},
  {key:'stretch',emoji:'🧘'},{key:'moon',emoji:'🌙'},{key:'music',emoji:'🎵'},
  {key:'pen',emoji:'✍️'},{key:'apple',emoji:'🍎'},{key:'run',emoji:'🏃'},
  {key:'palette',emoji:'🎨'},{key:'note',emoji:'📝'},{key:'pill',emoji:'💊'},
  {key:'leaf',emoji:'🌿'},{key:'sun',emoji:'☀️'},{key:'target',emoji:'🎯'},{key:'heart',emoji:'❤️'}
];

const COLORS = ['#6366f1','#8b5cf6','#ec4899','#f97316','#f59e0b','#10b981','#14b8a6','#0d9488','#3b82f6','#ef4444','#84cc16','#eab308'];

const WEEK_NAMES = ['一','二','三','四','五','六','日'];

Page({
  data: {
    isEdit: false,
    habitId: '',
    name: '',
    icon: 'target',
    iconEmoji: '🎯',
    color: '#6366f1',
    frequency: 'daily',
    weekdays: [],
    reminder: '',
    planItems: [],
    icons: ICONS,
    colors: COLORS,
    weekNames: WEEK_NAMES,
    saving: false
  },

  onLoad(options) {
    if (options.id) {
      const habit = store.getHabits().find(h => h.id === options.id);
      if (habit) {
        const iconEntry = ICONS.find(ic => ic.key === habit.icon) || ICONS[14];
        this.setData({
          isEdit: true,
          habitId: habit.id,
          name: habit.name,
          icon: habit.icon,
          iconEmoji: iconEntry.emoji,
          color: habit.color || '#6366f1',
          frequency: habit.frequency || 'daily',
          weekdays: habit.weekdays || [],
          reminder: habit.reminder || '',
          planItems: (habit.plan && habit.plan.items) ? habit.plan.items.map(p => ({text: p.text, color: p.color})) : []
        });
      }
    }
  },

  onNameInput(e) { this.setData({ name: e.detail.value }); },

  onIconTap(e) {
    const key = e.currentTarget.dataset.key;
    const entry = ICONS.find(ic => ic.key === key);
    if (entry) this.setData({ icon: key, iconEmoji: entry.emoji });
  },

  onColorTap(e) {
    this.setData({ color: e.currentTarget.dataset.color });
  },

  onFreqTap(e) {
    this.setData({ frequency: e.currentTarget.dataset.freq });
  },

  onWeekdayTap(e) {
    const d = parseInt(e.currentTarget.dataset.day);
    let wds = [...this.data.weekdays];
    const idx = wds.indexOf(d);
    if (idx > -1) wds.splice(idx, 1);
    else wds.push(d);
    this.setData({ weekdays: wds });
  },

  onReminderInput(e) {
    this.setData({ reminder: e.detail.value });
  },

  onReminderChange(e) {
    this.setData({ reminder: e.detail.value });
  },

  onReminderClear() {
    this.setData({ reminder: '' });
  },

  onPlanItemInput(e) {
    const idx = e.currentTarget.dataset.index;
    const val = e.detail.value;
    const items = [...this.data.planItems];
    items[idx] = {...items[idx], text: val};
    this.setData({ planItems: items });
  },

  onPlanColorTap(e) {
    const idx = e.currentTarget.dataset.index;
    const color = e.currentTarget.dataset.color;
    const items = [...this.data.planItems];
    items[idx] = {...items[idx], color: color};
    this.setData({ planItems: items });
  },

  onAddPlanItem() {
    this.setData({ planItems: [...this.data.planItems, {text:'', color:COLORS[this.data.planItems.length % COLORS.length]}] });
  },

  onRemovePlanItem(e) {
    const idx = e.currentTarget.dataset.index;
    const items = [...this.data.planItems];
    items.splice(idx, 1);
    this.setData({ planItems: items });
  },

  onSave() {
    const { name, icon, color, frequency, weekdays, reminder, planItems } = this.data;
    if (!name.trim()) { wx.showToast({ title: '请输入习惯名称', icon: 'none' }); return; }
    if (name.trim().length > 20) { wx.showToast({ title: '名称最多20字', icon: 'none' }); return; }

    this.setData({ saving: true });

    const habit = {
      name: name.trim(),
      icon: icon,
      color: color,
      frequency: frequency,
      weekdays: frequency === 'custom' ? weekdays : [],
      reminder: reminder,
      plan: { items: planItems.filter(p => p.text.trim()) }
    };

    const isEdit = this.data.isEdit;
    const oldHabit = isEdit ? store.getHabits().find(h => h.id === this.data.habitId) : null;
    const reminderChanged = !oldHabit || oldHabit.reminder !== reminder;

    const persistPromise = isEdit
      ? store.updateHabit(this.data.habitId, habit)
      : store.addHabit(habit);

    persistPromise.then(() => {
      const finalId = isEdit ? this.data.habitId : (store.getHabits().slice(-1)[0] || {}).id;

      // 提醒相关走独立流程，不影响主保存结果
      if (finalId) {
        try {
          if (!reminder && reminderChanged) {
            store.removeReminderConfig(finalId).catch(() => {});
          } else if (reminder) {
            this._requestSubscribeAndSave({
              id: finalId,
              name: habit.name,
              reminder: reminder,
              frequency: habit.frequency,
              weekdays: habit.weekdays
            }).catch(() => {});
          }
        } catch (e) {
          console.warn('reminder subflow failed', e);
        }
      }

      // 主流程：保存成功就直接回上一页，用户无感等待
      wx.navigateBack();
    }).catch(err => {
      console.error('habit save fail', err);
      wx.showToast({ title: '保存失败，请重试', icon: 'none' });
      this.setData({ saving: false });
    });
  },

  _requestSubscribeAndSave(habitLite) {
    const tmplId = subConfig.REMINDER_TEMPLATE_ID;
    if (!tmplId) {
      // templateId 未配置：只写数据库不弹授权
      console.warn('REMINDER_TEMPLATE_ID 未配置，跳过订阅授权');
      return store.saveReminderConfig(habitLite, 0).catch(() => {});
    }
    return new Promise((resolve) => {
      wx.requestSubscribeMessage({
        tmplIds: [tmplId],
        success: (res) => {
          const status = res[tmplId];
          const accepted = status === 'accept' ? subConfig.SUBSCRIBE_BATCH : 0;
          store.saveReminderConfig(habitLite, accepted).then(() => {
            if (accepted > 0) {
              wx.showToast({ title: '提醒已开启', icon: 'success' });
            } else {
              wx.showToast({ title: '提醒时间已保存，但需授权后才能推送', icon: 'none' });
            }
            resolve();
          }).catch(() => { resolve(); });
        },
        fail: () => {
          // 用户拒绝或未开权限：仍然写入 reminders 但 quota=0
          store.saveReminderConfig(habitLite, 0).finally(() => resolve());
        }
      });
    });
  }
});
