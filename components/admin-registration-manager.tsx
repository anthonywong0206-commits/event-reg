"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, CheckCircle2, LoaderCircle, Mail, Pencil, Phone, Plus, Save, Send, Trash2, UsersRound, X } from "lucide-react";
import { formatDateTime } from "@/lib/format";
import type { RegistrationMethod, RegistrationRecord, RegistrationStatus } from "@/lib/types";

type RegistrationFormState = {
  fullName: string;
  email: string;
  phone: string;
  method: RegistrationMethod;
  status: RegistrationStatus;
  attendedAt: string;
  notes: string;
};

function localInput(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
}

function statusLabel(status: RegistrationStatus) {
  if (status === "confirmed") return "已確認";
  if (status === "cancelled") return "已取消";
  return "候補";
}

function emptyForm(methods: RegistrationMethod[]): RegistrationFormState {
  return {
    fullName: "",
    email: "",
    phone: "",
    method: methods[0] || "online",
    status: "confirmed",
    attendedAt: "",
    notes: "",
  };
}

export function AdminRegistrationManager({
  eventId,
  methods,
  registrations,
}: {
  eventId: string;
  methods: RegistrationMethod[];
  registrations: RegistrationRecord[];
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<RegistrationRecord | null>(null);
  const [form, setForm] = useState<RegistrationFormState>(() => emptyForm(methods));
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState("");
  const [emailingId, setEmailingId] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  function updateField<Key extends keyof RegistrationFormState>(key: Key, value: RegistrationFormState[Key]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function openCreate() {
    setEditing(null);
    setForm(emptyForm(methods));
    setError("");
    setNotice("");
    setDialogOpen(true);
  }

  function openEdit(registration: RegistrationRecord) {
    setEditing(registration);
    setForm({
      fullName: registration.full_name,
      email: registration.email,
      phone: registration.phone,
      method: registration.method,
      status: registration.status,
      attendedAt: localInput(registration.attended_at),
      notes: registration.notes || "",
    });
    setError("");
    setNotice("");
    setDialogOpen(true);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const endpoint = editing
        ? `/api/admin/events/${eventId}/registrations/${editing.id}`
        : `/api/admin/events/${eventId}/registrations`;
      const response = await fetch(endpoint, {
        method: editing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          attendedAt: form.attendedAt ? new Date(form.attendedAt).toISOString() : null,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "未能儲存報名資料");

      setDialogOpen(false);
      setNotice(editing ? "報名資料已更新。" : "報名資料已新增。名額統計已同步更新。");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "未能儲存報名資料");
    } finally {
      setSaving(false);
    }
  }

  async function remove(registration: RegistrationRecord) {
    if (!window.confirm(`確定永久刪除「${registration.full_name}」的報名資料？此操作不能復原。`)) return;
    setDeletingId(registration.id);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`/api/admin/events/${eventId}/registrations/${registration.id}`, { method: "DELETE" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "未能刪除報名資料");
      setNotice("報名資料已刪除。名額統計已同步更新。");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "未能刪除報名資料");
    } finally {
      setDeletingId("");
    }
  }

  async function resendEmail(registration: RegistrationRecord) {
    setEmailingId(registration.id);
    setError("");
    setNotice("");
    try {
      const response = await fetch(
        `/api/admin/events/${eventId}/registrations/${registration.id}/email`,
        { method: "POST" },
      );
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "未能發送確認電郵");
      setNotice(`確認電郵已發送至 ${registration.email}。`);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "未能發送確認電郵");
    } finally {
      setEmailingId("");
    }
  }

  return (
    <section className="registration-list-panel">
      <div className="registration-list-toolbar">
        <div className="admin-section-title">
          <h2>參加者名單</h2>
          <p>資料按申請時間排列；新增、狀態修改及刪除會自動同步活動名額。</p>
        </div>
        <button type="button" className="button button-primary" onClick={openCreate}><Plus />新增報名</button>
      </div>

      {notice && <div className="notice notice-success"><CheckCircle2 />{notice}</div>}
      {error && !dialogOpen && <div className="notice notice-error"><AlertCircle />{error}</div>}

      {registrations.length === 0 ? (
        <div className="empty-registration-list"><UsersRound /><h3>暫未有報名紀錄</h3><p>你可以按「新增報名」手動建立第一筆資料。</p></div>
      ) : (
        <div className="registration-table-wrap">
          <table className="registration-table">
            <thead><tr><th>報名編號</th><th>參加者</th><th>聯絡方法</th><th>報名方式</th><th>申請時間</th><th>出席狀態</th><th>操作</th></tr></thead>
            <tbody>
              {registrations.map((registration) => (
                <tr key={registration.id}>
                  <td><strong>{registration.registration_no}</strong></td>
                  <td><strong>{registration.full_name}</strong><span className={`registration-status-chip ${registration.status}`}>{statusLabel(registration.status)}</span>{registration.notes && <small>{registration.notes}</small>}</td>
                  <td><span className="contact-line"><Mail />{registration.email}</span><span className="contact-line"><Phone />{registration.phone}</span></td>
                  <td>{registration.method === "online" ? "網上報名" : "親身報名"}</td>
                  <td>{formatDateTime(registration.created_at)}</td>
                  <td>{registration.attended_at ? <span className="attendance-chip attended"><CheckCircle2 />已出席<small>{formatDateTime(registration.attended_at)}</small></span> : <span className="attendance-chip pending">未登記</span>}</td>
                  <td>
                    <div className="registration-row-actions">
                      <button type="button" className="icon-button" aria-label={`重發確認電郵 ${registration.full_name}`} disabled={emailingId === registration.id} onClick={() => resendEmail(registration)}>
                        {emailingId === registration.id ? <LoaderCircle className="spin" /> : <Send />}
                      </button>
                      <button type="button" className="icon-button" aria-label={`編輯 ${registration.full_name}`} onClick={() => openEdit(registration)}><Pencil /></button>
                      <button type="button" className="icon-button danger" aria-label={`刪除 ${registration.full_name}`} disabled={deletingId === registration.id} onClick={() => remove(registration)}>
                        {deletingId === registration.id ? <LoaderCircle className="spin" /> : <Trash2 />}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {dialogOpen && (
        <div className="admin-modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && !saving && setDialogOpen(false)}>
          <section className="admin-modal" role="dialog" aria-modal="true" aria-labelledby="registration-dialog-title">
            <header className="admin-modal-header">
              <div><span>{editing ? "EDIT REGISTRATION" : "NEW REGISTRATION"}</span><h2 id="registration-dialog-title">{editing ? "修改報名資料" : "新增報名資料"}</h2>{editing && <p>{editing.registration_no}</p>}</div>
              <button type="button" className="icon-button" aria-label="關閉" disabled={saving} onClick={() => setDialogOpen(false)}><X /></button>
            </header>
            <form className="admin-registration-form" onSubmit={submit}>
              <div className="form-grid">
                <label className="field"><span>參加者姓名 *</span><input required minLength={2} maxLength={80} value={form.fullName} onChange={(event) => updateField("fullName", event.target.value)} /></label>
                <label className="field"><span>電郵地址 *</span><input type="email" required maxLength={160} value={form.email} onChange={(event) => updateField("email", event.target.value)} /></label>
                <label className="field"><span>聯絡電話 *</span><input required minLength={8} maxLength={30} value={form.phone} onChange={(event) => updateField("phone", event.target.value)} /></label>
                <label className="field"><span>報名方式 *</span><select value={form.method} onChange={(event) => updateField("method", event.target.value as RegistrationMethod)}>{methods.map((method) => <option key={method} value={method}>{method === "online" ? "網上報名" : "親身報名"}</option>)}</select></label>
                <label className="field"><span>報名狀態 *</span><select value={form.status} onChange={(event) => updateField("status", event.target.value as RegistrationStatus)}><option value="confirmed">已確認</option><option value="waitlist">候補</option><option value="cancelled">已取消</option></select></label>
                <label className="field"><span>出席時間</span><input type="datetime-local" value={form.attendedAt} onChange={(event) => updateField("attendedAt", event.target.value)} /></label>
                <label className="field field-full"><span>備註</span><textarea rows={4} maxLength={500} value={form.notes} onChange={(event) => updateField("notes", event.target.value)} /></label>
              </div>
              <p className="registration-form-note">「已確認」會佔用活動名額；「候補」及「已取消」不會計入已確認人數。</p>
              {error && <div className="notice notice-error"><AlertCircle />{error}</div>}
              <div className="admin-modal-actions">
                <button type="button" className="button button-ghost" disabled={saving} onClick={() => setDialogOpen(false)}>取消</button>
                <button type="submit" className="button button-primary" disabled={saving}>{saving ? <><LoaderCircle className="spin" />儲存中…</> : <><Save />{editing ? "儲存修改" : "新增報名"}</>}</button>
              </div>
            </form>
          </section>
        </div>
      )}
    </section>
  );
}
