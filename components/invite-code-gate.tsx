"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, ArrowRight, KeyRound, LoaderCircle, LockKeyhole } from "lucide-react";

export function InviteCodeGate({ eventSlug, eventTitle }: { eventSlug: string; eventTitle: string }) {
  const router = useRouter();
  const [inviteCode, setInviteCode] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const response = await fetch(`/api/events/${encodeURIComponent(eventSlug)}/invite`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inviteCode }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "邀請碼驗證失敗");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "邀請碼驗證失敗");
      setSubmitting(false);
    }
  }

  return (
    <section className="invite-code-gate">
      <div className="invite-code-gate-icon"><LockKeyhole /></div>
      <p>PRIVATE REGISTRATION</p>
      <h1>此活動需要邀請碼</h1>
      <span>「{eventTitle}」屬非公開報名活動。請輸入主辦單位提供的邀請碼，驗證成功後即可進入原有報名表。</span>
      <form onSubmit={submit}>
        <label className="field">
          <span><KeyRound />邀請碼</span>
          <input value={inviteCode} onChange={(event) => setInviteCode(event.target.value)} minLength={4} maxLength={40} autoComplete="off" autoCapitalize="characters" required placeholder="請輸入邀請碼" />
        </label>
        {error && <div className="notice notice-error"><AlertCircle />{error}</div>}
        <button className="button button-primary button-large" disabled={submitting || inviteCode.trim().length < 4}>
          {submitting ? <><LoaderCircle className="spin" />驗證中…</> : <>驗證並繼續<ArrowRight /></>}
        </button>
      </form>
      <small>邀請碼只用作控制報名頁存取，不會取代正常的名額、日期、候補及報名資格檢查。</small>
    </section>
  );
}
