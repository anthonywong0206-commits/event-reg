"use client";

import Link from "next/link";
import { useState } from "react";
import { Building2, CheckCircle2, Laptop, MapPinned } from "lucide-react";
import type { EventRecord, RegistrationMethod } from "@/lib/types";
import { eventRegistrationState, formatDateTime } from "@/lib/format";

export function EventDetailActions({ event }: { event: EventRecord }) {
  const [method, setMethod] = useState<RegistrationMethod>(event.registration_methods[0] ?? "online");
  const state = eventRegistrationState(event);

  return (
    <section className="registration-options" aria-labelledby="registration-options-title">
      <h2 id="registration-options-title" className="sr-only">報名方法</h2>
      <div className="method-tabs" role="tablist" aria-label="選擇報名方法">
        {event.registration_methods.includes("online") && (
          <button type="button" role="tab" aria-selected={method === "online"} className={method === "online" ? "active" : ""} onClick={() => setMethod("online")}>
            <Laptop />網上報名
          </button>
        )}
        {event.registration_methods.includes("in_person") && (
          <button type="button" role="tab" aria-selected={method === "in_person"} className={method === "in_person" ? "active" : ""} onClick={() => setMethod("in_person")}>
            <Building2 />親身報名
          </button>
        )}
      </div>

      <div className="method-panel" role="tabpanel">
        {method === "online" ? (
          <>
            <ul className="check-list">
              <li><CheckCircle2 />填寫網上表格，立即提交申請</li>
              <li><CheckCircle2 />成功後系統發送確認電郵及 QR Code</li>
              <li><CheckCircle2 />活動當日展示 QR Code 完成入場登記</li>
            </ul>
            {state === "open" ? (
              <Link className="button button-primary button-large" href={`/events/${event.slug}/register?method=online`}>立即網上報名</Link>
            ) : (
              <button className="button button-disabled button-large" disabled>{state === "upcoming" ? `將於 ${formatDateTime(event.registration_start_at)} 開始報名` : state === "full" ? "名額已滿" : "報名已截止"}</button>
            )}
          </>
        ) : (
          <>
            <div className="in-person-info">
              <MapPinned />
              <div>
                <strong>親身報名地點</strong>
                <p>{event.contact_address || event.location}</p>
                {event.contact_phone && <p>查詢電話：{event.contact_phone}</p>}
              </div>
            </div>
            <p className="muted">你亦可先填寫簡短資料，系統會保留名額，然後按指示到服務櫃台核實。</p>
            {state === "open" ? (
              <Link className="button button-secondary button-large" href={`/events/${event.slug}/register?method=in_person`}>預留親身報名名額</Link>
            ) : (
              <button className="button button-disabled button-large" disabled>{state === "upcoming" ? `將於 ${formatDateTime(event.registration_start_at)} 開始報名` : state === "full" ? "名額已滿" : "報名已截止"}</button>
            )}
          </>
        )}
      </div>
    </section>
  );
}
