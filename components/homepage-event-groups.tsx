"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { CalendarDays, ChevronUp, Clock3, FolderOpenDot, History, MapPin, Sparkles } from "lucide-react";
import { EventImage } from "@/components/event-image";
import type { EventRecord } from "@/lib/types";
import { capacitySignal, eventRegistrationState } from "@/lib/format";

const dateOnlyFormatter = new Intl.DateTimeFormat("zh-HK", {
  timeZone: "Asia/Hong_Kong",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  weekday: "short",
});

const timeOnlyFormatter = new Intl.DateTimeFormat("zh-HK", {
  timeZone: "Asia/Hong_Kong",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

type GroupKind = "open" | "upcoming" | "review";

type GroupConfig = {
  title: string;
  description: string;
  emptyMessage: string;
  kind: GroupKind;
  events: EventRecord[];
};

function formatSingleDate(event: EventRecord) {
  return dateOnlyFormatter.format(new Date(event.start_at));
}

function formatSingleTime(event: EventRecord) {
  const start = new Date(event.start_at);
  const end = new Date(event.end_at);
  return `${timeOnlyFormatter.format(start)} - ${timeOnlyFormatter.format(end)}`;
}

function getEventDateLabel(event: EventRecord) {
  if (!event.is_multi_session || !event.sessions?.length) return formatSingleDate(event);
  const uniqueDates = [...new Set(event.sessions.filter((item) => item.is_active).map((item) => item.session_date))].sort();
  if (uniqueDates.length <= 1) {
    const [onlyDate] = uniqueDates;
    if (onlyDate) {
      return dateOnlyFormatter.format(new Date(`${onlyDate}T12:00:00`));
    }
  }
  return `共 ${uniqueDates.length} 個活動日期`;
}

function getEventTimeLabel(event: EventRecord) {
  if (!event.is_multi_session || !event.sessions?.length) return formatSingleTime(event);
  return "多個時段可選";
}

function getEventStatus(event: EventRecord, kind: GroupKind) {
  if (kind === "review") return null;
  if (kind === "upcoming") {
    return {
      text: `開始報名：${dateOnlyFormatter.format(new Date(event.registration_start_at))} ${timeOnlyFormatter.format(new Date(event.registration_start_at))}`,
      tone: "upcoming",
    };
  }

  if (event.is_multi_session) {
    return {
      text: `多日期活動｜報名狀況：${capacitySignal(event).label}`,
      tone: "multi",
    };
  }

  const registrationState = eventRegistrationState(event);
  if (registrationState === "waitlist") {
    return { text: "現只接受候補", tone: "waitlist" };
  }
  return {
    text: `尚餘 ${Math.max(0, event.capacity - event.confirmed_count)} 位`,
    tone: "open",
  };
}

function GroupIcon({ kind }: { kind: GroupKind }) {
  if (kind === "open") return <Sparkles />;
  if (kind === "upcoming") return <FolderOpenDot />;
  return <History />;
}

function HomepageEventCard({ event, kind }: { event: EventRecord; kind: GroupKind }) {
  const status = getEventStatus(event, kind);

  return (
    <Link href={`/events/${event.slug}`} className={`homepage-event-card homepage-event-card-${kind}`}>
      <div className="homepage-event-poster">
        <EventImage
          src={event.poster_image_url}
          alt={`${event.title} 活動海報`}
          fill
          sizes="(max-width: 640px) 120px, 140px"
          objectFit="contain"
          objectPosition="center"
        />
      </div>
      <div className="homepage-event-content">
        <h3>{event.title}</h3>
        <div className="homepage-event-meta">
          <span><CalendarDays />{getEventDateLabel(event)}</span>
          <span><Clock3 />{getEventTimeLabel(event)}</span>
          <span><MapPin />{event.location}</span>
        </div>
        <p>{event.summary}</p>
        {status && <strong className={`homepage-event-status tone-${status.tone}`}>{status.text}</strong>}
      </div>
    </Link>
  );
}

function HomepageEventGroup({ title, description, emptyMessage, kind, events }: GroupConfig) {
  const [collapsed, setCollapsed] = useState(false);
  const countLabel = useMemo(() => `${events.length} 項活動`, [events.length]);

  return (
    <section className="homepage-event-group" id={`group-${kind}`}>
      <div className="homepage-event-group-header">
        <div className="homepage-event-group-title">
          <span className={`homepage-event-group-icon tone-${kind}`}><GroupIcon kind={kind} /></span>
          <div>
            <h2>{title}</h2>
            <p>{description}</p>
          </div>
        </div>
        <div className="homepage-event-group-actions">
          <small>{countLabel}</small>
          <button type="button" className="homepage-event-group-toggle" onClick={() => setCollapsed((current) => !current)} aria-expanded={!collapsed}>
            {collapsed ? "展開" : "褶起"}
            <ChevronUp className={collapsed ? "collapsed" : ""} />
          </button>
        </div>
      </div>

      {!collapsed && (
        events.length > 0 ? (
          <div className="homepage-event-grid">
            {events.map((event) => <HomepageEventCard key={event.id} event={event} kind={kind} />)}
          </div>
        ) : (
          <div className="homepage-event-empty">{emptyMessage}</div>
        )
      )}
    </section>
  );
}

export function HomepageEventGroups({ openEvents, upcomingEvents, reviewEvents }: {
  openEvents: EventRecord[];
  upcomingEvents: EventRecord[];
  reviewEvents: EventRecord[];
}) {
  return (
    <div className="shell homepage-event-groups" id="events">
      <HomepageEventGroup
        kind="open"
        title="精選活動"
        description="所有現正接受報名的活動，立即參與精彩體驗。"
        emptyMessage="目前暫未有接受報名中的活動。"
        events={openEvents}
      />
      <HomepageEventGroup
        kind="upcoming"
        title="即將開始"
        description="所有尚未到達開始報名日期的活動，敬請期待。"
        emptyMessage="目前暫未有即將開始報名的活動。"
        events={upcomingEvents}
      />
      <HomepageEventGroup
        kind="review"
        title="活動回顧"
        description="所有已完結的活動，重溫過往精彩內容。"
        emptyMessage="目前暫未有活動回顧。"
        events={reviewEvents}
      />
    </div>
  );
}
