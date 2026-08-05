import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CalendarDays, Clock3, MapPin, Phone, UsersRound } from "lucide-react";
import { EventImage } from "@/components/event-image";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { EventDetailActions } from "@/components/event-detail-actions";
import { Countdown } from "@/components/countdown";
import { StatusBadge } from "@/components/status-badge";
import { getEventBySlug } from "@/lib/data";
import { capacitySignal, eventRegistrationState, formatDateTime, formatDeadline, formatEventDate, remainingSeats } from "@/lib/format";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const event = await getEventBySlug(slug);
  return event ? { title: event.title, description: event.summary } : { title: "找不到活動" };
}

export default async function EventDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const event = await getEventBySlug(slug);
  if (!event) notFound();
  const registrationState = eventRegistrationState(event);

  return (
    <>
      <SiteHeader />
      <main className="event-detail-page">
        <div className="shell breadcrumb"><Link href="/"><ArrowLeft />返回活動總覽</Link><span>/</span><span>{event.category}</span></div>
        <section className="shell event-detail-hero">
          <div className="detail-poster"><EventImage src={event.poster_image_url} alt={`${event.title} 活動海報`} fill priority sizes="(max-width: 800px) 100vw, 32vw" objectFit="contain" objectPosition="center" /></div>
          <div className="detail-content">
            <div className="detail-title-row"><div><span className="category-tag static">{event.category}</span><h1>{event.title}</h1>{event.subtitle && <p className="detail-subtitle">{event.subtitle}</p>}</div><StatusBadge event={event} /></div>
            <p className="detail-summary">{event.summary}</p>
            <dl className="detail-facts">
              <div><dt><CalendarDays />日期時間</dt><dd>{event.is_multi_session ? `${event.sessions?.length || 0} 個可選時段` : formatEventDate(event)}</dd></div>
              <div><dt><MapPin />地點</dt><dd>{event.location}{event.address && <small>{event.address}</small>}</dd></div>
              <div><dt><UsersRound />活動名額</dt><dd>{event.is_multi_session ? <span className={`capacity-signal ${capacitySignal(event).key}`}>{capacitySignal(event).label}</span> : <>上限 {event.capacity} 人，已報名 {event.confirmed_count} 人，尚餘 {remainingSeats(event)} 位</>}</dd></div>
              <div><dt><Clock3 />開始報名</dt><dd>{formatDeadline(event.registration_start_at)}</dd></div>
              <div><dt><Clock3 />截止報名</dt><dd>{formatDeadline(event.registration_deadline)}</dd></div>
              {event.contact_phone && <div><dt><Phone />查詢</dt><dd>{event.contact_name || "活動服務處"}｜{event.contact_phone}</dd></div>}
            </dl>
            <div className="capacity-panel">
              <div><span>報名進度</span><strong>{event.confirmed_count} / {event.capacity}</strong><div className="progress-track"><i style={{ width: `${Math.min(100, (event.confirmed_count / event.capacity) * 100)}%` }} /></div></div>
              <div><span>{registrationState === "upcoming" ? "距離開始報名" : "距離截止報名"}</span><strong className="countdown-text"><Countdown deadline={registrationState === "upcoming" ? event.registration_start_at : event.registration_deadline} mode={registrationState === "upcoming" ? "opening" : "deadline"} refreshOnComplete={registrationState === "upcoming"} /></strong></div>
            </div>
            {event.is_multi_session && <div className="detail-session-preview"><h3>可選日期及時段</h3>{(event.sessions || []).filter((item)=>item.is_active).sort((a,b)=>a.start_at.localeCompare(b.start_at)).map((session)=><div key={session.id}><span>{formatDateTime(session.start_at)}</span><strong>尚餘 {Math.max(0,session.capacity-session.confirmed_count)} 位</strong></div>)}</div>}
            <EventDetailActions event={event} />
          </div>
        </section>
        <section className="shell event-description-section">
          <div className="article-label">活動詳情</div>
          <article><h2>關於本活動</h2>{event.description.split("\n").map((paragraph) => <p key={paragraph}>{paragraph}</p>)}</article>
          <aside><h3>參加提示</h3><ul><li>請使用有效電郵地址收取 QR Code。</li><li>如未能出席，請盡早聯絡主辦單位。</li><li>活動安排如有更改，將以電郵通知。</li></ul></aside>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
