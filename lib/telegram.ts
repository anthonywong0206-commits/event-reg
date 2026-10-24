import { createAdminClient } from "@/lib/supabase/admin";
import { isServiceRoleConfigured } from "@/lib/env";
import { TELEGRAM_FREQUENCY_LABELS } from "@/lib/telegram-constants";
import type {
  EventRecord,
  RegistrationRecord,
  TelegramNotificationFrequency,
  TelegramNotificationQueueRecord,
  TelegramNotificationSettingsRecord,
} from "@/lib/types";

const TELEGRAM_API_BASE = "https://api.telegram.org";
const MAX_DIGEST_ITEMS = 200;
const MAX_VISIBLE_NAMES = 40;

interface TelegramApiResponse<T> {
  ok: boolean;
  result?: T;
  description?: string;
  error_code?: number;
}

interface TelegramUser {
  id: number;
  is_bot: boolean;
  first_name: string;
  username?: string;
}

interface TelegramChat {
  id: number;
  type: "private" | "group" | "supergroup" | "channel";
  title?: string;
  username?: string;
  first_name?: string;
  last_name?: string;
}

interface TelegramMessage {
  message_id: number;
  date: number;
  text?: string;
  chat: TelegramChat;
}

interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
}

interface TelegramSentMessage {
  message_id: number;
}

export interface TelegramConnectMatch {
  chatId: string;
  chatLabel: string;
  updateId: number;
}

export interface TelegramProcessingResult {
  ok: boolean;
  skipped?: string;
  sent?: number;
  queued?: number;
  error?: string;
}

export function isTelegramBotConfigured(): boolean {
  return Boolean(process.env.TELEGRAM_BOT_TOKEN?.trim());
}

function telegramToken(): string {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN_NOT_CONFIGURED");
  return token;
}

