import { EventImage } from "@/components/event-image";
import Link from "next/link";
import { CalendarDays, MapPin, UsersRound } from "lucide-react";
import type { EventRecord } from "@/lib/types";
import { capacitySignal, formatEventDate, remainingSeats } from "@/lib/format";
import { StatusBadge } from "@/components/status-badge";

export function EventCard({ event, size = "regular" }: { event: EventRecord; size?: "large" | "regular" | "wide" }) {
  return (
    <article className={`event-card event-card-${size}`}>
      <Link href={`/events/${event.slug}`} className="event-card-image" aria-label={`查看 ${event.title}`}>
        <EventImage src={event.poster_image_url} alt={`${event.title} 活動海報`} fill sizes={size === "large" ? "(max-width: 800px) 100vw, 34vw" : "(max-width: 800px) 100vw, 26vw"} />
        <span className="category-tag">{event.category}</span>
      </Link>
      <div className="event-card-body">
        <div className="event-card-heading">
          <h3><Link href={`/events/${event.slug}`}>{event.title}</Link></h3>
          <StatusBadge event={event} compact />
        </div>
        <p className="event-summary">{event.summary}</p>
        <div className="event-meta">
          <span><CalendarDays />{formatEventDate(event)}</span>
          <span><MapPin />{event.location}</span>
          <span><UsersRound />{event.is_multi_session ? <b className={`capacity-signal ${capacitySignal(event).key}`}>{capacitySignal(event).label}</b> : <>{event.confirmed_count} / {event.capacity} 人已報名，尚餘 {remainingSeats(event)} 位</>}</span>
        </div>
      </div>
    </article>
  );
}
