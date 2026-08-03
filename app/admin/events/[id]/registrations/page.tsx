import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CheckCircle2, Download, QrCode, UserRoundCheck, UsersRound } from "lucide-react";
import { AdminRegistrationManager } from "@/components/admin-registration-manager";
import { requireAdmin } from "@/lib/auth";
import { getEventForAdmin, getRegistrationsForEvent } from "@/lib/data";
import { formatEventDate } from "@/lib/format";

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

        <AdminRegistrationManager eventId={event.id} methods={event.registration_methods} registrations={registrations} />
      </div>
    </main>
  );
}
