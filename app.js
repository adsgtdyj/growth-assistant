const store = require('./utils/store.js');

App({
  globalData: {
    ready: false,
    loggedIn: false,
    initPromise: null,
    openid: '',
    store: store
  },

  onError(err) {
    console.warn('[app.onError]', err);
  },

  onUnhandledRejection(res) {
    console.warn('[app.onUnhandledRejection]', res && res.reason, 'promise:', res && res.promise);
  },

  onLaunch() {
    if (!wx.cloud) {
      console.error('当前微信基础库不支持云开发，请升级到 2.2.3+');
      this.globalData.initPromise = Promise.resolve({ status: 'error', message: '基础库过低' });
      return;
    }
    wx.cloud.init({
      env: 'cloudbase-6g0gwb23bc2fde21',
      traceUser: true
    });
    this.globalData.initPromise = this._initApp();
  },

  async _initApp() {
    // 1) 先用本地缓存秒开，让首页立即可见
    const cacheHit = store.loadFromCache();
    if (cacheHit) {
      this.globalData.loggedIn = true;
      this.globalData.ready = true;
    }

    // 2) 后台静默拉云端数据刷新
    try {
      const res = await store.loadFromServer();
      if (res.needClaim) {
        // 首次进入：用当前微信 openid 自动创建空账号，跳过登录选择
        try {
          await store.saveToServer();
          this.globalData.loggedIn = true;
          this.globalData.ready = true;
          this.globalData.openid = res.openid || '';
          return { status: 'authed' };
        } catch (e) {
          console.error('auto create account failed:', e);
          this.globalData.ready = true;
          return { status: 'error', message: '账号初始化失败，请重启小程序' };
        }
      }
      this.globalData.loggedIn = true;
      this.globalData.ready = true;
      return { status: 'authed' };
    } catch (e) {
      console.error('init failed:', e);
      // 缓存已加载时仍允许使用，没缓存才报错
      if (!this.globalData.ready) this.globalData.ready = true;
      return { status: 'error', message: (e && (e.errMsg || e.message)) || String(e) };
    }
  }
});
