import { Resend } from "resend";
import type { EventRecord, RegistrationRecord } from "@/lib/types";
import { formatDateTime, formatEventDate } from "@/lib/format";
import { createQrDataUrl, checkInUrl } from "@/lib/qr";
import { getEmailSettings } from "@/lib/email-settings";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function sessionLabel(registration: RegistrationRecord, event: EventRecord): string {
  if (registration.session) return `${formatDateTime(registration.session.start_at)}–${new Intl.DateTimeFormat("zh-HK", { timeZone: "Asia/Hong_Kong", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(registration.session.end_at))}`;
  return formatEventDate(event);
}

function replaceVariables(template: string, registration: RegistrationRecord, event: EventRecord): string {
  const values: Record<string, string> = {
    name: registration.full_name,
    event_title: event.title,
    event_date: sessionLabel(registration, event),
    event_location: event.location,
    registration_no: registration.registration_no,
    entry_url: checkInUrl(registration.qr_token),
  };
  return template.replace(/\{\{([a-z_]+)\}\}/g, (match, key: string) => values[key] ?? match);
}

function textToHtml(value: string): string {
  return escapeHtml(value).replaceAll("\n", "<br />");
}

function isValidSender(value: string): boolean {
  const bracketedAddress = value.match(/<([^<>]+)>\s*$/)?.[1];
  const address = (bracketedAddress ?? value).trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address);
}

export async function sendRegistrationEmail(
  registration: RegistrationRecord,
  event: EventRecord,
  options?: { idempotencyKey?: string },
): Promise<{ sent: boolean; skipped?: boolean; error?: string }> {
  const recipient = registration.email?.trim();
  if (!recipient) return { sent: false, skipped: true };

  const settings = await getEmailSettings();
  if (!settings.enabled) return { sent: false, skipped: true, error: "EMAIL_NOTIFICATIONS_DISABLED" };

  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.RESEND_FROM_EMAIL?.trim();
  if (!apiKey || !from) return { sent: false, error: "RESEND_NOT_CONFIGURED" };
  if (!isValidSender(from)) return { sent: false, error: "RESEND_FROM_EMAIL_INVALID" };

  try {
    const resend = new Resend(apiKey);
    const entryUrl = checkInUrl(registration.qr_token);
    const subject = replaceVariables(settings.subject_template, registration, event).slice(0, 300);
    const customBody = textToHtml(replaceVariables(settings.body_template, registration, event));
    const attachments: Array<{ content: string; filename: string; contentId?: string }> = [];
    let qrBlock = "";

    if (settings.include_qr) {
      const qrDataUrl = await createQrDataUrl(registration.qr_token);
      const qrBase64 = qrDataUrl.split(",")[1];
      if (!qrBase64) throw new Error("QR_CODE_GENERATION_FAILED");
      attachments.push({
        content: qrBase64,
        filename: `${registration.registration_no}-QR.png`,
        contentId: "event-entry-qr",
      });
      qrBlock = `
        <div style="text-align:center;padding:12px 0 22px">
          <img src="cid:event-entry-qr" width="280" height="280" alt="活動出席 QR Code" style="display:block;margin:auto;border:1px solid #e1e7ef;border-radius:12px" />
          <p style="font-size:13px;color:#5c6b7a">QR Code PNG 亦已附於本電郵，請下載或截圖保存。</p>
          <a href="${escapeHtml(entryUrl)}" style="display:inline-block;background:#0f5bd3;color:#fff;text-decoration:none;padding:12px 20px;border-radius:9px">開啟電子入場證</a>
        </div>`;
    }

    const { error } = await resend.emails.send(
      {
        from,
        to: [recipient],
        ...(settings.reply_to ? { replyTo: settings.reply_to } : {}),
        subject,
        html: `
        <div style="font-family:Arial,'Noto Sans TC',sans-serif;background:#f4f7fb;padding:32px;color:#172b4d">
          <div style="max-width:620px;margin:auto;background:#fff;border-radius:18px;overflow:hidden;border:1px solid #dfe7ef">
            <div style="padding:26px 30px;background:#0f5bd3;color:#fff">
              <div style="font-size:13px;opacity:.85">EVENT REGISTER SYSTEM</div>
              <h1 style="font-size:24px;margin:8px 0 0">報名確認及電子入場證</h1>
            </div>
            <div style="padding:30px">
              <div style="font-size:15px;line-height:1.75">${customBody}</div>
              <div style="background:#f7faff;border:1px solid #dce8f8;border-radius:14px;padding:18px;margin:22px 0">
                <strong style="font-size:18px">${escapeHtml(event.title)}</strong>
                <p style="margin:10px 0 4px">${escapeHtml(sessionLabel(registration, event))}</p>
                <p style="margin:4px 0">${escapeHtml(event.location)}</p>
                <p style="margin:4px 0">報名編號：${escapeHtml(registration.registration_no)}</p>
              </div>
              ${qrBlock}
              <p style="font-size:13px;color:#68778a">電子入場證只供指定參加者使用，請勿轉發。如活動資料有更改，請以主辦單位最新通知為準。</p>
            </div>
          </div>
        </div>`,
        attachments,
      },
      { idempotencyKey: options?.idempotencyKey ?? `registration/${registration.id}` },
    );

    if (error) return { sent: false, error: error.message };
    return { sent: true };
  } catch (error) {
    return { sent: false, error: error instanceof Error ? error.message : "EMAIL_SEND_FAILED" };
  }
}
