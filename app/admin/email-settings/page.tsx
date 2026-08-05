import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, MailCheck } from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import { getEmailSettings } from "@/lib/email-settings";
import { AdminEmailSettingsForm } from "@/components/admin-email-settings-form";

export const metadata: Metadata = { title: "確認電郵設定" };
export default async function EmailSettingsPage() {
  await requireAdmin();
  const settings = await getEmailSettings();
  return <main className="admin-editor-page"><div className="admin-shell">
    <div className="editor-top-links"><Link href="/admin" className="back-link"><ArrowLeft/>返回活動總覽</Link></div>
    <div className="editor-title"><p>EMAIL & QR</p><h1><MailCheck/>確認電郵及 QR Code</h1><span>管理報名成功電郵、常用訊息範本及出席 QR Code。未提供電郵的參加者不會收到訊息。</span></div>
    <AdminEmailSettingsForm settings={settings}/>
  </div></main>;
}
