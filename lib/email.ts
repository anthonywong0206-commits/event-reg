import { Resend } from "resend";
import type { EventRecord, RegistrationRecord } from "@/lib/types";
import { formatEventDate } from "@/lib/format";
import { createQrDataUrl, checkInUrl } from "@/lib/qr";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export async function sendRegistrationEmail(
  registration: RegistrationRecord,
  event: EventRecord,
): Promise<{ sent: boolean; error?: string }> {
  const recipient = registration.email;
  if (!recipient) return { sent: false };

  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  if (!apiKey || !from) return { sent: false, error: "RESEND_NOT_CONFIGURED" };

  try {
    const resend = new Resend(apiKey);
    const qrDataUrl = await createQrDataUrl(registration.qr_token);
    const qrBase64 = qrDataUrl.split(",")[1];
    const entryUrl = checkInUrl(registration.qr_token);

    const { error } = await resend.emails.send(
      {
        from,
        to: [recipient],
        subject: `報名成功｜${event.title}`,
        html: `
        <div style="font-family:Arial,'Noto Sans TC',sans-serif;background:#f4f7fb;padding:32px;color:#172b4d">
          <div style="max-width:620px;margin:auto;background:#fff;border-radius:18px;overflow:hidden;border:1px solid #dfe7ef">
            <div style="padding:26px 30px;background:#0f5bd3;color:#fff">
              <div style="font-size:13px;opacity:.85">EVENT REGISTER SYSTEM</div>
              <h1 style="font-size:24px;margin:8px 0 0">報名成功通知</h1>
            </div>
            <div style="padding:30px">
              <p>${escapeHtml(registration.full_name)} 您好：</p>
              <p>感謝您報名以下活動。請保存此電郵，並於活動當日出示下方 QR Code 完成登記。</p>
              <div style="background:#f7faff;border:1px solid #dce8f8;border-radius:14px;padding:18px;margin:22px 0">
                <strong style="font-size:18px">${escapeHtml(event.title)}</strong>
                <p style="margin:10px 0 4px">${escapeHtml(formatEventDate(event))}</p>
                <p style="margin:4px 0">${escapeHtml(event.location)}</p>
                <p style="margin:4px 0">報名編號：${escapeHtml(registration.registration_no)}</p>
              </div>
              <div style="text-align:center;padding:8px 0 20px">
                <img src="cid:event-entry-qr" width="280" height="280" alt="活動入場 QR Code" style="display:block;margin:auto;border:1px solid #e1e7ef;border-radius:12px" />
                <p style="font-size:13px;color:#5c6b7a">如圖片未能顯示，QR Code PNG 已附於此電郵。</p>
                <a href="${entryUrl}" style="display:inline-block;background:#0f5bd3;color:#fff;text-decoration:none;padding:12px 20px;border-radius:9px">開啟電子入場證</a>
              </div>
              <p style="font-size:13px;color:#68778a">此憑證只供指定報名使用，請勿轉發。QR Code 是 DENSO WAVE INCORPORATED 在日本及其他國家的註冊商標。</p>
            </div>
          </div>
        </div>`,
        attachments: [
          {
            content: qrBase64,
            filename: `${registration.registration_no}-QR.png`,
            contentId: "event-entry-qr",
          },
        ],
      },
      {
        idempotencyKey: `registration/${registration.id}`,
      },
    );

    if (error) return { sent: false, error: error.message };
    return { sent: true };
  } catch (error) {
    return { sent: false, error: error instanceof Error ? error.message : "EMAIL_SEND_FAILED" };
  }
}
