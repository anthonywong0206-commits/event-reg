"use client";

import { FormEvent, useState } from "react";
import { CheckCircle2, LoaderCircle, QrCode, TriangleAlert } from "lucide-react";

type CheckInResponse = {
  registration_no: string;
  full_name: string;
  event_title: string;
  attended_at: string;
  already_checked_in?: boolean;
};

export function CheckInPanel({ initialToken = "" }: { initialToken?: string }) {
  const [token, setToken] = useState(initialToken);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<CheckInResponse | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const response = await fetch("/api/check-in", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: token.trim() }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "登記失敗");
      setResult(data);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "登記失敗");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="checkin-panel">
      <form onSubmit={submit}>
        <label className="field"><span>QR 憑證 Token</span><input value={token} onChange={(event) => setToken(event.target.value)} placeholder="掃描 QR 後會自動填入，亦可手動貼上" required /></label>
        <button className="button button-primary button-large" disabled={loading} type="submit">
          {loading ? <><LoaderCircle className="spin" />核對中…</> : <><QrCode />確認出席</>}
        </button>
      </form>
      {error && <div className="checkin-result error"><TriangleAlert /><div><strong>未能完成登記</strong><p>{error}</p></div></div>}
      {result && (
        <div className="checkin-result success">
          <CheckCircle2 />
          <div>
            <strong>{result.already_checked_in ? "此憑證已登記" : "登記成功"}</strong>
            <p>{result.full_name}｜{result.event_title}</p>
            <small>報名編號：{result.registration_no}</small>
          </div>
        </div>
      )}
    </div>
  );
}
