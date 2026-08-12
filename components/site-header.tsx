import Link from "next/link";
import { CalendarDays, Search, ShieldCheck } from "lucide-react";
import { MobileBottomNav, MobileFontSizeButton } from "@/components/mobile-site-controls";

export function SiteHeader() {
  return (
    <header className="site-header">
      <div className="shell header-inner">
        <Link href="/" className="brand" aria-label="活動報名平台首頁">
          <span className="brand-mark" aria-hidden="true">
            <CalendarDays size={22} />
          </span>
          <span>
            <strong>Event Register System</strong>
            <small>活動報名平台</small>
          </span>
        </Link>
        <div className="mobile-header-actions">
          <MobileFontSizeButton />
        </div>
        <nav className="main-nav" aria-label="主要導覽">
          <Link href="/#events"><Search size={16} />探索活動</Link>
          <Link href="/#closing">即將截止</Link>
          <Link href="/#about">關於平台</Link>
          <Link href="/admin" className="admin-link"><ShieldCheck size={16} />管理後台</Link>
        </nav>
      </div>
      <MobileBottomNav />
    </header>
  );
}
