import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CheckCircle2, Download, Mail, Phone, QrCode, UserRoundCheck, UsersRound } from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import { getEventForAdmin, getRegistrationsForEvent } from "@/lib/data";
import { formatDateTime, formatEventDate } from "@/lib/format";

export const metadata: Metadata = { title: "活動報名名單" };

export default async function EventRegistrationsPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const [event, registrations] = await Promise.all([
    getEventForAdmin(id),
    getRegistrationsForEvent(id),
  ]);
  if (!event) notFound();

  const confirmed = registrations.filter((item) => item.status === "confirmed");
  const attended = confirmed.filter((item) => item.attended_at);

  return (
    <main className="admin-editor-page">
      <div className="admin-shell registrations-admin-page">
        <Link href="/admin" className="back-link"><ArrowLeft />返回活動總覽</Link>
        <header className="registrations-admin-header">
          <div>
            <p>REGISTRATION LIST</p>
            <h1>{event.title}</h1>
            <span>{formatEventDate(event)}｜{event.location}</span>
          </div>
          <a className="button button-primary" href={`/api/admin/events/${event.id}/registrations/export`}>
            <Download />匯出 CSV
          </a>
        </header>

        <section className="registration-stat-grid">
          <article><UsersRound /><div><strong>{confirmed.length}</strong><span>已確認報名</span></div></article>
          <article><UserRoundCheck /><div><strong>{attended.length}</strong><span>已完成出席</span></div></article>
          <article><QrCode /><div><strong>{Math.max(0, confirmed.length - attended.length)}</strong><span>尚未登記</span></div></article>
          <article><CheckCircle2 /><div><strong>{event.capacity}</strong><span>活動名額上限</span></div></article>
        </section>

        <section className="registration-list-panel">
          <div className="admin-section-title">
            <div><h2>參加者名單</h2><p>資料按申請時間排列；出席時間由 QR Code 登記自動更新。</p></div>
          </div>
          {registrations.length === 0 ? (
            <div className="empty-registration-list"><UsersRound /><h3>暫未有報名紀錄</h3><p>公開活動後，完成申請的參加者會顯示在這裡。</p></div>
          ) : (
            <div className="registration-table-wrap">
              <table className="registration-table">
                <thead><tr><th>報名編號</th><th>參加者</th><th>聯絡方法</th><th>報名方式</th><th>申請時間</th><th>出席狀態</th></tr></thead>
                <tbody>
                  {registrations.map((registration) => (
                    <tr key={registration.id}>
                      <td><strong>{registration.registration_no}</strong></td>
                      <td><strong>{registration.full_name}</strong><small>{registration.status === "confirmed" ? "已確認" : registration.status === "cancelled" ? "已取消" : "候補"}</small></td>
                      <td><span className="contact-line"><Mail />{registration.email}</span><span className="contact-line"><Phone />{registration.phone}</span></td>
                      <td>{registration.method === "online" ? "網上報名" : "親身報名"}</td>
                      <td>{formatDateTime(registration.created_at)}</td>
                      <td>{registration.attended_at ? <span className="attendance-chip attended"><CheckCircle2 />已出席<small>{formatDateTime(registration.attended_at)}</small></span> : <span className="attendance-chip pending">未登記</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
