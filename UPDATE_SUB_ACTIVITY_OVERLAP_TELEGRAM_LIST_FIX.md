# 子活動時間重疊豁免、Telegram 與個別名單修正

## 1. 時間重疊豁免
- `event_sub_activities.overlap_exempt` 為子活動層級設定。
- 後台每個子活動可獨立勾選「時間重疊豁免」。
- 前台即時撞期檢查及資料庫 RPC 均使用同一規則：只要重疊的兩個子活動其中一個為豁免，便可同時報名。
- 沒有豁免的子活動仍維持原有撞期保護。

## 2. Telegram 子活動訊息
- 同一次子活動報名（相同 `registration_group_id`）整合為一則 Telegram 訊息。
- 訊息列出參加者姓名、電話、電郵，以及所有報名子活動、日期時間和正選／候補狀態。
- 即時通知及定時彙總均支援子活動分組顯示。

## 3. 個別子活動參加者名單
- 後台及 Excel 個別名單改用 `sub_activity_id` UUID 配對，不再靠子活動名稱。
- 修正子活動改名、名稱字元或 V2 session linkage 導致個別名單空白／漏人的問題。
- 手動新增或移動子活動參加者後，API 回傳完整子活動及時段資料，名單即時顯示於正確子活動。

## 4. 舊 email 唯一索引修正
- 修正舊 `one_active_registration_per_email_single_event` 將 V2 子活動（`session_id` 為 NULL）誤判為一般活動報名，導致同一 email 第二個子活動無法建立。
- 一般活動及普通多時段活動的防重複規則保持不變。
