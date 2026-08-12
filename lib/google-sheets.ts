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
  attributionSource: string;
  attributionMedium: string;
  attributionCampaign: string;
  attributionVideo: string;
  cashCollected: number;
  offerAmount: number;
  amountOwed: number;
  closedAt: string | null;
  nextPaymentAt: string | null;
  contractEndAt: string | null;
};

export type ImportedMeeting = {
  sourceKey: string;
  leadName: string;
  phone: string;
  email: string;
  setter: string;
  closer: string;
  scheduledAt: string;
  status: string;
  taken: boolean;
  notes: string;
  recordingUrl: string;
  feedback: string;
};

export type ImportedPayout = {
  sourceKey: string;
  member: string;
  date: string;
  method: string;
  amount: number;
};

export type ImportedAttributionEvent = {
  sourceKey: string;
  occurredAt: string;
  eventName: "page_view" | "application_submitted";
  source: string;
  medium: string;
  campaign: string;
  content: string;
  videoId: string;
  landingPage: string;
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

function safeHttpUrl(value = "") {
  try {
    const url = new URL(value.trim());
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : "";
  } catch {
    return "";
  }
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
  const [overview, closedDeals, crm, applicantRows, eventRows, payoutRows] = await Promise.all([
    fetchSheet(spreadsheetId, "System Overview"),
    fetchSheet(spreadsheetId, "Closed Deals"),
    fetchSheet(spreadsheetId, "Sales CRM"),
    fetchSheet(spreadsheetId, "Applications"),
    fetchSheet(spreadsheetId, "Events"),
    fetchSheet(spreadsheetId, "Payouts"),
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
  const dealHeaders = closedDeals[dealHeader] ?? [];
  const dealColumn = (...names: string[]) =>
    dealHeaders.findIndex((header) =>
      names.includes(header.trim().toLowerCase()),
    );
  const optionalDealValue = (row: string[], ...names: string[]) => {
    const index = dealColumn(...names);
    return index >= 0 ? row[index]?.trim() || "" : "";
  };

  type ApplicationAttribution = {
    source: string;
    medium: string;
    campaign: string;
    video: string;
  };
  const applicationDataRows = applicantRows[0]?.[0]?.trim().toLowerCase() === "status"
    ? applicantRows.slice(1)
    : applicantRows;
  const applicationAttribution = (row: string[]): ApplicationAttribution => ({
    source: row[12]?.trim() || "",
    medium: row[13]?.trim() || "",
    campaign: row[14]?.trim() || "",
    video: "",
  });
  const uniqueApplicationIndex = (keyFor: (row: string[]) => string) => {
    const index = new Map<string, ApplicationAttribution | null>();
    for (const row of applicationDataRows) {
      const key = keyFor(row);
      if (!key) continue;
      index.set(key, index.has(key) ? null : applicationAttribution(row));
    }
    return index;
  };
  const applicationsByEmail = uniqueApplicationIndex((row) => {
    const email = row[2]?.trim().toLowerCase() || "";
    return email.includes("@") ? email : "";
  });
  const applicationsByPhone = uniqueApplicationIndex((row) => {
    const phone = row[3]?.replace(/\D/g, "") || "";
    return phone.length >= 7 ? phone : "";
  });

  const deals: ImportedDeal[] = dealRows.map((row) => {
    const email = row[2]?.trim().toLowerCase() || "";
    const phone = row[1]?.replace(/\D/g, "") || "";
    const manualSource = optionalDealValue(row, "source", "attribution source", "utm source");
    const matchedApplication = manualSource ? null :
      (email.includes("@") ? applicationsByEmail.get(email) : null) ||
      (phone.length >= 7 ? applicationsByPhone.get(phone) : null) ||
      null;
    return {
      sourceKey: sourceKey(row.slice(0, 12)),
      leadName: row[0]?.trim() || "Unnamed lead",
      phone: row[1]?.trim() || "",
      email,
      setter: row[3]?.trim() || "",
      closer: row[4]?.trim() || "",
      paymentMethod: row[5]?.trim() || "",
      attributionSource: manualSource || matchedApplication?.source || "",
      attributionMedium: optionalDealValue(row, "medium", "attribution medium", "utm medium") || matchedApplication?.medium || "",
      attributionCampaign: optionalDealValue(row, "campaign", "attribution campaign", "utm campaign") || matchedApplication?.campaign || "",
      attributionVideo: optionalDealValue(row, "video", "video id", "youtube video", "utm content") || matchedApplication?.video || "",
      cashCollected: numeric(row[6]),
      offerAmount: numeric(row[7]),
      amountOwed: numeric(row[8]),
      closedAt: isoDate(row[9]),
      nextPaymentAt: isoDate(row[10]),
      contractEndAt: isoDate(row[11]),
    };
  });

  const meetings: ImportedMeeting[] = crm.flatMap((row) => {
    if (row[0]?.trim().toLowerCase() === "lead name") return [];
    const scheduledAt = isoDate(row[6]);
    if (!scheduledAt) return [];
    const status = row[3]?.trim() || "booked";
    return [
      {
        sourceKey: sourceKey(row),
        leadName: row[0]?.trim() || "Unnamed lead",
        phone: row[1]?.trim() || "",
        email: row[2]?.trim().toLowerCase() || "",
        setter: row[4]?.trim() || "",
        closer: row[5]?.trim() || "",
        scheduledAt,
        status,
        taken: !/no show|rescheduled|cancel|booked/i.test(status),
        notes: row[7]?.trim() || "",
        recordingUrl: safeHttpUrl(row[8]),
        feedback: row[9]?.trim() || "",
      },
    ];
  });

  const payouts: ImportedPayout[] = payoutRows.flatMap((row) => {
    if (row[0]?.trim().toLowerCase() === "payee") return [];
    const payee = row[0]?.trim() || "";
    const date = isoDate(row[1]);
    const method = row[2]?.trim() || "";
    const amount = numeric(row[3]);
    if (!payee || !date || !method || amount <= 0) return [];
    const role = row[4]?.trim() || "Team";
    const payoutId = row[5]?.trim() || "";
    return [{
      sourceKey: payoutId ? `app:${payoutId}` : `sheet:${sourceKey([payee, date, method, String(amount), role])}`,
      member: `${role}:${payee}`,
      date,
      method,
      amount,
    }];
  });

  const parsedAttributionEvents: ImportedAttributionEvent[] = eventRows.flatMap(
    (row, index) => {
      if (index === 0 && row[0]?.startsWith("timestamp ")) {
        const timestamps = row[0].trim().split(/\s+/).slice(1);
        const eventNames = row[1]?.trim().split(/\s+/).slice(1) ?? [];
        return timestamps.flatMap((timestamp, eventIndex) => {
          const eventName = eventNames[eventIndex];
          const occurredAt = timestamp.match(/^\d{4}-\d{2}-\d{2}/)?.[0];
          if (!occurredAt || (eventName !== "page_view" && eventName !== "application_submitted")) return [];
          return [{ sourceKey: sourceKey([timestamp, eventName]), occurredAt, eventName, source: "", medium: "", campaign: "", content: "", videoId: "", landingPage: "" }];
        });
      }
      const timestamp = row[0]?.trim() ?? "";
      const eventName = row[1]?.trim();
      const occurredAt = timestamp.match(/^\d{4}-\d{2}-\d{2}/)?.[0];
      if (!occurredAt || (eventName !== "page_view" && eventName !== "application_submitted")) return [];
      return [{
        sourceKey: sourceKey([timestamp, eventName, row[6] ?? "", row[8] ?? ""]),
        occurredAt,
        eventName,
        source: row[6]?.trim().toLowerCase() || "",
        medium: row[7]?.trim().toLowerCase() || "",
        campaign: row[8]?.trim() || "",
        content: row[9]?.trim() || "",
        videoId: row[10]?.trim() || "",
        landingPage: row[11]?.trim() || "",
      }];
    },
  );
  const submissionLimit = applicantRows.length;
  const datedSubmissions = parsedAttributionEvents
    .filter((event) => event.eventName === "application_submitted")
    .slice(-submissionLimit);
  const attributionEvents = [
    ...parsedAttributionEvents.filter((event) => event.eventName === "page_view"),
    ...datedSubmissions,
  ];

  return {
    people: [
      ...peopleFromRows(section("Setter Name", ["Closer Name"]), "setter"),
      ...peopleFromRows(section("Closer Name", ["Operator"]), "closer"),
      ...peopleFromRows(section("Operator", []), "operator"),
    ],
    deals,
    meetings,
    payouts,
    attributionEvents,
    applicantCount: applicantRows.length + 17,
  };
}
