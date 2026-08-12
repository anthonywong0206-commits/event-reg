"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, CheckCircle2, ImageUp, LoaderCircle, Save } from "lucide-react";
import type { EventRecord, HeroButtonLinkType, HeroButtonPosition, SiteSettingsRecord } from "@/lib/types";

export function AdminSiteSettingsForm({ settings, events }: { settings: SiteSettingsRecord; events: EventRecord[] }) {
  const router = useRouter();
  const [imageUrl, setImageUrl] = useState(settings.hero_image_url);
  const [buttonEnabled, setButtonEnabled] = useState(settings.hero_button_enabled);
  const [buttonLinkType, setButtonLinkType] = useState<HeroButtonLinkType>(settings.hero_button_link_type);
  const [buttonPosition, setButtonPosition] = useState<HeroButtonPosition>(settings.hero_button_position);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const activityOptions = useMemo(
    () => events.filter((event) => event.status !== "cancelled"),
    [events],
  );

  async function upload(file: File) {
    setUploading(true);
    setError("");
    setSuccess("");
    const body = new FormData();
    body.append("file", file);

    try {
      const response = await fetch("/api/admin/site-settings/upload", { method: "POST", body });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "橫額圖片上載失敗");
      setImageUrl(result.url);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "橫額圖片上載失敗");
    } finally {
      setUploading(false);
    }
  }

  async function submit(formEvent: FormEvent<HTMLFormElement>) {
    formEvent.preventDefault();
    setSaving(true);
    setError("");
    setSuccess("");
    const form = new FormData(formEvent.currentTarget);

    try {
      const response = await fetch("/api/admin/site-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          hero_title: String(form.get("hero_title") || "").trim(),
          hero_description: String(form.get("hero_description") || "").trim(),
          hero_image_url: imageUrl.trim(),
          hero_image_alt: String(form.get("hero_image_alt") || "").trim(),
          hero_button_enabled: buttonEnabled,
          hero_button_label: String(form.get("hero_button_label") || "").trim() || "立即報名",
          hero_button_position: buttonPosition,
          hero_button_link_type: buttonLinkType,
          hero_button_event_slug: String(form.get("hero_button_event_slug") || "").trim() || null,
          hero_button_external_url: String(form.get("hero_button_external_url") || "").trim() || null,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "未能更新首頁橫額");
      setSuccess("首頁橫額已更新，重新開啟首頁即可查看最新內容。");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "未能更新首頁橫額");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="admin-event-form site-settings-form" onSubmit={submit}>
      <section className="admin-form-section">
        <div className="section-heading">
          <h2>橫額文字</h2>
          <span>此內容只會更新首頁頂部，不會修改任何活動。</span>
        </div>
        <div className="form-grid">
          <label className="field field-full">
            <span>首頁主標題 *</span>
            <textarea name="hero_title" rows={3} required maxLength={240} defaultValue={settings.hero_title} />
            <small>可使用換行控制標題分行方式。</small>
          </label>
          <label className="field field-full">
            <span>說明文字 *</span>
            <textarea name="hero_description" rows={4} required maxLength={800} defaultValue={settings.hero_description} />
          </label>
        </div>
      </section>

      <section className="admin-form-section">
        <div className="section-heading">
          <h2>橫額圖片</h2>
          <span>建議使用 1920 × 1080（16:9）圖片；JPG、PNG 或 WebP，最大 8MB。</span>
        </div>
        <div className="homepage-banner-admin">
          <div className="image-upload-card wide homepage-banner-preview homepage-banner-preview-16x9">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={imageUrl} alt="首頁橫額預覽" />
            <div className="banner-upload-actions">
              <label className="button button-secondary button-small">
                <ImageUp />上載新圖片
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  hidden
                  onChange={(event) => event.target.files?.[0] && upload(event.target.files[0])}
                />
              </label>
              {uploading && <span className="muted"><LoaderCircle className="spin inline-icon" />上載中…</span>}
            </div>
            <label className="field compact-field">
              <span>圖片網址 *</span>
              <input value={imageUrl} onChange={(event) => setImageUrl(event.target.value)} required />
            </label>
            <label className="field compact-field">
              <span>圖片替代文字 *</span>
              <input name="hero_image_alt" required maxLength={240} defaultValue={settings.hero_image_alt} />
            </label>
          </div>
        </div>
      </section>

      <section className="admin-form-section">
        <div className="section-heading">
          <h2>快捷按鈕</h2>
          <span>可在首頁橫額上顯示快捷按鈕，連結指定活動或外部連結；按鈕可置於左方、中央或右方。</span>
        </div>
        <div className="form-grid">
          <label className="field field-full toggle-row">
            <span>啟用快捷按鈕</span>
            <input type="checkbox" checked={buttonEnabled} onChange={(event) => setButtonEnabled(event.target.checked)} />
          </label>
          <label className="field">
            <span>按鈕文字</span>
            <input name="hero_button_label" maxLength={80} defaultValue={settings.hero_button_label || "立即報名"} disabled={!buttonEnabled} />
          </label>
          <label className="field">
            <span>按鈕位置</span>
            <select value={buttonPosition} disabled={!buttonEnabled} onChange={(event) => setButtonPosition(event.target.value as HeroButtonPosition)}>
              <option value="left">左方</option>
              <option value="center">中央</option>
              <option value="right">右方</option>
            </select>
          </label>
          <label className="field">
            <span>連結類型</span>
            <select value={buttonLinkType} disabled={!buttonEnabled} onChange={(event) => setButtonLinkType(event.target.value as HeroButtonLinkType)}>
              <option value="event">指定活動</option>
              <option value="external">外部連結</option>
            </select>
          </label>
          {buttonLinkType === "event" ? (
            <label className="field field-full">
              <span>指定活動</span>
              <select name="hero_button_event_slug" defaultValue={settings.hero_button_event_slug || ""} disabled={!buttonEnabled}>
                <option value="">請選擇活動</option>
                {activityOptions.map((event) => (
                  <option key={event.id} value={event.slug}>{event.title}（{event.status === "published" ? "已發佈" : "草稿"}）</option>
                ))}
              </select>
              <small>使用者點擊後會直接開啟該活動詳情頁。</small>
            </label>
          ) : (
            <label className="field field-full">
              <span>外部連結網址</span>
              <input name="hero_button_external_url" type="url" placeholder="https://example.com" defaultValue={settings.hero_button_external_url || ""} disabled={!buttonEnabled} />
              <small>請輸入完整網址，包括 http:// 或 https://。</small>
            </label>
          )}
        </div>
      </section>

      {error && <div className="notice notice-error"><AlertCircle />{error}</div>}
      {success && <div className="notice notice-success"><CheckCircle2 />{success}</div>}
      <div className="admin-form-actions">
        <button type="submit" className="button button-primary button-large" disabled={saving || uploading}>
          {saving ? <><LoaderCircle className="spin" />儲存中…</> : <><Save />儲存首頁橫額</>}
        </button>
      </div>
    </form>
  );
}
