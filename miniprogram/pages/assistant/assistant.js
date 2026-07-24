const { TAB_MAP } = require('../../utils/constants.js');
const store = require('../../utils/store.js');

Page({
  data: {
    statusH: '44px',
    active: 'assistant',
    messages: [],
    inputValue: '',
    sending: false,
    greeting: '',
    uncheckedCount: 0,
    tone: 'normal',
    toneLabel: '默认',
    toneTagline: '教练在线，陪你把计划落到今天',
    welcomeText: '嘿，又是新的一天！点击上方快捷按钮，或者直接告诉我你想做什么——打卡、查计划、看数据，我都在。',
    // 语音输入
    voiceRecording: false,
    voiceCancel: false,
    voiceStartY: 0,
    voiceElapsed: 0,
    voiceUploading: false,
    // 滚动控制
    scrollTarget: '',
    autoScroll: true
  },

  onLoad() {
    const sys = wx.getWindowInfo();
    this.setData({ statusH: (sys.statusBarHeight || 44) + 'px' });
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 2 });
    }
    // 进入页面时恢复自动跟随
    this.setData({ autoScroll: true });
    const pending = getApp().globalData.pendingHabitId;
    if (pending) {
      getApp().globalData.pendingHabitId = '';
      const habit = store.getHabits().find(h => h.id === pending);
      if (habit) {
        this.setData({ inputValue: '关于「' + habit.name + '」，' });
      }
    }
    const pendingPrompt = getApp().globalData.pendingPrompt;
    if (pendingPrompt) {
      getApp().globalData.pendingPrompt = '';
      this.setData({ inputValue: pendingPrompt });
    }
    this._refreshChat();
  },

  _refreshChat() {
    if (!getApp().globalData.ready) return;
    const history = store.getChatHistory();
    const habits = store.getHabits();
    const settings = store.getSettings();
    const unchecked = habits.filter(h => !store.isCheckedInToday(h.id)).length;

    const messages = history.map(msg => ({
      role: msg.role === 'user' ? 'user' : 'assistant',
      content: msg.content || msg.text || '',
      time: this._fmtTime(msg.time)
    }));

    const h = new Date().getHours();
    const greeting = h < 6 ? '夜深了' : h < 9 ? '早上好' : h < 12 ? '上午好' : h < 14 ? '中午好' : h < 18 ? '下午好' : '晚上好';

    const tone = settings.aiTone || 'normal';
    const nickname = settings.nickname || '';
    const toneMeta = this._toneMeta(tone, nickname, unchecked);

    this.setData({
      messages: messages,
      greeting: greeting,
      uncheckedCount: unchecked,
      tone: tone,
      toneLabel: toneMeta.label,
      toneTagline: toneMeta.tagline,
      welcomeText: toneMeta.welcome
    });
    this._scrollToBottom();
  },

  _toneMeta(tone, nickname, unchecked) {
    const who = nickname || '你';
    if (tone === 'sassy') {
      return {
        label: '毒舌',
        tagline: '别磨蹭了，今天的账还没结呢',
        welcome: unchecked > 0
          ? `${who}，今天还有 ${unchecked} 个习惯挂着，是打算今天蒙混过关，还是准备开工？`
          : `${who}，今天居然全打了？别高兴太早，明天继续。`
      };
    }
    if (tone === 'mild') {
      return {
        label: '温和',
        tagline: '慢慢来也好，稳一点就走得远',
        welcome: unchecked > 0
          ? `嗨 ${who}，今天还有 ${unchecked} 个习惯可以做，先挑一个最舒服的开始就好。`
          : `嗨 ${who}，今天的习惯都完成啦，给自己一个小小的奖励。`
      };
    }
    return {
      label: '默认',
      tagline: '教练在线，陪你把计划落到今天',
      welcome: unchecked > 0
        ? `${who}，今天还有 ${unchecked} 个习惯没打卡，直接告诉我你想先做哪个。`
        : `${who}，今天的习惯都完成了，要不要看看这周的数据？`
    };
  },

  goToneSetting() {
    wx.switchTab({ url: TAB_MAP.stats });
  },

  _fmtTime(isoStr) {
    if (!isoStr) return '';
    const d = new Date(isoStr);
    return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  },

  onInput(e) {
    this.setData({ inputValue: e.detail.value });
  },

  onSend() {
    const text = this.data.inputValue.trim();
    if (!text || this.data.sending) return;

    const now = this._fmtTime(new Date().toISOString());
    const userMsg = { role: 'user', content: text, time: now };
    const pendingMsg = { role: 'assistant', content: '思考中...', time: '', pending: true };
    this.setData({
      messages: [...this.data.messages, userMsg, pendingMsg],
      inputValue: '',
      sending: true,
      autoScroll: true
    });
    this._scrollToBottom();

    store.sendChatMessage(text).then(response => {
      const finalMessages = this.data.messages.filter(m => !m.pending);
      finalMessages.push({
        role: 'assistant',
        content: response.reply,
        time: this._fmtTime(new Date().toISOString()),
        action: response.action || null,
        quickReplies: response.quickReplies || []
      });
      this.setData({ messages: finalMessages, sending: false });
      this._scrollToBottom();
    }).catch(err => {
      const errorMessages = this.data.messages.filter(m => !m.pending);
      errorMessages.push({
        role: 'assistant',
        content: '抱歉，连接教练失败，请稍后重试。',
        time: this._fmtTime(new Date().toISOString()),
        error: true
      });
      this.setData({ messages: errorMessages, sending: false });
    });
  },

  onQuickReply(e) {
    const text = e.currentTarget.dataset.text;
    this.setData({ inputValue: text });
    this.onSend();
  },

  onQuickAction(e) {
    const prompts = {
      checkin: '帮我快速打卡今天还没完成的所有习惯',
      workout: '今天练什么？给我安排一下',
      week: '总结一下我这周的表现',
      data: '分析一下我的习惯数据',
      plan: '帮我调整一下训练计划'
    };
    const action = e.currentTarget.dataset.action;
    const text = prompts[action] || action;
    this.setData({ inputValue: text });
    this.onSend();
  },

  _scrollToBottom() {
    if (!this.data.autoScroll) return;
    // 先清空 scroll-into-view，再重新指向底部锚点，触发滚动
    this.setData({ scrollTarget: '' }, () => {
      setTimeout(() => {
        this.setData({ scrollTarget: 'chatBottom' });
      }, 30);
    });
  },

  onChatScroll(e) {
    const st = (e.detail && e.detail.scrollTop) || 0;
    const last = this._lastScrollTop || 0;
    // 用户向上滑动：关闭自动跟随
    if (st < last - 8 && this.data.autoScroll) {
      this.setData({ autoScroll: false });
    }
    this._lastScrollTop = st;
  },

  onChatScrollToLower() {
    // 滑到底部：恢复自动跟随
    if (!this.data.autoScroll) {
      this.setData({ autoScroll: true });
    }
  },

  onTab(e) {
    const t = e.currentTarget.dataset.tab;
    if (t === this.data.active) return;
    wx.switchTab({ url: TAB_MAP[t] });
  },

  // ========== 语音输入 ==========
  onVoiceStart(e) {
    if (this.data.sending || this.data.voiceUploading) return;
    const touch = e.touches && e.touches[0];
    const startY = touch ? touch.clientY : 0;

    wx.getSetting({
      success: (res) => {
        if (res.authSetting['scope.record'] === false) {
          wx.showModal({
            title: '需要麦克风权限',
            content: '请在设置中开启录音权限',
            confirmText: '去开启',
            success: (r) => { if (r.confirm) wx.openSetting(); }
          });
          return;
        }
        this._startRecord(startY);
      }
    });
  },

  _startRecord(startY) {
    const rm = wx.getRecorderManager();
    this._recorder = rm;
    this._recStartTs = Date.now();
    this._recTimer = setInterval(() => {
      this.setData({ voiceElapsed: Math.floor((Date.now() - this._recStartTs) / 1000) });
    }, 500);

    rm.onStart(() => {
      this.setData({
        voiceRecording: true,
        voiceCancel: false,
        voiceStartY: startY,
        voiceElapsed: 0
      });
    });
    rm.onError((err) => {
      console.error('recorder error:', err);
      clearInterval(this._recTimer);
      this.setData({ voiceRecording: false });
      wx.showToast({ title: '录音失败：' + (err.errMsg || ''), icon: 'none' });
    });
    rm.onStop((res) => {
      clearInterval(this._recTimer);
      const cancelled = this.data.voiceCancel;
      this.setData({ voiceRecording: false, voiceCancel: false });
      if (cancelled) return;
      if (!res.tempFilePath || res.duration < 800) {
        wx.showToast({ title: '录音太短，请长按说话', icon: 'none' });
        return;
      }
      this._transcribe(res.tempFilePath, res.duration);
    });

    rm.start({
      duration: 60000,
      sampleRate: 16000,
      numberOfChannels: 1,
      encodeBitRate: 48000,
      format: 'mp3'
    });
  },

  onVoiceMove(e) {
    if (!this.data.voiceRecording) return;
    const touch = e.touches && e.touches[0];
    if (!touch) return;
    const dy = this.data.voiceStartY - touch.clientY;
    const cancel = dy > 80;
    if (cancel !== this.data.voiceCancel) {
      this.setData({ voiceCancel: cancel });
    }
  },

  onVoiceEnd() {
    if (!this._recorder) return;
    try { this._recorder.stop(); } catch (e) {}
  },

  onVoiceCancel() {
    if (!this._recorder) return;
    this.setData({ voiceCancel: true });
    try { this._recorder.stop(); } catch (e) {}
  },

  _transcribe(filePath, duration) {
    this.setData({ voiceUploading: true });
    wx.showLoading({ title: '识别中...', mask: true });
    const openid = getApp().globalData.openid || 'anon';
    const cloudPath = 'voice/' + openid + '_' + Date.now() + '.mp3';
    wx.cloud.uploadFile({
      cloudPath: cloudPath,
      filePath: filePath,
      success: (up) => {
        wx.cloud.callFunction({
          name: 'stt',
          data: { fileID: up.fileID, duration: duration },
          success: (res) => {
            wx.hideLoading();
            this.setData({ voiceUploading: false });
            const text = res.result && res.result.text;
            if (text) {
              this.setData({ inputValue: (this.data.inputValue || '') + text });
            } else {
              wx.showToast({ title: '没识别到内容', icon: 'none' });
            }
            try { wx.cloud.deleteFile({ fileList: [up.fileID] }); } catch (e) {}
          },
          fail: (err) => {
            wx.hideLoading();
            this.setData({ voiceUploading: false });
            console.error('stt fail:', err);
            wx.showModal({
              title: '语音识别未开通',
              content: '云函数 stt 未部署或调用失败。可以先用键盘输入，或联系开发者配置识别服务。',
              showCancel: false
            });
          }
        });
      },
      fail: (err) => {
        wx.hideLoading();
        this.setData({ voiceUploading: false });
        console.error('voice upload fail:', err);
        wx.showToast({ title: '上传失败', icon: 'none' });
      }
    });
  }
});
