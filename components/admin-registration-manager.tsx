"use client";

import { useMemo, useState, type ChangeEvent, type FormEvent, type MouseEvent } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  CheckCircle2,
  Download,
  LoaderCircle,
  Mail,
  Pencil,
  Phone,
  Plus,
  QrCode,
  Save,
  Trash2,
  UserRoundCheck,
  UsersRound,
  X,
} from "lucide-react";
import { formatDateTime } from "@/lib/format";
import type { EventRecord, RegistrationRecord, RegistrationStatus } from "@/lib/types";

interface AdminRegistrationManagerProps {
  event: EventRecord;
  initialRegistrations: RegistrationRecord[];
}

type EditorMode = { type: "new" } | { type: "edit"; registration: RegistrationRecord } | null;

const statusLabels: Record<RegistrationStatus, string> = {
  confirmed: "已確認",
  waitlist: "候補",
  cancelled: "已取消",
};

export function AdminRegistrationManager({ event, initialRegistrations }: AdminRegistrationManagerProps) {
  const router = useRouter();
  const [registrations, setRegistrations] = useState(initialRegistrations);
  const [editor, setEditor] = useState<EditorMode>(null);
  const [status, setStatus] = useState<RegistrationStatus>("confirmed");
  const [attended, setAttended] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const confirmed = useMemo(
    () => registrations.filter((item) => item.status === "confirmed"),
    [registrations],
  );
  const attendedCount = useMemo(
    () => confirmed.filter((item) => item.attended_at).length,
    [confirmed],
  );

  function openNew() {
    setError("");
    setStatus("confirmed");
    setAttended(false);
    setEditor({ type: "new" });
  }

  function openEdit(registration: RegistrationRecord) {
    setError("");
    setStatus(registration.status);
    setAttended(Boolean(registration.attended_at));
    setEditor({ type: "edit", registration });
  }

  function closeEditor() {
    if (saving) return;
    setEditor(null);
    setError("");
  }

  async function submit(formEvent: FormEvent<HTMLFormElement>) {
    formEvent.preventDefault();
    if (!editor) return;
    setSaving(true);
    setError("");

    const form = new FormData(formEvent.currentTarget);
    const value = (name: string) => String(form.get(name) || "").trim();
    const payload = {
      fullName: value("fullName"),
      email: value("email"),
      phone: value("phone"),
      method: value("method"),
      status,
      notes: value("notes"),
      attended: status === "confirmed" && attended,
      ...(editor.type === "new" ? { sendEmail: form.get("sendEmail") === "on" } : {}),
    };

    const endpoint = editor.type === "new"
      ? `/api/admin/events/${event.id}/registrations`
      : `/api/admin/events/${event.id}/registrations/${editor.registration.id}`;

    try {
      const response = await fetch(endpoint, {
        method: editor.type === "new" ? "POST" : "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "未能儲存參加者");

      const registration = result as RegistrationRecord;
      if (editor.type === "new") {
        setRegistrations((current) => [...current, registration].sort((a, b) => a.created_at.localeCompare(b.created_at)));
      } else {
        setRegistrations((current) => current.map((item) => item.id === registration.id ? registration : item));
      }
      setEditor(null);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "未能儲存參加者");
    } finally {
      setSaving(false);
    }
  }

  async function remove(registration: RegistrationRecord) {
    if (!window.confirm(`確定永久刪除「${registration.full_name}」的報名紀錄？此操作不可復原。`)) return;
    setDeletingId(registration.id);
    setError("");
    try {
      const response = await fetch(`/api/admin/events/${event.id}/registrations/${registration.id}`, {
        method: "DELETE",
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "未能刪除參加者");
      setRegistrations((current) => current.filter((item) => item.id !== registration.id));
      if (editor?.type === "edit" && editor.registration.id === registration.id) setEditor(null);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "未能刪除參加者");
    } finally {
      setDeletingId(null);
    }
  }

  const editingRegistration = editor?.type === "edit" ? editor.registration : null;
  const availableMethods = editingRegistration && !event.registration_methods.includes(editingRegistration.method)
    ? [...event.registration_methods, editingRegistration.method]
    : event.registration_methods;
  const defaultMethod = editingRegistration?.method ?? (event.registration_methods.includes("in_person") ? "in_person" : event.registration_methods[0]);

  return (
    <>
      <section className="registration-stat-grid">
        <article><UsersRound /><div><strong>{confirmed.length}</strong><span>已確認報名</span></div></article>
        <article><UserRoundCheck /><div><strong>{attendedCount}</strong><span>已完成出席</span></div></article>
        <article><QrCode /><div><strong>{Math.max(0, confirmed.length - attendedCount)}</strong><span>尚未登記</span></div></article>
        <article><CheckCircle2 /><div><strong>{event.capacity}</strong><span>活動名額上限</span></div></article>
      </section>

      <section className="registration-list-panel">
        <div className="admin-section-title registration-list-heading">
          <div><h2>參加者名單</h2><p>管理員可手動新增、修改或刪除紀錄；已確認人數會同步更新活動剩餘名額。</p></div>
          <div className="registration-list-actions">
            <a className="button button-secondary button-small" href={`/api/admin/events/${event.id}/registrations/export`}>
              <Download />匯出 CSV
            </a>
            <button type="button" className="button button-primary button-small" onClick={openNew}>
              <Plus />新增參加者
            </button>
          </div>
        </div>

        {error && !editor && <div className="notice notice-error registration-page-error"><AlertCircle />{error}</div>}

        {registrations.length === 0 ? (
          <div className="empty-registration-list">
            <UsersRound />
            <h3>暫未有報名紀錄</h3>
            <p>可等待參加者網上報名，或由管理員手動加入名單。</p>
            <button type="button" className="button button-primary button-small" onClick={openNew}><Plus />新增第一位參加者</button>
          </div>
        ) : (
          <div className="registration-table-wrap">
            <table className="registration-table registration-manage-table">
              <thead><tr><th>報名編號</th><th>參加者</th><th>聯絡方法</th><th>報名方式</th><th>申請時間</th><th>出席狀態</th><th>操作</th></tr></thead>
              <tbody>
                {registrations.map((registration) => (
                  <tr key={registration.id}>
                    <td><strong>{registration.registration_no}</strong></td>
                    <td><strong>{registration.full_name}</strong><small>{statusLabels[registration.status]}</small></td>
                    <td><span className="contact-line"><Mail />{registration.email}</span><span className="contact-line"><Phone />{registration.phone}</span></td>
                    <td>{registration.method === "online" ? "網上報名" : "親身報名"}</td>
                    <td>{formatDateTime(registration.created_at)}</td>
                    <td>{registration.attended_at ? <span className="attendance-chip attended"><CheckCircle2 />已出席<small>{formatDateTime(registration.attended_at)}</small></span> : <span className="attendance-chip pending">未登記</span>}</td>
                    <td>
                      <div className="registration-row-actions">
                        <button type="button" className="icon-button" aria-label={`修改 ${registration.full_name}`} onClick={() => openEdit(registration)}><Pencil /></button>
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
      </section>

      {editor && (
        <div className="admin-modal-backdrop" role="presentation" onMouseDown={(event: MouseEvent<HTMLDivElement>) => event.target === event.currentTarget && closeEditor()}>
          <section className="admin-modal" role="dialog" aria-modal="true" aria-labelledby="registration-editor-title">
            <header className="admin-modal-header">
              <div>
                <p>{editor.type === "new" ? "MANUAL REGISTRATION" : editingRegistration?.registration_no}</p>
                <h2 id="registration-editor-title">{editor.type === "new" ? "新增參加者" : "修改參加者資料"}</h2>
              </div>
              <button type="button" className="icon-button" aria-label="關閉" onClick={closeEditor}><X /></button>
            </header>

            <form className="admin-registration-form" key={editingRegistration?.id ?? "new"} onSubmit={submit}>
              <div className="form-grid">
                <label className="field"><span>姓名 *</span><input name="fullName" required defaultValue={editingRegistration?.full_name ?? ""} /></label>
                <label className="field"><span>聯絡電話 *</span><input name="phone" required defaultValue={editingRegistration?.phone ?? ""} /></label>
                <label className="field field-full"><span>電郵地址 *</span><input name="email" type="email" required defaultValue={editingRegistration?.email ?? ""} /></label>
                <label className="field"><span>報名方式 *</span><select name="method" required defaultValue={defaultMethod}>{availableMethods.includes("online") && <option value="online">網上報名{!event.registration_methods.includes("online") ? "（現有紀錄）" : ""}</option>}{availableMethods.includes("in_person") && <option value="in_person">親身報名{!event.registration_methods.includes("in_person") ? "（現有紀錄）" : ""}</option>}</select></label>
                <label className="field"><span>報名狀態 *</span><select name="status" value={status} onChange={(event: ChangeEvent<HTMLSelectElement>) => { const next = event.target.value as RegistrationStatus; setStatus(next); if (next !== "confirmed") setAttended(false); }}><option value="confirmed">已確認</option><option value="waitlist">候補</option><option value="cancelled">已取消</option></select></label>
                <label className="field field-full"><span>備註</span><textarea name="notes" rows={4} maxLength={500} defaultValue={editingRegistration?.notes ?? ""} /></label>
              </div>

              <div className="admin-registration-options">
                <label className={status !== "confirmed" ? "disabled" : ""}><input type="checkbox" checked={attended} disabled={status !== "confirmed"} onChange={(event: ChangeEvent<HTMLInputElement>) => setAttended(event.target.checked)} /><span><strong>已出席</strong><small>啟用後會記錄目前時間；取消勾選會清除出席時間。</small></span></label>
                {editor.type === "new" && <label><input type="checkbox" name="sendEmail" /><span><strong>發送確認電郵</strong><small>只會向「已確認」參加者寄出 QR Code 入場憑證。</small></span></label>}
              </div>

              {error && <div className="notice notice-error"><AlertCircle />{error}</div>}

              <footer className="admin-modal-actions">
                {editingRegistration && <button type="button" className="button button-danger" disabled={saving || deletingId === editingRegistration.id} onClick={() => remove(editingRegistration)}><Trash2 />刪除紀錄</button>}
                <button type="button" className="button button-secondary" disabled={saving} onClick={closeEditor}>取消</button>
                <button type="submit" className="button button-primary" disabled={saving}>{saving ? <><LoaderCircle className="spin" />儲存中…</> : <><Save />儲存參加者</>}</button>
              </footer>
            </form>
          </section>
        </div>
      )}
    </>
  );
}
