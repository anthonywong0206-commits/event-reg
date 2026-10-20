# 子活動模式架構 V2

本版本將「多時段活動」與「子活動模式」完全分離。

## 建立模式

- 一般活動：`/admin/events/new`
- 多時段活動：`/admin/events/new/multi`
- 子活動模式：`/admin/events/new/sub-activity`
- 外部連結報名：沿用活動表單的外部連結設定

## 資料結構

子活動不再依賴普通 `event_sessions` 或 `sub_activity_definitions` JSON 作主要儲存：

- `events.event_mode`
- `event_sub_activities`
- `event_sub_activity_sessions`
- `registrations.sub_activity_id`
- `registrations.sub_activity_session_id`

普通多時段活動仍只使用 `event_sessions`。

## 子活動建立流程

1. 建立主活動。
2. 新增一個或多個子活動；每個子活動都有獨立 UUID。
3. 每個子活動內獨立新增日期、開始時間、結束時間及名額。
4. 子活動可以先保存為草稿而未有時段。
5. 發布子活動模式活動時，整個活動最少需要一個可用子活動時段。
6. 不同子活動可有相同開始時間；同一子活動不可有重複開始時間。

## 報名

- 前台一次可選多個子活動，各子活動只可選一個時段。
- 仍受「最多報名子活動數量」限制。
- 所選時段不可互相重疊。
- 同一用戶既有子活動報名亦會參與撞期檢查。
- 名額及候補按子活動時段獨立計算。

## 管理及匯出

- 後台按子活動獨立顯示參加者名單。
- 可匯出全部 Excel，亦可按子活動獨立匯出。
- Excel、自訂報名欄目、QR、電郵、Telegram、候補及邀請碼功能保留。

## 舊資料遷移

`202610200004_sub_activity_architecture_v2.sql` 會把舊 `sub_activity_definitions` 及具子活動名稱的舊時段複製到新資料表，並保留舊欄位作兼容。普通多時段資料不會轉成子活動資料。
