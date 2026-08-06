# Smoke Test Coverage

冒烟测试实际覆盖的用例清单。5 个 spec，共 60+ 条断言/交互步骤，覆盖新建→打卡→编辑→删除→退出重进的完整数据链，以及日历/分析/教练的数据一致性通道和语气跨页联动。

## 01-today · 今日模块 - 新建到打卡闭环

1. reLaunch 到 index，读取初始 `data.habits.length`
2. 点右下角 `.fab-btn` → 断言 6s 内页面栈出现 `habit-edit`
3. 在 `.form-input` 里填入 `Smoke测试-今日`
4. 点第一个 `.icon-item` 选图标
5. 点第一个 `.color-item` 选颜色
6. 点 `.save-btn` 保存 → 断言 10s 内回到 index
7. 断言 `habits.length` = before+1
8. 找到新习惯后断言初始 `checkedToday === false`
9. 找到对应 `.habit-card`（按 data-id 匹配），点击打卡
10. 断言 6s 内 `checkedToday === true`
11. 断言 `streak >= 1`
12. 截图 `today-checkedin`

## 02-calendar · 日历模块 - 打卡数据是否正确

1. 先在首页把所有 `checkedToday=false` 的习惯用 `onHabitTap` 全部打卡，保证今日有数据
2. switchTab 到 calendar
3. 断言 `data.days` 非空
4. 找到今日格子（`dateStr` 匹配），断言 `level >= 1` 和 `isToday === true`
5. 断言月度 `totalCheckins >= 1`，并读出 `checkinRate`
6. 从 DOM 找到今日 `.cal-day`（data-date 匹配），点击
7. 断言 `detailVisible === true`
8. 读取 `detailCheckins` 详情列表，列出今日已打卡习惯名
9. 截图 `calendar-today`
10. 关闭详情面板

## 03-coach · 教练模块 - 语气与对话

1. switchTab 到 assistant，读取默认 `tone` / `toneLabel`
2. 找 `.tone-badge` 检查其 class 是否包含当前 tone
3. 切回 stats，点 `.tone-option.sassy` 选毒舌
4. 断言 stats 页 `data.tone === 'sassy'`
5. 切回 assistant，断言 tone 同步为 sassy、toneLabel 为"毒舌"
6. 检查 `welcomeText` 是否包含"N 个习惯"
7. 在 `.ai-input` 输入"今天还有几个没打？"
8. 点 `.ai-send-btn` 发送
9. 断言用户消息 3s 内进入 messages
10. 断言 30s 内 `sending === false`
11. 断言最后一条 assistant 消息内容非空、非 error、非 pending
12. 截图 `coach-sassy-reply`
13. 收尾把语气切回 normal

## 04-analytics · 分析模块 - 统计与跳转

1. 从首页读今日已打卡数量
2. switchTab 到 analytics
3. 断言 `totalCheckins` 是数字且 ≥ 1
4. 断言 `activeHabits` 与首页 habits.length 相等
5. 断言 `weekRate` 格式为百分比字符串
6. 断言 `weekDays.length === 7`，最后一格是今日且 count ≥ 1
7. 断言 `habitRates.length` 与 habits.length 相等
8. 点第一条 `.compare-row` → 断言跳转到单任务分析页
9. 断言 `insights` 非空，读出首条内容
10. 截图 `analytics`

## 05-profile · 我的模块 - 资料与习惯管理

1. switchTab 到 stats（"我的"入口所在页）
2. 检查 `data.nickname` / `data.slogan` 是否有内容
3. 找 `.edit-profile-btn`：存在？有 bindtap？点击是否跳转？
4. 读 `data.habits`，找到目标 `Smoke测试-今日`
5. 从 DOM 找到匹配 data-id 的 `.habit-edit` 按钮，点进编辑页
6. 在 `.form-input` 改名为 `Smoke编辑后`，点 `.save-btn`
7. 断言 7s 内返回 stats
8. 断言 habits 里的对应 id 已改名为 `Smoke编辑后`
9. 点 `.tone-option.sassy` 切毒舌
10. 切到 assistant，断言 tone/toneLabel 同步
11. 切回 stats 把语气改回 normal
12. Mock `wx.showModal` 让 confirm 自动返回 true
13. 从 `.setting-item` 里找到含"退出登录"文案的项，点击
14. 断言 6s 内 reLaunch 到 login 页
15. 手动 reLaunch 回 index，等 2s
16. 断言重新加载后 `habits.length > 0`（登录态与数据能自恢复）
17. 恢复 `wx.showModal` mock
18. 截图 `profile-final`
