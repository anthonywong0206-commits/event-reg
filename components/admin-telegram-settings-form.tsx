"use client";

import { useState, type ChangeEvent, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  Bot,
  CheckCircle2,
  Clock3,
  ExternalLink,
  Link2,
  LoaderCircle,
  MessageCircleMore,
  Save,
  Send,
  ShieldCheck,
} from "lucide-react";
import type { TelegramNotificationFrequency, TelegramNotificationSettingsRecord } from "@/lib/types";
import { TELEGRAM_FREQUENCY_LABELS } from "@/lib/telegram-constants";

interface AdminTelegramSettingsFormProps {
  settings: TelegramNotificationSettingsRecord;
  botConfigured: boolean;
  cronConfigured: boolean;
}

export function AdminTelegramSettingsForm({ settings, botConfigured, cronConfigured }: AdminTelegramSettingsFormProps) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(settings.enabled);
  const [frequency, setFrequency] = useState<TelegramNotificationFrequency>(settings.frequency);
  const [chatId, setChatId] = useState(settings.chat_id || "");
  const [chatLabel, setChatLabel] = useState(settings.chat_label || "");
  const [botUsername, setBotUsername] = useState(settings.bot_username || "");
  const [connectUrl, setConnectUrl] = useState("");
  const [connectExpiresAt, setConnectExpiresAt] = useState("");
  const [saving, setSaving] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  function resetMessages() {
    setError("");
    setSuccess("");
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    resetMessages();
    try {
      const response = await fetch("/api/admin/telegram/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled, frequency, chatId: chatId.trim() }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "未能儲存 Telegram 設定");
      setEnabled(result.enabled);
      setFrequency(result.frequency);
      setChatId(result.chat_id || "");
      setChatLabel(result.chat_label || "");
      setSuccess("Telegram 通知設定已儲存。");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "未能儲存 Telegram 設定");
    } finally {
      setSaving(false);
    }
  }

  async function createConnection() {
    setConnecting(true);
    resetMessages();
    try {
      const response = await fetch("/api/admin/telegram/connect", { method: "POST" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "未能建立 Telegram 連接");
      setConnectUrl(result.url);
      setConnectExpiresAt(result.expiresAt);
      setBotUsername(result.username || "");
      window.open(result.url, "_blank", "noopener,noreferrer");
      setSuccess("已開啟 Telegram。請按 Start／開始，再返回此頁按「完成連接」。");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "未能建立 Telegram 連接");
    } finally {
      setConnecting(false);
    }
  }

  async function confirmConnection() {
    setConfirming(true);
    resetMessages();
    try {
      const response = await fetch("/api/admin/telegram/connect/confirm", { method: "POST" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "尚未收到 Telegram 的 Start 訊息");
      setChatId(result.chatId);
      setChatLabel(result.chatLabel);
      setBotUsername(result.botUsername || botUsername);
      setConnectUrl("");
      setConnectExpiresAt("");
      setSuccess(`已連接 Telegram：${result.chatLabel}`);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "尚未收到 Telegram 的 Start 訊息");
    } finally {
      setConfirming(false);
    }
  }

  async function testConnection() {
    setTesting(true);
    resetMessages();
    try {
      const response = await fetch("/api/admin/telegram/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chatId: chatId.trim() }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "測試訊息發送失敗");
      setSuccess("測試訊息已發送至 Telegram。");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "測試訊息發送失敗");
    } finally {
      setTesting(false);
    }
  }

  return (
    <form className="admin-event-form telegram-settings-form" onSubmit={save}>
      <section className="telegram-status-grid">
        <article className={botConfigured ? "ready" : "warning"}>
          <Bot />
          <div><strong>{botConfigured ? "Bot Token 已設定" : "尚未設定 Bot Token"}</strong><span>{botConfigured ? (botUsername ? `@${botUsername}` : "可開始連接 Telegram") : "請先在 Vercel 加入 TELEGRAM_BOT_TOKEN"}</span></div>
        </article>
        <article className={chatId ? "ready" : "warning"}>
          <Link2 />
          <div><strong>{chatId ? "已連接收件人" : "尚未連接收件人"}</strong><span>{chatLabel || (chatId ? `Chat ID：${chatId}` : "電話號碼不能直接用作 Bot 收件人")}</span></div>
        </article>
        <article className={cronConfigured ? "ready" : "warning"}>
          <Clock3 />
          <div><strong>{cronConfigured ? "排程驗證已設定" : "尚未設定 CRON_SECRET"}</strong><span>{cronConfigured ? "可執行定時彙總及失敗重試" : "請在 Vercel 加入 CRON_SECRET"}</span></div>
        </article>
        <article className={enabled ? "ready" : "neutral"}>
          <MessageCircleMore />
          <div><strong>{enabled ? "通知已啟用" : "通知已停用"}</strong><span>{TELEGRAM_FREQUENCY_LABELS[frequency]}</span></div>
        </article>
      </section>

      <section className="admin-form-section">
        <div className="section-heading">
          <h2>連接 Telegram</h2>
          <span>Bot 無法以電話號碼直接找到用戶；請先向 Bot 發送 Start 以取得 Chat ID</span>
        </div>

        {!botConfigured && (
          <div className="notice notice-info">
            <ShieldCheck />
            <div><strong>先設定伺服器環境變數</strong><br />在 Vercel 加入 <code>TELEGRAM_BOT_TOKEN</code>，重新部署後再返回此頁連接。Token 不會儲存在資料庫或傳送到瀏覽器。</div>
          </div>
        )}

        <div className="telegram-connect-panel">
          <div className="telegram-connect-steps">
            <span>1</span><div><strong>開啟專用 Bot</strong><small>系統會建立 15 分鐘有效的一次性連接連結。</small></div>
            <span>2</span><div><strong>在 Telegram 按 Start／開始</strong><small>你提供的 +852 電話號碼不會被網站儲存，亦不能代替 Chat ID。</small></div>
            <span>3</span><div><strong>返回並完成連接</strong><small>系統只會配對這次產生的一次性代碼。</small></div>
          </div>
          <div className="telegram-connect-actions">
            <button type="button" className="button button-secondary" disabled={!botConfigured || connecting} onClick={createConnection}>
              {connecting ? <><LoaderCircle className="spin" />建立中…</> : <><ExternalLink />開啟 Telegram 連接</>}
            </button>
            <button type="button" className="button button-primary" disabled={!botConfigured || confirming} onClick={confirmConnection}>
              {confirming ? <><LoaderCircle className="spin" />檢查中…</> : <><CheckCircle2 />完成連接</>}
            </button>
          </div>
          {connectUrl && <p className="telegram-connect-link">連接連結：<a href={connectUrl} target="_blank" rel="noreferrer">{connectUrl}</a>{connectExpiresAt && <small>有效至 {new Date(connectExpiresAt).toLocaleString("zh-HK")}</small>}</p>}
        </div>

        <div className="form-grid telegram-manual-chat">
          <label className="field field-full">
            <span>Telegram Chat ID（進階／手動輸入）</span>
            <input value={chatId} onChange={(event: ChangeEvent<HTMLInputElement>) => setChatId(event.target.value)} placeholder="例如 123456789 或 -1001234567890" />
            <small>個人對話或群組均可使用。建議優先使用上方連接流程自動取得。</small>
          </label>
        </div>
      </section>

      <section className="admin-form-section">
        <div className="section-heading">
          <h2>通知頻率</h2>
          <span>通知包含活動名稱、最新參加者姓名、活動總報名人數及全站總報名人數</span>
        </div>
        <div className="telegram-frequency-grid">
          {(Object.keys(TELEGRAM_FREQUENCY_LABELS) as TelegramNotificationFrequency[]).map((value) => (
            <label key={value} className={frequency === value ? "selected" : ""}>
              <input type="radio" name="frequency" value={value} checked={frequency === value} onChange={() => setFrequency(value)} />
              <Clock3 />
              <span><strong>{TELEGRAM_FREQUENCY_LABELS[value]}</strong><small>{value === "instant" ? "每次新報名後立即發送；失敗時由每小時排程重試。" : `把期間內的新參加者合併成一則訊息，減少頻繁提示。`}</small></span>
            </label>
          ))}
        </div>
        <label className="telegram-enable-toggle">
          <input type="checkbox" checked={enabled} onChange={(event: ChangeEvent<HTMLInputElement>) => setEnabled(event.target.checked)} />
          <span><strong>啟用 Telegram 報名通知</strong><small>必須已設定 Bot Token 及連接 Chat ID。</small></span>
        </label>
      </section>

      <section className="admin-form-section telegram-health-section">
        <div className="section-heading"><h2>連線狀態</h2><span>可先發送測試訊息，再正式啟用通知</span></div>
        <dl className="telegram-health-list">
          <div><dt>收件人</dt><dd>{chatLabel || "尚未連接"}</dd></div>
          <div><dt>最後發送</dt><dd>{settings.last_sent_at ? new Date(settings.last_sent_at).toLocaleString("zh-HK") : "尚未發送"}</dd></div>
          <div><dt>最近錯誤</dt><dd className={settings.last_error ? "error" : ""}>{settings.last_error || "沒有"}</dd></div>
        </dl>
        <button type="button" className="button button-secondary" disabled={!botConfigured || !chatId || testing} onClick={testConnection}>
          {testing ? <><LoaderCircle className="spin" />發送中…</> : <><Send />發送測試訊息</>}
        </button>
      </section>

      {error && <div className="notice notice-error"><AlertCircle />{error}</div>}
      {success && <div className="notice notice-success"><CheckCircle2 />{success}</div>}

      <div className="admin-form-actions">
        <button type="submit" className="button button-primary button-large" disabled={saving}>
          {saving ? <><LoaderCircle className="spin" />儲存中…</> : <><Save />儲存 Telegram 設定</>}
        </button>
      </div>
    </form>
  );
}
