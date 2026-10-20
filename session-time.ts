export type SessionDateTimeLike = {
  session_date: string;
  start_at: string;
  end_at: string;
};

function hongKongClock(value: string) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Hong_Kong",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(value));
  const hour = parts.find((part) => part.type === "hour")?.value || "00";
  const minute = parts.find((part) => part.type === "minute")?.value || "00";
  return `${hour === "24" ? "00" : hour}:${minute}`;
}

export function hongKongSessionIso(sessionDate: string, time: string) {
  return new Date(`${sessionDate}T${time}:00+08:00`).toISOString();
}

export function normalizeSessionDateTimes<T extends SessionDateTimeLike>(session: T): T {
  return {
    ...session,
    start_at: hongKongSessionIso(session.session_date, hongKongClock(session.start_at)),
    end_at: hongKongSessionIso(session.session_date, hongKongClock(session.end_at)),
  };
}

export function normalizeSessionDateTimeList<T extends SessionDateTimeLike>(sessions: T[]): T[] {
  return sessions.map(normalizeSessionDateTimes);
}
