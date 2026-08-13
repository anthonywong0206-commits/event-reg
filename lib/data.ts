import { cache } from "react";
import { DEMO_EVENTS, DEMO_REGISTRATION } from "@/lib/demo-data";
import { isSupabaseConfigured, isServiceRoleConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { EventRecord, RegistrationRecord } from "@/lib/types";

const PUBLIC_EVENT_SELECT = "id,slug,title,subtitle,summary,description,category,location,address,start_at,end_at,registration_start_at,registration_deadline,capacity,confirmed_count,status,registration_methods,hero_image_url,poster_image_url,contact_name,contact_phone,contact_address,is_featured,accepts_waitlist,registration_visibility,is_multi_session,created_at,updated_at,sessions:event_sessions(*)";

function normalizePublicEvent(event: EventRecord): EventRecord {
  return { ...event, registration_visibility: event.registration_visibility || "public" };
}

function normalizeAdminEvent(row: Record<string, unknown>): EventRecord {
  const { invite_code_hash, ...safe } = row;
  return {
    ...(safe as unknown as EventRecord),
    registration_visibility: (safe.registration_visibility as EventRecord["registration_visibility"]) || "public",
    invite_code_configured: Boolean(invite_code_hash),
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
    .select("*, sessions:event_sessions(*)")
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
  const { data, error } = await admin.from("events").select("*, sessions:event_sessions(*)").eq("id", id).maybeSingle();
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
    .select("*, session:event_sessions(*), event:events(*, sessions:event_sessions(*))")
    .eq("qr_token", token)
    .maybeSingle();
  if (error) throw error;
  return (data as RegistrationRecord | null) ?? null;
}

export async function getRegistrationsForEvent(eventId: string): Promise<RegistrationRecord[]> {
  if (!isServiceRoleConfigured()) {
    return DEMO_REGISTRATION.event_id === eventId ? [DEMO_REGISTRATION] : [];
  }
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("registrations")
    .select("*, session:event_sessions(*)")
    .eq("event_id", eventId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data as RegistrationRecord[]) ?? [];
}
