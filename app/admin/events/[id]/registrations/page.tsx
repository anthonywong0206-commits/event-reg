import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Plus } from "lucide-react";
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
          <a className="button button-primary" href="#participant-list"><Plus />管理參加者名單</a>
        </header>
        <div id="participant-list">
          <AdminRegistrationManager event={event} initialRegistrations={registrations} />
        </div>
      </div>
    </main>
  );
}
