"use client";

import Link from "next/link";
import { useState } from "react";
import { Building2, CheckCircle2, ExternalLink, KeyRound, Laptop, MapPinned } from "lucide-react";
import { ExternalRegistrationButton } from "@/components/external-registration-button";
import type { EventRecord, RegistrationMethod } from "@/lib/types";
import { eventRegistrationState, formatDateTime } from "@/lib/format";

export function EventDetailActions({ event }: { event: EventRecord }) {
  const [method, setMethod] = useState<RegistrationMethod>(event.registration_methods[0] ?? "online");
  const state = eventRegistrationState(event);

  if (event.external_registration && event.external_registration_url && event.external_registration_organization) {
    return <section className="registration-options external-registration-option" aria-labelledby="registration-options-title">
      <h2 id="registration-options-title">外部連結報名</h2>
      <div className="external-registration-provider"><ExternalLink /><div><strong>由 {event.external_registration_organization} 負責報名</strong><p>本網站不會收集此活動的報名資料。點擊下方按鈕後會先顯示離站提醒。</p></div></div>
      {state === "open"
        ? <ExternalRegistrationButton url={event.external_registration_url} organization={event.external_registration_organization} />
        : <button className="button button-disabled button-large" disabled>{state === "upcoming" ? `將於 ${formatDateTime(event.registration_start_at)} 開始報名` : "報名已截止"}</button>}
    </section>;
  }

  return (
    <section className="registration-options" aria-labelledby="registration-options-title">
      {event.registration_visibility === "private" && <div className="private-registration-notice"><KeyRound /><span><strong>非公開報名活動</strong><small>進入報名表前需要輸入主辦單位提供的邀請碼。</small></span></div>}
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
              <li><CheckCircle2 />正選成功後系統發送確認電郵及 QR Code</li>
              <li><CheckCircle2 />活動當日展示 QR Code 完成入場登記</li>
            </ul>
            {(state === "open" || state === "waitlist") ? (
              <Link className="button button-primary button-large" href={`/events/${event.slug}/register?method=online`}>{state === "waitlist" ? "登記候補名單" : event.registration_visibility === "private" ? "輸入邀請碼報名" : "立即網上報名"}</Link>
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
            {(state === "open" || state === "waitlist") ? (
              <Link className="button button-secondary button-large" href={`/events/${event.slug}/register?method=in_person`}>{state === "waitlist" ? "登記候補名單" : event.registration_visibility === "private" ? "輸入邀請碼預留名額" : "預留親身報名名額"}</Link>
            ) : (
              <button className="button button-disabled button-large" disabled>{state === "upcoming" ? `將於 ${formatDateTime(event.registration_start_at)} 開始報名` : state === "full" ? "名額已滿" : "報名已截止"}</button>
            )}
          </>
        )}
      </div>
    </section>
  );
}
