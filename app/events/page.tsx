import type { Metadata } from "next";
import { CalendarDays } from "lucide-react";
import { HomepageEventGroups } from "@/components/homepage-event-groups";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { getPublishedEvents } from "@/lib/data";
import { eventRegistrationState } from "@/lib/format";

export const metadata: Metadata = {
  title: "活動",
  description: "瀏覽現正接受報名、即將開始及已完結的活動。",
};

export default async function EventsPage() {
  const events = await getPublishedEvents();
  const now = Date.now();
  const upcomingEvents = events
    .filter((event) => eventRegistrationState(event) === "upcoming")
    .sort((a, b) => new Date(a.registration_start_at).getTime() - new Date(b.registration_start_at).getTime());
  const currentEvents = events
    .filter((event) => new Date(event.end_at).getTime() >= now && eventRegistrationState(event) !== "upcoming")
    .sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime());
  const reviewEvents = events
    .filter((event) => new Date(event.end_at).getTime() < now)
    .sort((a, b) => new Date(b.end_at).getTime() - new Date(a.end_at).getTime());

  return (
    <>
      <SiteHeader />
      <main className="events-index-page">
        <div className="shell events-index-heading">
          <span className="events-index-icon"><CalendarDays /></span>
          <div>
            <p>EVENTS</p>
            <h1>活動</h1>
            <span>瀏覽精選活動、即將開始及活動回顧。</span>
          </div>
        </div>
        <HomepageEventGroups openEvents={currentEvents} upcomingEvents={upcomingEvents} reviewEvents={reviewEvents} />
      </main>
      <SiteFooter />
    </>
  );
}
