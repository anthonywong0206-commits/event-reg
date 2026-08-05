"use client";
import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, ArrowRight, Building2, CalendarDays, Clock3, Laptop, LoaderCircle, LockKeyhole } from "lucide-react";
import type { EventRecord, RegistrationMethod } from "@/lib/types";

const dateLabel = new Intl.DateTimeFormat("zh-HK", { timeZone:"Asia/Hong_Kong", month:"long", day:"numeric", weekday:"short" });
const timeLabel = new Intl.DateTimeFormat("zh-HK", { timeZone:"Asia/Hong_Kong", hour:"2-digit", minute:"2-digit", hour12:false });

export function RegistrationForm({ event, initialMethod }: { event: EventRecord; initialMethod: RegistrationMethod }) {
  const router = useRouter();
  const activeSessions = useMemo(() => (event.sessions || []).filter((item) => item.is_active && new Date(item.start_at).getTime() > Date.now()).sort((a,b)=>a.start_at.localeCompare(b.start_at)), [event.sessions]);
  const dateGroups = useMemo(() => {
    const groups = new Map<string, typeof activeSessions>();
    for (const session of activeSessions) groups.set(session.session_date, [...(groups.get(session.session_date)||[]), session]);
    return [...groups.entries()].map(([date,sessions])=>({date,sessions}));
  }, [activeSessions]);
  const firstAvailable = activeSessions.find((item)=>item.confirmed_count < item.capacity);
  const [selectedDate, setSelectedDate] = useState(firstAvailable?.session_date || dateGroups[0]?.date || "");
  const sessionsForDate = dateGroups.find((item)=>item.date===selectedDate)?.sessions || [];
  const [sessionId, setSessionId] = useState(firstAvailable?.id || "");
  const [method, setMethod] = useState<RegistrationMethod>(event.registration_methods.includes(initialMethod) ? initialMethod : event.registration_methods[0]);
  const [error, setError] = useState(""); const [submitting, setSubmitting] = useState(false);

  function chooseDate(date:string){
    setSelectedDate(date);
    const next=(dateGroups.find((item)=>item.date===date)?.sessions||[]).find((item)=>item.confirmed_count<item.capacity);
    setSessionId(next?.id||"");
  }

  async function handleSubmit(formEvent: FormEvent<HTMLFormElement>) {
    formEvent.preventDefault(); setError(""); setSubmitting(true); const form = new FormData(formEvent.currentTarget);
    const payload = { eventId:event.id, sessionId:event.is_multi_session ? sessionId : null, fullName:form.get("fullName"), email:form.get("email"), phone:form.get("phone"), method, notes:form.get("notes")||"", consent:form.get("consent")==="on", website:form.get("website")||"" };
    try { const response=await fetch("/api/registrations",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)}); const result=await response.json(); if(!response.ok) throw new Error(result.error||"未能完成報名"); router.push(`/registration/success?token=${encodeURIComponent(result.qr_token)}`); }
    catch(caught){setError(caught instanceof Error?caught.message:"未能完成報名");setSubmitting(false);}
  }
  return <form className="registration-form" onSubmit={handleSubmit}>
    {event.is_multi_session && <fieldset className="form-section"><legend>第一步：選擇活動日期</legend><div className="date-choice-grid">{dateGroups.map(({date,sessions})=>{const capacity=sessions.reduce((sum,item)=>sum+item.capacity,0);const confirmed=sessions.reduce((sum,item)=>sum+item.confirmed_count,0);const remaining=Math.max(0,capacity-confirmed);return <button type="button" key={date} className={selectedDate===date?"date-choice selected":"date-choice"} onClick={()=>chooseDate(date)}><CalendarDays/><span><strong>{dateLabel.format(new Date(`${date}T12:00:00`))}</strong><small>{remaining===0?"所有時段已滿":`當日尚餘 ${remaining} 位`}</small></span></button>})}</div>{dateGroups.length===0&&<div className="notice notice-error">暫時沒有可報名日期</div>}</fieldset>}
    {event.is_multi_session && selectedDate && <fieldset className="form-section"><legend>第二步：選擇時段</legend><div className="session-choice-grid">{sessionsForDate.map((session)=>{const remaining=Math.max(0,session.capacity-session.confirmed_count);return <label key={session.id} className={sessionId===session.id?"session-choice selected":"session-choice"}><input type="radio" name="sessionId" checked={sessionId===session.id} disabled={remaining===0} onChange={()=>setSessionId(session.id)} /><Clock3/><span><strong>{timeLabel.format(new Date(session.start_at))}–{timeLabel.format(new Date(session.end_at))}</strong><small>{remaining===0?"名額已滿":`尚餘 ${remaining} 位`}</small></span></label>})}</div></fieldset>}
    <fieldset className="form-section"><legend>{event.is_multi_session?"第三步：選擇報名方法":"選擇報名方法"}</legend><div className="method-choice-grid">{event.registration_methods.includes("online")&&<label className={method==="online"?"method-choice selected":"method-choice"}><input type="radio" checked={method==="online"} onChange={()=>setMethod("online")}/><Laptop/><span><strong>網上報名</strong><small>即時完成申請</small></span></label>}{event.registration_methods.includes("in_person")&&<label className={method==="in_person"?"method-choice selected":"method-choice"}><input type="radio" checked={method==="in_person"} onChange={()=>setMethod("in_person")}/><Building2/><span><strong>親身報名</strong><small>先預留名額</small></span></label>}</div></fieldset>
    <fieldset className="form-section"><legend>{event.is_multi_session?"第四步：參加者資料":"參加者資料"}</legend><div className="form-grid"><label className="field field-full"><span>姓名 *</span><input name="fullName" required maxLength={80}/></label><label className="field"><span>聯絡電話 *</span><input name="phone" type="tel" required maxLength={30}/></label><label className="field"><span>電郵地址（選填）</span><input name="email" type="email" maxLength={160}/></label><label className="field field-full"><span>備註</span><textarea name="notes" rows={4} maxLength={500}/></label><label className="honeypot"><input name="website" tabIndex={-1}/></label></div></fieldset>
    <label className="consent-row"><input type="checkbox" name="consent" required/><span>我同意系統收集以上資料作活動報名及聯絡用途。</span></label>{error&&<div className="notice notice-error"><AlertCircle/>{error}</div>}<div className="form-submit-row"><span className="privacy-note"><LockKeyhole/>資料會經加密連線傳送</span><button className="button button-primary button-large" disabled={submitting||(event.is_multi_session&&!sessionId)}>{submitting?<><LoaderCircle className="spin"/>處理中…</>:<>提交報名<ArrowRight/></>}</button></div>
  </form>;
}
