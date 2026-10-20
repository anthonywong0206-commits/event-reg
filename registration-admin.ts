import { randomUUID } from "node:crypto";

export function createRegistrationNumber(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Hong_Kong",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? "00";
  const date = `${value("year")}${value("month")}${value("day")}`;
  const suffix = randomUUID().replaceAll("-", "").slice(0, 8).toUpperCase();
  return `ER${date}${suffix}`;
}

export function registrationAdminError(error: {
  code?: string | null;
  message?: string | null;
  constraint?: string | null;
}): { message: string; status: number } | null {
  const message = error.message ?? "";
  const constraint = error.constraint ?? "";

  if (message.includes("SESSION_FULL")) {
    return { message: "所選時段名額已滿，請選擇其他時段或先增加該時段名額。", status: 409 };
  }
  if (message.includes("SESSION_NOT_FOUND") || message.includes("SESSION_NOT_ACTIVE")) {
    return { message: "所選活動時段無效或已停止報名。", status: 400 };
  }
  if (message.includes("EVENT_FULL")) {
    return { message: "活動名額已滿，未能加入已確認參加者。可改為候補或先增加活動名額。", status: 409 };
  }
  if (error.code === "23505") {
    if (constraint.includes("one_active_registration_per_email") || message.includes("one_active_registration_per_email")) {
      return { message: "此電郵已經有一筆有效報名紀錄。", status: 409 };
    }
    return { message: "報名編號或參加者資料與現有紀錄重複，請重新嘗試。", status: 409 };
  }
  if (error.code === "23514") {
    return { message: "參加者資料不符合系統限制，請檢查姓名、電話及狀態。", status: 400 };
  }
  if (error.code === "22P02") {
    return { message: "報名方式或狀態資料無效。", status: 400 };
  }
  return null;
}
