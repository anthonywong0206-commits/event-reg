import type { Metadata } from "next";
import Link from "next/link";
import { Bot, CalendarPlus, CalendarRange, CheckCircle2, ClipboardList, Clock3, Edit3, ExternalLink, ImageIcon, MailCheck, QrCode, UsersRound } from "lucide-react";
import { EventImage } from "@/components/event-image";
import { requireAdmin } from "@/lib/auth";
import { getAllEventsForAdmin } from "@/lib/data";
import { eventRegistrationState, formatDateTime, formatEventDate, remainingSeats } from "@/lib/format";
import { SignOutButton } from "@/components/sign-out-button";

export const metadata: Metadata = { title: "管理後台" };

export default async function AdminDashboardPage() {
  const { profile } = await requireAdmin();
  const events = await getAllEventsForAdmin();
  const totalRegistrations = events.reduce((total, event) => total + event.confirmed_count, 0);
  const openEvents = events.filter((event) => eventRegistrationState(event) === "open").length;
  const upcomingEvents = events.filter((event) => eventRegistrationState(event) === "upcoming").length;

  return (
    <main className="admin-dashboard">
      <header className="admin-header">
        <div className="admin-shell admin-header-inner"><Link href="/admin" className="admin-brand"><span className="brand-mark"><CalendarRange /></span><span><strong>Event Register</strong><small>管理後台</small></span></Link><nav><Link href="/admin/email-settings"><MailCheck />確認電郵</Link><Link href="/admin/telegram"><Bot />Telegram 通知</Link><Link href="/admin/site-settings"><ImageIcon />首頁橫額</Link><Link href="/" target="_blank"><ExternalLink />查看網站</Link><Link href="/check-in"><QrCode />現場登記</Link><SignOutButton /></nav></div>
      </header>
      <div className="admin-shell admin-content">
        <div className="admin-welcome"><div><p>歡迎回來，{profile.display_name || "管理員"}</p><h1>活動管理總覽</h1></div><div className="admin-welcome-actions"><Link className="button button-secondary button-large" href="/admin/email-settings"><MailCheck />確認電郵設定</Link><Link className="button button-secondary button-large" href="/admin/telegram"><Bot />Telegram 通知</Link><Link className="button button-secondary button-large" href="/admin/site-settings"><ImageIcon />首頁橫額設定</Link><Link className="button button-secondary button-large" href="/admin/events/new/multi"><CalendarRange />建立多時段活動</Link><Link className="button button-primary button-large" href="/admin/events/new"><CalendarPlus />建立新活動</Link></div></div>
        <section className="stat-grid">
          <article><span><CalendarRange /></span><div><strong>{events.length}</strong><small>活動總數</small></div></article>
          <article><span><CheckCircle2 /></span><div><strong>{openEvents}</strong><small>接受報名中</small></div></article>
          <article><span><UsersRound /></span><div><strong>{totalRegistrations}</strong><small>已確認報名</small></div></article>
          <article><span><CalendarPlus /></span><div><strong>{upcomingEvents}</strong><small>即將開始報名</small></div></article>
        </section>

        <section className="admin-table-section">
          <div className="admin-section-title"><div><h2>活動列表</h2><p>管理公開狀態、名額、時間與活動圖片。</p></div></div>
          <div className="admin-event-table">
            {events.map((event) => {
              const registrationState = eventRegistrationState(event);
              return (
                <article key={event.id} className="admin-event-row">
                  <EventImage src={event.poster_image_url} alt="" width={74} height={92} />
                  <div className="admin-event-main"><div><span className={`admin-status ${event.status}`}>{event.status === "published" ? "公開" : event.status === "draft" ? "草稿" : "已取消"}</span><strong>{event.title}</strong></div><small>{event.is_multi_session ? `${event.sessions?.length || 0} 個時段` : formatEventDate(event)}｜{event.location}</small></div>
                  <div className="admin-event-metric"><UsersRound /><strong>{event.confirmed_count}/{event.capacity}</strong><small>{event.is_multi_session ? "多時段活動" : `尚餘 ${remainingSeats(event)} 位`}</small></div>
                  <div className="admin-event-metric"><Clock3 /><strong>{registrationState === "upcoming" ? "即將開放" : registrationState === "open" ? "接受報名" : registrationState === "full" ? "名額已滿" : "已截止"}</strong><small>{registrationState === "upcoming" ? `開始：${formatDateTime(event.registration_start_at)}` : "報名狀態"}</small></div>
                  <div className="admin-row-actions"><Link href={`/events/${event.slug}`} target="_blank" className="icon-button" aria-label="查看活動"><ExternalLink /></Link><Link href={`/admin/events/${event.id}/registrations`} className="button button-secondary button-small"><ClipboardList />報名名單</Link><Link href={`/admin/events/${event.id}`} className="button button-secondary button-small"><Edit3 />編輯</Link></div>
                </article>
              );
            })}
          </div>
        </section>
      </div>
    </main>
  );
}
