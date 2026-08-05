import { cache } from "react";
import { DEMO_EVENTS, DEMO_REGISTRATION } from "@/lib/demo-data";
import { isSupabaseConfigured, isServiceRoleConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { EventRecord, RegistrationRecord } from "@/lib/types";

export const getPublishedEvents = cache(async (): Promise<EventRecord[]> => {
  if (!isSupabaseConfigured()) return DEMO_EVENTS;
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("events")
      .select("*, sessions:event_sessions(*)")
      .eq("status", "published")
      .order("start_at", { ascending: true });
    if (error) throw error;
    return (data as EventRecord[]) ?? [];
  } catch (error) {
    console.error("Falling back to demo events:", error);
    return DEMO_EVENTS;
  }
});

export const getEventBySlug = cache(async (slug: string): Promise<EventRecord | null> => {
  if (!isSupabaseConfigured()) {
    return DEMO_EVENTS.find((event) => event.slug === slug) ?? null;
  }
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("events")
      .select("*, sessions:event_sessions(*)")
      .eq("slug", slug)
      .eq("status", "published")
      .maybeSingle();
    if (error) throw error;
    return (data as EventRecord | null) ?? null;
  } catch (error) {
    console.error("Unable to fetch event:", error);
    return DEMO_EVENTS.find((event) => event.slug === slug) ?? null;
  }
});

export async function getAllEventsForAdmin(): Promise<EventRecord[]> {
  if (!isServiceRoleConfigured()) return DEMO_EVENTS;
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("events")
    .select("*, sessions:event_sessions(*)")
    .order("start_at", { ascending: true });
  if (error) throw error;
  return (data as EventRecord[]) ?? [];
}

export async function getEventForAdmin(id: string): Promise<EventRecord | null> {
  if (!isServiceRoleConfigured()) {
    return DEMO_EVENTS.find((event) => event.id === id) ?? null;
  }
  const admin = createAdminClient();
  const { data, error } = await admin.from("events").select("*, sessions:event_sessions(*)").eq("id", id).maybeSingle();
  if (error) throw error;
  return (data as EventRecord | null) ?? null;
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
