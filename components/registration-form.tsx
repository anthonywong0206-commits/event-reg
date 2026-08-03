"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, ArrowRight, Building2, Laptop, LoaderCircle, LockKeyhole } from "lucide-react";
import type { EventRecord, RegistrationMethod } from "@/lib/types";

export function RegistrationForm({ event, initialMethod }: { event: EventRecord; initialMethod: RegistrationMethod }) {
  const router = useRouter();
  const [method, setMethod] = useState<RegistrationMethod>(
    event.registration_methods.includes(initialMethod) ? initialMethod : event.registration_methods[0],
  );
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(formEvent: FormEvent<HTMLFormElement>) {
    formEvent.preventDefault();
    setError("");
    setSubmitting(true);
    const form = new FormData(formEvent.currentTarget);

    const payload = {
      eventId: event.id,
      fullName: form.get("fullName"),
      email: form.get("email"),
      phone: form.get("phone"),
      method,
      notes: form.get("notes") || "",
      consent: form.get("consent") === "on",
      website: form.get("website") || "",
    };

    try {
      const response = await fetch("/api/registrations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "未能完成報名，請稍後再試。");
      router.push(`/registration/success?token=${encodeURIComponent(result.qr_token)}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "未能完成報名，請稍後再試。");
      setSubmitting(false);
    }
  }

  return (
    <form className="registration-form" onSubmit={handleSubmit}>
      <fieldset className="form-section">
        <legend>選擇報名方法</legend>
        <div className="method-choice-grid">
          {event.registration_methods.includes("online") && (
            <label className={method === "online" ? "method-choice selected" : "method-choice"}>
              <input type="radio" name="method" checked={method === "online"} onChange={() => setMethod("online")} />
              <Laptop /><span><strong>網上報名</strong><small>即時完成申請並收取電子入場證</small></span>
            </label>
          )}
          {event.registration_methods.includes("in_person") && (
            <label className={method === "in_person" ? "method-choice selected" : "method-choice"}>
              <input type="radio" name="method" checked={method === "in_person"} onChange={() => setMethod("in_person")} />
              <Building2 /><span><strong>親身報名</strong><small>先預留名額，再到服務櫃台核實</small></span>
            </label>
          )}
        </div>
      </fieldset>

      <fieldset className="form-section">
        <legend>參加者資料</legend>
        <div className="form-grid">
          <label className="field field-full"><span>姓名 *</span><input name="fullName" autoComplete="name" required maxLength={80} placeholder="請輸入參加者姓名" /></label>
          <label className="field"><span>電郵地址 *</span><input name="email" type="email" autoComplete="email" required maxLength={160} placeholder="name@example.com" /></label>
          <label className="field"><span>聯絡電話 *</span><input name="phone" type="tel" autoComplete="tel" required maxLength={30} placeholder="9123 4567" /></label>
          <label className="field field-full"><span>備註</span><textarea name="notes" rows={4} maxLength={500} placeholder="例如無障礙安排、飲食需要或其他查詢（選填）" /></label>
          <label className="honeypot" aria-hidden="true"><span>Website</span><input name="website" tabIndex={-1} autoComplete="off" /></label>
        </div>
      </fieldset>

      <label className="consent-row">
        <input type="checkbox" name="consent" required />
        <span>我同意系統收集以上資料作處理活動報名、聯絡及出席登記之用。</span>
      </label>

      {method === "in_person" && (
        <div className="notice notice-info">
          <Building2 />
          <span>提交後會先保留名額。請按確認電郵指示於指定時間到「{event.contact_address || event.location}」完成核實。</span>
        </div>
      )}
      {error && <div className="notice notice-error" role="alert"><AlertCircle />{error}</div>}

      <div className="form-submit-row">
        <span className="privacy-note"><LockKeyhole />資料會經加密連線傳送</span>
        <button className="button button-primary button-large" type="submit" disabled={submitting}>
          {submitting ? <><LoaderCircle className="spin" />處理中…</> : <>提交報名<ArrowRight /></>}
        </button>
      </div>
    </form>
  );
}
