import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Camera, LogIn, QrCode } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { CheckInPanel } from "@/components/check-in-panel";
import { getAdminSession } from "@/lib/auth";

export const metadata: Metadata = { title: "現場 QR 登記" };

export default async function CheckInPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token = "" } = await searchParams;
  const session = await getAdminSession();
  const nextPath = `/check-in${token ? `?token=${encodeURIComponent(token)}` : ""}`;

  return (
    <>
      <SiteHeader />
      <main className="checkin-page shell">
        <Link href="/admin" className="back-link"><ArrowLeft />返回管理後台</Link>
        <section className="checkin-shell">
          <div className="checkin-heading"><span><Camera /></span><div><p>STAFF CHECK-IN</p><h1>現場 QR Code 登記</h1><p>工作人員可直接使用手機相機掃描參加者的 QR Code；連結會自動把憑證帶到此頁。</p></div></div>
          {session ? <CheckInPanel initialToken={token} /> : (
            <div className="login-required"><QrCode /><h2>需要管理員登入</h2><p>為保障參加者資料，只有已授權工作人員可以確認出席。</p><Link href={`/admin/login?next=${encodeURIComponent(nextPath)}`} className="button button-primary button-large"><LogIn />管理員登入</Link></div>
          )}
        </section>
      </main>
    </>
  );
}
