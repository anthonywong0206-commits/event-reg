"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, CheckCircle2, ImageUp, LoaderCircle, Save } from "lucide-react";
import type { SiteSettingsRecord } from "@/lib/types";

export function AdminSiteSettingsForm({ settings }: { settings: SiteSettingsRecord }) {
  const router = useRouter();
  const [imageUrl, setImageUrl] = useState(settings.hero_image_url);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

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
          <span>此內容只會更新首頁頂部，不會修改任何活動</span>
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
          <span>建議使用橫向圖片；JPG、PNG 或 WebP，最大 8MB</span>
        </div>
        <div className="homepage-banner-admin">
          <div className="image-upload-card wide homepage-banner-preview">
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
