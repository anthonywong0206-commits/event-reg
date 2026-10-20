import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import { AdminEventForm } from "@/components/admin-event-form";

export const metadata: Metadata = { title: "建立活動" };

export default async function NewEventPage() {
  await requireAdmin();
  return <main className="admin-editor-page"><div className="admin-shell"><Link href="/admin" className="back-link"><ArrowLeft />返回活動總覽</Link><div className="editor-title"><p>NEW EVENT</p><h1>建立新活動</h1><span>完成後可先儲存為草稿，再公開接受報名。</span></div><AdminEventForm /></div></main>;
}
