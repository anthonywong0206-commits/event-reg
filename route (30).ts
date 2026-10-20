import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { assertAdminForApi } from "@/lib/auth";
import { isServiceRoleConfigured } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { getTelegramBotIdentity, isTelegramBotConfigured } from "@/lib/telegram";

export const runtime = "nodejs";

export async function POST() {
  try {
    const { user } = await assertAdminForApi();
    if (!isServiceRoleConfigured()) return NextResponse.json({ error: "Supabase 尚未完成設定" }, { status: 503 });
    if (!isTelegramBotConfigured()) {
      return NextResponse.json({ error: "請先在 Vercel 設定 TELEGRAM_BOT_TOKEN 並重新部署" }, { status: 409 });
    }

    const bot = await getTelegramBotIdentity();
    if (!bot.username) return NextResponse.json({ error: "Telegram Bot 尚未設定 username" }, { status: 409 });

    const token = randomUUID();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    const admin = createAdminClient();
    const { error } = await admin
      .from("event_telegram_notification_settings")
      .upsert(
        {
          setting_key: "admin",
          bot_username: bot.username,
          connect_token: token,
          connect_expires_at: expiresAt,
          updated_by: user.id,
        },
        { onConflict: "setting_key" },
      );
    if (error) {
      if (error.code === "PGRST205" || error.code === "PGRST204") {
        return NextResponse.json(
          { error: "資料庫尚未完成 Telegram 通知更新，請先套用 Migration：202608040003_add_telegram_notifications.sql" },
          { status: 503 },
        );
      }
      throw error;
    }

    return NextResponse.json({
      url: `https://t.me/${bot.username}?start=${token}`,
      username: bot.username,
      expiresAt,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "未獲授權" }, { status: 401 });
    }
    console.error("Create Telegram connection failed", error);
    return NextResponse.json(
      { error: error instanceof Error ? `未能建立 Telegram 連接：${error.message}` : "未能建立 Telegram 連接" },
      { status: 500 },
    );
  }
}
