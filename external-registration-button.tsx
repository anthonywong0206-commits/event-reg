"use client";

import { useState } from "react";
import { ExternalLink, X } from "lucide-react";

export function ExternalRegistrationButton({ url, organization }: { url: string; organization: string }) {
  const [open, setOpen] = useState(false);

  function continueToExternal() {
    setOpen(false);
    window.open(url, "_blank", "noopener,noreferrer");
  }

  return <>
    <button type="button" className="button button-primary button-large" onClick={() => setOpen(true)}>
      <ExternalLink />外部連結報名
    </button>
    {open && <div className="external-registration-modal-backdrop" role="presentation" onMouseDown={(e) => { if (e.currentTarget === e.target) setOpen(false); }}>
      <section className="external-registration-modal" role="dialog" aria-modal="true" aria-labelledby="external-registration-title">
        <header>
          <div><ExternalLink /><span><strong id="external-registration-title">即將離開本網站</strong><small>請確認後繼續前往外部報名頁面</small></span></div>
          <button type="button" className="icon-button" aria-label="關閉" onClick={() => setOpen(false)}><X /></button>
        </header>
        <p>你正離開網站報名，前往「<strong>{organization}</strong>」提供的報名連結。</p>
        <div className="external-registration-modal-actions">
          <button type="button" className="button button-secondary" onClick={() => setOpen(false)}>取消</button>
          <button type="button" className="button button-primary" onClick={continueToExternal}>同意並繼續 <ExternalLink /></button>
        </div>
      </section>
    </div>}
  </>;
}
