import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { assertAdminForApi } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { isServiceRoleConfigured } from "@/lib/env";
import type { CustomRegistrationField } from "@/lib/types";

export const runtime = "nodejs";

type ExportSession = {
  id: string;
  session_date: string;
  start_at: string;
  end_at: string;
  sort_order: number;
  is_active: boolean;
};

type ExportRegistration = {
  id: string;
  session_id: string | null;
  full_name: string;
  phone: string;
  notes: string | null;
  status: string;
  created_at: string;
  custom_answers?: Record<string, string | string[]> | null;
};

const hkDateFormatter = new Intl.DateTimeFormat("zh-HK", {
  timeZone: "Asia/Hong_Kong",
  year: "numeric",
  month: "long",
  day: "numeric",
  weekday: "short",
});

const hkTimeFormatter = new Intl.DateTimeFormat("zh-HK", {
  timeZone: "Asia/Hong_Kong",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

const hkIsoDateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Hong_Kong",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function formatDate(value: string) {
  return hkDateFormatter.format(new Date(value));
}

function formatTime(value: string) {
  return hkTimeFormatter.format(new Date(value));
}

function formatTimeRange(startAt: string, endAt: string) {
  return `${formatTime(startAt)}–${formatTime(endAt)}`;
}

function safeSheetName(value: string, fallback: string) {
  const cleaned = value.replace(/[\\/?*\[\]:]/g, "-").trim();
  return (cleaned || fallback).slice(0, 31);
}

function setCellStyle(ws: XLSX.WorkSheet, address: string, style: Record<string, unknown>) {
  const cell = ws[address];
  if (cell) (cell as typeof cell & { s?: Record<string, unknown> }).s = style;
}

function applyListLayout(ws: XLSX.WorkSheet, lastRow: number, columnCount: number) {
  const lastColumn = XLSX.utils.encode_col(Math.max(0, columnCount - 1));
  ws["!cols"] = Array.from({ length: columnCount }, (_, index) => {
    if (index === 0) return { wch: 11 };
    if (index === 1) return { wch: 22 };
    if (index === 2) return { wch: 17 };
    if (index === 3) return { wch: 32 };
    if (index === columnCount - 1) return { wch: 18 };
    return { wch: 22 };
  });
  ws["!rows"] = Array.from({ length: lastRow }, (_, index) => ({ hpt: index === 0 ? 28 : index < 5 ? 22 : 24 }));
  ws["!margins"] = { left: 0.35, right: 0.35, top: 0.45, bottom: 0.45, header: 0.2, footer: 0.2 };
  (ws as XLSX.WorkSheet & { "!pageSetup"?: unknown })["!pageSetup"] = {
    orientation: columnCount > 7 ? "landscape" : "portrait",
    fitToWidth: 1,
    fitToHeight: 0,
    paperSize: 9,
  };
  (ws as XLSX.WorkSheet & { "!printArea"?: string })["!printArea"] = `A1:${lastColumn}${lastRow}`;

  const titleStyle: Record<string, unknown> = {
    font: { bold: true, sz: 18, color: { rgb: "17365D" } },
    alignment: { horizontal: "center", vertical: "center" },
  };
  const infoStyle: Record<string, unknown> = {
    font: { bold: true, sz: 11, color: { rgb: "243447" } },
    alignment: { vertical: "center", wrapText: true },
  };
  const sessionStyle: Record<string, unknown> = {
    font: { bold: true, sz: 12, color: { rgb: "FFFFFF" } },
    fill: { patternType: "solid", fgColor: { rgb: "4472C4" } },
    alignment: { vertical: "center", wrapText: true },
  };
  const headerStyle: Record<string, unknown> = {
    font: { bold: true, sz: 11, color: { rgb: "FFFFFF" } },
    fill: { patternType: "solid", fgColor: { rgb: "5B9BD5" } },
    alignment: { horizontal: "center", vertical: "center", wrapText: true },
    border: {
      top: { style: "thin", color: { rgb: "B4C7E7" } },
      bottom: { style: "thin", color: { rgb: "B4C7E7" } },
      left: { style: "thin", color: { rgb: "B4C7E7" } },
      right: { style: "thin", color: { rgb: "B4C7E7" } },
    },
  };
  const bodyStyle: Record<string, unknown> = {
    font: { sz: 11, color: { rgb: "222222" } },
    alignment: { vertical: "center", wrapText: true },
    border: {
      top: { style: "thin", color: { rgb: "D9E2F3" } },
      bottom: { style: "thin", color: { rgb: "D9E2F3" } },
      left: { style: "thin", color: { rgb: "D9E2F3" } },
      right: { style: "thin", color: { rgb: "D9E2F3" } },
    },
  };

  setCellStyle(ws, "A1", titleStyle);
  ["A2", "A3", "A4", "A5"].forEach((address) => {
    const value = ws[address]?.v;
    if (typeof value === "string" && (value.startsWith("活動名稱：") || value.startsWith("日期：") || value.startsWith("時間：") || value.startsWith("參加者人數總數："))) {
      setCellStyle(ws, address, infoStyle);
    }
  });

  for (let row = 5; row <= lastRow; row += 1) {
    const marker = ws[`A${row}`]?.v;
    if (typeof marker === "string" && marker.startsWith("時段：")) {
      setCellStyle(ws, `A${row}`, sessionStyle);
      continue;
    }
    if (ws[`A${row}`]?.v === "報名編號") {
      for (let colIndex = 0; colIndex < columnCount; colIndex += 1) {
        setCellStyle(ws, `${XLSX.utils.encode_col(colIndex)}${row}`, headerStyle);
      }
      continue;
    }
    if (typeof marker === "number") {
      for (let colIndex = 0; colIndex < columnCount; colIndex += 1) {
        setCellStyle(ws, `${XLSX.utils.encode_col(colIndex)}${row}`, bodyStyle);
      }
      setCellStyle(ws, `A${row}`, { ...bodyStyle, alignment: { horizontal: "center", vertical: "center" } });
      setCellStyle(ws, `${lastColumn}${row}`, { ...bodyStyle, alignment: { horizontal: "center", vertical: "center" } });
    }
  }
}
function displayCustomAnswer(value: string | string[] | null | undefined) {
  if (Array.isArray(value)) return value.filter(Boolean).join("、");
  return typeof value === "string" ? value : "";
}

function buildSheet(options: {
  eventTitle: string;
  dateLabel: string;
  overallTimeLabel: string;
  sessionGroups: Array<{ label: string | null; registrations: ExportRegistration[] }>;
  customFields: CustomRegistrationField[];
  showDailyTotal?: boolean;
  dailyTotal?: number;
}) {
  const headers = ["報名編號", "參加者姓名", "電話", "備註", ...options.customFields.map((field) => field.label), "簽到"];
  const columnCount = headers.length;
  const blankRow = () => Array.from({ length: columnCount }, () => "");
  const lastColumn = XLSX.utils.encode_col(columnCount - 1);
  const rows: Array<Array<string | number>> = [
    ["參加者名單", ...blankRow().slice(1)],
    [`活動名稱：${options.eventTitle}`, ...blankRow().slice(1)],
    [`日期：${options.dateLabel}`, ...blankRow().slice(1)],
    [`時間：${options.overallTimeLabel}`, ...blankRow().slice(1)],
  ];
  const merges: ReturnType<typeof XLSX.utils.decode_range>[] = [
    XLSX.utils.decode_range(`A1:${lastColumn}1`),
    XLSX.utils.decode_range(`A2:${lastColumn}2`),
    XLSX.utils.decode_range(`A3:${lastColumn}3`),
    XLSX.utils.decode_range(`A4:${lastColumn}4`),
  ];

  if (options.showDailyTotal) {
    rows.push([`參加者人數總數：${options.dailyTotal ?? 0} 人`, ...blankRow().slice(1)]);
    merges.push(XLSX.utils.decode_range(`A5:${lastColumn}5`));
  }
  rows.push(blankRow());

  for (const group of options.sessionGroups) {
    if (group.label) {
      const rowNo = rows.length + 1;
      rows.push([`時段：${group.label}`, ...blankRow().slice(1)]);
      merges.push(XLSX.utils.decode_range(`A${rowNo}:${lastColumn}${rowNo}`));
    }

    rows.push(headers);
    if (group.registrations.length === 0) {
      rows.push(["", "（暫未有參加者）", ...Array.from({ length: columnCount - 2 }, () => "")]);
    } else {
      for (const [index, registration] of group.registrations.entries()) {
        rows.push([
          index + 1,
          registration.full_name,
          registration.phone,
          registration.notes ?? "",
          ...options.customFields.map((field) => displayCustomAnswer(registration.custom_answers?.[field.id])),
          "",
        ]);
      }
    }
    rows.push(blankRow());
  }

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws["!merges"] = merges;
  applyListLayout(ws, rows.length, columnCount);
  return ws;
}
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await assertAdminForApi();
    if (!isServiceRoleConfigured()) {
      return NextResponse.json({ error: "Supabase 尚未完成設定" }, { status: 503 });
    }

    const { id } = await params;
    const admin = createAdminClient();
    const [{ data: event, error: eventError }, { data: registrations, error: registrationError }] = await Promise.all([
      admin
        .from("events")
        .select("title, slug, start_at, end_at, is_multi_session, custom_registration_fields, sessions:event_sessions(id,session_date,start_at,end_at,sort_order,is_active)")
        .eq("id", id)
        .maybeSingle(),
      admin
        .from("registrations")
        .select("id, session_id, full_name, phone, notes, status, created_at, custom_answers")
        .eq("event_id", id)
        .eq("status", "confirmed")
        .order("created_at", { ascending: true }),
    ]);

    if (eventError || !event) return NextResponse.json({ error: "找不到活動" }, { status: 404 });
    if (registrationError) throw registrationError;

    const confirmed = ((registrations ?? []) as ExportRegistration[]).sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
    );
    const customFields = Array.isArray(event.custom_registration_fields)
      ? (event.custom_registration_fields as CustomRegistrationField[]).filter(
          (field) => field && typeof field.id === "string" && typeof field.label === "string" && field.label.trim(),
        )
      : [];
    const workbook = XLSX.utils.book_new();

    if (!event.is_multi_session) {
      const dateKey = hkIsoDateFormatter.format(new Date(event.start_at));
      const ws = buildSheet({
        eventTitle: event.title,
        dateLabel: formatDate(event.start_at),
        overallTimeLabel: formatTimeRange(event.start_at, event.end_at),
        sessionGroups: [{ label: null, registrations: confirmed }],
        customFields,
      });
      XLSX.utils.book_append_sheet(workbook, ws, safeSheetName(dateKey, "參加者名單"));
    } else {
      const sessions = ((event.sessions ?? []) as ExportSession[]).sort((a, b) => {
        const dateCompare = a.session_date.localeCompare(b.session_date);
        if (dateCompare !== 0) return dateCompare;
        const timeCompare = new Date(a.start_at).getTime() - new Date(b.start_at).getTime();
        return timeCompare !== 0 ? timeCompare : a.sort_order - b.sort_order;
      });
      const sessionById = new Map(sessions.map((session) => [session.id, session]));
      const dates = new Map<string, ExportSession[]>();
      for (const session of sessions) {
        const hasParticipant = confirmed.some((registration) => registration.session_id === session.id);
        if (!session.is_active && !hasParticipant) continue;
        dates.set(session.session_date, [...(dates.get(session.session_date) ?? []), session]);
      }

      const unmatched = confirmed.filter((registration) => !registration.session_id || !sessionById.has(registration.session_id));
      if (dates.size === 0) {
        const fallbackDate = hkIsoDateFormatter.format(new Date(event.start_at));
        dates.set(fallbackDate, []);
      }

      let sheetIndex = 0;
      for (const [sessionDate, daySessions] of dates) {
        sheetIndex += 1;
        const sortedDaySessions = [...daySessions].sort(
          (a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime() || a.sort_order - b.sort_order,
        );
        const sessionGroups = sortedDaySessions.map((session) => ({
          label: formatTimeRange(session.start_at, session.end_at),
          registrations: confirmed.filter((registration) => registration.session_id === session.id),
        }));

        if (sheetIndex === 1 && unmatched.length > 0) {
          sessionGroups.push({ label: "未指定時段", registrations: unmatched });
        }

        const firstSession = sortedDaySessions[0];
        const lastSession = sortedDaySessions.at(-1);
        const dateValue = firstSession?.start_at ?? `${sessionDate}T12:00:00+08:00`;
        const overallTimeLabel = firstSession && lastSession
          ? `${formatTime(firstSession.start_at)}–${formatTime(lastSession.end_at)}（多時段，詳見下方）`
          : "多個時段（詳見下方）";
        const groupsForSheet = sessionGroups.length ? sessionGroups : [{ label: null, registrations: unmatched }];
        const dailyTotal = sortedDaySessions.reduce(
          (total, session) => total + confirmed.filter((registration) => registration.session_id === session.id).length,
          0,
        );
        const ws = buildSheet({
          eventTitle: event.title,
          dateLabel: formatDate(dateValue),
          overallTimeLabel,
          sessionGroups: groupsForSheet,
          customFields,
          showDailyTotal: true,
          dailyTotal,
        });
        XLSX.utils.book_append_sheet(workbook, ws, safeSheetName(sessionDate, `日期${sheetIndex}`));
      }
    }

    const output = XLSX.write(workbook, {
      type: "buffer",
      bookType: "xlsx",
      compression: true,
      cellStyles: true,
    } as XLSX.WritingOptions) as Buffer;
    const filename = `${event.slug}-participant-list.xlsx`;

    return new NextResponse(new Uint8Array(output), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "未獲授權" }, { status: 401 });
    }
    console.error("Export participant workbook failed", error);
    return NextResponse.json({ error: "未能匯出參加者名單 Excel" }, { status: 500 });
  }
}
