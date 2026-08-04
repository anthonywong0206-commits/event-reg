import type { TelegramNotificationFrequency } from "@/lib/types";

export const TELEGRAM_FREQUENCY_LABELS: Record<TelegramNotificationFrequency, string> = {
  instant: "每當有新報名",
  "3h": "每 3 小時彙總",
  "12h": "每 12 小時彙總",
  daily: "每天彙總",
};
