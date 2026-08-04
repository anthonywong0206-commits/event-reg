import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { assertAdminForApi } from "@/lib/auth";
import { isCronSecretConfigured, isServiceRoleConfigured } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { isTelegramBotConfigured } from "@/lib/telegram";
import { telegramSettingsSchema } from "@/lib/validators";
import type { TelegramNotificationSettingsRecord } from "@/lib/types";

export async function PUT(request: Request) {
  try {
    const { user } = await assertAdminForApi();
    if (!isServiceRoleConfigured()) {
      return NextResponse.json({ error: "Supabase 尚未完成設定" }, { status: 503 });
    }

    const parsed = telegramSettingsSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message || "Telegram 設定無效" }, { status: 400 });
    }

    const admin = createAdminClient();
    const { data: existing, error: existingError } = await admin
      .from("event_telegram_notification_settings")
      .select("*")
      .eq("setting_key", "admin")
      .maybeSingle();
    if (existingError) {
      if (existingError.code === "PGRST205" || existingError.code === "PGRST204") {
        return NextResponse.json(
          { error: "資料庫尚未完成 Telegram 通知更新，請先套用 Migration：202608040003_add_telegram_notifications.sql" },
          { status: 503 },
        );
      }
      throw existingError;
    }

    const chatId = parsed.data.chatId || null;
    if (parsed.data.enabled && !isTelegramBotConfigured()) {
      return NextResponse.json({ error: "請先在 Vercel 設定 TELEGRAM_BOT_TOKEN 並重新部署" }, { status: 409 });
    }
    if (parsed.data.enabled && !isCronSecretConfigured()) {
      return NextResponse.json({ error: "請先在 Vercel 設定 CRON_SECRET 並重新部署" }, { status: 409 });
    }
    if (parsed.data.enabled && !chatId) {
      return NextResponse.json({ error: "請先連接 Telegram 或輸入 Chat ID" }, { status: 409 });
    }

    const current = existing as TelegramNotificationSettingsRecord | null;
    const frequencyChanged = current?.frequency !== parsed.data.frequency;
    const enabling = !current?.enabled && parsed.data.enabled;
    const disabling = Boolean(current?.enabled) && !parsed.data.enabled;
    const now = new Date().toISOString();

    const { data, error } = await admin
      .from("event_telegram_notification_settings")
      .upsert(
        {
          setting_key: "admin",
          enabled: parsed.data.enabled,
          frequency: parsed.data.frequency,
          chat_id: chatId,
          chat_label: chatId === current?.chat_id ? current?.chat_label : null,
          connected_at: chatId ? (chatId !== current?.chat_id ? now : current?.connected_at) : null,
          last_digest_at: frequencyChanged || enabling ? now : current?.last_digest_at || now,
          last_error: null,
          updated_by: user.id,
        },
        { onConflict: "setting_key" },
      )
      .select("*")
      .single();
    if (error) throw error;

    if (disabling) {
      await admin
        .from("event_telegram_notification_queue")
        .update({ discarded_at: now, processing_at: null, last_error: "Notifications disabled by administrator" })
        .is("delivered_at", null)
        .is("discarded_at", null);
    }

    revalidatePath("/admin/telegram");
    return NextResponse.json(data);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "未獲授權" }, { status: 401 });
    }
    console.error("Update Telegram settings failed", error);
    return NextResponse.json(
      { error: error instanceof Error ? `未能更新 Telegram 設定：${error.message}` : "未能更新 Telegram 設定" },
      { status: 500 },
    );
  }
}
