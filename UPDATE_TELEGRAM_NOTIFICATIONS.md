# Telegram 報名通知更新

本版本以 `event-reg-main-participant-management.zip` 為基準加入 Telegram Bot 通知。

## 新增功能

- 後台獨立頁面：`/admin/telegram`
- 透過一次性 Start 連結自動配對 Telegram Chat ID
- 支援手動輸入個人或群組 Chat ID
- 發送測試訊息
- 通知頻率：
  - 每當有新報名
  - 每 3 小時彙總
  - 每 12 小時彙總
  - 每天彙總
- 通知包括活動、參加者姓名、活動總報名人數、剩餘名額及全站總報名人數
- 公開網上報名及管理員手動新增參加者均會進入同一通知佇列
- Telegram 發送失敗不會令報名失敗；系統會保留佇列供排程重試
- GitHub Actions 每小時檢查到期通知，兼容 Vercel Hobby

## 安全設計

- `TELEGRAM_BOT_TOKEN` 只存於伺服器環境變數
- `CRON_SECRET` 驗證排程請求
- Telegram 設定及通知佇列不開放予 anon 或一般 authenticated client
- 管理設定必須通過網站管理員 session
- 一次性 Telegram 連接碼 15 分鐘後失效
- 電話號碼不能取代 Chat ID，亦不會被寫入程式或資料庫

## 必須設定的環境變數

```env
TELEGRAM_BOT_TOKEN=由BotFather取得
CRON_SECRET=至少16字元的隨機密碼
```

設定後必須重新部署 Vercel，然後在後台完成 Telegram 連接及啟用通知。

## 定時排程（兼容 Vercel Hobby）

專案使用 `.github/workflows/telegram-notification-scheduler.yml` 每小時呼叫一次受保護的處理端點，應用程式再按管理員所選的 3 小時、12 小時或每日頻率判斷是否需要發送彙總。

請在 GitHub Repository → Settings → Secrets and variables → Actions 加入：

- `TELEGRAM_CRON_URL`：例如 `https://你的正式網域/api/cron/telegram`
- `CRON_SECRET`：必須與 Vercel Production 的 `CRON_SECRET` 完全相同

此安排不在 `vercel.json` 建立每小時 Cron，因此不會因 Vercel Hobby 只允許每日 Cron 而令部署失敗。即時通知不依賴排程；新報名完成後會立即嘗試發送，排程亦負責失敗重試。
