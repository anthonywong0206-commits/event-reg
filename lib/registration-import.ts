import * as XLSX from "xlsx";
import type { EventRecord, EventSessionRecord, RegistrationMethod, RegistrationStatus } from "@/lib/types";

export const IMPORT_HEADERS = [
  "姓名*",
  "電話*",
  "電郵（選填）",
  "活動日期",
  "開始時間",
  "狀態",
  "報名方式",
  "備註",
  "已出席",
  "發送確認電郵",
] as const;

export type ImportRow = {
  rowNumber: number;
  fullName: string;
  phone: string;
  email: string | null;
  sessionId: string | null;
  status: RegistrationStatus;
  method: RegistrationMethod;
  notes: string;
  attended: boolean;
  sendEmail: boolean;
};

function cellText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString();
  return String(value).trim();
}

function normalizeDate(value: unknown): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "number") {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed) return `${parsed.y}-${String(parsed.m).padStart(2, "0")}-${String(parsed.d).padStart(2, "0")}`;
  }
  const text = cellText(value).replaceAll("/", "-");
  const match = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  return match ? `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}` : text;
}

function normalizeTime(value: unknown): string {
  if (value instanceof Date) return `${String(value.getHours()).padStart(2, "0")}:${String(value.getMinutes()).padStart(2, "0")}`;
  if (typeof value === "number") {
    const totalMinutes = Math.round(value * 24 * 60) % (24 * 60);
    return `${String(Math.floor(totalMinutes / 60)).padStart(2, "0")}:${String(totalMinutes % 60).padStart(2, "0")}`;
  }
  const text = cellText(value);
  const match = text.match(/^(\d{1,2}):(\d{2})/);
  return match ? `${match[1].padStart(2, "0")}:${match[2]}` : text;
}

function booleanValue(value: unknown): boolean {
  const normalized = cellText(value).toLowerCase();
  return ["是", "yes", "y", "true", "1", "✓", "已出席"].includes(normalized);
}

function statusValue(value: unknown): RegistrationStatus | null {
  const normalized = cellText(value).toLowerCase();
  if (["", "已確認", "confirmed", "確認"].includes(normalized)) return "confirmed";
  if (["候補", "waitlist", "waiting"].includes(normalized)) return "waitlist";
  if (["已取消", "取消", "cancelled", "canceled"].includes(normalized)) return "cancelled";
  return null;
}

function methodValue(value: unknown, event: EventRecord): RegistrationMethod | null {
  const normalized = cellText(value).toLowerCase();
  const fallback = event.registration_methods[0];
  if (!normalized) return fallback;
  if (["網上", "online"].includes(normalized)) return event.registration_methods.includes("online") ? "online" : null;
  if (["親身", "in_person", "in person", "現場"].includes(normalized)) return event.registration_methods.includes("in_person") ? "in_person" : null;
  return null;
}

function sessionKey(session: EventSessionRecord): string {
  const time = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Hong_Kong", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(session.start_at));
  return `${session.session_date}|${time}`;
}

export function parseRegistrationWorkbook(buffer: ArrayBuffer, event: EventRecord): { rows: ImportRow[]; errors: string[] } {
  const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) return { rows: [], errors: ["Excel 沒有可讀取的工作表。"] };
  const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "", raw: true });
  const sessionMap = new Map((event.sessions ?? []).map((session) => [sessionKey(session), session]));
  const rows: ImportRow[] = [];
  const errors: string[] = [];

  rawRows.forEach((raw, index) => {
    const rowNumber = index + 2;
    const fullName = cellText(raw["姓名*"] ?? raw["姓名"]);
    const phone = cellText(raw["電話*"] ?? raw["電話"]);
    const emailText = cellText(raw["電郵（選填）"] ?? raw["電郵"]);
    const email = emailText || null;
    const status = statusValue(raw["狀態"]);
    const method = methodValue(raw["報名方式"], event);
    const attended = booleanValue(raw["已出席"]);
    const sendEmail = booleanValue(raw["發送確認電郵"]);
    const notes = cellText(raw["備註"]);
    let sessionId: string | null = null;

    if (!fullName && !phone && !email && !cellText(raw["活動日期"]) && !cellText(raw["開始時間"])) return;
    if (fullName.length < 2) errors.push(`第 ${rowNumber} 行：姓名最少需要 2 個字。`);
    if (phone.length < 8) errors.push(`第 ${rowNumber} 行：電話最少需要 8 個字元。`);
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.push(`第 ${rowNumber} 行：電郵格式不正確。`);
    if (!status) errors.push(`第 ${rowNumber} 行：狀態只可填「已確認」、「候補」或「已取消」。`);
    if (!method) errors.push(`第 ${rowNumber} 行：報名方式不受此活動支援。`);
    if (attended && status !== "confirmed") errors.push(`第 ${rowNumber} 行：只有已確認參加者可以標示為已出席。`);
    if (sendEmail && !email) errors.push(`第 ${rowNumber} 行：如要發送確認電郵，必須填寫電郵。`);

    if (event.is_multi_session) {
      const date = normalizeDate(raw["活動日期"]);
      const time = normalizeTime(raw["開始時間"]);
      const session = sessionMap.get(`${date}|${time}`);
      if (!date || !time) errors.push(`第 ${rowNumber} 行：多時段活動必須填寫活動日期及開始時間。`);
      else if (!session) errors.push(`第 ${rowNumber} 行：找不到 ${date} ${time} 的活動時段。請使用範本「可選時段」工作表中的資料。`);
      else if (!session.is_active) errors.push(`第 ${rowNumber} 行：所選時段已停止報名。`);
      else sessionId = session.id;
    }

    if (fullName.length >= 2 && phone.length >= 8 && (!email || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) && status && method && (!event.is_multi_session || sessionId) && !(attended && status !== "confirmed") && !(sendEmail && !email)) {
      rows.push({ rowNumber, fullName, phone, email, sessionId, status, method, notes, attended, sendEmail });
    }
  });

  if (!rawRows.length) errors.push("Excel 沒有參加者資料。請由第 2 行開始輸入。 ");
  return { rows, errors };
}

