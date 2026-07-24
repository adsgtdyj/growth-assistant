const { TAB_MAP } = require('../../utils/constants.js');
const store = require('../../utils/store.js');
const api = require('../../utils/api.js');

Page({
  data: {
    statusH: '44px',
    active: 'stats',
    loading: true,
    nickname: '',
    slogan: '',
    avatar: 'user',
    avatarIsImage: false,
    tone: 'normal',
    habits: [],
    // 编辑资料弹窗
    editVisible: false,
    editNickname: '',
    editSlogan: '',
    editAvatar: 'user',
    editAvatarIsImage: false,
    accountName: '',
    accountOpenid: ''
  },

  onLoad() {
    const sys = wx.getWindowInfo();
    this.setData({ statusH: (sys.statusBarHeight || 44) + 'px' });
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 4 });
    }
    this._refreshData();
  },

  _refreshData() {
    if (!getApp().globalData.ready) return;
    const settings = store.getSettings();
    const habits = store.getHabits().map(h => ({
      ...h,
      iconEmoji: store.habitEmoji(h.icon),
      streak: store.calcStreak(h.id),
      freqText: this._fmtFreq(h)
    }));
    const avatar = settings.avatar || 'user';
    const avatarIsImage = typeof avatar === 'string' && (avatar.indexOf('cloud://') === 0 || avatar.indexOf('http') === 0);
    this.setData({
      loading: false,
      nickname: settings.nickname || '习惯达人',
      slogan: settings.slogan || '坚持就是胜利',
      avatar: avatar,
      avatarIsImage: avatarIsImage,
      tone: settings.aiTone || 'normal',
      habits: habits
    });
  },

  _fmtFreq(h) {
    if (h.frequency === 'daily') return '每天';
    if (h.frequency === 'weekdays') return '工作日';
    if (h.weekdays && h.weekdays.length) return '每周' + h.weekdays.length + '天';
    return '每天';
  },

  onTone(e) {
    const tone = e.currentTarget.dataset.tone;
    this.setData({ tone });
    store.updateSettings({ aiTone: tone }).catch(() => {
      wx.showToast({ title: '保存失败', icon: 'none' });
    });
  },

  onEditHabit(e) {
    const habitId = e.currentTarget.dataset.id;
    wx.navigateTo({ url: '/pages/habit-edit/habit-edit?id=' + habitId });
  },

  onDeleteHabit(e) {
    const habitId = e.currentTarget.dataset.id;
    wx.showModal({
      title: '确认删除',
      content: '删除后无法恢复，包括该习惯的所有打卡记录。',
      confirmColor: '#ef4444',
      success: (res) => {
        if (res.confirm) {
          store.deleteHabit(habitId).then(() => {
            wx.showToast({ title: '已删除', icon: 'success' });
            this._refreshData();
          }).catch(() => {
            wx.showToast({ title: '删除失败', icon: 'none' });
          });
        }
      }
    });
  },

  onLogout() {
    wx.showModal({
      title: '退出登录',
      content: '确认退出当前账号？',
      success: (res) => {
        if (res.confirm) {
          getApp().globalData.loggedIn = false;
          getApp().globalData.ready = true;
          wx.reLaunch({ url: '/pages/login/login' });
        }
      }
    });
  },

  onExportData() {
    const data = store.getData();
    const json = JSON.stringify(data, null, 2);
    wx.setClipboardData({
      data: json,
      success: () => {
        wx.showModal({
          title: '数据已复制',
          content: '完整数据 JSON 已复制到剪贴板，你可以粘贴到备忘录 / 邮件里保存。共 ' + json.length + ' 字节。',
          showCancel: false,
          confirmText: '好的'
        });
      },
      fail: () => wx.showToast({ title: '复制失败', icon: 'none' })
    });
  },

  onImportData() {
    wx.showModal({
      title: '从剪贴板导入',
      content: '将读取剪贴板里的 JSON 数据并覆盖当前数据，此操作不可撤销，确定继续？',
      confirmText: '继续',
      confirmColor: '#6366f1',
      success: (res) => {
        if (!res.confirm) return;
        wx.getClipboardData({
          success: (r) => {
            const text = (r.data || '').trim();
            if (!text) {
              wx.showToast({ title: '剪贴板为空', icon: 'none' });
              return;
            }
            let parsed;
            try { parsed = JSON.parse(text); } catch (e) {
              wx.showToast({ title: '不是合法 JSON', icon: 'none' });
              return;
            }
            wx.showLoading({ title: '导入中...', mask: true });
            store.importData(parsed).then(() => {
              wx.hideLoading();
              wx.showToast({ title: '导入成功', icon: 'success' });
              this._refreshData();
            }).catch((err) => {
              wx.hideLoading();
              wx.showToast({ title: err.message || '导入失败', icon: 'none' });
            });
          },
          fail: () => wx.showToast({ title: '读取剪贴板失败', icon: 'none' })
        });
      }
    });
  },

  onClearData() {
    wx.showModal({
      title: '清除所有数据',
      content: '将清空全部习惯、打卡记录、教练对话，此操作不可撤销。建议先导出数据备份。',
      confirmText: '清空',
      confirmColor: '#ef4444',
      success: (res) => {
        if (!res.confirm) return;
        wx.showModal({
          title: '再次确认',
          content: '真的要清除所有数据吗？这一步之后无法找回。',
          confirmText: '我确定',
          confirmColor: '#ef4444',
          success: (res2) => {
            if (!res2.confirm) return;
            wx.showLoading({ title: '清除中...', mask: true });
            store.resetData().then(() => {
              wx.hideLoading();
              wx.showToast({ title: '已清除', icon: 'success' });
              this._refreshData();
            }).catch((err) => {
              wx.hideLoading();
              wx.showToast({ title: err.message || '清除失败', icon: 'none' });
            });
          }
        });
      }
    });
  },

  onAbout() {
    wx.showModal({
      title: '关于 habit v13',
      content: '一款让你把好习惯坚持下来的小程序。数据保存在微信云端，可通过导出导入迁移。',
      showCancel: false,
      confirmText: '好的'
    });
  },

  onTab(e) {
    const t = e.currentTarget.dataset.tab;
    if (t === this.data.active) return;
    wx.switchTab({ url: TAB_MAP[t] });
  },

  // ===== 编辑资料弹窗 =====
  openEditProfile() {
    const settings = store.getSettings();
    const openid = getApp().globalData.openid || '';
    const accountOpenid = openid ? openid.slice(0, 8) + '…' : '';
    const accountName = settings.wxNickname || settings.nickname || '微信用户';
    const avatar = settings.avatar || 'user';
    const avatarIsImage = typeof avatar === 'string' && (avatar.indexOf('cloud://') === 0 || avatar.indexOf('http') === 0);
    this.setData({
      editVisible: true,
      editNickname: settings.nickname || '',
      editSlogan: settings.slogan || '',
      editAvatar: avatar,
      editAvatarIsImage: avatarIsImage,
      accountName: accountName,
      accountOpenid: accountOpenid
    });
  },

  closeEditProfile() {
    this.setData({ editVisible: false });
  },

  _noopTap() {},

  onEditNickname(e) {
    this.setData({ editNickname: e.detail.value });
  },

  onEditSlogan(e) {
    this.setData({ editSlogan: e.detail.value });
  },

  onChooseAvatar() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      sizeType: ['compressed'],
      success: (res) => {
        const filePath = res.tempFiles && res.tempFiles[0] && res.tempFiles[0].tempFilePath;
        if (!filePath) return;
        wx.showLoading({ title: '上传中...', mask: true });
        const openid = getApp().globalData.openid || 'anon';
        const cloudPath = 'avatars/' + openid + '_' + Date.now() + '.jpg';
        const oldAvatar = this.data.editAvatar;
        wx.cloud.uploadFile({
          cloudPath: cloudPath,
          filePath: filePath,
          success: (up) => {
            wx.hideLoading();
            const fileID = up.fileID;
            this.setData({ editAvatar: fileID, editAvatarIsImage: true });
            wx.showToast({ title: '头像已更新', icon: 'success' });
            if (oldAvatar && typeof oldAvatar === 'string' && oldAvatar.indexOf('cloud://') === 0) {
              try { wx.cloud.deleteFile({ fileList: [oldAvatar] }); } catch (e) {}
            }
          },
          fail: (err) => {
            wx.hideLoading();
            console.error('avatar upload fail:', err);
            wx.showToast({ title: '上传失败：' + (err.errMsg || '未知错误'), icon: 'none', duration: 2500 });
          }
        });
      },
      fail: (err) => {
        if (err && err.errMsg && err.errMsg.indexOf('cancel') === -1) {
          console.error('chooseMedia fail:', err);
          wx.showToast({ title: '选择图片失败', icon: 'none' });
        }
      }
    });
  },

  saveProfile() {
    const { editNickname, editSlogan, editAvatar } = this.data;
    const updates = {
      nickname: editNickname.trim(),
      slogan: editSlogan.trim(),
      avatar: editAvatar
    };
    store.updateSettings(updates).then(() => {
      wx.showToast({ title: '已保存', icon: 'success' });
      this.setData({ editVisible: false });
      this._refreshData();
    }).catch(() => {
      wx.showToast({ title: '保存失败', icon: 'none' });
    });
  }
});
