import { EventImage } from "@/components/event-image";
import Link from "next/link";
import { CalendarDays, MapPin, UsersRound } from "lucide-react";
import type { EventRecord, EventSessionRecord } from "@/lib/types";
import { capacitySignal, formatEventDate, remainingSeats } from "@/lib/format";
import { StatusBadge } from "@/components/status-badge";

const shortDate = new Intl.DateTimeFormat("zh-HK", { timeZone:"Asia/Hong_Kong", month:"numeric", day:"numeric", weekday:"short" });
function dateSignals(sessions: EventSessionRecord[] = []) {
  const groups = new Map<string, EventSessionRecord[]>();
  sessions.filter((item)=>item.is_active).forEach((item)=>groups.set(item.session_date,[...(groups.get(item.session_date)||[]),item]));
  return [...groups.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([date,items])=>{
    const capacity=items.reduce((sum,item)=>sum+item.capacity,0);
    const confirmed=items.reduce((sum,item)=>sum+item.confirmed_count,0);
    const signal=capacitySignal({capacity,confirmed_count:confirmed} as EventRecord);
    return {date,signal};
  });
}

export function EventCard({ event, size = "regular" }: { event: EventRecord; size?: "large" | "regular" | "wide" }) {
  const dailySignals=event.is_multi_session?dateSignals(event.sessions):[];
  return (
    <article className={`event-card event-card-${size}`}>
      <Link href={`/events/${event.slug}`} className="event-card-image" aria-label={`查看 ${event.title}`}>
        <EventImage src={event.poster_image_url} alt={`${event.title} 活動海報`} fill sizes={size === "large" ? "(max-width: 800px) 100vw, 34vw" : "(max-width: 800px) 100vw, 26vw"} />
        <span className="category-tag">{event.category}</span>
      </Link>
      <div className="event-card-body">
        <div className="event-card-heading"><h3><Link href={`/events/${event.slug}`}>{event.title}</Link></h3><StatusBadge event={event} compact /></div>
        <p className="event-summary">{event.summary}</p>
        <div className="event-meta">
          <span><CalendarDays />{event.is_multi_session?`${dailySignals.length} 個活動日期`:formatEventDate(event)}</span>
          <span><MapPin />{event.location}</span>
          {event.is_multi_session?<div className="daily-capacity-signals" aria-label="各日期名額狀況">{dailySignals.map(({date,signal})=><span key={date}><b>{shortDate.format(new Date(`${date}T12:00:00`))}</b><em className={`capacity-signal ${signal.key}`}>{signal.label}</em></span>)}</div>:<span><UsersRound />{event.confirmed_count} / {event.capacity} 人已報名，尚餘 {remainingSeats(event)} 位</span>}
        </div>
      </div>
    </article>
  );
}
