"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Clock3, ImageUp, LoaderCircle, Save, Trash2, Zap } from "lucide-react";
import type { EventRecord, RegistrationMethod } from "@/lib/types";

function localInput(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
}

export function AdminEventForm({ event }: { event?: EventRecord | null }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [posterUrl, setPosterUrl] = useState(event?.poster_image_url || "/images/ocean-poster.jpg");
  const [heroUrl, setHeroUrl] = useState(event?.hero_image_url || "/images/hero-community.jpg");
  const [methods, setMethods] = useState<RegistrationMethod[]>(event?.registration_methods || ["online", "in_person"]);
  const [registrationStartMode, setRegistrationStartMode] = useState<"immediate" | "scheduled">(
    event && new Date(event.registration_start_at).getTime() > Date.now() ? "scheduled" : "immediate",
  );

  function toggleMethod(method: RegistrationMethod) {
    setMethods((current) => current.includes(method) ? current.filter((item) => item !== method) : [...current, method]);
  }

  async function upload(file: File, target: "poster" | "hero") {
    setUploading(true);
    setError("");
    const body = new FormData();
    body.append("file", file);
    try {
      const response = await fetch("/api/admin/upload", { method: "POST", body });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "圖片上載失敗");
      if (target === "poster") setPosterUrl(result.url);
      else setHeroUrl(result.url);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "圖片上載失敗");
    } finally {
      setUploading(false);
    }
  }

  async function submit(formEvent: FormEvent<HTMLFormElement>) {
    formEvent.preventDefault();
    setSaving(true);
    setError("");
    const form = new FormData(formEvent.currentTarget);
    const value = (name: string) => String(form.get(name) || "").trim();
    const payload = {
      title: value("title"),
      slug: value("slug"),
      subtitle: value("subtitle") || null,
      summary: value("summary"),
      description: value("description"),
      category: value("category"),
      location: value("location"),
      address: value("address") || null,
      start_at: new Date(value("start_at")).toISOString(),
      end_at: new Date(value("end_at")).toISOString(),
      registration_start_at: registrationStartMode === "immediate"
        ? event?.registration_start_at && new Date(event.registration_start_at).getTime() <= Date.now()
          ? event.registration_start_at
          : new Date().toISOString()
        : new Date(value("registration_start_at")).toISOString(),
      registration_deadline: new Date(value("registration_deadline")).toISOString(),
      capacity: Number(form.get("capacity")),
      status: value("status"),
      registration_methods: methods,
      hero_image_url: heroUrl,
      poster_image_url: posterUrl,
      contact_name: value("contact_name") || null,
      contact_phone: value("contact_phone") || null,
      contact_address: value("contact_address") || null,
      is_featured: form.get("is_featured") === "on",
    };

    try {
      const response = await fetch(event ? `/api/admin/events/${event.id}` : "/api/admin/events", {
        method: event ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "未能儲存活動");
      router.push("/admin");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "未能儲存活動");
      setSaving(false);
    }
  }

  async function remove() {
    if (!event || !window.confirm(`確定刪除「${event.title}」？相關報名紀錄存在時系統會拒絕刪除。`)) return;
    setSaving(true);
    setError("");
    try {
      const response = await fetch(`/api/admin/events/${event.id}`, { method: "DELETE" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "未能刪除活動");
      router.push("/admin");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "未能刪除活動");
      setSaving(false);
    }
  }

  return (
    <form className="admin-event-form" onSubmit={submit}>
      <section className="admin-form-section">
        <div className="section-heading"><h2>基本資料</h2><span>活動名稱、分類及公開狀態</span></div>
        <div className="form-grid">
          <label className="field field-full"><span>活動名稱 *</span><input name="title" required defaultValue={event?.title} /></label>
          <label className="field"><span>網址 Slug *</span><input name="slug" required defaultValue={event?.slug} placeholder="ocean-sustainability-week" /></label>
          <label className="field"><span>分類 *</span><input name="category" required defaultValue={event?.category || "講座"} /></label>
          <label className="field field-full"><span>副標題</span><input name="subtitle" defaultValue={event?.subtitle || ""} /></label>
          <label className="field field-full"><span>活動簡介 *</span><textarea name="summary" rows={3} required defaultValue={event?.summary} /></label>
          <label className="field field-full"><span>活動詳情 *</span><textarea name="description" rows={8} required defaultValue={event?.description} /></label>
          <label className="field"><span>狀態</span><select name="status" defaultValue={event?.status || "draft"}><option value="draft">草稿</option><option value="published">公開</option><option value="cancelled">取消</option></select></label>
          <label className="field checkbox-field"><input type="checkbox" name="is_featured" defaultChecked={event?.is_featured} /><span>設為精選活動</span></label>
        </div>
      </section>

      <section className="admin-form-section">
        <div className="section-heading"><h2>日期、地點及名額</h2><span>系統會按開始時間、名額與截止時間自動控制報名</span></div>
        <div className="form-grid">
          <label className="field"><span>活動開始時間 *</span><input name="start_at" type="datetime-local" required defaultValue={localInput(event?.start_at)} /></label>
          <label className="field"><span>活動結束時間 *</span><input name="end_at" type="datetime-local" required defaultValue={localInput(event?.end_at)} /></label>
          <div className="field field-full">
            <span>開始報名日期 *</span>
            <div className="registration-start-options" role="radiogroup" aria-label="選擇開始報名方式">
              <label className={registrationStartMode === "immediate" ? "selected" : ""}>
                <input type="radio" name="registration_start_mode" value="immediate" checked={registrationStartMode === "immediate"} onChange={() => setRegistrationStartMode("immediate")} />
                <Zap /><span><strong>即時開始</strong><small>儲存並公開活動後可立即接受報名</small></span>
              </label>
              <label className={registrationStartMode === "scheduled" ? "selected" : ""}>
                <input type="radio" name="registration_start_mode" value="scheduled" checked={registrationStartMode === "scheduled"} onChange={() => setRegistrationStartMode("scheduled")} />
                <Clock3 /><span><strong>指定日期及時間</strong><small>系統會於指定時間自動開放報名</small></span>
              </label>
            </div>
          </div>
          <label className="field"><span>指定開始報名時間</span><input name="registration_start_at" type="datetime-local" required={registrationStartMode === "scheduled"} disabled={registrationStartMode === "immediate"} defaultValue={localInput(event?.registration_start_at)} /></label>
          <label className="field"><span>截止報名時間 *</span><input name="registration_deadline" type="datetime-local" required defaultValue={localInput(event?.registration_deadline)} /></label>
          <label className="field"><span>人數上限 *</span><input name="capacity" type="number" min={1} required defaultValue={event?.capacity || 50} /></label>
          <label className="field"><span>活動地點 *</span><input name="location" required defaultValue={event?.location} /></label>
          <label className="field"><span>完整地址</span><input name="address" defaultValue={event?.address || ""} /></label>
        </div>
      </section>

      <section className="admin-form-section">
        <div className="section-heading"><h2>報名方法與聯絡資料</h2><span>最少選擇一種報名方法</span></div>
        <div className="admin-method-checks">
          <label><input type="checkbox" checked={methods.includes("online")} onChange={() => toggleMethod("online")} />網上報名</label>
          <label><input type="checkbox" checked={methods.includes("in_person")} onChange={() => toggleMethod("in_person")} />親身報名</label>
        </div>
        <div className="form-grid">
          <label className="field"><span>聯絡人／部門</span><input name="contact_name" defaultValue={event?.contact_name || ""} /></label>
          <label className="field"><span>查詢電話</span><input name="contact_phone" defaultValue={event?.contact_phone || ""} /></label>
          <label className="field field-full"><span>親身報名地址</span><input name="contact_address" defaultValue={event?.contact_address || ""} /></label>
        </div>
      </section>

      <section className="admin-form-section">
        <div className="section-heading"><h2>活動圖片</h2><span>可使用現有圖片網址或上載至 Supabase Storage</span></div>
        <div className="image-admin-grid">
          <div className="image-upload-card">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={posterUrl} alt="活動海報預覽" />
            <label className="button button-secondary button-small"><ImageUp />上載海報<input type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => e.target.files?.[0] && upload(e.target.files[0], "poster")} /></label>
            <input aria-label="海報圖片網址" value={posterUrl} onChange={(e) => setPosterUrl(e.target.value)} />
          </div>
          <div className="image-upload-card wide">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={heroUrl} alt="活動橫幅預覽" />
            <label className="button button-secondary button-small"><ImageUp />上載橫幅<input type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => e.target.files?.[0] && upload(e.target.files[0], "hero")} /></label>
            <input aria-label="橫幅圖片網址" value={heroUrl} onChange={(e) => setHeroUrl(e.target.value)} />
          </div>
        </div>
        {uploading && <p className="muted"><LoaderCircle className="spin inline-icon" />圖片上載中…</p>}
      </section>

      {error && <div className="notice notice-error"><AlertCircle />{error}</div>}
      <div className="admin-form-actions">
        {event && <button type="button" onClick={remove} className="button button-danger" disabled={saving}><Trash2 />刪除活動</button>}
        <button type="submit" className="button button-primary button-large" disabled={saving || uploading || methods.length === 0}>
          {saving ? <><LoaderCircle className="spin" />儲存中…</> : <><Save />儲存活動</>}
        </button>
      </div>
    </form>
  );
}
