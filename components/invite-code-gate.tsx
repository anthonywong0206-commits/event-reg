"use client";

import { FormEvent, useState } from "react";
import { AlertCircle, ArrowRight, KeyRound, LoaderCircle, LockKeyhole } from "lucide-react";

export function InviteCodeGate({
  eventSlug,
  eventTitle,
  onVerified,
}: {
  eventSlug: string;
  eventTitle: string;
  onVerified: (accessToken: string) => void;
}) {
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
        cache: "no-store",
        body: JSON.stringify({ inviteCode }),
      });
      const result = await response.json();
      if (!response.ok || !result?.accessToken) {
        throw new Error(result.error || "邀請碼驗證失敗");
      }
      setInviteCode("");
      onVerified(String(result.accessToken));
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
      <span>「{eventTitle}」屬非公開報名活動。每次進入報名頁都需要重新輸入主辦單位提供的邀請碼。</span>
      <form onSubmit={submit}>
        <label className="field">
          <span><KeyRound />邀請碼</span>
          <input
            value={inviteCode}
            onChange={(event) => setInviteCode(event.target.value)}
            minLength={4}
            maxLength={40}
            autoComplete="off"
            autoCapitalize="characters"
            required
            placeholder="請輸入邀請碼"
          />
        </label>
        {error && <div className="notice notice-error"><AlertCircle />{error}</div>}
        <button className="button button-primary button-large" disabled={submitting || inviteCode.trim().length < 4}>
          {submitting ? <><LoaderCircle className="spin" />驗證中…</> : <>驗證並繼續<ArrowRight /></>}
        </button>
      </form>
      <small>驗證只適用於今次開啟的報名頁。重新整理、離開再返回或開新分頁時，都需要再次輸入邀請碼。</small>
    </section>
  );
}
