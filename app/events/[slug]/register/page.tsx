import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CalendarDays, MapPin, UsersRound } from "lucide-react";
import { RegistrationForm } from "@/components/registration-form";
import { EventImage } from "@/components/event-image";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { getEventBySlug } from "@/lib/data";
import { eventRegistrationState, formatEventDate, remainingSeats } from "@/lib/format";
import type { RegistrationMethod } from "@/lib/types";

export const metadata: Metadata = { title: "活動報名" };

export default async function RegisterPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ method?: string }> }) {
  const { slug } = await params;
  const query = await searchParams;
  const event = await getEventBySlug(slug);
  if (!event) notFound();
  const state = eventRegistrationState(event);
  const method: RegistrationMethod = query.method === "in_person" ? "in_person" : "online";

  return (
    <>
      <SiteHeader />
      <main className="register-page shell">
        <div className="breadcrumb"><Link href={`/events/${event.slug}`}><ArrowLeft />返回活動詳情</Link></div>
        <div className="register-layout">
          <section className="register-main">
            <div className="page-title"><span>活動報名表</span><h1>完成你的活動申請</h1><p>填寫以下資料後，系統會即時核對名額並發送電子入場證。</p></div>
            {state === "open" ? <RegistrationForm event={event} initialMethod={method} /> : (
              <div className="closed-message"><h2>{state === "full" ? "活動名額已滿" : "報名已截止"}</h2><p>此活動暫時未能接受新申請。</p><Link className="button button-primary" href="/">瀏覽其他活動</Link></div>
            )}
          </section>
          <aside className="register-summary-card">
            <div className="summary-poster"><EventImage src={event.poster_image_url} alt="" fill sizes="320px" /></div>
            <span className="category-tag static">{event.category}</span>
            <h2>{event.title}</h2>
            <ul><li><CalendarDays />{formatEventDate(event)}</li><li><MapPin />{event.location}</li><li><UsersRound />尚餘 {remainingSeats(event)} 位</li></ul>
            <div className="summary-security"><strong>安全報名流程</strong><span>提交資料後才會正式扣減名額；重複或逾時申請不會造成超額報名。</span></div>
          </aside>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
