import type { EventRecord } from "@/lib/types";
import { eventRegistrationState, remainingSeats } from "@/lib/format";

export function StatusBadge({ event, compact = false }: { event: EventRecord; compact?: boolean }) {
  const state = eventRegistrationState(event);
  const label = state === "upcoming"
    ? "即將開始"
    : state === "full"
      ? "名額已滿"
      : state === "closed"
        ? "報名已截止"
        : `尚餘 ${remainingSeats(event)} 位`;
  return <span className={`status-badge status-${state} ${compact ? "compact" : ""}`}>{label}</span>;
}
