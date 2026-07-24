// 微信订阅消息模板配置
// templateId 在微信公众平台 → 订阅消息 → 我的模板 里获取
// 拿到后把下面的 REMINDER_TEMPLATE_ID 值替换成真实 templateId
// 云函数 reminder 也需要在环境变量中配置同样的 templateId
module.exports = {
  // 打卡提醒模板 ID
  REMINDER_TEMPLATE_ID: 'Cy8rFD7AFyrWhXYsvLu4ck8fOdzm0Jn6zMAyblY1WVM',
  // 每次授权请求几条（一次性订阅上限为 3）
  SUBSCRIBE_BATCH: 3
};
