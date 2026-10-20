import { NextResponse } from "next/server";
import { assertAdminForApi } from "@/lib/auth";
import { isServiceRoleConfigured } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { isTelegramBotConfigured, sendTelegramMessage } from "@/lib/telegram";
import type { TelegramNotificationSettingsRecord } from "@/lib/types";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    await assertAdminForApi();
    if (!isServiceRoleConfigured()) return NextResponse.json({ error: "Supabase 尚未完成設定" }, { status: 503 });
    if (!isTelegramBotConfigured()) return NextResponse.json({ error: "TELEGRAM_BOT_TOKEN 尚未設定" }, { status: 409 });

    const admin = createAdminClient();
    const [{ data: settingsData, error: settingsError }, { data: events, error: eventsError }] = await Promise.all([
      admin.from("event_telegram_notification_settings").select("*").eq("setting_key", "admin").maybeSingle(),
      admin.from("events").select("confirmed_count"),
    ]);
    if (settingsError) throw settingsError;
    if (eventsError) throw eventsError;
    const settings = settingsData as TelegramNotificationSettingsRecord | null;
    let requestedChatId = "";
    try {
      const payload = await request.json() as { chatId?: unknown };
      requestedChatId = typeof payload.chatId === "string" ? payload.chatId.trim() : "";
    } catch {
      requestedChatId = "";
    }
    const chatId = requestedChatId || settings?.chat_id;
    if (!chatId) return NextResponse.json({ error: "尚未連接 Telegram Chat ID" }, { status: 409 });

    const rows = (events ?? []) as Array<{ confirmed_count: number | null }>;
    const total = rows.reduce((sum: number, event: { confirmed_count: number | null }) => sum + Number(event.confirmed_count || 0), 0);
    await sendTelegramMessage(
      chatId,
      `🧪 <b>Telegram 通知測試成功</b>\n\n活動報名系統已可發送通知。\n目前全站已確認報名：<b>${total}</b> 位`,
    );
    await admin
      .from("event_telegram_notification_settings")
      .update({ last_sent_at: new Date().toISOString(), last_error: null })
      .eq("setting_key", "admin");

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "未獲授權" }, { status: 401 });
    }
    const message = error instanceof Error ? error.message : "測試訊息發送失敗";
    if (isServiceRoleConfigured()) {
      const admin = createAdminClient();
      await admin.from("event_telegram_notification_settings").update({ last_error: message.slice(0, 1000) }).eq("setting_key", "admin");
    }
    console.error("Telegram test failed", error);
    return NextResponse.json({ error: `測試訊息發送失敗：${message}` }, { status: 500 });
  }
}
