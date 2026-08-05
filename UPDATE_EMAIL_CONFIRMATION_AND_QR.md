# 報名確認電郵及出席 QR Code 修復

- 公開報名只有在參加者提供電郵時才會寄送。
- 電郵附上可下載的 QR Code PNG，並在內文顯示電子入場證連結。
- 多日期／多時段活動會在電郵顯示參加者實際選擇的時段。
- 新增後台 `/admin/email-settings`，可使用標準、親切、簡潔範本或自訂主旨和內容。
- 支援 `{{name}}`、`{{event_title}}`、`{{event_date}}`、`{{event_location}}`、`{{registration_no}}`、`{{entry_url}}` 變數。
- 參加者名單可向已有電郵的已確認參加者重新發送確認電郵。
- 需要 Vercel 環境變數 `RESEND_API_KEY`、`RESEND_FROM_EMAIL` 及正確的 `NEXT_PUBLIC_APP_URL`。
