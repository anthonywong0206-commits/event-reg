"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarDays, Home } from "lucide-react";

const STORAGE_KEY = "event-register-mobile-large-text";

export function MobileFontSizeButton() {
  const [large, setLarge] = useState(false);

  useEffect(() => {
    const enabled = window.localStorage.getItem(STORAGE_KEY) === "1";
    setLarge(enabled);
    document.documentElement.dataset.mobileText = enabled ? "large" : "normal";

    const updateMobileLayout = () => {
      const coarsePointer = window.matchMedia?.("(pointer: coarse)").matches ?? false;
      const mobileLayout = window.innerWidth <= 860 || (coarsePointer && window.innerWidth <= 1024);
      document.documentElement.dataset.mobileLayout = mobileLayout ? "true" : "false";
    };
    updateMobileLayout();
    window.addEventListener("resize", updateMobileLayout);
    window.addEventListener("orientationchange", updateMobileLayout);

    return () => {
      window.removeEventListener("resize", updateMobileLayout);
      window.removeEventListener("orientationchange", updateMobileLayout);
      document.documentElement.dataset.mobileText = "normal";
      delete document.documentElement.dataset.mobileLayout;
    };
  }, []);

  function toggle() {
    const next = !large;
    setLarge(next);
    window.localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
    document.documentElement.dataset.mobileText = next ? "large" : "normal";
  }

  return (
    <button
      type="button"
      className={`mobile-font-size-button ${large ? "active" : ""}`}
      onClick={toggle}
      aria-pressed={large}
      aria-label={large ? "還原正常字體" : "放大字體"}
      title={large ? "還原正常字體" : "放大字體"}
    >
      <strong>A+</strong>
      <span>{large ? "正常字體" : "放大字體"}</span>
    </button>
  );
}

export function MobileBottomNav() {
  const pathname = usePathname();
  const homeActive = pathname === "/";
  const eventsActive = pathname === "/events" || pathname.startsWith("/events/");

  return (
    <nav className="mobile-bottom-nav" aria-label="手機主要導覽">
      <Link href="/" className={homeActive ? "active" : ""} aria-current={homeActive ? "page" : undefined}>
        <Home />
        <span>首頁</span>
      </Link>
      <Link href="/events" className={eventsActive ? "active" : ""} aria-current={eventsActive ? "page" : undefined}>
        <CalendarDays />
        <span>活動</span>
      </Link>
    </nav>
  );
}
