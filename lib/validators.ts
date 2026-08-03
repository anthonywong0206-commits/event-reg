import { z } from "zod";

export const registrationSchema = z.object({
  eventId: z.uuid("活動資料無效"),
  fullName: z.string().trim().min(2, "請輸入姓名").max(80),
  email: z.email("請輸入有效電郵地址").max(160),
  phone: z.string().trim().min(8, "請輸入聯絡電話").max(30),
  method: z.enum(["online", "in_person"]),
  notes: z.string().trim().max(500).optional().default(""),
  consent: z.literal(true, { error: "請同意個人資料收集聲明" }),
  website: z.string().max(0).optional().default(""),
});

export const eventSchema = z
  .object({
    title: z.string().trim().min(2, "請輸入活動名稱").max(160),
    slug: z
      .string()
      .trim()
      .min(2)
      .max(120)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug 只可使用小寫英文字母、數字及連字號"),
    subtitle: z.string().trim().max(200).nullable().optional(),
    summary: z.string().trim().min(10, "請輸入活動簡介").max(400),
    description: z.string().trim().min(20, "請輸入活動詳情").max(8000),
    category: z.string().trim().min(1).max(60),
    location: z.string().trim().min(2).max(180),
    address: z.string().trim().max(300).nullable().optional(),
    start_at: z.iso.datetime(),
    end_at: z.iso.datetime(),
    registration_deadline: z.iso.datetime(),
    capacity: z.coerce.number().int().min(1).max(100000),
    status: z.enum(["draft", "published", "cancelled"]),
    registration_methods: z.array(z.enum(["online", "in_person"])).min(1),
    hero_image_url: z.string().trim().min(1).max(1000),
    poster_image_url: z.string().trim().min(1).max(1000),
    contact_name: z.string().trim().max(100).nullable().optional(),
    contact_phone: z.string().trim().max(50).nullable().optional(),
    contact_address: z.string().trim().max(300).nullable().optional(),
    is_featured: z.boolean().default(false),
  })
  .refine((data) => new Date(data.end_at) > new Date(data.start_at), {
    message: "活動結束時間必須遲於開始時間",
    path: ["end_at"],
  })
  .refine((data) => new Date(data.registration_deadline) <= new Date(data.start_at), {
    message: "截止報名時間必須早於或等於活動開始時間",
    path: ["registration_deadline"],
  });

export const checkInSchema = z.object({
  token: z.uuid("QR Code 憑證無效"),
});
