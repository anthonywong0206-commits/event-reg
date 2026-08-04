import type { EventRecord } from "@/lib/types";

const dateTimeFormatter = new Intl.DateTimeFormat("zh-HK", {
  timeZone: "Asia/Hong_Kong",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  weekday: "short",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

const dateFormatter = new Intl.DateTimeFormat("zh-HK", {
  timeZone: "Asia/Hong_Kong",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  weekday: "short",
});

const timeFormatter = new Intl.DateTimeFormat("zh-HK", {
  timeZone: "Asia/Hong_Kong",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

export type EventRegistrationState = "upcoming" | "open" | "full" | "closed";

export function formatDateTime(value: string): string {
  return dateTimeFormatter.format(new Date(value));
}

export function formatEventDate(event: Pick<EventRecord, "start_at" | "end_at">): string {
  const start = new Date(event.start_at);
  const end = new Date(event.end_at);
  return `${dateFormatter.format(start)} ${timeFormatter.format(start)}–${timeFormatter.format(end)}`;
}

export function formatDeadline(value: string): string {
  return dateTimeFormatter.format(new Date(value));
}

export function remainingSeats(event: Pick<EventRecord, "capacity" | "confirmed_count">): number {
  return Math.max(0, event.capacity - event.confirmed_count);
}

export function isRegistrationNotStarted(event: Pick<EventRecord, "registration_start_at" | "status">): boolean {
  return event.status === "published" && new Date(event.registration_start_at).getTime() > Date.now();
}

export function isRegistrationClosed(event: Pick<EventRecord, "registration_deadline" | "status">): boolean {
  return event.status !== "published" || new Date(event.registration_deadline).getTime() <= Date.now();
}

export function eventRegistrationState(event: EventRecord): EventRegistrationState {
  if (event.status !== "published") return "closed";
  if (isRegistrationNotStarted(event)) return "upcoming";
  if (event.confirmed_count >= event.capacity) return "full";
  if (isRegistrationClosed(event)) return "closed";
  return "open";
}
