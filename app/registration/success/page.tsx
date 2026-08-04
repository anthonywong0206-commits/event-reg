import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarDays, CheckCircle2, Download, MailCheck, MapPin, QrCode } from "lucide-react";
import { EventImage } from "@/components/event-image";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { getRegistrationByToken } from "@/lib/data";
import { createQrDataUrl } from "@/lib/qr";
import { formatEventDate } from "@/lib/format";

export const metadata: Metadata = { title: "報名成功" };

export default async function RegistrationSuccessPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  if (!token) notFound();
  const registration = await getRegistrationByToken(token);
  if (!registration || !registration.event) notFound();
  const qrDataUrl = await createQrDataUrl(registration.qr_token);
  const event = registration.event;

  return (
    <>
      <SiteHeader />
      <main className="success-page shell">
        <section className="success-card">
          <div className="success-copy">
            <CheckCircle2 className="success-icon" />
            <span className="success-kicker">申請完成</span>
            <h1>報名成功！</h1>
            {registration.email ? (
              <p>確認資料已發送至 <strong>{registration.email}</strong>。請保存電郵及 QR Code，並於活動當日出示。</p>
            ) : (
              <p>你的電子入場 QR Code 已建立。請立即下載或截圖保存，並於活動當日出示。</p>
            )}
            <div className="success-event-summary">
              <EventImage src={event.poster_image_url} alt="" width={92} height={120} />
              <div><strong>{event.title}</strong><span><CalendarDays />{formatEventDate(event)}</span><span><MapPin />{event.location}</span></div>
            </div>
            {registration.email ? (
              <div className="email-confirmation"><MailCheck /><span><strong>確認電郵及 QR 圖片</strong>如收件箱未有顯示，請檢查垃圾郵件資料夾。</span></div>
            ) : (
              <div className="email-confirmation"><QrCode /><span><strong>請保存電子入場憑證</strong>未有填寫電郵，系統不會另行寄送 QR Code。</span></div>
            )}
            <div className="success-actions"><Link className="button button-primary" href="/">返回活動總覽</Link><Link className="button button-secondary" href={`/events/${event.slug}`}>查看活動詳情</Link></div>
          </div>
          <div className="qr-ticket">
            <div className="ticket-top"><QrCode /><span>電子入場憑證</span></div>
            <Image src={qrDataUrl} alt="活動入場 QR Code" width={320} height={320} unoptimized />
            <strong>{registration.registration_no}</strong>
            <span>{registration.full_name}</span>
            <a href={qrDataUrl} download={`${registration.registration_no}-QR.png`} className="button button-ghost button-small"><Download />下載 QR Code</a>
            <small>每個 QR Code 只可完成一次出席登記</small>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
