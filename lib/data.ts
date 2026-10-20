import { cache } from "react";
import { DEMO_EVENTS, DEMO_REGISTRATION } from "@/lib/demo-data";
import { isSupabaseConfigured, isServiceRoleConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { EventRecord, EventSessionRecord, RegistrationRecord, SubActivityRecord } from "@/lib/types";

const PUBLIC_EVENT_SELECT = "id,slug,title,subtitle,summary,description,category,location,address,start_at,end_at,registration_start_at,registration_deadline,capacity,confirmed_count,status,registration_methods,hero_image_url,poster_image_url,contact_name,contact_phone,contact_address,is_featured,accepts_waitlist,registration_visibility,external_registration,external_registration_url,external_registration_organization,email_required,notes_required,custom_registration_fields,event_mode,is_multi_session,sub_activity_mode,max_sub_activity_selections,created_at,updated_at,sessions:event_sessions(*),sub_activities:event_sub_activities(*,sessions:event_sub_activity_sessions(*))";

function resolveEventMode(event: Partial<EventRecord>) {
  if (event.event_mode) return event.event_mode;
  if (event.external_registration) return "external" as const;
  if (event.sub_activity_mode) return "sub_activity" as const;
  if (event.is_multi_session) return "multi_session" as const;
  return "single" as const;
}

function projectSubActivitySessions(event: EventRecord): EventSessionRecord[] {
  return (event.sub_activities || []).flatMap((activity) => (activity.sessions || []).map((session) => ({
    id: session.id,
    event_id: session.event_id,
    session_date: session.session_date,
    start_at: session.start_at,
    end_at: session.end_at,
    capacity: session.capacity,
    confirmed_count: session.confirmed_count,
    sort_order: session.sort_order,
    is_active: session.is_active && activity.is_active,
    sub_activity_name: activity.name,
    sub_activity_key: activity.id,
    created_at: session.created_at,
    updated_at: session.updated_at,
  })));
}

function normalizePublicEvent(event: EventRecord): EventRecord {
  const eventMode = resolveEventMode(event);
  const subActivities = (event.sub_activities || []).sort((a,b)=>a.sort_order-b.sort_order);
  const sessions = eventMode === "sub_activity"
    ? projectSubActivitySessions({ ...event, sub_activities: subActivities })
    : (event.sessions || []).filter((session) => !String(session.sub_activity_key || "").trim());
  return {
    ...event,
    event_mode: eventMode,
    sessions,
    sub_activities: subActivities,
    registration_visibility: event.registration_visibility || "public",
    external_registration: eventMode === "external" || Boolean(event.external_registration),
    email_required: Boolean(event.email_required),
    notes_required: Boolean(event.notes_required),
    custom_registration_fields: event.custom_registration_fields || [],
    is_multi_session: eventMode === "multi_session",
    sub_activity_mode: eventMode === "sub_activity",
    max_sub_activity_selections: event.max_sub_activity_selections || 1,
    sub_activity_definitions: subActivities.map((item) => ({ id: item.id, name: item.name })),
  };
}

function normalizeAdminEvent(row: Record<string, unknown>): EventRecord {
  const { invite_code_hash, ...safe } = row;
  const event = safe as unknown as EventRecord;
  return {
    ...normalizePublicEvent(event),
    invite_code_configured: Boolean(invite_code_hash),
  };
}

function normalizeRegistration(row: RegistrationRecord): RegistrationRecord {
  if (row.session || !row.sub_activity_session) return row;
  const activity = row.sub_activity;
  return {
    ...row,
    session: {
      id: row.sub_activity_session.id,
      event_id: row.sub_activity_session.event_id,
      session_date: row.sub_activity_session.session_date,
      start_at: row.sub_activity_session.start_at,
      end_at: row.sub_activity_session.end_at,
      capacity: row.sub_activity_session.capacity,
      confirmed_count: row.sub_activity_session.confirmed_count,
      sort_order: row.sub_activity_session.sort_order,
      is_active: row.sub_activity_session.is_active,
      sub_activity_name: activity?.name || null,
      sub_activity_key: activity?.id || row.sub_activity_id || null,
    },
  };
}


export const getPublishedEvents = cache(async (): Promise<EventRecord[]> => {
  if (!isSupabaseConfigured()) return DEMO_EVENTS.map((event) => ({ ...event, registration_visibility: event.registration_visibility || "public" }));
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("events")
      .select(PUBLIC_EVENT_SELECT)
      .eq("status", "published")
      .order("start_at", { ascending: true });
    if (error) throw error;
    return ((data as EventRecord[]) ?? []).map(normalizePublicEvent);
  } catch (error) {
    console.error("Falling back to demo events:", error);
    return DEMO_EVENTS.map((event) => ({ ...event, registration_visibility: event.registration_visibility || "public" }));
  }
});

