import { cache } from "react";
import { DEMO_EVENTS, DEMO_REGISTRATION } from "@/lib/demo-data";
import { isDemoMode } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { EventRecord, RegistrationRecord } from "@/lib/types";

export const getPublishedEvents = cache(async (): Promise<EventRecord[]> => {
  if (isDemoMode()) return DEMO_EVENTS;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("events")
    .select("*")
    .eq("status", "published")
    .order("start_at", { ascending: true });
  if (error) throw new Error(`Supabase events query failed: ${error.message}`);
  return (data as EventRecord[]) ?? [];
});

export const getEventBySlug = cache(async (slug: string): Promise<EventRecord | null> => {
  if (isDemoMode()) {
    return DEMO_EVENTS.find((event) => event.slug === slug) ?? null;
  }
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("events")
    .select("*")
    .eq("slug", slug)
    .eq("status", "published")
    .maybeSingle();
  if (error) throw new Error(`Supabase event query failed: ${error.message}`);
  return (data as EventRecord | null) ?? null;
});

export async function getAllEventsForAdmin(): Promise<EventRecord[]> {
  if (isDemoMode()) return DEMO_EVENTS;
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("events")
    .select("*")
    .order("start_at", { ascending: true });
  if (error) throw error;
  return (data as EventRecord[]) ?? [];
}

export async function getEventForAdmin(id: string): Promise<EventRecord | null> {
  if (isDemoMode()) {
    return DEMO_EVENTS.find((event) => event.id === id) ?? null;
  }
  const admin = createAdminClient();
  const { data, error } = await admin.from("events").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return (data as EventRecord | null) ?? null;
}

export async function getRegistrationByToken(token: string): Promise<RegistrationRecord | null> {
  if (isDemoMode()) {
    return token === DEMO_REGISTRATION.qr_token ? DEMO_REGISTRATION : null;
  }
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("registrations")
    .select("*, event:events(*)")
    .eq("qr_token", token)
    .maybeSingle();
  if (error) throw error;
  return (data as RegistrationRecord | null) ?? null;
}

export async function getRegistrationsForEvent(eventId: string): Promise<RegistrationRecord[]> {
  if (isDemoMode()) {
    return DEMO_REGISTRATION.event_id === eventId ? [DEMO_REGISTRATION] : [];
  }
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("registrations")
    .select("*")
    .eq("event_id", eventId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data as RegistrationRecord[]) ?? [];
}
