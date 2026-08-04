import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Bot, ExternalLink } from "lucide-react";
import { AdminTelegramSettingsForm } from "@/components/admin-telegram-settings-form";
import { requireAdmin } from "@/lib/auth";
import { isTelegramBotConfigured } from "@/lib/telegram";
import { isCronSecretConfigured } from "@/lib/env";
import { getTelegramSettingsForAdmin } from "@/lib/telegram-settings";

export const metadata: Metadata = { title: "Telegram 通知設定" };

export default async function TelegramSettingsPage() {
  await requireAdmin();
  const settings = await getTelegramSettingsForAdmin();

  return (
    <main className="admin-editor-page">
      <div className="admin-shell">
        <div className="editor-top-links">
          <Link href="/admin" className="back-link"><ArrowLeft />返回活動總覽</Link>
          {settings.bot_username && (
            <a href={`https://t.me/${settings.bot_username}`} target="_blank" rel="noreferrer" className="button button-secondary button-small">
              <ExternalLink />開啟 Telegram Bot
            </a>
          )}
        </div>
        <div className="editor-title">
          <p>TELEGRAM NOTIFICATIONS</p>
          <h1><Bot />Telegram 報名通知</h1>
          <span>獨立設定管理員收件人及通知頻率。Bot Token 只保存在伺服器環境變數。</span>
        </div>
        <AdminTelegramSettingsForm settings={settings} botConfigured={isTelegramBotConfigured()} cronConfigured={isCronSecretConfigured()} />
      </div>
    </main>
  );
}
