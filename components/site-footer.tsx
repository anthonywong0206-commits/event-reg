import Link from "next/link";
import { CalendarCheck2, Mail, QrCode, Smartphone } from "lucide-react";

export function SiteFooter() {
  return (
    <footer className="site-footer" id="about">
      <div className="shell feature-footer">
        <div><CalendarCheck2 /><strong>彈性報名</strong><span>網上及親身報名雙模式</span></div>
        <div><Mail /><strong>自動確認電郵</strong><span>報名完成即發送電子憑證</span></div>
        <div><QrCode /><strong>QR Code 入場</strong><span>手機展示，快速完成登記</span></div>
        <div><Smartphone /><strong>跨平台使用</strong><span>電腦、平板及手機均適用</span></div>
      </div>
      <div className="shell footer-bottom">
        <span>© 2026 Event Register System</span>
        <Link href="/admin">管理員登入</Link>
      </div>
    </footer>
  );
}
