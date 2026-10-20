import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import { getEventForAdmin } from "@/lib/data";
import { AdminEventForm } from "@/components/admin-event-form";

export const metadata: Metadata = { title: "編輯活動" };

export default async function EditEventPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const event = await getEventForAdmin(id);
  if (!event) notFound();
  return <main className="admin-editor-page"><div className="admin-shell"><Link href="/admin" className="back-link"><ArrowLeft />返回活動總覽</Link><div className="editor-title"><p>EDIT EVENT</p><h1>編輯活動</h1><span>可修改活動所有資料、增加名額及設定候補名單；目前已確認 {event.confirmed_count} 個報名。</span></div><AdminEventForm event={event} /></div></main>;
}
