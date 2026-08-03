"use client";

import { useEffect, useState } from "react";

function calculate(deadline: string) {
  const distance = new Date(deadline).getTime() - Date.now();
  if (distance <= 0) return null;
  const days = Math.floor(distance / 86_400_000);
  const hours = Math.floor((distance % 86_400_000) / 3_600_000);
  const minutes = Math.floor((distance % 3_600_000) / 60_000);
  const seconds = Math.floor((distance % 60_000) / 1000);
  return { days, hours, minutes, seconds };
}

export function Countdown({ deadline }: { deadline: string }) {
  const [remaining, setRemaining] = useState<ReturnType<typeof calculate> | undefined>(undefined);

  useEffect(() => {
    const update = () => setRemaining(calculate(deadline));
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [deadline]);

  if (remaining === undefined) return <span aria-hidden="true">-- 日 --:--:--</span>;
  if (!remaining) return <span>報名時間已結束</span>;
  return (
    <span aria-label={`距離截止報名尚餘 ${remaining.days} 日 ${remaining.hours} 小時`}>
      {remaining.days} 日 {String(remaining.hours).padStart(2, "0")}:{String(remaining.minutes).padStart(2, "0")}:{String(remaining.seconds).padStart(2, "0")}
    </span>
  );
}