export function createRegistrationTemplate(event: EventRecord): Buffer {
  const workbook = XLSX.utils.book_new();
  const sampleDate = event.sessions?.[0]?.session_date ?? "2026-08-20";
  const sampleTime = event.sessions?.[0]
    ? new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Hong_Kong", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(event.sessions[0].start_at))
    : "10:00";
  const participantSheet = XLSX.utils.aoa_to_sheet([
    [...IMPORT_HEADERS],
    ["陳大文", "91234567", "example@email.com", event.is_multi_session ? sampleDate : "", event.is_multi_session ? sampleTime : "", "已確認", event.registration_methods.includes("online") ? "網上" : "親身", "範例資料，可刪除", "否", "否"],
  ]);
  participantSheet["!cols"] = [{ wch: 18 }, { wch: 16 }, { wch: 28 }, { wch: 14 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 32 }, { wch: 12 }, { wch: 18 }];
  participantSheet["!freeze"] = { xSplit: 0, ySplit: 1 };
  XLSX.utils.book_append_sheet(workbook, participantSheet, "參加者匯入");

  const instructionRows = [
    ["欄位", "說明"],
    ["姓名*", "必填，最少 2 個字。"],
    ["電話*", "必填，最少 8 個字元。"],
    ["電郵（選填）", "選填；如選擇發送確認電郵則必須填寫。"],
    ["活動日期／開始時間", event.is_multi_session ? "必填，必須完全對應「可選時段」工作表。" : "單時段活動可留空。"],
    ["狀態", "已確認／候補／已取消；留空預設為已確認。"],
    ["報名方式", `可填：${event.registration_methods.map((method) => method === "online" ? "網上" : "親身").join("、")}；留空使用活動首個方式。`],
    ["已出席", "是／否；只有已確認參加者可填是。"],
    ["發送確認電郵", "是／否。大量匯入時建議先匯入，確認無誤後再個別發送。"],
    ["重要", "請勿更改「參加者匯入」工作表的欄位名稱。每次最多匯入 500 人。"],
  ];
  const instructionSheet = XLSX.utils.aoa_to_sheet(instructionRows);
  instructionSheet["!cols"] = [{ wch: 24 }, { wch: 76 }];
  XLSX.utils.book_append_sheet(workbook, instructionSheet, "填寫說明");

  if (event.is_multi_session) {
    const sessions = [...(event.sessions ?? [])].sort((a, b) => a.start_at.localeCompare(b.start_at));
    const rows = [["活動日期", "開始時間", "結束時間", "時段名額", "現時剩餘名額", "狀態"]];
    for (const session of sessions) {
      const start = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Hong_Kong", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(session.start_at));
      const end = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Hong_Kong", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(session.end_at));
      rows.push([session.session_date, start, end, String(session.capacity), String(Math.max(0, session.capacity - session.confirmed_count)), session.is_active ? "開放" : "暫停"]);
    }
    const sessionSheet = XLSX.utils.aoa_to_sheet(rows);
    sessionSheet["!cols"] = [{ wch: 14 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 18 }, { wch: 12 }];
    XLSX.utils.book_append_sheet(workbook, sessionSheet, "可選時段");
  }
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
}