export const getEventBySlug = cache(async (slug: string): Promise<EventRecord | null> => {
  if (!isSupabaseConfigured()) {
    const event = DEMO_EVENTS.find((item) => item.slug === slug) ?? null;
    return event ? { ...event, registration_visibility: event.registration_visibility || "public" } : null;
  }
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("events")
      .select(PUBLIC_EVENT_SELECT)
      .eq("slug", slug)
      .eq("status", "published")
      .maybeSingle();
    if (error) throw error;
    return data ? normalizePublicEvent(data as EventRecord) : null;
  } catch (error) {
    console.error("Unable to fetch event:", error);
    const event = DEMO_EVENTS.find((item) => item.slug === slug) ?? null;
    return event ? { ...event, registration_visibility: event.registration_visibility || "public" } : null;
  }
});

export async function getAllEventsForAdmin(): Promise<EventRecord[]> {
  if (!isServiceRoleConfigured()) return DEMO_EVENTS.map((event) => ({ ...event, registration_visibility: event.registration_visibility || "public", invite_code_configured: false }));
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("events")
    .select("*, sessions:event_sessions(*), sub_activities:event_sub_activities(*, sessions:event_sub_activity_sessions(*))")
    .order("start_at", { ascending: true });
  if (error) throw error;
  return ((data as Record<string, unknown>[]) ?? []).map(normalizeAdminEvent);
}

export async function getEventForAdmin(id: string): Promise<EventRecord | null> {
  if (!isServiceRoleConfigured()) {
    const event = DEMO_EVENTS.find((item) => item.id === id) ?? null;
    return event ? { ...event, registration_visibility: event.registration_visibility || "public", invite_code_configured: false } : null;
  }
  const admin = createAdminClient();
  const { data, error } = await admin.from("events").select("*, sessions:event_sessions(*), sub_activities:event_sub_activities(*, sessions:event_sub_activity_sessions(*))").eq("id", id).maybeSingle();
  if (error) throw error;
  return data ? normalizeAdminEvent(data as Record<string, unknown>) : null;
}

export async function getEventInviteAccessInfo(slug: string): Promise<{ id: string; registration_visibility: "public" | "private"; invite_code_hash: string | null } | null> {
  if (!isServiceRoleConfigured()) return null;
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("events")
    .select("id,registration_visibility,invite_code_hash")
    .eq("slug", slug)
    .eq("status", "published")
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    id: data.id,
    registration_visibility: data.registration_visibility === "private" ? "private" : "public",
    invite_code_hash: data.invite_code_hash || null,
  };
}

export async function getRegistrationByToken(token: string): Promise<RegistrationRecord | null> {
  if (!isServiceRoleConfigured()) {
    return token === DEMO_REGISTRATION.qr_token ? DEMO_REGISTRATION : null;
  }
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("registrations")
    .select("*, session:event_sessions(*), sub_activity:event_sub_activities(*), sub_activity_session:event_sub_activity_sessions(*), event:events(*, sessions:event_sessions(*), sub_activities:event_sub_activities(*, sessions:event_sub_activity_sessions(*)))")
    .eq("qr_token", token)
    .maybeSingle();
  if (error) throw error;
  return data ? normalizeRegistration(data as RegistrationRecord) : null;
}

export async function getRegistrationsForEvent(eventId: string): Promise<RegistrationRecord[]> {
  if (!isServiceRoleConfigured()) {
    return DEMO_REGISTRATION.event_id === eventId ? [DEMO_REGISTRATION] : [];
  }
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("registrations")
    .select("*, session:event_sessions(*), sub_activity:event_sub_activities(*), sub_activity_session:event_sub_activity_sessions(*)")
    .eq("event_id", eventId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return ((data as RegistrationRecord[]) ?? []).map(normalizeRegistration);
}
