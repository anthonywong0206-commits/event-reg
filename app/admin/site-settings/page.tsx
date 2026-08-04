import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ExternalLink, ImageIcon } from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import { getSiteSettingsForAdmin } from "@/lib/site-settings";
import { AdminSiteSettingsForm } from "@/components/admin-site-settings-form";

export const metadata: Metadata = { title: "首頁橫額設定" };

export default async function SiteSettingsPage() {
  await requireAdmin();
  const settings = await getSiteSettingsForAdmin();

  return (
    <main className="admin-editor-page">
      <div className="admin-shell">
        <div className="editor-top-links">
          <Link href="/admin" className="back-link"><ArrowLeft />返回活動總覽</Link>
          <Link href="/" target="_blank" className="button button-secondary button-small"><ExternalLink />預覽首頁</Link>
        </div>
        <div className="editor-title">
          <p>HOMEPAGE HERO</p>
          <h1><ImageIcon />首頁橫額設定</h1>
          <span>獨立管理首頁頂部的主標題、說明文字及橫額圖片，不會更改活動內容。</span>
        </div>
        <AdminSiteSettingsForm settings={settings} />
      </div>
    </main>
  );
}
