import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import { AdminEventForm } from "@/components/admin-event-form";

export const metadata: Metadata = { title: "建立子活動模式活動" };
export default async function NewSubActivityEventPage() {
  await requireAdmin();
  return <main className="admin-editor-page"><div className="admin-shell"><Link href="/admin" className="back-link"><ArrowLeft />返回活動總覽</Link><div className="editor-title"><p>SUB-ACTIVITY EVENT</p><h1>建立子活動模式活動</h1><span>先建立主活動，再獨立建立多個子活動；每個子活動可擁有自己的日期、時段及名額。</span></div><AdminEventForm forceMode="sub_activity" /></div></main>;
}