async function telegramRequest<T>(method: string, payload: Record<string, unknown> = {}): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);

  try {
    const response = await fetch(`${TELEGRAM_API_BASE}/bot${telegramToken()}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
      cache: "no-store",
    });
    const result = (await response.json()) as TelegramApiResponse<T>;
    if (!response.ok || !result.ok || result.result === undefined) {
      throw new Error(result.description || `Telegram API ${response.status}`);
    }
    return result.result;
  } finally {
    clearTimeout(timer);
  }
}

export async function getTelegramBotIdentity(): Promise<TelegramUser> {
  return telegramRequest<TelegramUser>("getMe");
}

export async function sendTelegramMessage(chatId: string, text: string): Promise<TelegramSentMessage> {
  return telegramRequest<TelegramSentMessage>("sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    disable_web_page_preview: true,
  });
}

export async function findTelegramConnectMatch(connectToken: string): Promise<TelegramConnectMatch | null> {
  const updates = await telegramRequest<TelegramUpdate[]>("getUpdates", {
    timeout: 0,
    limit: 100,
    allowed_updates: ["message"],
  });

  const token = connectToken.trim();
  const match = [...updates].reverse().find((update) => {
    const text = update.message?.text?.trim() || "";
    return text === `/start ${token}` || (/^\/start@[^ ]+ /.test(text) && text.endsWith(` ${token}`));
  });

  if (!match?.message) return null;
  const chat = match.message.chat;
  const label = chat.title || [chat.first_name, chat.last_name].filter(Boolean).join(" ") || chat.username || `Chat ${chat.id}`;

  // Acknowledge updates up to the matched command so the same connection is not reused.
  await telegramRequest<TelegramUpdate[]>("getUpdates", {
    offset: match.update_id + 1,
    timeout: 0,
    limit: 1,
    allowed_updates: ["message"],
  });

  return { chatId: String(chat.id), chatLabel: label, updateId: match.update_id };
}

function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function formatHongKongDateTime(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  return new Intl.DateTimeFormat("zh-HK", {
    timeZone: "Asia/Hong_Kong",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

async function getSettings(): Promise<TelegramNotificationSettingsRecord | null> {
  if (!isServiceRoleConfigured()) return null;
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("event_telegram_notification_settings")
    .select("*")
    .eq("setting_key", "admin")
    .maybeSingle();
  if (error) throw error;
  return (data as TelegramNotificationSettingsRecord | null) ?? null;
}

async function getSiteConfirmedTotal(): Promise<number> {
  const admin = createAdminClient();
  const { data, error } = await admin.from("events").select("confirmed_count");
  if (error) throw error;
  const rows = (data ?? []) as Array<{ confirmed_count: number | null }> ;
  return rows.reduce((total: number, event: { confirmed_count: number | null }) => total + Number(event.confirmed_count || 0), 0);
}

const TELEGRAM_REGISTRATION_SELECT = "*, event:events(*), sub_activity:event_sub_activities(*), sub_activity_session:event_sub_activity_sessions(*)";

async function getRegistrationWithEvent(registrationId: string): Promise<RegistrationRecord | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("registrations")
    .select(TELEGRAM_REGISTRATION_SELECT)
    .eq("id", registrationId)
    .maybeSingle();
  if (error) throw error;
  return (data as RegistrationRecord | null) ?? null;
}

async function getRegistrationGroup(registration: RegistrationRecord): Promise<RegistrationRecord[]> {
  if (!registration.registration_group_id) return [registration];
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("registrations")
    .select(TELEGRAM_REGISTRATION_SELECT)
    .eq("registration_group_id", registration.registration_group_id)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return ((data as RegistrationRecord[]) ?? []).filter((item) => item.event_id === registration.event_id);
}

async function claimRegistrationGroupQueue(registrations: RegistrationRecord[]): Promise<TelegramNotificationQueueRecord[]> {
  const claimed: TelegramNotificationQueueRecord[] = [];
  for (const registration of registrations) {
    claimed.push(...await claimQueue(1, registration.id));
  }
  return claimed;
}

async function claimQueue(limit: number, registrationId: string | null): Promise<TelegramNotificationQueueRecord[]> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("claim_event_telegram_notifications", {
    p_limit: limit,
    p_registration_id: registrationId,
  });
  if (error) throw error;
  return (data as TelegramNotificationQueueRecord[]) ?? [];
}

async function markDelivered(queueIds: string[], messageId: number): Promise<void> {
  if (!queueIds.length) return;
  const admin = createAdminClient();
  const { error } = await admin
    .from("event_telegram_notification_queue")
    .update({
      delivered_at: new Date().toISOString(),
      processing_at: null,
      last_error: null,
      telegram_message_id: messageId,
    })
    .in("id", queueIds);

  // Older migration revisions may not yet have telegram_message_id. Retry without it.
  if (error?.code === "PGRST204") {
    const retry = await admin
      .from("event_telegram_notification_queue")
      .update({ delivered_at: new Date().toISOString(), processing_at: null, last_error: null })
      .in("id", queueIds);
    if (retry.error) throw retry.error;
  } else if (error) {
    throw error;
  }
}

async function releaseQueue(queueIds: string[], errorMessage: string): Promise<void> {
  if (!queueIds.length) return;
  const admin = createAdminClient();
  await admin
    .from("event_telegram_notification_queue")
    .update({ processing_at: null, last_error: errorMessage.slice(0, 1000) })
    .in("id", queueIds);
}

async function updateSettingsStatus(values: Record<string, unknown>): Promise<void> {
  const admin = createAdminClient();
  await admin
    .from("event_telegram_notification_settings")
    .update(values)
    .eq("setting_key", "admin");
}

function statusLabel(registration: RegistrationRecord): string {
  if (registration.status === "waitlist") return "候補";
  if (registration.status === "cancelled") return "已取消";
  return "已確認";
}

function subActivityItemLabel(registration: RegistrationRecord): string | null {
  const name = registration.sub_activity?.name;
  const session = registration.sub_activity_session;
  if (!name || !session) return null;
  const start = formatHongKongDateTime(session.start_at);
  const endTime = new Intl.DateTimeFormat("zh-HK", { timeZone:"Asia/Hong_Kong", hour:"2-digit", minute:"2-digit", hour12:false }).format(new Date(session.end_at));
  return `${name}｜${start}–${endTime}`;
}

function buildInstantMessage(registration: RegistrationRecord, event: EventRecord, siteTotal: number): string {
  const eventTotal = event.confirmed_count;
  const remaining = Math.max(0, event.capacity - event.confirmed_count);
  return [
    "🔔 <b>活動最新報名</b>",
    "",
    `活動：<b>${escapeHtml(event.title)}</b>`,
    `參加者：<b>${escapeHtml(registration.full_name)}</b>`,
    `電話：${escapeHtml(registration.phone)}`,
    ...(registration.email ? [`電郵：${escapeHtml(registration.email)}`] : []),
    `報名狀態：${statusLabel(registration)}`,
    `活動總報名人數：<b>${eventTotal} / ${event.capacity}</b>`,
    `尚餘名額：${remaining}`,
    `全站已確認報名：<b>${siteTotal}</b>`,
    `報名時間：${formatHongKongDateTime(registration.created_at)}`,
  ].join("\n");
}

function buildSubActivityGroupMessage(registrations: RegistrationRecord[], event: EventRecord, siteTotal: number): string {
  const primary = registrations[0];
  const confirmed = registrations.filter((item) => item.status === "confirmed");
  const waitlist = registrations.filter((item) => item.status === "waitlist");
  const itemLines = registrations.map((item) => {
    const label = subActivityItemLabel(item) || item.sub_activity?.name || "子活動";
    return `• ${escapeHtml(label)}（${statusLabel(item)}）`;
  });
  return [
    "🔔 <b>子活動最新報名</b>",
    "",
    `活動：<b>${escapeHtml(event.title)}</b>`,
    `參加者：<b>${escapeHtml(primary.full_name)}</b>`,
    `電話：${escapeHtml(primary.phone)}`,
    ...(primary.email ? [`電郵：${escapeHtml(primary.email)}`] : []),
    "",
    `<b>所報名子活動（${registrations.length} 項）</b>`,
    ...itemLines,
    "",
    `已確認：${confirmed.length} 項${waitlist.length ? `｜候補：${waitlist.length} 項` : ""}`,
    `全站已確認報名：<b>${siteTotal}</b>`,
    `報名時間：${formatHongKongDateTime(primary.created_at)}`,
  ].join("\n");
}

function digestHours(frequency: TelegramNotificationFrequency): number | null {
  if (frequency === "3h") return 3;
  if (frequency === "12h") return 12;
  if (frequency === "daily") return 24;
  return null;
}

function isDigestDue(settings: TelegramNotificationSettingsRecord, now = new Date()): boolean {
  const hours = digestHours(settings.frequency);
  if (!hours) return true;
  const last = new Date(settings.last_digest_at || settings.updated_at || settings.created_at || now).getTime();
  return now.getTime() - last >= hours * 60 * 60 * 1000;
}

function buildDigestMessage(
  registrations: RegistrationRecord[],
  siteTotal: number,
  frequency: TelegramNotificationFrequency,
): string {
  const grouped = new Map<string, { event: EventRecord; registrations: RegistrationRecord[] }>();
  for (const registration of registrations) {
    if (!registration.event) continue;
    const entry = grouped.get(registration.event.id) || { event: registration.event, registrations: [] };
    entry.registrations.push(registration);
    grouped.set(registration.event.id, entry);
  }
  const participantGroupKeys = new Set(registrations.map((item) => `${item.event_id}:${item.registration_group_id || item.id}`));
  const lines = [
    `📊 <b>${TELEGRAM_FREQUENCY_LABELS[frequency]}報名彙總</b>`,
    `統計時間：${formatHongKongDateTime(new Date())}`,
    `新增參加者：<b>${participantGroupKeys.size}</b> 位`,
    `新增報名項目：<b>${registrations.length}</b> 項`,
    `全站已確認報名：<b>${siteTotal}</b> 位`,
    "",
  ];

  let visibleNames = 0;
  for (const { event, registrations: eventRegistrations } of grouped.values()) {
    lines.push(`🎫 <b>${escapeHtml(event.title)}</b>`);
    const participantGroups = new Map<string, RegistrationRecord[]>();
    for (const registration of eventRegistrations) {
      const key = registration.registration_group_id || registration.id;
      participantGroups.set(key, [...(participantGroups.get(key) || []), registration]);
    }
    for (const group of participantGroups.values()) {
      if (visibleNames >= MAX_VISIBLE_NAMES) break;
      const primary = group[0];
      lines.push(`• <b>${escapeHtml(primary.full_name)}</b>`);
      lines.push(`  電話：${escapeHtml(primary.phone)}`);
      if (primary.email) lines.push(`  電郵：${escapeHtml(primary.email)}`);
      if (event.event_mode === "sub_activity" || event.sub_activity_mode) {
        for (const item of group) {
          const label = subActivityItemLabel(item) || item.sub_activity?.name || "子活動";
          lines.push(`  ↳ ${escapeHtml(label)}（${statusLabel(item)}）`);
        }
      } else {
        lines.push(`  狀態：${statusLabel(primary)}`);
      }
      visibleNames += 1;
    }
    lines.push("");
  }

  if (participantGroupKeys.size > visibleNames) {
    lines.push(`另有 ${participantGroupKeys.size - visibleNames} 位新報名者未逐一列出。`);
  }

  const text = lines.join("\n").trim();
  return text.length <= 3900 ? text : `${text.slice(0, 3840)}\n…內容較長，請登入後台查看完整名單。`;
}

export async function notifyNewRegistration(registrationId: string): Promise<TelegramProcessingResult> {
  if (!isServiceRoleConfigured() || !isTelegramBotConfigured()) {
    return { ok: true, skipped: "telegram_not_configured" };
  }

  let claimed: TelegramNotificationQueueRecord[] = [];
  try {
    const settings = await getSettings();
    if (!settings?.enabled || !settings.chat_id || settings.frequency !== "instant") {
      return { ok: true, skipped: "instant_disabled" };
    }

    const registration = await getRegistrationWithEvent(registrationId);
    if (!registration?.event) return { ok: false, error: "registration_not_found" };
    const isSubActivity = registration.event.event_mode === "sub_activity" || registration.event.sub_activity_mode;
    const group = isSubActivity ? await getRegistrationGroup(registration) : [registration];
    claimed = isSubActivity ? await claimRegistrationGroupQueue(group) : await claimQueue(1, registrationId);
    if (!claimed.length) return { ok: true, skipped: "nothing_to_send" };

    const siteTotal = await getSiteConfirmedTotal();
    const sent = await sendTelegramMessage(
      settings.chat_id,
      isSubActivity ? buildSubActivityGroupMessage(group, registration.event, siteTotal) : buildInstantMessage(registration, registration.event, siteTotal),
    );
    await markDelivered(claimed.map((item) => item.id), sent.message_id);
    await updateSettingsStatus({ last_sent_at: new Date().toISOString(), last_error: null });
    return { ok: true, sent: 1 };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Telegram notification failed";
    try {
      await releaseQueue(claimed.map((item) => item.id), message);
      if (isServiceRoleConfigured()) await updateSettingsStatus({ last_error: message.slice(0, 1000) });
    } catch (statusError) {
      console.error("Unable to record Telegram notification error", statusError);
    }
    console.error("Telegram instant notification failed", error);
    return { ok: false, error: message };
  }
}

export async function processTelegramNotificationQueue(): Promise<TelegramProcessingResult> {
  if (!isServiceRoleConfigured()) return { ok: false, error: "supabase_not_configured" };
  if (!isTelegramBotConfigured()) return { ok: false, error: "telegram_bot_not_configured" };

  const settings = await getSettings();
  if (!settings?.enabled || !settings.chat_id) return { ok: true, skipped: "notifications_disabled" };
  if (!isDigestDue(settings)) return { ok: true, skipped: "not_due" };

  const claimed = await claimQueue(MAX_DIGEST_ITEMS, null);
  if (!claimed.length) {
    if (settings.frequency !== "instant") {
      await updateSettingsStatus({ last_digest_at: new Date().toISOString(), last_error: null });
    }
    return { ok: true, skipped: "empty_queue", queued: 0 };
  }

  try {
    const admin = createAdminClient();
    const registrationIds = claimed.map((item) => item.registration_id);
    const { data, error } = await admin
      .from("registrations")
      .select(TELEGRAM_REGISTRATION_SELECT)
      .in("id", registrationIds)
      .order("created_at", { ascending: true });
    if (error) throw error;

    const registrations = (data as RegistrationRecord[]) ?? [];
    const siteTotal = await getSiteConfirmedTotal();

    if (settings.frequency === "instant") {
      let sentCount = 0;
      const notificationGroups = new Map<string, { registrations: RegistrationRecord[]; queueIds: string[] }>();
      for (const queueItem of claimed) {
        const registration = registrations.find((item) => item.id === queueItem.registration_id);
        if (!registration?.event) {
          await releaseQueue([queueItem.id], "Registration or event not found");
          continue;
        }
        const isSubActivity = registration.event.event_mode === "sub_activity" || registration.event.sub_activity_mode;
        const key = isSubActivity ? `${registration.event_id}:${registration.registration_group_id || registration.id}` : registration.id;
        const entry = notificationGroups.get(key) || { registrations: [], queueIds: [] };
        entry.registrations.push(registration);
        entry.queueIds.push(queueItem.id);
        notificationGroups.set(key, entry);
      }
      for (const entry of notificationGroups.values()) {
        const primary = entry.registrations[0];
        if (!primary?.event) continue;
        try {
          const isSubActivity = primary.event.event_mode === "sub_activity" || primary.event.sub_activity_mode;
          const sent = await sendTelegramMessage(
            settings.chat_id,
            isSubActivity ? buildSubActivityGroupMessage(entry.registrations, primary.event, siteTotal) : buildInstantMessage(primary, primary.event, siteTotal),
          );
          await markDelivered(entry.queueIds, sent.message_id);
          sentCount += 1;
        } catch (error) {
          const message = error instanceof Error ? error.message : "Telegram notification failed";
          await releaseQueue(entry.queueIds, message);
        }
      }
      await updateSettingsStatus({
        last_sent_at: sentCount ? new Date().toISOString() : settings.last_sent_at,
        last_error: sentCount ? null : "Telegram 訊息發送失敗，系統將於下次排程重試。",
      });
      return { ok: sentCount > 0, sent: sentCount, queued: claimed.length };
    }

    const sent = await sendTelegramMessage(
      settings.chat_id,
      buildDigestMessage(registrations, siteTotal, settings.frequency),
    );
    await markDelivered(claimed.map((item) => item.id), sent.message_id);
    await updateSettingsStatus({
      last_digest_at: new Date().toISOString(),
      last_sent_at: new Date().toISOString(),
      last_error: null,
    });
    return { ok: true, sent: registrations.length, queued: claimed.length };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Telegram digest failed";
    await releaseQueue(claimed.map((item) => item.id), message);
    await updateSettingsStatus({ last_error: message.slice(0, 1000) });
    throw error;
  }
}
