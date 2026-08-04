export type RegistrationMethod = "online" | "in_person";
export type EventStatus = "draft" | "published" | "cancelled";
export type RegistrationStatus = "confirmed" | "cancelled" | "waitlist";

export interface EventRecord {
  id: string;
  slug: string;
  title: string;
  subtitle: string | null;
  summary: string;
  description: string;
  category: string;
  location: string;
  address: string | null;
  start_at: string;
  end_at: string;
  registration_start_at: string;
  registration_deadline: string;
  capacity: number;
  confirmed_count: number;
  status: EventStatus;
  registration_methods: RegistrationMethod[];
  hero_image_url: string;
  poster_image_url: string;
  contact_name: string | null;
  contact_phone: string | null;
  contact_address: string | null;
  is_featured: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface RegistrationRecord {
  id: string;
  event_id: string;
  registration_no: string;
  full_name: string;
  email: string;
  phone: string;
  method: RegistrationMethod;
  status: RegistrationStatus;
  qr_token: string;
  attended_at: string | null;
  notes: string | null;
  email_sent?: boolean;
  email_error?: string | null;
  created_at: string;
  updated_at?: string;
  event?: EventRecord;
}

export interface RegistrationResult {
  id: string;
  registration_no: string;
  qr_token: string;
  email_sent: boolean;
}

export interface SiteSettingsRecord {
  setting_key: "homepage";
  hero_title: string;
  hero_description: string;
  hero_image_url: string;
  hero_image_alt: string;
  updated_by?: string | null;
  created_at?: string;
  updated_at?: string;
}
