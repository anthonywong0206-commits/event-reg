import Link from "next/link";
import { ArrowRight, CheckCircle2, MailCheck, QrCode } from "lucide-react";
import { EventImage } from "@/components/event-image";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { HomepageEventGroups } from "@/components/homepage-event-groups";
import { getPublishedEvents } from "@/lib/data";
import { getPublicSiteSettings } from "@/lib/site-settings";
import { eventRegistrationState, remainingSeats } from "@/lib/format";
import type { EventRecord } from "@/lib/types";

function resolveHeroButtonHref(events: EventRecord[], siteSettings: Awaited<ReturnType<typeof getPublicSiteSettings>>) {
  if (!siteSettings.hero_button_enabled) return null;
  if (siteSettings.hero_button_link_type === "external") {
    return siteSettings.hero_button_external_url || null;
  }
  if (!siteSettings.hero_button_event_slug) return null;
  const matched = events.find((event) => event.slug === siteSettings.hero_button_event_slug);
  return matched ? `/events/${matched.slug}` : null;
}

export default async function HomePage() {
  const [events, siteSettings] = await Promise.all([getPublishedEvents(), getPublicSiteSettings()]);
  const now = Date.now();
  const upcomingEvents = events
    .filter((event) => eventRegistrationState(event) === "upcoming")
    .sort((a, b) => new Date(a.registration_start_at).getTime() - new Date(b.registration_start_at).getTime());
  const openEvents = events
    .filter((event) => {
      const state = eventRegistrationState(event);
      return state === "open" || state === "waitlist";
    })
    .sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime());
  const reviewEvents = events
    .filter((event) => new Date(event.end_at).getTime() < now)
    .sort((a, b) => new Date(b.end_at).getTime() - new Date(a.end_at).getTime());
  const spotlightEvent = openEvents[0] || upcomingEvents[0] || reviewEvents[0];
  const heroButtonHref = resolveHeroButtonHref(events, siteSettings);
  const heroButtonIsExternal = Boolean(heroButtonHref && /^https?:\/\//i.test(heroButtonHref));

  return (
    <>
      <SiteHeader />
      <main>
        <section className="home-hero">
          <div className="shell hero-layout hero-layout-banner-only">
            <div className="hero-visual hero-visual-banner">
              <EventImage
                src={siteSettings.hero_image_url}
                alt={siteSettings.hero_image_alt}
                fill
                priority
                sizes="(max-width: 860px) 100vw, 1240px"
                objectFit="cover"
                objectPosition="center"
              />
              <div className="hero-overlay">
                <div className="hero-copy hero-copy-overlay">
                  <h1>{siteSettings.hero_title}</h1>
                  <p>{siteSettings.hero_description}</p>
                  <div className={`hero-actions hero-actions-${siteSettings.hero_button_position}`}>
                    <Link className="button button-secondary button-large hero-banner-secondary" href="#events">查看活動</Link>
                    {heroButtonHref && (
                      <Link
                        className="button button-primary button-large hero-banner-primary"
                        href={heroButtonHref}
                        target={heroButtonIsExternal ? "_blank" : undefined}
                        rel={heroButtonIsExternal ? "noreferrer noopener" : undefined}
                      >
                        {siteSettings.hero_button_label}
                        {!heroButtonIsExternal && <ArrowRight />}
                      </Link>
                    )}
                  </div>
                  <div className="hero-proof hero-proof-overlay"><span><CheckCircle2 />即時名額顯示</span><span><MailCheck />自動確認電郵</span><span><QrCode />QR Code 入場</span></div>
                </div>
              </div>
              <div className="floating-event-card">
                <span>本月精選</span>
                <strong>{spotlightEvent?.title || "立即瀏覽活動"}</strong>
                <small>
                  {spotlightEvent
                    ? (eventRegistrationState(spotlightEvent) === "upcoming"
                      ? "即將開始報名"
                      : eventRegistrationState(spotlightEvent) === "waitlist"
                        ? "現只接受候補"
                        : new Date(spotlightEvent.end_at).getTime() < now
                          ? "活動回顧"
                          : `尚餘 ${remainingSeats(spotlightEvent)} 位`)
                    : "探索最新活動與回顧"}
                </small>
              </div>
            </div>
          </div>
        </section>

        <HomepageEventGroups openEvents={openEvents} upcomingEvents={upcomingEvents} reviewEvents={reviewEvents} />

        <section className="process-section shell" id="how-it-works">
          <div className="section-title-centered"><span className="section-number">04</span><h2>由報名到入場，只需三步</h2></div>
          <div className="process-grid">
            <article><span>1</span><QrCode /><h3>瀏覽活動與海報</h3><p>以更清楚的海報卡片查看日期、時間、地點及活動簡介，快速找到合適活動。</p></article>
            <article><span>2</span><MailCheck /><h3>完成報名並接收通知</h3><p>系統會按設定即時處理報名，並自動發送確認電郵及 QR Code（如填寫電郵）。</p></article>
            <article><span>3</span><CheckCircle2 /><h3>活動當日輕鬆入場</h3><p>工作人員可掃描 QR Code 或於後台核對名單，完成出席登記及管理候補安排。</p></article>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
