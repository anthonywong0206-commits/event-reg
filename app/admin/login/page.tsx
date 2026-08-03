import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/login-form";
import { getAdminSession } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/env";

export const metadata: Metadata = { title: "管理員登入" };

export default async function AdminLoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const session = await getAdminSession();
  const { next = "/admin" } = await searchParams;
  if (session) redirect(next.startsWith("/") && !next.startsWith("//") ? next : "/admin");

  return (
    <main className="admin-login-page">
      <div className="admin-login-visual">
        <Link href="/" className="back-link light"><ArrowLeft />返回活動平台</Link>
        <div><span className="brand-mark large"><ShieldCheck /></span><h1>活動管理中心</h1><p>建立活動、設定名額與截止時間、管理報名，以及使用手機完成 QR Code 出席登記。</p></div>
      </div>
      <section className="admin-login-card">
        <div><p className="admin-eyebrow">ADMIN PORTAL</p><h2>管理員登入</h2><p>請使用已加入 admin_profiles 的 Supabase Auth 帳戶。</p></div>
        <LoginForm nextPath={next} configured={isSupabaseConfigured()} />
        <small>首次設定請參閱專案 README 的「建立首位管理員」章節。</small>
      </section>
    </main>
  );
}
