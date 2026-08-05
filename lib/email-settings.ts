import { createAdminClient } from "@/lib/supabase/admin";
import { isServiceRoleConfigured } from "@/lib/env";
import type { EmailNotificationSettingsRecord, EmailTemplateKey } from "@/lib/types";

export const EMAIL_TEMPLATE_PRESETS: Record<Exclude<EmailTemplateKey, "custom">, Pick<EmailNotificationSettingsRecord, "subject_template" | "body_template"> & { label: string; description: string }> = {
  standard: {
    label: "標準確認通知",
    description: "完整列出活動資料、報名編號及入場提示。",
    subject_template: "報名成功｜{{event_title}}",
    body_template: "{{name}} 您好：\n\n感謝您報名「{{event_title}}」。您的報名已確認。\n\n活動日期及時間：{{event_date}}\n活動地點：{{event_location}}\n報名編號：{{registration_no}}\n\n請保存本電郵及下方 QR Code，並於活動當日出示以完成出席登記。",
  },
  friendly: {
    label: "親切提醒",
    description: "語氣較親切，適合社區及中心活動。",
    subject_template: "已為你留位｜{{event_title}}",
    body_template: "{{name}} 您好！\n\n你已成功報名「{{event_title}}」，期待活動當日見到你。\n\n日期及時間：{{event_date}}\n地點：{{event_location}}\n報名編號：{{registration_no}}\n\n請保留這封電郵及 QR Code，活動當日向工作人員出示即可登記入場。如未能出席，請盡早聯絡主辦單位。",
  },
  concise: {
    label: "簡潔通知",
    description: "只保留最重要的確認及入場資料。",
    subject_template: "報名確認：{{event_title}}",
    body_template: "{{name}} 您好，你已成功報名「{{event_title}}」。\n\n日期及時間：{{event_date}}\n地點：{{event_location}}\n報名編號：{{registration_no}}\n\n請於活動當日出示下方 QR Code。",
  },
};

export const DEFAULT_EMAIL_SETTINGS: EmailNotificationSettingsRecord = {
  setting_key: "registration_confirmation",
  enabled: true,
  template_key: "standard",
  subject_template: EMAIL_TEMPLATE_PRESETS.standard.subject_template,
  body_template: EMAIL_TEMPLATE_PRESETS.standard.body_template,
  include_qr: true,
  reply_to: null,
};

export async function getEmailSettings(): Promise<EmailNotificationSettingsRecord> {
  if (!isServiceRoleConfigured()) return DEFAULT_EMAIL_SETTINGS;
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("event_email_notification_settings")
    .select("*")
    .eq("setting_key", "registration_confirmation")
    .maybeSingle();
  if (error) {
    console.error("Unable to load email notification settings", error);
    return DEFAULT_EMAIL_SETTINGS;
  }
  return (data as EmailNotificationSettingsRecord | null) ?? DEFAULT_EMAIL_SETTINGS;
}
