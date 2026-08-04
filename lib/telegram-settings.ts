import { createAdminClient } from "@/lib/supabase/admin";
import { isServiceRoleConfigured } from "@/lib/env";
import type { TelegramNotificationSettingsRecord } from "@/lib/types";

export const DEFAULT_TELEGRAM_SETTINGS: TelegramNotificationSettingsRecord = {
  setting_key: "admin",
  enabled: false,
  frequency: "instant",
  chat_id: null,
  chat_label: null,
  bot_username: null,
  connected_at: null,
  last_digest_at: new Date(0).toISOString(),
  last_sent_at: null,
  last_error: null,
};

export async function getTelegramSettingsForAdmin(): Promise<TelegramNotificationSettingsRecord> {
  if (!isServiceRoleConfigured()) return DEFAULT_TELEGRAM_SETTINGS;
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("event_telegram_notification_settings")
    .select("*")
    .eq("setting_key", "admin")
    .maybeSingle();
  if (error) {
    if (error.code === "PGRST205" || error.code === "PGRST204") return DEFAULT_TELEGRAM_SETTINGS;
    throw error;
  }
  return (data as TelegramNotificationSettingsRecord | null) ?? DEFAULT_TELEGRAM_SETTINGS;
}
