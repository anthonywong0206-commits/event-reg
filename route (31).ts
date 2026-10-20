import { NextResponse } from "next/server";
import { assertAdminForApi } from "@/lib/auth";
import { isServiceRoleConfigured } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { findTelegramConnectMatch, getTelegramBotIdentity, isTelegramBotConfigured, sendTelegramMessage } from "@/lib/telegram";
import type { TelegramNotificationSettingsRecord } from "@/lib/types";

export const runtime = "nodejs";

export async function POST() {
  try {
    const { user } = await assertAdminForApi();
    if (!isServiceRoleConfigured()) return NextResponse.json({ error: "Supabase 尚未完成設定" }, { status: 503 });
    if (!isTelegramBotConfigured()) return NextResponse.json({ error: "TELEGRAM_BOT_TOKEN 尚未設定" }, { status: 409 });

    const admin = createAdminClient();
    const { data, error } = await admin
      .from("event_telegram_notification_settings")
      .select("*")
      .eq("setting_key", "admin")
      .maybeSingle();
    if (error) throw error;
    const settings = data as TelegramNotificationSettingsRecord | null;
    if (!settings?.connect_token || !settings.connect_expires_at) {
      return NextResponse.json({ error: "請先按『開啟 Telegram 連接』產生一次性連結" }, { status: 409 });
    }
    if (new Date(settings.connect_expires_at).getTime() < Date.now()) {
      return NextResponse.json({ error: "連接連結已過期，請重新產生" }, { status: 410 });
    }

    const match = await findTelegramConnectMatch(settings.connect_token);
    if (!match) {
      return NextResponse.json({ error: "尚未收到 Start 訊息。請在 Telegram 開啟 Bot 並按 Start／開始後再試。" }, { status: 409 });
    }

    const bot = await getTelegramBotIdentity();
    const now = new Date().toISOString();
    const { error: updateError } = await admin
      .from("event_telegram_notification_settings")
      .update({
        chat_id: match.chatId,
        chat_label: match.chatLabel,
        bot_username: bot.username || settings.bot_username,
        connected_at: now,
        connect_token: null,
        connect_expires_at: null,
        last_error: null,
        updated_by: user.id,
      })
      .eq("setting_key", "admin");
    if (updateError) throw updateError;

    await sendTelegramMessage(
      match.chatId,
      "✅ <b>活動報名系統已成功連接</b>\n\n你現在可以返回管理後台選擇通知頻率並啟用通知。",
    );

    return NextResponse.json({
      chatId: match.chatId,
      chatLabel: match.chatLabel,
      botUsername: bot.username || settings.bot_username,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "未獲授權" }, { status: 401 });
    }
    console.error("Confirm Telegram connection failed", error);
    return NextResponse.json(
      { error: error instanceof Error ? `未能完成 Telegram 連接：${error.message}` : "未能完成 Telegram 連接" },
      { status: 500 },
    );
  }
}
