"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

function calculate(deadline: string) {
  const distance = new Date(deadline).getTime() - Date.now();
  if (distance <= 0) return null;
  const days = Math.floor(distance / 86_400_000);
  const hours = Math.floor((distance % 86_400_000) / 3_600_000);
  const minutes = Math.floor((distance % 3_600_000) / 60_000);
  const seconds = Math.floor((distance % 60_000) / 1000);
  return { days, hours, minutes, seconds };
}

export function Countdown({
  deadline,
  mode = "deadline",
  refreshOnComplete = false,
}: {
  deadline: string;
  mode?: "opening" | "deadline";
  refreshOnComplete?: boolean;
}) {
  const router = useRouter();
  const initial = useMemo(() => calculate(deadline), [deadline]);
  const [remaining, setRemaining] = useState(initial);
  const hasRefreshed = useRef(false);

  useEffect(() => {
    hasRefreshed.current = false;
    const update = () => {
      const next = calculate(deadline);
      setRemaining(next);
      if (!next && refreshOnComplete && !hasRefreshed.current) {
        hasRefreshed.current = true;
        router.refresh();
      }
    };
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [deadline, refreshOnComplete, router]);

  if (!remaining) return <span>{mode === "opening" ? "報名已開始" : "報名時間已結束"}</span>;
  const ariaLabel = mode === "opening" ? "距離開始報名" : "距離截止報名";
  return (
    <span aria-label={`${ariaLabel}尚餘 ${remaining.days} 日 ${remaining.hours} 小時`}>
      {remaining.days} 日 {String(remaining.hours).padStart(2, "0")}:{String(remaining.minutes).padStart(2, "0")}:{String(remaining.seconds).padStart(2, "0")}
    </span>
  );
}
