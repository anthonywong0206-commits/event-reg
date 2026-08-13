"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, CalendarDays, CalendarPlus, Clock3, ImageUp, KeyRound, LoaderCircle, Plus, RefreshCw, Save, Trash2, Zap } from "lucide-react";
import type { EventRecord, EventSessionRecord, RegistrationMethod } from "@/lib/types";

function localInput(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
}

const hongKongTimeFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Hong_Kong",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

function hongKongTime(value?: string | null) {
  if (!value) return "";
  return hongKongTimeFormatter.format(new Date(value));
}

function hongKongSessionIso(sessionDate: string, time: string) {
  return new Date(`${sessionDate}T${time}:00+08:00`).toISOString();
}

type SessionDraft = Pick<EventSessionRecord, "id" | "session_date" | "start_at" | "end_at" | "capacity" | "confirmed_count" | "sort_order" | "is_active">;

type IntervalGeneratorDraft = {
  startTime: string;
  endTime: string;
  intervalMinutes: number;
  capacity: number;
};

type InferredIntervalBlock = IntervalGeneratorDraft & {
  slotCount: number;
};

function minutesToTime(totalMinutes: number) {
  const normalized = ((totalMinutes % 1440) + 1440) % 1440;
  const hours = Math.floor(normalized / 60);
  const minutes = normalized % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function timeToMinutes(value: string) {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

function dateTimeForSession(sessionDate: string, time: string) {
  return new Date(hongKongSessionIso(sessionDate, time));
}

function defaultSession(): SessionDraft {
  const date = new Date();
  date.setDate(date.getDate() + 14);
  const sessionDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Hong_Kong", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
  return { id: crypto.randomUUID(), session_date: sessionDate, start_at: hongKongSessionIso(sessionDate, "10:00"), end_at: hongKongSessionIso(sessionDate, "12:00"), capacity: 20, confirmed_count: 0, sort_order: 0, is_active: true };
}

export function AdminEventForm({ event, forceMulti = false }: { event?: EventRecord | null; forceMulti?: boolean }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [posterUrl, setPosterUrl] = useState(event?.poster_image_url || "/images/ocean-poster.jpg");
  const [heroUrl, setHeroUrl] = useState(event?.hero_image_url || "/images/hero-community.jpg");
  const [methods, setMethods] = useState<RegistrationMethod[]>(event?.registration_methods || ["online", "in_person"]);
  const isMulti = forceMulti || Boolean(event?.is_multi_session);
  const [sessions, setSessions] = useState<SessionDraft[]>(event?.sessions?.length ? event.sessions.map((item) => ({
    ...item,
    start_at: hongKongSessionIso(item.session_date, hongKongTime(item.start_at)),
    end_at: hongKongSessionIso(item.session_date, hongKongTime(item.end_at)),
  })) : isMulti ? [defaultSession()] : []);
  const totalSessionCapacity = useMemo(() => sessions.reduce((sum, item) => sum + Number(item.capacity || 0), 0), [sessions]);
  const [registrationStartMode, setRegistrationStartMode] = useState<"immediate" | "scheduled">(
    event && new Date(event.registration_start_at).getTime() > Date.now() ? "scheduled" : "immediate",
  );
  const [registrationVisibility, setRegistrationVisibility] = useState<"public" | "private">(event?.registration_visibility === "private" ? "private" : "public");
  const [inviteCode, setInviteCode] = useState("");
  const [intervalGenerators, setIntervalGenerators] = useState<Record<string, IntervalGeneratorDraft>>({});

  function generateInviteCode() {
    const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    const bytes = new Uint32Array(8);
    crypto.getRandomValues(bytes);
    setInviteCode(Array.from(bytes, (value) => alphabet[value % alphabet.length]).join(""));
  }

  const sessionDates = useMemo(() => [...new Set(sessions.map((item) => item.session_date))].sort(), [sessions]);

  function addDate() {
    const next = defaultSession();
    const lastDate = sessionDates.at(-1);
    if (lastDate) {
      const date = new Date(`${lastDate}T12:00:00`);
      date.setDate(date.getDate() + 1);
      const nextDate = date.toISOString().slice(0, 10);
      next.session_date = nextDate;
      next.start_at = hongKongSessionIso(nextDate, "10:00");
      next.end_at = hongKongSessionIso(nextDate, "12:00");
    }
    setSessions((current) => [...current, { ...next, sort_order: current.length }]);
  }

  function addSessionForDate(sessionDate: string) {
    const sameDate = sessions.filter((item) => item.session_date === sessionDate).sort((a,b)=>a.start_at.localeCompare(b.start_at));
    const previous = sameDate.at(-1);
    const startTime = previous ? hongKongTime(previous.end_at) : "10:00";
    const startMinutes = timeToMinutes(startTime);
    const endTime = minutesToTime(Math.min(startMinutes + 120, 23 * 60 + 59));
    const next = defaultSession();
    next.session_date = sessionDate;
    next.start_at = hongKongSessionIso(sessionDate, startTime);
    next.end_at = hongKongSessionIso(sessionDate, endTime);
    setSessions((current) => [...current, { ...next, sort_order: current.length }]);
  }

  function updateDate(oldDate: string, newDate: string) {
    setSessions((current) => current.map((item) => {
      if (item.session_date !== oldDate) return item;
      return {
        ...item,
        session_date: newDate,
        start_at: hongKongSessionIso(newDate, hongKongTime(item.start_at)),
        end_at: hongKongSessionIso(newDate, hongKongTime(item.end_at)),
      };
    }));
    setIntervalGenerators((current) => {
      if (!current[oldDate]) return current;
      const next = { ...current, [newDate]: current[oldDate] };
      delete next[oldDate];
      return next;
    });
  }

  function removeDate(sessionDate: string) {
    if (sessionDates.length === 1) return;
    setSessions((current) => current.filter((item) => item.session_date !== sessionDate));
  }

  function updateSession(index: number, patch: Partial<SessionDraft>) {
    setSessions((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item));
  }

  function removeSession(index: number) {
    setSessions((current) => current.filter((_, itemIndex) => itemIndex !== index));
  }

  function inferIntervalBlocks(dateSessions: SessionDraft[]): InferredIntervalBlock[] {
    const ordered = [...dateSessions].sort((a, b) => a.start_at.localeCompare(b.start_at));
    const blocks: InferredIntervalBlock[] = [];
    for (const session of ordered) {
      const startTime = hongKongTime(session.start_at);
      const endTime = hongKongTime(session.end_at);
      const intervalMinutes = timeToMinutes(endTime) - timeToMinutes(startTime);
      if (intervalMinutes <= 0) continue;
      const previous = blocks.at(-1);
      if (previous && previous.endTime === startTime && previous.intervalMinutes === intervalMinutes && previous.capacity === Number(session.capacity)) {
        previous.endTime = endTime;
        previous.slotCount += 1;
      } else {
        blocks.push({ startTime, endTime, intervalMinutes, capacity: Number(session.capacity), slotCount: 1 });
      }
    }
    return blocks;
  }

  function getIntervalGenerator(sessionDate: string, dateSessions: SessionDraft[]): IntervalGeneratorDraft {
    const existing = intervalGenerators[sessionDate];
    if (existing) return existing;
    if (event) {
      const inferred = inferIntervalBlocks(dateSessions)[0];
      if (inferred) {
        return { startTime: inferred.startTime, endTime: inferred.endTime, intervalMinutes: inferred.intervalMinutes, capacity: inferred.capacity };
      }
    }
    const latest = [...dateSessions].sort((a, b) => a.end_at.localeCompare(b.end_at)).at(-1);
    const startTime = latest ? hongKongTime(latest.end_at) : "10:00";
    const startMinutes = timeToMinutes(startTime);
    return {
      startTime,
      endTime: minutesToTime(Math.min(startMinutes + 120, 23 * 60 + 59)),
      intervalMinutes: 15,
      capacity: 20,
    };
  }

  function updateIntervalGenerator(sessionDate: string, dateSessions: SessionDraft[], patch: Partial<IntervalGeneratorDraft>) {
    setIntervalGenerators((current) => ({
      ...current,
      [sessionDate]: { ...getIntervalGenerator(sessionDate, dateSessions), ...patch },
    }));
  }

  function generateIntervalSessions(sessionDate: string, dateSessions: SessionDraft[]) {
    setError("");
    const generator = getIntervalGenerator(sessionDate, dateSessions);
    const interval = Number(generator.intervalMinutes);
    const capacity = Number(generator.capacity);
    const startMinutes = timeToMinutes(generator.startTime);
    const endMinutes = timeToMinutes(generator.endTime);

    if (!Number.isInteger(interval) || interval < 1 || interval > 720) {
      setError("節數間隔必須為 1 至 720 分鐘的整數");
      return;
    }
    if (!Number.isInteger(capacity) || capacity < 1 || capacity > 100000) {
      setError("每節名額必須為 1 至 100000 人");
      return;
    }
    if (endMinutes <= startMinutes) {
      setError("批量產生時段的結束時間必須遲於開始時間");
      return;
    }
    const duration = endMinutes - startMinutes;
    if (duration % interval !== 0) {
      setError(`時間區段共 ${duration} 分鐘，未能完整分成每 ${interval} 分鐘一節。請調整結束時間或節數間隔。`);
      return;
    }

    const blockStart = dateTimeForSession(sessionDate, generator.startTime).getTime();
    const blockEnd = dateTimeForSession(sessionDate, generator.endTime).getTime();
    const overlapping = dateSessions.filter((session) => {
      const sessionStart = new Date(session.start_at).getTime();
      const sessionEnd = new Date(session.end_at).getTime();
      return sessionStart < blockEnd && sessionEnd > blockStart;
    });
    const bookedOverlap = overlapping.find((session) => Number(session.confirmed_count || 0) > 0);
    if (bookedOverlap) {
      setError(`所選時間區段與已有參加者的時段 ${hongKongTime(bookedOverlap.start_at)}–${hongKongTime(bookedOverlap.end_at)} 重疊。為保障報名資料，請先調整時間區段。`);
      return;
    }

    const generated: SessionDraft[] = [];
    for (let cursor = startMinutes; cursor < endMinutes; cursor += interval) {
      const slotStart = dateTimeForSession(sessionDate, minutesToTime(cursor));
      const slotEnd = dateTimeForSession(sessionDate, minutesToTime(cursor + interval));
      generated.push({
        id: crypto.randomUUID(),
        session_date: sessionDate,
        start_at: slotStart.toISOString(),
        end_at: slotEnd.toISOString(),
        capacity,
        confirmed_count: 0,
        sort_order: 0,
        is_active: true,
      });
    }

    const overlappingIds = new Set(overlapping.map((session) => session.id));
    setSessions((current) => {
      const preserved = current.filter((session) => !overlappingIds.has(session.id));
      return [...preserved, ...generated]
        .sort((a, b) => a.start_at.localeCompare(b.start_at))
        .map((session, index) => ({ ...session, sort_order: index }));
    });

    const nextStart = generator.endTime;
    const nextStartMinutes = endMinutes;
    const nextEndMinutes = Math.min(nextStartMinutes + Math.max(60, duration), 23 * 60 + 59);
    setIntervalGenerators((current) => ({
      ...current,
      [sessionDate]: {
        ...generator,
        startTime: nextStart,
        endTime: minutesToTime(nextEndMinutes),
      },
    }));
  }

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
    if (isMulti && sessions.length === 0) { setError("請最少建立一個活動時段"); setSaving(false); return; }
    const normalizedSessions = sessions.map((session, index) => ({
      ...(event?.sessions?.some((item) => item.id === session.id) ? { id: session.id } : {}),
      session_date: session.session_date,
      start_at: hongKongSessionIso(session.session_date, hongKongTime(session.start_at)),
      end_at: hongKongSessionIso(session.session_date, hongKongTime(session.end_at)),
      capacity: Number(session.capacity),
      sort_order: index,
      is_active: session.is_active,
    }));
    const invalidSession = normalizedSessions.find((item) => new Date(item.end_at).getTime() <= new Date(item.start_at).getTime());
    if (invalidSession) {
      setError(`${invalidSession.session_date} 有時段的結束時間必須遲於開始時間`);
      setSaving(false);
      return;
    }
    const sortedStarts = normalizedSessions.map((item) => item.start_at).sort();
    const sortedEnds = normalizedSessions.map((item) => item.end_at).sort();
    const startAtIso = isMulti ? sortedStarts[0] : new Date(value("start_at")).toISOString();
    const endAtIso = isMulti ? sortedEnds.at(-1)! : new Date(value("end_at")).toISOString();
    const registrationDeadlineIso = new Date(value("registration_deadline")).toISOString();
    let registrationStartAtIso: string;
    if (registrationStartMode === "immediate") {
      if (new Date(registrationDeadlineIso).getTime() <= Date.now()) {
        registrationStartAtIso = registrationDeadlineIso;
      } else if (event?.registration_start_at && new Date(event.registration_start_at).getTime() <= Date.now()) {
        registrationStartAtIso = new Date(event.registration_start_at).toISOString();
      } else {
        registrationStartAtIso = new Date().toISOString();
      }
    } else {
      registrationStartAtIso = new Date(value("registration_start_at")).toISOString();
    }
    const payload = {
      title: value("title"),
      slug: value("slug"),
      subtitle: value("subtitle") || null,
      summary: value("summary"),
      description: value("description"),
      category: value("category"),
      location: value("location"),
      address: value("address") || null,
      start_at: startAtIso,
      end_at: endAtIso,
      registration_start_at: registrationStartAtIso,
      registration_deadline: registrationDeadlineIso,
      capacity: isMulti ? totalSessionCapacity : Number(form.get("capacity")),
      status: value("status"),
      registration_methods: methods,
      hero_image_url: heroUrl,
      poster_image_url: posterUrl,
      contact_name: value("contact_name") || null,
      contact_phone: value("contact_phone") || null,
      contact_address: value("contact_address") || null,
      is_featured: form.get("is_featured") === "on",
      accepts_waitlist: form.get("accepts_waitlist") === "on",
      registration_visibility: registrationVisibility,
      invite_code: registrationVisibility === "private" ? (inviteCode.trim() || null) : null,
      is_multi_session: isMulti,
      sessions: normalizedSessions,
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
      {event && <div className="notice notice-info event-edit-notice"><AlertCircle /><div><strong>現正編輯已建立活動</strong><span>你可以修改以下所有活動資料，包括活動內容、日期時間、名額及候補設定。名額只不可低於目前已確認人數。</span></div></div>}

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

      <section className="admin-form-section event-access-settings">
        <div className="section-heading"><h2>報名存取方式</h2><span>設定活動是否需要邀請碼才可進入報名表。</span></div>
        <div className="registration-visibility-options" role="radiogroup" aria-label="活動報名存取方式">
          <label className={registrationVisibility === "public" ? "selected" : ""}>
            <input type="radio" name="registration_visibility" value="public" checked={registrationVisibility === "public"} onChange={() => setRegistrationVisibility("public")} />
            <span><strong>公開報名</strong><small>與現時一樣，任何人都可進入活動報名頁。</small></span>
          </label>
          <label className={registrationVisibility === "private" ? "selected" : ""}>
            <input type="radio" name="registration_visibility" value="private" checked={registrationVisibility === "private"} onChange={() => setRegistrationVisibility("private")} />
            <span><strong>非公開報名</strong><small>用戶必須先輸入正確邀請碼，才可進入報名表。</small></span>
          </label>
        </div>
        {registrationVisibility === "private" && (
          <div className="private-invite-code-panel">
            <div className="private-invite-code-heading"><KeyRound /><div><strong>活動邀請碼</strong><small>{event?.invite_code_configured ? "此活動已有邀請碼。留空會保留原有邀請碼；輸入或重新產生會取代舊碼。" : "請設定邀請碼，或使用系統自動產生。"}</small></div></div>
            <div className="invite-code-editor">
              <label className="field"><span>{event?.invite_code_configured ? "新邀請碼（選填）" : "邀請碼 *"}</span><input value={inviteCode} onChange={(e) => setInviteCode(e.target.value)} minLength={4} maxLength={40} placeholder={event?.invite_code_configured ? "留空沿用原邀請碼" : "最少 4 個字元"} /></label>
              <button type="button" className="button button-secondary" onClick={generateInviteCode}><RefreshCw />產生邀請碼</button>
            </div>
            {inviteCode && <div className="generated-invite-code"><span>目前設定的新邀請碼</span><strong>{inviteCode}</strong><small>請在儲存活動後將此邀請碼提供給獲邀人士。</small></div>}
          </div>
        )}
      </section>

      <section className="admin-form-section">
        <div className="section-heading"><h2>日期、地點及名額</h2><span>系統會按開始時間、名額與截止時間自動控制報名</span></div>
        <div className="form-grid">
          {!isMulti && <><label className="field"><span>活動開始時間 *</span><input name="start_at" type="datetime-local" required defaultValue={localInput(event?.start_at)} /></label>
          <label className="field"><span>活動結束時間 *</span><input name="end_at" type="datetime-local" required defaultValue={localInput(event?.end_at)} /></label></>}
          <div className="field field-full">
            <span>開始報名日期 *</span>
            <div className="registration-start-options" role="radiogroup" aria-label="選擇開始報名方式">
              <label className={registrationStartMode === "immediate" ? "selected" : ""}>
                <input type="radio" name="registration_start_mode" value="immediate" checked={registrationStartMode === "immediate"} onChange={() => setRegistrationStartMode("immediate")} />
                <Zap /><span><strong>即時開始</strong><small>儲存並公開活動後可立即接受報名；如建立過往活動，系統會自動以截止報名時間作為開始報名時間。</small></span>
              </label>
              <label className={registrationStartMode === "scheduled" ? "selected" : ""}>
                <input type="radio" name="registration_start_mode" value="scheduled" checked={registrationStartMode === "scheduled"} onChange={() => setRegistrationStartMode("scheduled")} />
                <Clock3 /><span><strong>指定日期及時間</strong><small>系統會於指定時間自動開放報名</small></span>
              </label>
            </div>
          </div>
          <label className="field"><span>指定開始報名時間</span><input name="registration_start_at" type="datetime-local" required={registrationStartMode === "scheduled"} disabled={registrationStartMode === "immediate"} defaultValue={localInput(event?.registration_start_at)} /></label>
          <label className="field"><span>截止報名時間 *</span><input name="registration_deadline" type="datetime-local" required defaultValue={localInput(event?.registration_deadline)} /></label>
          {!isMulti && <label className="field"><span>人數上限 *</span><input name="capacity" type="number" min={Math.max(1, event?.confirmed_count || 0)} required defaultValue={event?.capacity || 50} /><small>{event ? `目前已確認 ${event.confirmed_count} 人；可增加名額，最低不可少於 ${event.confirmed_count} 人。` : "設定活動可接受的正選人數。"}</small></label>}
          {isMulti && <div className="field"><span>全部時段總名額</span><strong className="session-capacity-total">{totalSessionCapacity} 人</strong></div>}
          <label className="field checkbox-field field-full waitlist-setting-field"><input type="checkbox" name="accepts_waitlist" defaultChecked={Boolean(event?.accepts_waitlist)} /><span><strong>正選滿額後接受候補登記</strong><small>可隨時開啟或關閉。開啟後，正選滿額時前台只顯示「現只接受候補」，不會顯示候補人數；關閉後滿額即停止報名。</small></span></label>
          <label className="field"><span>活動地點 *</span><input name="location" required defaultValue={event?.location} /></label>
          <label className="field"><span>完整地址</span><input name="address" defaultValue={event?.address || ""} /></label>
        </div>
      </section>

      {isMulti && <section className="admin-form-section multi-session-builder">
        <div className="section-heading"><div><h2>活動日期及時段</h2><span>可手動新增時段，或按開始時間、結束時間及節數間隔批量產生時段</span></div><button type="button" className="button button-secondary button-small" onClick={addDate}><CalendarPlus />新增日期</button></div>
        <div className="multi-date-editor-list">
          {sessionDates.map((sessionDate, dateIndex) => {
            const dateSessions = sessions.filter((item) => item.session_date === sessionDate).sort((a,b)=>a.start_at.localeCompare(b.start_at));
            const dateCapacity = dateSessions.reduce((sum,item)=>sum+Number(item.capacity||0),0);
            return <article className="multi-date-editor-card" key={sessionDate}>
              <header className="multi-date-editor-header">
                <div><CalendarDays /><label><span>活動日期 {dateIndex + 1}</span><input type="date" value={sessionDate} onChange={(e)=>updateDate(sessionDate,e.target.value)} required /></label><strong>當日總名額 {dateCapacity} 人</strong></div>
                <div><button type="button" className="button button-secondary button-small" onClick={()=>addSessionForDate(sessionDate)}><Plus />新增時段</button><button type="button" className="icon-button danger" onClick={()=>removeDate(sessionDate)} disabled={sessionDates.length===1}><Trash2 /></button></div>
              </header>
              {(() => {
                const generator = getIntervalGenerator(sessionDate, dateSessions);
                const savedBlocks = inferIntervalBlocks(dateSessions);
                const duration = Math.max(0, timeToMinutes(generator.endTime) - timeToMinutes(generator.startTime));
                const slotCount = generator.intervalMinutes > 0 && duration > 0 && duration % generator.intervalMinutes === 0 ? duration / generator.intervalMinutes : 0;
                return <div className="interval-session-generator">
                  <div className="interval-session-generator-heading">
                    <div><Clock3 /><span><strong>按節數間隔快速產生時段</strong><small>同一日可重複使用不同設定，例如 12:00–14:00 每 15 分鐘，再設定 14:00–16:00 每 30 分鐘。</small></span></div>
                    {slotCount > 0 && <b>將產生 {slotCount} 節</b>}
                  </div>
                  {event && savedBlocks.length > 0 && <div className="saved-interval-blocks">
                    <strong>目前已儲存的節數設定</strong>
                    <div>
                      {savedBlocks.map((block, blockIndex) => <button
                        type="button"
                        key={`${block.startTime}-${block.endTime}-${blockIndex}`}
                        className="saved-interval-block"
                        onClick={() => updateIntervalGenerator(sessionDate, dateSessions, { startTime: block.startTime, endTime: block.endTime, intervalMinutes: block.intervalMinutes, capacity: block.capacity })}
                      >
                        <span>{block.startTime}–{block.endTime}</span>
                        <small>每 {block.intervalMinutes} 分鐘 · {block.slotCount} 節 · 每節 {block.capacity} 人</small>
                      </button>)}
                    </div>
                    <small>點擊任何一組即可載入到下方修改。重新儲存後會按活動日期及香港時間完整保留。</small>
                  </div>}
                  <div className="interval-session-generator-grid">
                    <label className="field"><span>開始時間</span><input type="time" value={generator.startTime} onChange={(e) => updateIntervalGenerator(sessionDate, dateSessions, { startTime: e.target.value })} /></label>
                    <label className="field"><span>結束時間</span><input type="time" value={generator.endTime} onChange={(e) => updateIntervalGenerator(sessionDate, dateSessions, { endTime: e.target.value })} /></label>
                    <label className="field"><span>節數間隔（分鐘）</span><input type="number" min={1} max={720} step={1} value={generator.intervalMinutes} onChange={(e) => updateIntervalGenerator(sessionDate, dateSessions, { intervalMinutes: Number(e.target.value) })} /></label>
                    <label className="field"><span>每節名額</span><input type="number" min={1} max={100000} step={1} value={generator.capacity} onChange={(e) => updateIntervalGenerator(sessionDate, dateSessions, { capacity: Number(e.target.value) })} /></label>
                    <button type="button" className="button button-primary interval-generate-button" onClick={() => generateIntervalSessions(sessionDate, dateSessions)}><Plus />產生時段</button>
                  </div>
                  <small className="interval-generator-note">如所選區段與未有人報名的既有時段重疊，系統會以新產生的節數取代；如重疊時段已有參加者，系統會停止操作以保障報名資料。</small>
                </div>;
              })()}
              <div className="date-session-editor-list">
                {dateSessions.map((session, sessionIndex) => {
                  const index = sessions.findIndex((item)=>item.id===session.id);
                  return <section className="date-session-editor-row" key={session.id}>
                    <strong>時段 {sessionIndex + 1}</strong>
                    <label className="field"><span>開始時間 *</span><input type="time" value={hongKongTime(session.start_at)} onChange={(e) => updateSession(index,{start_at:hongKongSessionIso(session.session_date,e.target.value)})} required /></label>
                    <label className="field"><span>結束時間 *</span><input type="time" value={hongKongTime(session.end_at)} onChange={(e) => updateSession(index,{end_at:hongKongSessionIso(session.session_date,e.target.value)})} required /></label>
                    <label className="field"><span>人數上限 *</span><input type="number" min={Math.max(1, session.confirmed_count || 0)} value={session.capacity} onChange={(e) => updateSession(index,{capacity:Number(e.target.value)})} required /><small>{event ? `已確認 ${session.confirmed_count || 0} 人；可增加名額。` : "此時段正選名額"}</small></label>
                    <label className="field checkbox-field"><input type="checkbox" checked={session.is_active} onChange={(e) => updateSession(index,{is_active:e.target.checked})} /><span>開放</span></label>
                    <button type="button" className="icon-button danger" onClick={() => removeSession(index)} disabled={sessions.length === 1 || dateSessions.length === 1}><Trash2 /></button>
                  </section>;
                })}
              </div>
            </article>;
          })}
        </div>
      </section>}

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
