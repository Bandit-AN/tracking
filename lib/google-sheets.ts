import "server-only";

import { createHash } from "node:crypto";

export type ImportedPerson = {
  name: string;
  role: "closer" | "setter" | "operator";
  calls: number;
  closed: number;
  cash: number;
  revenue: number;
  commission: number;
  paid: number;
};

export type ImportedDeal = {
  sourceKey: string;
  leadName: string;
  phone: string;
  email: string;
  setter: string;
  closer: string;
  paymentMethod: string;
  cashCollected: number;
  offerAmount: number;
  amountOwed: number;
  closedAt: string | null;
  nextPaymentAt: string | null;
  contractEndAt: string | null;
};

export type ImportedMeeting = {
  sourceKey: string;
  scheduledAt: string;
  status: string;
  taken: boolean;
};

export type ImportedApplicant = {
  sourceKey: string;
  occurredAt: string;
  eventName: "application_submitted";
};

function parseCsv(text: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === '"') {
      if (quoted && text[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === "," && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && text[index + 1] === "\n") index += 1;
      row.push(cell);
      if (row.some((value) => value.trim())) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += character;
    }
  }
  if (cell || row.length) {
    row.push(cell);
    if (row.some((value) => value.trim())) rows.push(row);
  }
  return rows;
}

function numeric(value = "") {
  return Number(value.replace(/[$,%\s,]/g, "")) || 0;
}

function isoDate(value = "") {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const slashDate = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  if (slashDate) {
    const year = Number(slashDate[3]);
    const normalizedYear = year < 100 ? 2000 + year : year;
    return `${normalizedYear}-${slashDate[1].padStart(2, "0")}-${slashDate[2].padStart(2, "0")}`;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  return null;
}

function sourceKey(values: string[]) {
  return createHash("sha256").update(values.join("\u001f")).digest("hex");
}

function sheetIdFromUrl(value: string) {
  const parsed = new URL(value);
  if (parsed.hostname !== "docs.google.com") throw new Error("Unsupported sheet host");
  const sheetId = parsed.pathname.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/)?.[1];
  if (!sheetId) throw new Error("Invalid Google Sheets URL");
  return sheetId;
}

async function fetchSheet(spreadsheetId: string, sheet: string) {
  const source = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheet)}`;
  const response = await fetch(source, {
    headers: { "User-Agent": "MoonRift-Media-Client-Portal/1.0" },
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    throw new Error(`Google Sheets returned ${response.status} for ${sheet}`);
  }
  const declaredSize = Number(response.headers.get("content-length") || 0);
  if (declaredSize > 5_000_000) throw new Error(`${sheet} export is too large`);
  const text = await response.text();
  if (text.length > 5_000_000) throw new Error(`${sheet} export is too large`);
  return parseCsv(text);
}

export async function importGoogleSheet(sheetUrl: string) {
  const spreadsheetId = sheetIdFromUrl(sheetUrl);
  const [overview, closedDeals, crm, eventRows] = await Promise.all([
    fetchSheet(spreadsheetId, "System Overview"),
    fetchSheet(spreadsheetId, "Closed Deals"),
    fetchSheet(spreadsheetId, "Sales CRM"),
    fetchSheet(spreadsheetId, "Events"),
  ]);

  const section = (name: string, stop: string[]) => {
    const start = overview.findIndex((row) => row[0]?.trim() === name);
    if (start < 0) return [];
    const remaining = overview.slice(start + 1);
    const end = remaining.findIndex((row) => stop.includes(row[0]?.trim()));
    return (end < 0 ? remaining : remaining.slice(0, end)).filter((row) =>
      row[0]?.trim(),
    );
  };

  const peopleFromRows = (
    rows: string[][],
    role: ImportedPerson["role"],
  ): ImportedPerson[] =>
    rows.map((row) => ({
      name: row[0].trim(),
      role,
      calls: numeric(row[1]),
      closed: numeric(row[2]),
      revenue: numeric(row[4]),
      cash: numeric(row[5]),
      commission: numeric(row[6] || row[2]),
      paid: numeric(row[7] || row[3]),
    }));

  const dealHeader = closedDeals.findIndex(
    (row) => row[0]?.trim() === "Lead Name",
  );
  const dealRows =
    dealHeader >= 0
      ? closedDeals.slice(dealHeader + 1).filter((row) => row[0]?.trim())
      : [];

  const deals: ImportedDeal[] = dealRows.map((row) => ({
    sourceKey: sourceKey(row.slice(0, 12)),
    leadName: row[0]?.trim() || "Unnamed lead",
    phone: row[1]?.trim() || "",
    email: row[2]?.trim().toLowerCase() || "",
    setter: row[3]?.trim() || "",
    closer: row[4]?.trim() || "",
    paymentMethod: row[5]?.trim() || "",
    cashCollected: numeric(row[6]),
    offerAmount: numeric(row[7]),
    amountOwed: numeric(row[8]),
    closedAt: isoDate(row[9]),
    nextPaymentAt: isoDate(row[10]),
    contractEndAt: isoDate(row[11]),
  }));

  const meetings: ImportedMeeting[] = crm.flatMap((row) => {
    const scheduledAt = isoDate(row[6]);
    if (!scheduledAt) return [];
    const status = row[3]?.trim() || "booked";
    return [
      {
        sourceKey: sourceKey(row),
        scheduledAt,
        status,
        taken: !/no show|rescheduled|cancel/i.test(status),
      },
    ];
  });

  // The Events export's first row contains the headers followed by the first
  // few event values in the same cells; subsequent rows are one event each.
  // Normalize both forms and persist only completed application submissions.
  const normalizedEvents = eventRows.flatMap((row, index) => {
    if (index === 0 && row[0]?.startsWith("timestamp ")) {
      const timestamps = row[0].trim().split(/\s+/).slice(1);
      const eventNames = row[1]?.trim().split(/\s+/).slice(1) ?? [];
      return timestamps.map((timestamp, eventIndex) => ({
        timestamp,
        eventName: eventNames[eventIndex] ?? "",
      }));
    }
    return [{ timestamp: row[0]?.trim() ?? "", eventName: row[1]?.trim() ?? "" }];
  });

  const applicants: ImportedApplicant[] = normalizedEvents.flatMap((event) => {
    const occurredAt = event.timestamp.match(/^\d{4}-\d{2}-\d{2}/)?.[0];
    if (!occurredAt || event.eventName !== "application_submitted") return [];
    return [{
      sourceKey: sourceKey([event.timestamp, event.eventName]),
      occurredAt,
      eventName: "application_submitted" as const,
    }];
  });

  return {
    people: [
      ...peopleFromRows(section("Setter Name", ["Closer Name"]), "setter"),
      ...peopleFromRows(section("Closer Name", ["Operator"]), "closer"),
      ...peopleFromRows(section("Operator", []), "operator"),
    ],
    deals,
    meetings,
    applicants,
  };
}
