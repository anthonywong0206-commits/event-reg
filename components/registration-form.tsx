"use client";
import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, ArrowRight, Building2, CalendarDays, Clock3, Laptop, LoaderCircle, LockKeyhole } from "lucide-react";
import type { EventRecord, RegistrationMethod } from "@/lib/types";

const dateLabel = new Intl.DateTimeFormat("zh-HK", { timeZone:"Asia/Hong_Kong", month:"long", day:"numeric", weekday:"short" });
const timeLabel = new Intl.DateTimeFormat("zh-HK", { timeZone:"Asia/Hong_Kong", hour:"2-digit", minute:"2-digit", hour12:false });

export function RegistrationForm({ event, initialMethod, inviteAccessToken }: { event: EventRecord; initialMethod: RegistrationMethod; inviteAccessToken?: string | null }) {
  const router = useRouter();
  const activeSessions = useMemo(() => (event.sessions || []).filter((item) => item.is_active && new Date(item.start_at).getTime() > Date.now()).sort((a,b)=>a.start_at.localeCompare(b.start_at)), [event.sessions]);
  const subActivityGroups = useMemo(() => {
    if (!event.sub_activity_mode) return [] as { id: string; name: string; overlap_exempt: boolean; sessions: typeof activeSessions }[];
    const activityById = new Map<string, NonNullable<EventRecord["sub_activities"]>[number]>((event.sub_activities || []).map((activity) => [activity.id, activity]));
    const groups = new Map<string, { id: string; name: string; overlap_exempt: boolean; sessions: typeof activeSessions }>();
    for (const session of activeSessions) {
      const id = String(session.sub_activity_key || "").trim();
      const name = String(session.sub_activity_name || "").trim();
      if (!id || !name) continue;
      const activity = activityById.get(id);
      const current = groups.get(id) || { id, name, overlap_exempt: Boolean(activity?.overlap_exempt || session.sub_activity_overlap_exempt), sessions: [] };
      current.sessions.push(session);
      groups.set(id, current);
    }
    return [...groups.values()];
  }, [activeSessions, event.sub_activity_mode, event.sub_activities]);
  const dateGroups = useMemo(() => {
    const groups = new Map<string, typeof activeSessions>();
    for (const session of activeSessions) groups.set(session.session_date, [...(groups.get(session.session_date)||[]), session]);
    return [...groups.entries()].map(([date,sessions])=>({date,sessions}));
  }, [activeSessions]);
  const firstAvailable = activeSessions.find((item)=>item.confirmed_count < item.capacity) || (event.accepts_waitlist ? activeSessions[0] : undefined);
  const [selectedDate, setSelectedDate] = useState(firstAvailable?.session_date || dateGroups[0]?.date || "");
  const sessionsForDate = dateGroups.find((item)=>item.date===selectedDate)?.sessions || [];
  const [sessionId, setSessionId] = useState(firstAvailable?.id || "");
  const [selectedSubSessions, setSelectedSubSessions] = useState<Record<string,string>>({});
  const selectedSubSessionIds = Object.values(selectedSubSessions);
  const [method, setMethod] = useState<RegistrationMethod>(event.registration_methods.includes(initialMethod) ? initialMethod : event.registration_methods[0]);
  const [error, setError] = useState(""); const [submitting, setSubmitting] = useState(false);

  function chooseDate(date:string){
    setSelectedDate(date);
    const dateSessions=dateGroups.find((item)=>item.date===date)?.sessions||[];
    const next=dateSessions.find((item)=>item.confirmed_count<item.capacity) || (event.accepts_waitlist ? dateSessions[0] : undefined);
    setSessionId(next?.id||"");
  }

  function toggleSubActivitySession(activityId: string, candidateId: string) {
    setError("");
    const currentId = selectedSubSessions[activityId];
    if (currentId === candidateId) {
      setSelectedSubSessions((current) => { const next = { ...current }; delete next[activityId]; return next; });
      return;
    }
    const isNewActivity = !currentId;
    const maxSelections = Math.max(1, Number(event.max_sub_activity_selections || 1));
    if (isNewActivity && Object.keys(selectedSubSessions).length >= maxSelections) {
      setError(`此活動每人最多可選 ${maxSelections} 個子活動。`);
      return;
    }
    const candidate = activeSessions.find((item) => item.id === candidateId);
    if (!candidate) return;
    const candidateActivity = subActivityGroups.find((group) => group.id === activityId);
    const conflict = Object.entries(selectedSubSessions).some(([otherActivityId, otherId]) => {
      if (otherActivityId === activityId) return false;
      const other = activeSessions.find((item) => item.id === otherId);
      const otherActivity = subActivityGroups.find((group) => group.id === otherActivityId);
      if (candidateActivity?.overlap_exempt || otherActivity?.overlap_exempt) return false;
      return Boolean(other && new Date(candidate.start_at).getTime() < new Date(other.end_at).getTime() && new Date(other.start_at).getTime() < new Date(candidate.end_at).getTime());
    });
    if (conflict) {
      setError("所選子活動時段與另一個已選時段重疊，請選擇其他時段。");
      return;
    }
    setSelectedSubSessions((current) => ({ ...current, [activityId]: candidateId }));
  }

  async function handleSubmit(formEvent: FormEvent<HTMLFormElement>) {
    formEvent.preventDefault(); setError(""); setSubmitting(true); const form = new FormData(formEvent.currentTarget);
    const customAnswers: Record<string, string | string[]> = {};
    for (const field of event.custom_registration_fields || []) {
      if (field.type === "multiple_choice") customAnswers[field.id] = form.getAll(`custom_${field.id}`).map(String);
      else customAnswers[field.id] = String(form.get(`custom_${field.id}`) || "");
    }
    const payload = { eventId:event.id, sessionId:event.is_multi_session && !event.sub_activity_mode ? sessionId : null, sessionIds:event.sub_activity_mode ? selectedSubSessionIds : [], fullName:form.get("fullName"), email:form.get("email"), phone:form.get("phone"), method, notes:form.get("notes")||"", customAnswers, consent:form.get("consent")==="on", website:form.get("website")||"" };
    try { const response=await fetch("/api/registrations",{method:"POST",headers:{"Content-Type":"application/json",...(inviteAccessToken?{"X-Event-Invite-Access":inviteAccessToken}:{})},body:JSON.stringify(payload)}); const result=await response.json(); if(!response.ok) throw new Error(result.error||"未能完成報名"); router.push(`/registration/success?token=${encodeURIComponent(result.qr_token)}`); }
    catch(caught){setError(caught instanceof Error?caught.message:"未能完成報名");setSubmitting(false);}
  }
  const selectedSession=activeSessions.find((item)=>item.id===sessionId);
  const joiningWaitlist=event.sub_activity_mode ? selectedSubSessionIds.some((id)=>{ const item=activeSessions.find((session)=>session.id===id); return Boolean(item && item.confirmed_count>=item.capacity && event.accepts_waitlist); }) : event.is_multi_session ? Boolean(selectedSession && selectedSession.confirmed_count>=selectedSession.capacity && event.accepts_waitlist) : Boolean(event.confirmed_count>=event.capacity && event.accepts_waitlist);
  return <form className="registration-form" onSubmit={handleSubmit}>
    {joiningWaitlist&&<div className="notice notice-waitlist"><AlertCircle/><span><strong>現只接受候補登記</strong>候補並不代表成功參加活動；如沒有收到主辦單位進一步通知，則視作未能申請。</span></div>}
    {event.sub_activity_mode && <fieldset className="form-section sub-activity-public-selector"><legend>第一步：選擇子活動及時段</legend>
      <div className="sub-activity-selection-summary"><strong>已選 {selectedSubSessionIds.length} / 最多 {Math.max(1,Number(event.max_sub_activity_selections||1))} 個子活動</strong><span>同一子活動只可選一個時段；標示「時間重疊豁免」的子活動可與其他時段重疊。</span></div>
      <div className="sub-activity-public-list">{subActivityGroups.map((group)=>{const selectedId=selectedSubSessions[group.id];return <article className={selectedId?"sub-activity-public-card selected":"sub-activity-public-card"} key={group.id}><header><strong>{group.name}</strong><small>{group.overlap_exempt?"時間重疊豁免":selectedId?"已選擇 1 個時段":"請選擇一個時段"}</small></header><div className="sub-activity-session-options">{group.sessions.map((session)=>{const remaining=Math.max(0,session.capacity-session.confirmed_count);const checked=selectedId===session.id;return <label key={session.id} className={checked?"sub-activity-session-option selected":"sub-activity-session-option"}><input type="checkbox" checked={checked} disabled={remaining===0&&!event.accepts_waitlist} onChange={()=>toggleSubActivitySession(group.id,session.id)} /><span><b>{dateLabel.format(new Date(`${session.session_date}T12:00:00`))}</b><strong>{timeLabel.format(new Date(session.start_at))}–{timeLabel.format(new Date(session.end_at))}</strong><small>{remaining===0?(event.accepts_waitlist?"只接受候補":"名額已滿"):`尚餘 ${remaining} 位`}</small></span></label>})}</div></article>})}</div>
      {subActivityGroups.length===0&&<div className="notice notice-error">暫時沒有可報名的子活動時段</div>}
    </fieldset>}
    {event.is_multi_session && !event.sub_activity_mode && <fieldset className="form-section"><legend>第一步：選擇活動日期</legend><div className="date-choice-grid">{dateGroups.map(({date,sessions})=>{const capacity=sessions.reduce((sum,item)=>sum+item.capacity,0);const confirmed=sessions.reduce((sum,item)=>sum+item.confirmed_count,0);const remaining=Math.max(0,capacity-confirmed);return <button type="button" key={date} className={selectedDate===date?"date-choice selected":"date-choice"} onClick={()=>chooseDate(date)}><CalendarDays/><span><strong>{dateLabel.format(new Date(`${date}T12:00:00`))}</strong><small>{remaining===0?(event.accepts_waitlist?"現只接受候補":"所有時段已滿"):`當日尚餘 ${remaining} 位`}</small></span></button>})}</div>{dateGroups.length===0&&<div className="notice notice-error">暫時沒有可報名日期</div>}</fieldset>}
    {event.is_multi_session && !event.sub_activity_mode && selectedDate && <fieldset className="form-section"><legend>第二步：選擇時段</legend><div className="session-choice-grid">{sessionsForDate.map((session)=>{const remaining=Math.max(0,session.capacity-session.confirmed_count);return <label key={session.id} className={sessionId===session.id?"session-choice selected":"session-choice"}><input type="radio" name="sessionId" checked={sessionId===session.id} disabled={remaining===0&&!event.accepts_waitlist} onChange={()=>setSessionId(session.id)} /><Clock3/><span><strong>{timeLabel.format(new Date(session.start_at))}–{timeLabel.format(new Date(session.end_at))}</strong><small>{remaining===0?(event.accepts_waitlist?"只接受候補":"名額已滿"):`尚餘 ${remaining} 位`}</small></span></label>})}</div></fieldset>}
    <fieldset className="form-section"><legend>{event.sub_activity_mode?"第二步：選擇報名方法":event.is_multi_session?"第三步：選擇報名方法":"選擇報名方法"}</legend><div className="method-choice-grid">{event.registration_methods.includes("online")&&<label className={method==="online"?"method-choice selected":"method-choice"}><input type="radio" checked={method==="online"} onChange={()=>setMethod("online")}/><Laptop/><span><strong>網上報名</strong><small>即時完成申請</small></span></label>}{event.registration_methods.includes("in_person")&&<label className={method==="in_person"?"method-choice selected":"method-choice"}><input type="radio" checked={method==="in_person"} onChange={()=>setMethod("in_person")}/><Building2/><span><strong>親身報名</strong><small>先預留名額</small></span></label>}</div></fieldset>
    <fieldset className="form-section"><legend>{event.sub_activity_mode?"第三步：參加者資料":event.is_multi_session?"第四步：參加者資料":"參加者資料"}</legend><div className="form-grid"><label className="field field-full"><span>姓名 *</span><input name="fullName" required maxLength={80}/></label><label className="field"><span>聯絡電話 *</span><input name="phone" type="tel" required maxLength={30}/></label><label className="field"><span>電郵地址{event.email_required ? " *" : "（選填）"}</span><input name="email" type="email" required={Boolean(event.email_required)} maxLength={160}/></label><label className="field field-full"><span>備註{event.notes_required ? " *" : ""}</span><textarea name="notes" rows={4} required={Boolean(event.notes_required)} maxLength={500}/></label>
      {(event.custom_registration_fields || []).map((field) => <div className="field field-full custom-registration-public-field" key={field.id}><span>{field.label}{field.required ? " *" : ""}</span>{field.type === "short_text" && <input name={`custom_${field.id}`} required={field.required} maxLength={500}/>} {field.type === "long_text" && <textarea name={`custom_${field.id}`} required={field.required} rows={4} maxLength={2000}/>} {field.type === "select" && <select name={`custom_${field.id}`} required={field.required} defaultValue=""><option value="" disabled>請選擇</option>{(field.options||[]).map((option)=><option key={option} value={option}>{option}</option>)}</select>} {field.type === "single_choice" && <div className="custom-choice-options">{(field.options||[]).map((option)=><label key={option}><input type="radio" name={`custom_${field.id}`} value={option} required={field.required}/><span>{option}</span></label>)}</div>} {field.type === "multiple_choice" && <div className="custom-choice-options">{(field.options||[]).map((option)=><label key={option}><input type="checkbox" name={`custom_${field.id}`} value={option}/><span>{option}</span></label>)}</div>}</div>)}
      <label className="honeypot"><input name="website" tabIndex={-1}/></label></div></fieldset>
    <label className="consent-row"><input type="checkbox" name="consent" required/><span>我同意系統收集以上資料作活動報名及聯絡用途。</span></label>{error&&<div className="notice notice-error"><AlertCircle/>{error}</div>}<div className="form-submit-row"><span className="privacy-note"><LockKeyhole/>資料會經加密連線傳送</span><button className="button button-primary button-large" disabled={submitting||(event.sub_activity_mode?selectedSubSessionIds.length===0:(event.is_multi_session&&!sessionId))}>{submitting?<><LoaderCircle className="spin"/>處理中…</>:<>{joiningWaitlist?"提交候補登記":"提交報名"}<ArrowRight/></>}</button></div>
  </form>;
}
