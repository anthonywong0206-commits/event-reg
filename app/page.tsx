import Link from "next/link";
import { ArrowRight, CalendarClock, CheckCircle2, MailCheck, QrCode, Sparkles, UsersRound } from "lucide-react";
import { EventImage } from "@/components/event-image";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { EventDirectory } from "@/components/event-directory";
import { EventCard } from "@/components/event-card";
import { Countdown } from "@/components/countdown";
import { getPublishedEvents } from "@/lib/data";
import { getPublicSiteSettings } from "@/lib/site-settings";
import { eventRegistrationState, formatDeadline, remainingSeats } from "@/lib/format";

export default async function HomePage() {
  const [events, siteSettings] = await Promise.all([getPublishedEvents(), getPublicSiteSettings()]);
  const upcoming = events
    .filter((event) => eventRegistrationState(event) === "upcoming")
    .sort((a, b) => new Date(a.registration_start_at).getTime() - new Date(b.registration_start_at).getTime());
  const directoryEvents = events.filter((event) => eventRegistrationState(event) !== "upcoming");
  const featured = directoryEvents.filter((event) => event.is_featured).slice(0, 3);
  const closing = directoryEvents
    .filter((event) => eventRegistrationState(event) === "open")
    .sort((a, b) => new Date(a.registration_deadline).getTime() - new Date(b.registration_deadline).getTime())
    .slice(0, 3);

  return (
    <>
      <SiteHeader />
      <main>
        <section className="home-hero">
          <div className="shell hero-layout">
            <div className="hero-copy">
              <h1>{siteSettings.hero_title}</h1>
              <p>{siteSettings.hero_description}</p>
              <div className="hero-actions">
                <Link className="button button-primary button-large" href="#events">探索活動<ArrowRight /></Link>
                <Link className="button button-ghost button-large" href="#how-it-works">了解報名流程</Link>
              </div>
              <div className="hero-proof"><span><CheckCircle2 />即時名額顯示</span><span><MailCheck />自動確認電郵</span><span><QrCode />QR Code 入場</span></div>
            </div>
            <div className="hero-visual">
              <EventImage src={siteSettings.hero_image_url} alt={siteSettings.hero_image_alt} fill priority sizes="(max-width: 900px) 100vw, 50vw" />
              <div className="floating-event-card">
                <span>本月精選</span>
                <strong>{featured[0]?.title || upcoming[0]?.title || "海洋永續週"}</strong>
                <small>{featured[0] ? `尚餘 ${remainingSeats(featured[0])} 位` : upcoming[0] ? "即將開始報名" : "立即瀏覽活動"}</small>
              </div>
            </div>
          </div>
        </section>

        <EventDirectory events={directoryEvents} />

        {upcoming.length > 0 && (
          <section className="upcoming-section" id="upcoming">
            <div className="shell">
              <div className="section-title-row"><div><span className="section-number">02</span><h2>即將開始報名</h2><p>活動已率先公開，系統會在指定日期及時間自動開放報名。</p></div><CalendarClock /></div>
              <div className="closing-list">
                {upcoming.map((event) => (
                  <Link key={event.id} href={`/events/${event.slug}`} className="closing-item upcoming-item">
                    <EventImage src={event.poster_image_url} alt="" width={92} height={92} />
                    <div><strong>{event.title}</strong><span>{event.location}</span><small>開始報名：{formatDeadline(event.registration_start_at)}</small></div>
                    <div className="closing-capacity upcoming-countdown"><CalendarClock /><b><Countdown deadline={event.registration_start_at} mode="opening" refreshOnComplete /></b><span>距離開放</span></div>
                    <ArrowRight />
                  </Link>
                ))}
              </div>
            </div>
          </section>
        )}

        {closing.length > 0 && (
          <section className="closing-section" id="closing">
            <div className="shell">
              <div className="section-title-row"><div><span className="section-number">03</span><h2>即將截止報名</h2></div><CalendarClock /></div>
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
        )}

        {featured.length > 0 && (
          <section className="featured-band">
            <div className="shell">
              <div className="section-title-row light"><div><span className="section-number">04</span><h2>編輯精選活動</h2><p>專為社區、學校及機構策劃的多元體驗。</p></div><Sparkles /></div>
              <div className="featured-grid">{featured.map((event) => <EventCard key={event.id} event={event} size="wide" />)}</div>
            </div>
          </section>
        )}

        <section className="process-section shell" id="how-it-works">
          <div className="section-title-centered"><span className="section-number">05</span><h2>由報名到入場，只需三步</h2></div>
          <div className="process-grid">
            <article><span>1</span><CalendarClock /><h3>選擇活動與報名方法</h3><p>查看活動詳情、開始報名時間、即時名額及截止時間，選擇網上或親身報名。</p></article>
            <article><span>2</span><MailCheck /><h3>收取確認電郵</h3><p>成功申請後，系統自動發送活動資料及專屬 QR Code 圖片。</p></article>
            <article><span>3</span><QrCode /><h3>現場掃描登記</h3><p>活動當日以手機展示 QR Code，工作人員掃描後即完成出席登記。</p></article>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
