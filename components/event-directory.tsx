"use client";

import { useMemo, useState } from "react";
import { Search, SlidersHorizontal } from "lucide-react";
import type { EventRecord } from "@/lib/types";
import { EventCard } from "@/components/event-card";

export function EventDirectory({ events }: { events: EventRecord[] }) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("全部類別");
  const categories = useMemo(() => ["全部類別", ...Array.from(new Set(events.map((event) => event.category)))], [events]);
  const filtered = useMemo(() => {
    const keyword = query.trim().toLocaleLowerCase("zh-HK");
    return events.filter((event) => {
      const matchCategory = category === "全部類別" || event.category === category;
      const haystack = `${event.title} ${event.summary} ${event.location} ${event.category}`.toLocaleLowerCase("zh-HK");
      return matchCategory && (!keyword || haystack.includes(keyword));
    });
  }, [events, query, category]);

  return (
    <section className="directory-section shell" id="events">
      <div className="directory-header">
        <div><span className="section-number">01</span><h2>探索最新活動</h2><p>以海報雜誌方式瀏覽，快速掌握日期、地點及剩餘名額。</p></div>
        <div className="directory-filters">
          <label className="search-field"><Search /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜尋活動、主題或地點" /></label>
          <label className="select-field"><SlidersHorizontal /><select value={category} onChange={(event) => setCategory(event.target.value)}>{categories.map((item) => <option key={item}>{item}</option>)}</select></label>
        </div>
      </div>
      {filtered.length ? (
        <div className="magazine-grid">
          {filtered.map((event, index) => <EventCard key={event.id} event={event} size={index === 0 ? "large" : "regular"} />)}
        </div>
      ) : (
        <div className="empty-state"><Search /><h3>找不到相關活動</h3><p>試試使用其他關鍵字或類別。</p></div>
      )}
    </section>
  );
}
