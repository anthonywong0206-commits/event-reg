import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import { AdminEventForm } from "@/components/admin-event-form";

export const metadata: Metadata = { title: "建立多時段活動" };
export default async function NewMultiSessionEventPage() {
  await requireAdmin();
  return <main className="admin-editor-page"><div className="admin-shell"><Link href="/admin" className="back-link"><ArrowLeft />返回活動總覽</Link><div className="editor-title"><p>MULTI-SESSION EVENT</p><h1>建立多時段活動</h1><span>自由新增不同日期及時段，並為每個時段設定獨立名額。</span></div><AdminEventForm forceMulti /></div></main>;
}
