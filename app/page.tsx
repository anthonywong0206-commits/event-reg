import Image from "next/image";
import Link from "next/link";
import { ArrowRight, CalendarClock, CheckCircle2, MailCheck, QrCode, Sparkles, UsersRound } from "lucide-react";
import { EventImage } from "@/components/event-image";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { EventDirectory } from "@/components/event-directory";
import { EventCard } from "@/components/event-card";
import { getPublishedEvents } from "@/lib/data";
import { formatDeadline, remainingSeats } from "@/lib/format";

export default async function HomePage() {
  const events = await getPublishedEvents();
  const featured = events.filter((event) => event.is_featured).slice(0, 3);
  const closing = [...events].sort((a, b) => new Date(a.registration_deadline).getTime() - new Date(b.registration_deadline).getTime()).slice(0, 3);

  return (
    <>
      <SiteHeader />
      <main>
        <section className="home-hero">
          <div className="shell hero-layout">
            <div className="hero-copy">
              <h1>連結人與活動<br />創造更多可能</h1>
              <p>發掘精彩活動、學習新知、參與社群。從活動海報到電子入場證，讓每一次參與都更簡單。</p>
              <div className="hero-actions">
                <Link className="button button-primary button-large" href="#events">探索活動<ArrowRight /></Link>
                <Link className="button button-ghost button-large" href="#how-it-works">了解報名流程</Link>
              </div>
              <div className="hero-proof"><span><CheckCircle2 />即時名額顯示</span><span><MailCheck />自動確認電郵</span><span><QrCode />QR Code 入場</span></div>
            </div>
            <div className="hero-visual">
              <Image src="/images/hero-community.jpg" alt="明亮的社區活動空間" fill priority sizes="(max-width: 900px) 100vw, 50vw" />
              <div className="floating-event-card">
                <span>本月精選</span>
                <strong>{featured[0]?.title || "海洋永續週"}</strong>
                <small>{featured[0] ? `尚餘 ${remainingSeats(featured[0])} 位` : "立即瀏覽活動"}</small>
              </div>
            </div>
          </div>
        </section>

        <EventDirectory events={events} />

        <section className="closing-section" id="closing">
          <div className="shell">
            <div className="section-title-row"><div><span className="section-number">02</span><h2>即將截止報名</h2></div><CalendarClock /></div>
            <div className="closing-list">
              {closing.map((event) => (
                <Link key={event.id} href={`/events/${event.slug}`} className="closing-item">
                  <EventImage src={event.poster_image_url} alt="" width={92} height={92} />
                  <div><strong>{event.title}</strong><span>{event.location}</span><small>截止：{formatDeadline(event.registration_deadline)}</small></div>
                  <div className="closing-capacity"><UsersRound /><b>{remainingSeats(event)}</b><span>剩餘名額</span></div>
                  <ArrowRight />
                </Link>
              ))}
            </div>
          </div>
        </section>

        {featured.length > 0 && (
          <section className="featured-band">
            <div className="shell">
              <div className="section-title-row light"><div><span className="section-number">03</span><h2>編輯精選活動</h2><p>專為社區、學校及機構策劃的多元體驗。</p></div><Sparkles /></div>
              <div className="featured-grid">{featured.map((event) => <EventCard key={event.id} event={event} size="wide" />)}</div>
            </div>
          </section>
        )}

        <section className="process-section shell" id="how-it-works">
          <div className="section-title-centered"><span className="section-number">04</span><h2>由報名到入場，只需三步</h2></div>
          <div className="process-grid">
            <article><span>1</span><CalendarClock /><h3>選擇活動與報名方法</h3><p>查看活動詳情、即時名額及截止時間，選擇網上或親身報名。</p></article>
            <article><span>2</span><MailCheck /><h3>收取確認電郵</h3><p>成功申請後，系統自動發送活動資料及專屬 QR Code 圖片。</p></article>
            <article><span>3</span><QrCode /><h3>現場掃描登記</h3><p>活動當日以手機展示 QR Code，工作人員掃描後即完成出席登記。</p></article>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
