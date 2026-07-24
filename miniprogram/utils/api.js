// Wraps wx.cloud.callFunction so pages/store don't need to know cloud APIs.
// getData / putData / sendChat / claimLegacy — matches interface consumed by store.js.

function callFn(name, data, options) {
  const opts = options || {};
  return new Promise((resolve, reject) => {
    console.log('[cloud]', name, data);
    const params = {
      name: name,
      data: data || {},
      config: { timeout: opts.timeout || 30000 },
      success: (res) => {
        console.log('[cloud] ok', name, res.result);
        resolve(res.result);
      },
      fail: (err) => {
        console.error('[cloud] fail', name, err);
        reject({ networkError: true, errMsg: err.errMsg || String(err) });
      }
    };
    wx.cloud.callFunction(params);
  });
}

function getData() {
  return callFn('getData').then(res => {
    if (!res || !res.ok) throw { statusCode: 0, data: res };
    return res;  // { ok, data? , needClaim? , openid? }
  });
}

function putData(data) {
  return callFn('putData', { data: data }).then(res => {
    if (!res || !res.ok) throw { statusCode: 0, data: res };
    return res;
  });
}

function sendChat(payload) {
  return callFn('chat', payload || {}, { timeout: 60000 });
}

function claimLegacy(username, password) {
  return callFn('claimLegacy', { username, password }).then(res => {
    if (!res || !res.ok) throw { statusCode: 0, data: res, message: (res && res.error) || '认领失败' };
    return res;
  });
}

function saveReminder(payload) {
  return callFn('saveReminder', payload || {});
}

module.exports = {
  getData, putData, sendChat, claimLegacy, saveReminder
};
