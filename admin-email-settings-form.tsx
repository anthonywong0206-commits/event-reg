"use client";

import { FormEvent, useState } from "react";
import { AlertCircle, CheckCircle2, LoaderCircle, MailCheck, Save } from "lucide-react";
import type { EmailNotificationSettingsRecord, EmailTemplateKey } from "@/lib/types";
import { EMAIL_TEMPLATE_PRESETS } from "@/lib/email-settings";

export function AdminEmailSettingsForm({ settings }: { settings: EmailNotificationSettingsRecord }) {
  const [templateKey, setTemplateKey] = useState<EmailTemplateKey>(settings.template_key);
  const [subject, setSubject] = useState(settings.subject_template);
  const [body, setBody] = useState(settings.body_template);
  const [enabled, setEnabled] = useState(settings.enabled);
  const [includeQr, setIncludeQr] = useState(settings.include_qr);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  function applyPreset(key: Exclude<EmailTemplateKey, "custom">) {
    const preset = EMAIL_TEMPLATE_PRESETS[key];
    setTemplateKey(key);
    setSubject(preset.subject_template);
    setBody(preset.body_template);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setError(""); setSuccess("");
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/admin/email-settings", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled, template_key: templateKey, subject_template: subject, body_template: body, include_qr: includeQr, reply_to: String(form.get("reply_to") || "").trim() || null }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "未能儲存電郵設定");
      setSuccess("確認電郵設定已儲存。之後的新報名會使用這個內容。");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "未能儲存電郵設定"); }
    finally { setSaving(false); }
  }

  return <form className="admin-event-form email-settings-form" onSubmit={submit}>
    <section className="admin-form-section">
      <div className="section-heading"><h2>寄送設定</h2><span>只有參加者提供電郵地址時才會寄送</span></div>
      <div className="admin-registration-options email-setting-switches">
        <label><input type="checkbox" checked={enabled} onChange={e=>setEnabled(e.target.checked)} />啟用報名確認電郵</label>
        <label><input type="checkbox" checked={includeQr} onChange={e=>setIncludeQr(e.target.checked)} />附上出席 QR Code</label>
      </div>
      <label className="field"><span>回覆電郵（選填）</span><input type="email" name="reply_to" defaultValue={settings.reply_to || ""} placeholder="例如 centre@example.org" /></label>
    </section>
    <section className="admin-form-section">
      <div className="section-heading"><h2>常用訊息範本</h2><span>選擇後仍可自行修改文字</span></div>
      <div className="email-template-grid">
        {(Object.keys(EMAIL_TEMPLATE_PRESETS) as Array<Exclude<EmailTemplateKey,"custom">>).map(key => {
          const preset=EMAIL_TEMPLATE_PRESETS[key]; return <button type="button" key={key} className={`email-template-card ${templateKey===key?"selected":""}`} onClick={()=>applyPreset(key)}><MailCheck/><strong>{preset.label}</strong><span>{preset.description}</span></button>;
        })}
      </div>
      <div className="form-grid">
        <label className="field field-full"><span>電郵主旨 *</span><input value={subject} onChange={e=>{setSubject(e.target.value);setTemplateKey("custom")}} required maxLength={300}/></label>
        <label className="field field-full"><span>電郵內容 *</span><textarea value={body} onChange={e=>{setBody(e.target.value);setTemplateKey("custom")}} required rows={14} maxLength={6000}/><small>可用變數：{"{{name}}、{{event_title}}、{{event_date}}、{{event_location}}、{{registration_no}}、{{entry_url}}"}</small></label>
      </div>
    </section>
    {error&&<div className="notice notice-error"><AlertCircle/>{error}</div>}
    {success&&<div className="notice notice-success"><CheckCircle2/>{success}</div>}
    <div className="admin-form-actions"><button className="button button-primary button-large" disabled={saving}>{saving?<><LoaderCircle className="spin"/>儲存中…</>:<><Save/>儲存電郵設定</>}</button></div>
  </form>;
}
