const api = require('../../utils/api.js');
const store = require('../../utils/store.js');

Page({
  data: {
    mode: 'claim',       // 'claim' | 'fresh' | 'done'
    username: '',
    password: '',
    errorMsg: '',
    loading: false
  },

  onLoad() {},

  onUsernameInput(e) { this.setData({ username: e.detail.value, errorMsg: '' }); },
  onPasswordInput(e) { this.setData({ password: e.detail.value, errorMsg: '' }); },

  onSwitchFresh() { if (this.data.loading) return; this.setData({ mode: 'fresh', errorMsg: '' }); },
  onSwitchClaim() { if (this.data.loading) return; this.setData({ mode: 'claim', errorMsg: '' }); },

  onClaim() {
    if (this.data.loading) return;
    const { username, password } = this.data;
    if (!username.trim()) return this.setData({ errorMsg: '请输入旧账号用户名' });
    if (!password) return this.setData({ errorMsg: '请输入密码' });

    console.log('[login] claim', { username: username.trim() });
    this.setData({ loading: true, errorMsg: '' });

    api.claimLegacy(username.trim(), password).then(() => {
      return store.loadFromServer();
    }).then(() => {
      getApp().globalData.loggedIn = true;
      wx.switchTab({ url: '/pages/index/index' });
    }).catch(err => {
      console.error('[login] claim err', err);
      const msg = (err && (err.message || (err.data && err.data.error))) || '认领失败，请稍后重试';
      this.setData({ errorMsg: msg, loading: false });
    });
  },

  onStartFresh() {
    if (this.data.loading) return;
    this.setData({ loading: true, errorMsg: '' });
    // Write an empty doc for this openid so getData succeeds next time
    store.saveToServer = store.saveToServer || (() => Promise.resolve());
    const emptyData = require('../../utils/store.js').getDefaultData
      ? require('../../utils/store.js').getDefaultData()
      : {};
    api.putData(emptyData).then(() => {
      return store.loadFromServer();
    }).then(() => {
      getApp().globalData.loggedIn = true;
      wx.switchTab({ url: '/pages/index/index' });
    }).catch(err => {
      console.error('[login] fresh err', err);
      this.setData({ errorMsg: '创建失败：' + JSON.stringify(err), loading: false });
    });
  }
});
