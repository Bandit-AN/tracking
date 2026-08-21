"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Client = { id: number; name: string; industry: string; initials: string; color: string; avatar?: string };
type Person = { name: string; role: "Closer" | "Setter" | "Operator" | "Growth Operator" | "Co-owner"; calls: number; closed: number; cash: number; revenue: number; commission: number; paid: number; commissionRate?: number };
type Deal = { lead: string; phone: string; email: string; setter: string; closer: string; method: string; cash: number; offer: number; owed: number; date: string; next: string; end: string; source: string; medium: string; campaign: string; video: string; workspaceId: number; workspaceName?: string; sheetRow: number; growthOperator?: string };
type Meeting = { lead: string; email: string; date: string; status: string; setter: string; closer: string; taken: boolean };
type Booking = { name: string; email: string; date: string; source: string; medium: string; campaign: string; video: string; leadSource: string };
type Payout = { id: number; workspaceId: number; member: string; date: string; method: string; amount: number };
type MetaInsight = { date_start: string; ad_id?: string; ad_name?: string; campaign_name?: string; spend: string; impressions?: string; clicks?: string };
type SupportMessage = { id: number; workspaceId: number; workspaceName: string; senderEmail: string; message: string; status: "open" | "resolved"; createdAt: string };
type SheetMetrics = { booked: number; taken: number; showRate: number; closers: Person[]; setters: Person[]; operators: Person[]; deals: Deal[]; meetings: Meeting[]; bookings: Booking[]; sheetPayouts: Payout[]; applicationDates: string[]; applicationCount: number; duplicateDealsRemoved: number; updatedAt: Date };
type AgencySource = { client: Client; data: SheetMetrics };

const sheetUrlDefault = "https://docs.google.com/spreadsheets/d/1ahyY64u9uYmcEDFi1XAJRFmnZ_gX_6VQHUnWvswkvmg/edit?usp=sharing";
const agencyClient: Client = { id: 0, name: "Agency view", industry: "All connected offers", initials: "MR", color: "#8b6cff", avatar: "/moonriftmedia-logo.jpg" };
const sellerSyndicateLogo = "/seller-syndicate-logo.png";
const clientsSeed: Client[] = [
  agencyClient,
  { id: 1, name: "Seller Syndicate", industry: "Sales workspace", initials: "SS", color: "#7646ff", avatar: sellerSyndicateLogo },
];
const money = (value: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value || 0);
const numeric = (value = "") => Number(value.replace(/[$,%\s,]/g, "")) || 0;
const sheetIdFromUrl = (value: string) => value.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/)?.[1] ?? value.trim();
const initials = (name: string) => name.split(/\s+/).map((word) => word[0]).join("").slice(0, 2).toUpperCase();
const repNames = (value: string) => value.split(/\s*\/\s*|\s*,\s*/).map((name) => name.trim()).filter(Boolean);
const normalizedLabel = (value = "") => value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "");

function columnIndex(headers: string[], aliases: string[], fallback = -1) {
  const normalized = headers.map(normalizedLabel);
  const index = aliases.map(normalizedLabel).map((alias) => normalized.indexOf(alias)).find((item) => item >= 0);
  return index ?? fallback;
}

function rowValue(row: string[], headers: string[], aliases: string[], fallback = -1) {
  const index = columnIndex(headers, aliases, fallback);
  return index >= 0 ? row[index] ?? "" : "";
}

function uniqueDeals(rows: Deal[]) {
  const seen = new Set<string>();
  let duplicateCount = 0;
  const summaryLabels = /^(?:total|totals|grand total|revenue generated|cash collected|contracted amount|setter name|closer name|other %|operator)$/i;
  const deals = rows.filter((deal) => {
    const lead = deal.lead.trim();
    if (!lead || summaryLabels.test(lead)) return false;

    // Only actual deal rows may contribute to dashboard revenue. Summary rows
    // have no contact or assigned sales rep and are deliberately excluded.
    const hasDealIdentity = Boolean(deal.phone.trim() || deal.email.trim() || deal.setter.trim() || deal.closer.trim());
    if (!hasDealIdentity) return false;

    const key = [lead, deal.phone, deal.email, deal.setter, deal.closer, deal.cash, deal.offer, deal.owed, deal.date]
      .map((value) => String(value ?? "").trim().toLowerCase())
      .join("|");
    if (seen.has(key)) { duplicateCount++; return false; }
    seen.add(key);
    return true;
  });
  return { deals, duplicateCount };
}

function assignGrowthOperatorDeals(deals: Deal[], operators: Person[]) {
  const assigned = deals.map((deal) => ({ ...deal }));
  operators.filter((person) => person.role === "Growth Operator" && (person.cash > 0 || person.revenue > 0)).forEach((operator) => {
    let best: { start: number; end: number } | null = null;
    for (let start = 0; start < assigned.length; start++) {
      let cash = 0; let revenue = 0;
      for (let end = start; end < assigned.length; end++) {
        if (assigned[end].growthOperator) break;
        cash += assigned[end].cash; revenue += assigned[end].offer;
        if (Math.abs(cash - operator.cash) < .01 && Math.abs(revenue - operator.revenue) < .01) best = { start, end };
      }
    }
    if (best) for (let index = best.start; index <= best.end; index++) assigned[index].growthOperator = operator.name;
  });
  return assigned;
}

function parseCsv(text: string) {
  const rows: string[][] = []; let row: string[] = []; let cell = ""; let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"') {
      if (quoted && text[i + 1] === '"') { cell += '"'; i++; } else quoted = !quoted;
    } else if (char === "," && !quoted) { row.push(cell); cell = ""; }
    else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); if (row.some(Boolean)) rows.push(row); row = []; cell = "";
    } else cell += char;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

function parseSheetDate(value: string) {
  if (!value?.trim()) return null;
  const raw = value.trim();
  const usDate = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  const isoDate = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const date = usDate
    ? new Date(Number(usDate[3]), Number(usDate[1]) - 1, Number(usDate[2]), 12)
    : isoDate
      ? new Date(Number(isoDate[1]), Number(isoDate[2]) - 1, Number(isoDate[3]), 12)
      : new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

function endOfDay(value = new Date()) {
  const end = new Date(value); end.setHours(23, 59, 59, 999); return end;
}

function rangeStart(range: string, now: Date) {
  const start = new Date(now); start.setHours(0, 0, 0, 0);
  if (range === "Last 7 days") start.setDate(start.getDate() - 6);
  if (range === "Last 30 days") start.setDate(start.getDate() - 29);
  if (range === "This quarter") start.setMonth(Math.floor(start.getMonth() / 3) * 3, 1);
  if (range === "Year to date") start.setMonth(0, 1);
  if (range === "All time") start.setFullYear(2000, 0, 1);
  return start;
}

const percentChange = (current: number, previous: number) => previous === 0 ? (current > 0 ? 100 : 0) : (current - previous) / previous * 100;

function combineAgencyMetrics(sources: AgencySource[]): SheetMetrics {
  const mergePeople = (key: "closers" | "setters" | "operators") => {
    const people = new Map<string, Person>();
    sources.forEach(({ data }) => data[key].forEach((person) => {
      const id = `${person.role}:${person.name.toLowerCase()}`;
      const current = people.get(id);
      if (current) {
        current.calls += person.calls; current.closed += person.closed; current.cash += person.cash;
        current.revenue += person.revenue; current.commission += person.commission; current.paid += person.paid;
      } else people.set(id, { ...person });
    }));
    return [...people.values()].sort((a, b) => b.cash - a.cash);
  };
  const booked = sources.reduce((sum, { data }) => sum + data.booked, 0);
  const taken = sources.reduce((sum, { data }) => sum + data.taken, 0);
  return {
    booked, taken, showRate: booked ? taken / booked * 100 : 0,
    closers: mergePeople("closers"), setters: mergePeople("setters"), operators: mergePeople("operators"),
    deals: sources.flatMap(({ client, data }) => data.deals.map((deal) => ({ ...deal, workspaceName: client.name }))), meetings: sources.flatMap(({ data }) => data.meetings),
    bookings: sources.flatMap(({ data }) => data.bookings), sheetPayouts: sources.flatMap(({ data }) => data.sheetPayouts),
    applicationDates: sources.flatMap(({ data }) => data.applicationDates),
    applicationCount: sources.reduce((sum, { data }) => sum + data.applicationCount, 0),
    duplicateDealsRemoved: sources.reduce((sum, { data }) => sum + data.duplicateDealsRemoved, 0), updatedAt: new Date(),
  };
}

function Chart({ data, labels, color, fill, label, total }: { data: number[]; labels: string[]; color: string; fill: string; label: string; total: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [hover, setHover] = useState<{ index: number; x: number; y: number } | null>(null);
  useEffect(() => {
    const el = canvas.current; if (!el) return;
    const render = () => {
      const ratio = window.devicePixelRatio || 1; const { width, height } = el.getBoundingClientRect();
      el.width = width * ratio; el.height = height * ratio;
      const ctx = el.getContext("2d"); if (!ctx) return; ctx.scale(ratio, ratio);
      const values = data.length ? data : [0]; const max = Math.max(...values, 1) * 1.12;
      for (let i = 0; i < 4; i++) { const y = 15 + ((height - 30) / 3) * i; ctx.strokeStyle = "rgba(130,120,150,.16)"; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke(); }
      const points = values.map((v, i) => ({ x: values.length === 1 ? width / 2 : 8 + i / (values.length - 1) * (width - 16), y: height - 15 - v / max * (height - 30) }));
      const gradient = ctx.createLinearGradient(0, 0, 0, height); gradient.addColorStop(0, fill); gradient.addColorStop(1, "rgba(0,0,0,0)");
      ctx.beginPath(); ctx.moveTo(points[0].x, height); points.forEach((p) => ctx.lineTo(p.x, p.y)); ctx.lineTo(points.at(-1)!.x, height); ctx.closePath(); ctx.fillStyle = gradient; ctx.fill();
      ctx.beginPath(); points.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); ctx.strokeStyle = color; ctx.lineWidth = 2.5; ctx.stroke();
      points.forEach((p) => { ctx.beginPath(); ctx.arc(p.x, p.y, 3, 0, Math.PI * 2); ctx.fillStyle = "#fff"; ctx.fill(); ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.stroke(); });
    };
    render(); const ro = new ResizeObserver(render); ro.observe(el); return () => ro.disconnect();
  }, [data, color, fill]);
  const peak = data.length ? Math.max(...data) : 0; const peakIndex = data.indexOf(peak);
  return <article className="chart-card"><div className="chart-head"><div><span className="chart-dot" style={{ background: color }} />{label}<small>Peak {labels[peakIndex] ?? "—"}: {money(peak)}</small></div><strong>{total}</strong></div><div className="chart-canvas-wrap"><canvas ref={canvas} aria-label={`${label} by payment date`} onMouseLeave={() => setHover(null)} onMouseMove={(event) => { if (!data.length) return; const rect = event.currentTarget.getBoundingClientRect(); const pointerX = event.clientX - rect.left; const index = Math.max(0, Math.min(data.length - 1, Math.round((pointerX - 8) / Math.max(1, rect.width - 16) * (data.length - 1)))); const x = data.length === 1 ? rect.width / 2 : 8 + index / (data.length - 1) * (rect.width - 16); const max = Math.max(...data, 1) * 1.12; const y = rect.height - 15 - data[index] / max * (rect.height - 30); setHover({ index, x, y }); }} />{hover && data[hover.index] !== undefined && <div className="chart-tooltip" style={{ left: hover.x, top: hover.y }}><b>{labels[hover.index]}</b><span>{money(data[hover.index])}</span></div>}</div><div className="chart-axis">{labels.filter((_, i) => i % Math.max(1, Math.ceil(labels.length / 5)) === 0 || i === labels.length - 1).map((x, i) => <span key={`${x}-${i}`}>{x}</span>)}</div></article>;
}

function AttributionChart({ title, items, color }: { title: string; items: Array<{ label: string; value: number }>; color: string[] }) {
  const total = items.reduce((sum, item) => sum + item.value, 0);
  const gradient = items.reduce<{ cursor: number; stops: string[] }>((result, item, index) => {
    const end = result.cursor + (total ? item.value / total * 100 : 0);
    return { cursor: end, stops: [...result.stops, `${color[index % color.length]} ${result.cursor}% ${end}%`] };
  }, { cursor: 0, stops: [] }).stops.join(", ") || "#2a2533 0 100%";
  return <article className="attribution-card"><div><h3>{title}</h3><strong>{money(total)}</strong></div><div className="donut" style={{ background: `conic-gradient(${gradient})` }}><span>{items.length}</span></div><ul>{items.map((item, i) => <li key={item.label}><i style={{ background: color[i % color.length] }} /><span>{item.label}</span><b>{money(item.value)}</b><small>{total ? (item.value / total * 100).toFixed(1) : 0}%</small></li>)}</ul></article>;
}

function PerformanceTable({ title, people, range }: { title: "Closer" | "Setter"; people: Person[]; range: string }) {
  const rateLabel = title === "Setter" ? "Show rate" : "Close rate";
  return <article className="table-card">
    <div className="section-head"><div><h2>{title} performance</h2><p>{range} · sorted by most cash collected</p></div></div>
    <div className="table-wrap"><table><thead><tr><th>{title}</th><th>{title === "Setter" ? "Booked" : "Calls"}</th><th>{title === "Setter" ? "Taken" : "Closed"}</th><th>{rateLabel}</th><th>Cash collected</th><th>Revenue</th><th>Commission owed</th></tr></thead><tbody>
      {people.map((p, i) => <tr key={p.name}><td><span className={`person p${i % 4}`}>{initials(p.name)}</span><div><b>{p.name}</b><small>{p.role}</small></div></td><td>{p.calls}</td><td>{p.closed}</td><td><span className="rate">{p.calls ? Math.round(p.closed / p.calls * 100) : 0}%</span></td><td>{money(p.cash)}</td><td>{money(p.revenue)}</td><td>{money(Math.max(0, p.commission - p.paid))}</td></tr>)}
      {!people.length && <tr><td colSpan={7}>No team data in this sheet.</td></tr>}
    </tbody></table></div>
  </article>;
}

export function Dashboard() {
  const [clients, setClients] = useState(clientsSeed); const [clientId, setClientId] = useState(1);
  const [range, setRange] = useState("Last 30 days"); const [tab, setTab] = useState("Overview"); const [activeNav, setActiveNav] = useState("Dashboard");
  const [customStart, setCustomStart] = useState("2026-07-01"); const [customEnd, setCustomEnd] = useState(new Date().toISOString().slice(0, 10));
  const [sidebarOpen, setSidebarOpen] = useState(false); const [clientMenu, setClientMenu] = useState(false); const [actionMenu, setActionMenu] = useState(false);
  const [modal, setModal] = useState<"client" | "member" | "sheet" | "meta" | "support" | "settings" | "payout" | null>(null); const [toast, setToast] = useState("");
  const [newName, setNewName] = useState(""); const [email, setEmail] = useState(""); const [memberRole, setMemberRole] = useState("Viewer"); const [workspaceName, setWorkspaceName] = useState(""); const [workspaceAvatar, setWorkspaceAvatar] = useState("");
  const [sheetUrls, setSheetUrls] = useState<Record<number, string>>({ 1: sheetUrlDefault }); const [sheetUrl, setSheetUrl] = useState(sheetUrlDefault);
  const [sheetData, setSheetData] = useState<SheetMetrics | null>(null); const [sheetStatus, setSheetStatus] = useState<"idle" | "loading" | "connected" | "error">("idle");
  const [agencySources, setAgencySources] = useState<AgencySource[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [metaInsights, setMetaInsights] = useState<MetaInsight[]>([]); const [metaConnected, setMetaConnected] = useState(false); const [metaStatus, setMetaStatus] = useState<"idle" | "loading" | "error">("idle");
  const [metaAccount, setMetaAccount] = useState("");
  const [supportMessages, setSupportMessages] = useState<SupportMessage[]>([]); const [supportText, setSupportText] = useState(""); const [isAgencyAdmin, setIsAgencyAdmin] = useState(false);
  const [payouts, setPayouts] = useState<Payout[]>([]); const [payoutMember, setPayoutMember] = useState(""); const [payoutDate, setPayoutDate] = useState(new Date().toISOString().slice(0, 10)); const [payoutMethod, setPayoutMethod] = useState("ACH"); const [payoutAmount, setPayoutAmount] = useState("");
  const client = clients.find((c) => c.id === clientId) ?? clients[0];

  async function fetchSheetMetrics(url: string, workspaceId: number, force = false): Promise<SheetMetrics> {
      const id = sheetIdFromUrl(url);
      const getSheet = async (sheet: string, optional = false) => { try { const response = await fetch(`/api/sheets?spreadsheetId=${encodeURIComponent(id)}&sheet=${encodeURIComponent(sheet)}${force ? `&refresh=${Date.now()}` : ""}`, { cache: "no-store" }); if (!response.ok) throw new Error(); return parseCsv(await response.text()); } catch (error) { if (optional) return []; throw error; } };
      const [overview, closed, crm, applications, events, payoutRows, bookedCalls] = await Promise.all([getSheet("System Overview"), getSheet("Closed Deals"), getSheet("Sales CRM"), getSheet("Applications", true), getSheet("Events", true), getSheet("Payouts", true), getSheet("Booked Calls", true)]);
      const totalsHeader = overview.findIndex((row) => row.some((cell) => normalizedLabel(cell) === "meetingsbooked")); const totalHeaders = overview[totalsHeader] ?? []; const totals = overview[totalsHeader + 1] ?? [];
      const overviewSectionLabels = ["Setter Name", "Closer Name", "Other %", "Operator", "Other Employees", "Growth Operator", "Growth Operators", "Growth Operator Name"].map(normalizedLabel);
      const findSection = (names: string[]) => {
        const aliases = names.map(normalizedLabel); const start = overview.findIndex((row) => aliases.includes(normalizedLabel(row[0])));
        if (start < 0) return { headers: [] as string[], rows: [] as string[][] };
        const remaining = overview.slice(start + 1); const end = remaining.findIndex((row) => overviewSectionLabels.includes(normalizedLabel(row[0])));
        return { headers: overview[start], rows: (end < 0 ? remaining : remaining.slice(0, end)).filter((row) => row[0]?.trim()) };
      };
      const peopleFromSection = (names: string[], roleForName: (name: string) => Person["role"], revenueShareLayout = false) => {
        const { headers, rows } = findSection(names);
        return rows.map((row) => {
          const name = rowValue(row, headers, names, 0).trim();
          const cash = revenueShareLayout ? 0 : numeric(rowValue(row, headers, ["Cash Collected"], 5)); const commission = numeric(rowValue(row, headers, ["Setter Commision", "Setter Commission", "Closer Commission", "GO Commission", "Commission", "Amount Owed"], revenueShareLayout ? 2 : 6));
          const statedRate = numeric(rowValue(row, headers, ["Rev-Share", "Revenue Share"], revenueShareLayout ? 1 : -1));
          return { name, role: roleForName(name), calls: revenueShareLayout ? 0 : numeric(rowValue(row, headers, ["Meetings Booked", "Meetings Taken", "Qualified Meetings", "Calls"], 1)), closed: revenueShareLayout ? 0 : numeric(rowValue(row, headers, ["Showed Up", "Meetings Closed", "Calls Closed"], 2)), revenue: revenueShareLayout ? 0 : numeric(rowValue(row, headers, ["Revenue Generated", "Revenue Set"], 4)), cash, commission, paid: numeric(rowValue(row, headers, ["Paid Out", "Amount Paid"], revenueShareLayout ? 3 : 7)), commissionRate: statedRate ? statedRate / 100 : cash ? commission / cash : undefined };
        }).filter((person) => person.name).sort((a, b) => b.cash - a.cash);
      };
      const setters = peopleFromSection(["Setter Name"], () => "Setter");
      const closers = peopleFromSection(["Closer Name"], () => "Closer");
      const revenueShareOperators = peopleFromSection(["Other %", "Operator"], (name) => /king/i.test(name) ? "Co-owner" : "Operator", true);
      const growthOperators = peopleFromSection(["Other Employees", "Growth Operator", "Growth Operators", "Growth Operator Name"], () => "Growth Operator");
      const operators = [...revenueShareOperators, ...growthOperators];
      const header = closed.findIndex((row) => normalizedLabel(row[0]) === "leadname"); const dealHeaders = closed[header] ?? [];
      const mappedDeals = header < 0 ? [] : closed.slice(header + 1).map((row, index): Deal => ({
        lead: rowValue(row, dealHeaders, ["Lead Name", "Client Name", "Customer Name"], 0), phone: rowValue(row, dealHeaders, ["Phone Number", "Phone"], 1), email: rowValue(row, dealHeaders, ["Email", "Email Address"], 2), setter: rowValue(row, dealHeaders, ["Setter", "Setter Name"], 3), closer: rowValue(row, dealHeaders, ["Closer", "Closer Name"], 4), method: rowValue(row, dealHeaders, ["Paid Through", "Payment Method"], 5),
        cash: numeric(rowValue(row, dealHeaders, ["Cash Collected", "Collected"])), offer: numeric(rowValue(row, dealHeaders, ["Revenue Generated", "Offer Amount", "Revenue Contracted", "Contract Value"])), owed: numeric(rowValue(row, dealHeaders, ["Amount Owed", "Balance Owed", "Remaining Balance"])), date: rowValue(row, dealHeaders, ["Date Closed", "Closed Date", "Payment Date"]), next: rowValue(row, dealHeaders, ["Next Payment Date", "Next Payment"]), end: rowValue(row, dealHeaders, ["Program End Date", "End Date"]), source: rowValue(row, dealHeaders, ["Source", "Lead Source", "Attribution Source"]) || "Unattributed", medium: rowValue(row, dealHeaders, ["Medium", "UTM Medium"]), campaign: rowValue(row, dealHeaders, ["Campaign", "UTM Campaign"]), video: rowValue(row, dealHeaders, ["Video", "Video ID", "Specific Ad / Video", "Ad", "Creative", "UTM Content"]), workspaceId, sheetRow: header + index + 2,
      }));
      const unique = uniqueDeals(mappedDeals); const deals = assignGrowthOperatorDeals(unique.deals, growthOperators);
      const payoutHeader = payoutRows.findIndex((row) => normalizedLabel(row[0]) === "payee"); const payoutHeaders = payoutRows[payoutHeader] ?? []; const payoutData = payoutHeader >= 0 ? payoutRows.slice(payoutHeader + 1).filter((row) => row[0]?.trim()) : [];
      const crmHeader = crm.findIndex((row) => normalizedLabel(row[0]) === "leadname"); const crmHeaders = crm[crmHeader] ?? []; const crmData = crmHeader >= 0 ? crm.slice(crmHeader + 1) : [];
      const applicationHeader = applications.findIndex((row) => normalizedLabel(row[0]) === "status" || row.some((cell) => normalizedLabel(cell) === "submittedat")); const applicationHeaders = applications[applicationHeader] ?? []; const applicationData = applicationHeader >= 0 ? applications.slice(applicationHeader + 1).filter((row) => row.some((cell) => cell.trim())) : [];
      const bookingHeader = bookedCalls.findIndex((row) => normalizedLabel(row[0]) === "timestamp"); const bookingData = bookingHeader >= 0 ? bookedCalls.slice(bookingHeader + 1).filter((row) => row[0]?.trim()) : [];
      return {
        booked: numeric(rowValue(totals, totalHeaders, ["Meetings Booked"], 0)), taken: numeric(rowValue(totals, totalHeaders, ["Meetings Taken"], 1)), showRate: numeric(rowValue(totals, totalHeaders, ["Show Rate"], 3)),
        setters, closers, operators, deals,
        meetings: crmData.filter((row) => rowValue(row, crmHeaders, ["Lead Name"], 0).trim() && parseSheetDate(rowValue(row, crmHeaders, ["Meeting Date", "Call Date"], 6))).map((row) => { const status = rowValue(row, crmHeaders, ["Status"], 3); return { lead: rowValue(row, crmHeaders, ["Lead Name"], 0), email: rowValue(row, crmHeaders, ["Email", "Email Address"], 2), date: rowValue(row, crmHeaders, ["Meeting Date", "Call Date"], 6), status, setter: rowValue(row, crmHeaders, ["Setter", "Setter Name"], 4), closer: rowValue(row, crmHeaders, ["Closer", "Closer Name"], 5), taken: !!status && !/no show|cancelled/i.test(status) }; }),
        bookings: bookingData.map((row) => ({ name: row[1] || "", email: row[2] || "", date: row[8] || row[0], source: row[10] || "", medium: row[11] || "", campaign: row[12] || "", video: (() => { try { return JSON.parse(row[14] || "{}").attribution?.video_id || row[12] || ""; } catch { return row[12] || ""; } })(), leadSource: row[15] || "" })),
        sheetPayouts: payoutData.map((row, index) => { const payee = rowValue(row, payoutHeaders, ["Payee"], 0); const role = rowValue(row, payoutHeaders, ["Role"], 4); return { id: numeric(rowValue(row, payoutHeaders, ["ID", "Payout ID"], 5)) || workspaceId * 1000000 + 900000 + index, workspaceId, member: role ? `${role}:${payee}` : payee, date: rowValue(row, payoutHeaders, ["Date", "Day"], 1), method: rowValue(row, payoutHeaders, ["Method", "Payment Method"], 2), amount: numeric(rowValue(row, payoutHeaders, ["Amount", "Payout Amount"], 3)) }; }),
        applicationDates: applicationData.length ? applicationData.map((row) => rowValue(row, applicationHeaders, ["submitted_at", "Submitted At", "Timestamp"], 0)).filter((date) => !!parseSheetDate(date)) : events.filter((row) => row[1]?.trim() === "application_submitted" && parseSheetDate(row[0])).map((row) => row[0]),
        applicationCount: applicationData.length || events.filter((row) => row[1]?.trim() === "application_submitted").length,
        duplicateDealsRemoved: unique.duplicateCount,
        updatedAt: new Date(),
      };
  }

  async function loadSheet(url = sheetUrls[clientId], force = false) {
    setSheetStatus("loading");
    if (clientId === agencyClient.id) {
      const connectedOffers = clients.filter((item) => item.id !== agencyClient.id).flatMap((item) => {
        const itemUrl = sheetUrls[item.id] || (item.id === 1 ? sheetUrlDefault : "");
        return itemUrl ? [{ client: item, url: itemUrl }] : [];
      });
      if (!connectedOffers.length) { setAgencySources([]); setSheetData(null); setSheetStatus("idle"); return null; }
      const results = await Promise.allSettled(connectedOffers.map(async ({ client, url: itemUrl }) => ({ client, data: await fetchSheetMetrics(itemUrl, client.id, force) })));
      const sources = results.flatMap((result) => result.status === "fulfilled" ? [result.value] : []);
      setAgencySources(sources);
      if (!sources.length) { setSheetData(null); setSheetStatus("error"); return null; }
      const combined = combineAgencyMetrics(sources);
      setSheetData(combined); setSheetStatus("connected");
      return { dealCount: combined.deals.length, duplicateCount: combined.duplicateDealsRemoved };
    }
    if (!url) { setAgencySources([]); setSheetData(null); setSheetStatus("idle"); return null; }
    try {
      const metrics = await fetchSheetMetrics(url, clientId, force);
      setAgencySources([]); setSheetData(metrics);
      setSheetStatus("connected");
      return { dealCount: metrics.deals.length, duplicateCount: metrics.duplicateDealsRemoved };
    } catch { setAgencySources([]); setSheetStatus("error"); setSheetData(null); return null; }
  }

  async function loadWorkspace() {
    if (clientId === agencyClient.id) { setPayouts([]); return; }
    try {
      const response = await fetch(`/api/workspaces?workspaceId=${clientId}`); if (!response.ok) return;
      const data = await response.json() as { workspace?: { name?: string; avatar?: string; industry?: string; initials?: string; color?: string; sheetUrl?: string }; payouts?: Payout[] };
      if (data.workspace?.name) {
        setClients((items) => items.map((item) => item.id === clientId ? { ...item, name: data.workspace!.name!, initials: data.workspace!.initials || initials(data.workspace!.name!), avatar: data.workspace!.avatar || item.avatar || (item.id === 1 ? sellerSyndicateLogo : ""), industry: data.workspace!.industry || item.industry, color: data.workspace!.color || item.color } : item));
        if (data.workspace.sheetUrl) setSheetUrls((items) => ({ ...items, [clientId]: data.workspace!.sheetUrl! }));
      }
      setPayouts(data.payouts ?? []);
    } catch { /* Preview remains usable when local D1 is unavailable. */ }
  }

  async function loadWorkspaceList() {
    try {
      const response = await fetch("/api/workspaces?all=true"); if (!response.ok) return;
      const data = await response.json() as { workspaces?: Array<Client & { sheetUrl?: string }> };
      if (data.workspaces?.length) {
        const normalized = data.workspaces.map((item) => ({ ...item, id: Number(item.id), initials: item.initials || initials(item.name), color: item.color || "#7646ff", avatar: item.avatar || (Number(item.id) === 1 ? sellerSyndicateLogo : "") }));
        const savedSheetUrls = Object.fromEntries(data.workspaces.filter((item) => item.sheetUrl).map((item) => [Number(item.id), item.sheetUrl!] as const));
        setClients([agencyClient, ...normalized]); setSheetUrls((current) => ({ ...current, ...savedSheetUrls }));
        if (clientId !== agencyClient.id && !normalized.some((item) => item.id === clientId)) setClientId(normalized[0].id);
      }
    } catch {}
  }

  useEffect(() => { const timer = window.setTimeout(() => void loadWorkspaceList(), 0); return () => window.clearTimeout(timer); }, []);
  useEffect(() => { const timer = window.setTimeout(() => { void loadSheet(); void loadWorkspace(); void loadSupport(); }, 0); return () => window.clearTimeout(timer); }, [clientId]);
  useEffect(() => { const timer = window.setTimeout(() => void loadMeta(), 0); return () => window.clearTimeout(timer); }, [clientId, range, customStart, customEnd]);
  const notify = (text: string) => { setToast(text); window.setTimeout(() => setToast(""), 2800); };
  useEffect(() => {
    const params = new URLSearchParams(window.location.search); const metaResult = params.get("meta"); if (!metaResult) return;
    const timer = window.setTimeout(() => {
      if (metaResult === "connected") notify("Meta Ads connected successfully");
      else if (metaResult === "cancelled") notify("Meta connection cancelled");
      else if (metaResult === "setup_required") notify("Meta OAuth needs the MoonRift app credentials");
      else notify(params.get("reason") === "no_ad_accounts" ? "No accessible Meta ad accounts were found" : "Meta Ads could not be connected");
    }, 0);
    window.history.replaceState({}, "", `${window.location.pathname}${window.location.hash}`);
    return () => window.clearTimeout(timer);
  }, []);

  async function refreshDashboard() {
    setRefreshing(true);
    const currentSheetUrl = sheetUrls[clientId] || (clientId === 1 ? sheetUrlDefault : "");
    const [sheetResult] = await Promise.all([loadSheet(currentSheetUrl, true), loadWorkspace(), loadMeta()]);
    setRefreshing(false);
    if (!sheetResult) { notify("Google Sheets refresh failed"); return; }
    notify(`Refreshed ${sheetResult.dealCount} unique closed deals${sheetResult.duplicateCount ? ` · removed ${sheetResult.duplicateCount} duplicate${sheetResult.duplicateCount === 1 ? "" : "s"}` : ""}`);
  }

  function selectedBounds() {
    const end = range === "Custom" ? endOfDay(new Date(`${customEnd}T12:00:00`)) : endOfDay();
    const start = range === "Custom" ? new Date(`${customStart}T00:00:00`) : rangeStart(range, end);
    return { start, end };
  }

  async function loadMeta() {
    const { start, end } = selectedBounds(); setMetaStatus("loading");
    try {
      const workspaceIds = clientId === agencyClient.id ? clients.filter((item) => item.id !== agencyClient.id).map((item) => item.id) : [clientId];
      const results = await Promise.all(workspaceIds.map(async (workspaceId) => {
        const response = await fetch(`/api/meta?workspaceId=${workspaceId}&since=${start.toISOString().slice(0, 10)}&until=${end.toISOString().slice(0, 10)}`, { cache: "no-store" });
        const data = await response.json() as { connected?: boolean; adAccountId?: string; insights?: MetaInsight[] };
        return { ok: response.ok, ...data };
      }));
      const connected = results.filter((result) => result.connected);
      setMetaConnected(connected.length > 0); setMetaAccount(clientId === agencyClient.id ? `${connected.length} ad account${connected.length === 1 ? "" : "s"}` : connected[0]?.adAccountId ?? "");
      setMetaInsights(connected.flatMap((result) => result.insights ?? [])); setMetaStatus(results.every((result) => result.ok) ? "idle" : "error");
    } catch { setMetaStatus("error"); setMetaInsights([]); }
  }

  function connectMeta(e: React.FormEvent) {
    e.preventDefault();
    if (clientId === agencyClient.id) { setModal(null); notify("Select an offer before connecting its Meta ad account"); return; }
    setMetaStatus("loading"); window.location.assign(`/api/meta/oauth/start?workspaceId=${clientId}`);
  }

  async function loadSupport() {
    try { const response = await fetch(`/api/support?workspaceId=${clientId}`, { cache: "no-store" }); if (!response.ok) return; const data = await response.json() as { isAdmin?: boolean; messages?: SupportMessage[] }; setIsAgencyAdmin(!!data.isAdmin); setSupportMessages(data.messages ?? []); } catch {}
  }

  async function sendSupport(e: React.FormEvent) {
    e.preventDefault(); if (!supportText.trim()) return; const response = await fetch("/api/support", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ workspaceId: clientId, workspaceName: client.name, message: supportText.trim() }) }); if (!response.ok) { notify("Message could not be sent"); return; } setSupportText(""); setModal(null); await loadSupport(); notify("Message sent to MoonRift Media");
  }

  async function resolveSupport(id: number) { await fetch("/api/support", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id, status: "resolved" }) }); await loadSupport(); notify("Request marked resolved"); }

  const period = useMemo(() => {
    const now = range === "Custom" ? endOfDay(new Date(`${customEnd}T12:00:00`)) : endOfDay(); const start = range === "Custom" ? new Date(`${customStart}T00:00:00`) : rangeStart(range, now);
    const allTime = range === "All time"; const dateInPeriod = (date: Date) => allTime || (date >= start && date <= now);
    const allDeals = sheetData?.deals ?? []; const missingDeals = allDeals.filter((deal) => !parseSheetDate(deal.date));
    const dated = allDeals.map((deal) => ({ deal, date: parseSheetDate(deal.date) })).filter((item): item is { deal: Deal; date: Date } => !!item.date && dateInPeriod(item.date));
    const spanStart = allTime && dated.length ? new Date(Math.min(...dated.map((x) => x.date.getTime()))) : start;
    const days = Math.max(1, Math.ceil((now.getTime() - spanStart.getTime()) / 86400000) + 1); const bucketCount = days <= 30 ? days : Math.min(13, Math.ceil(days / 7)); const bucketDays = Math.ceil(days / bucketCount);
    const cashSeries = Array(bucketCount).fill(0); const revenueSeries = Array(bucketCount).fill(0); const labels = Array(bucketCount).fill("");
    for (let i = 0; i < bucketCount; i++) { const date = new Date(spanStart); date.setDate(spanStart.getDate() + i * bucketDays); labels[i] = date.toLocaleDateString("en-US", { month: "short", day: "numeric" }); }
    dated.forEach(({ deal, date }) => { const index = Math.min(bucketCount - 1, Math.floor((date.getTime() - spanStart.getTime()) / 86400000 / bucketDays)); cashSeries[index] += deal.cash; revenueSeries[index] += deal.offer; });
    const meetings = (sheetData?.meetings ?? []).map((meeting) => ({ meeting, date: parseSheetDate(meeting.date)! })).filter((x) => x.date && dateInPeriod(x.date));
    const booked = meetings.length; const taken = meetings.filter((x) => x.meeting.taken).length;
    const meetingsClosed = meetings.filter((x) => /^(?:closed|deposit)$/i.test(x.meeting.status.trim())).length;
    const periodMs = now.getTime() - start.getTime() + 1; const previousStart = new Date(start.getTime() - periodMs); const previousEnd = new Date(start.getTime() - 1);
    const previousDeals = allTime ? [] : (sheetData?.deals ?? []).map((deal) => ({ deal, date: parseSheetDate(deal.date) })).filter((x): x is { deal: Deal; date: Date } => !!x.date && x.date >= previousStart && x.date <= previousEnd);
    const previousMeetings = allTime ? [] : (sheetData?.meetings ?? []).map((meeting) => ({ meeting, date: parseSheetDate(meeting.date) })).filter((x) => !!x.date && x.date >= previousStart && x.date <= previousEnd);
    const applications = allTime ? sheetData?.applicationCount ?? 0 : (sheetData?.applicationDates ?? []).map(parseSheetDate).filter((date): date is Date => !!date && dateInPeriod(date)).length;
    const previousApplications = allTime ? 0 : (sheetData?.applicationDates ?? []).map(parseSheetDate).filter((date): date is Date => !!date && date >= previousStart && date <= previousEnd).length;
    const current = { cash: dated.reduce((sum, x) => sum + x.deal.cash, 0), revenue: dated.reduce((sum, x) => sum + x.deal.offer, 0), closed: dated.length, meetingsClosed, booked, taken, show: booked ? taken / booked * 100 : 0, applications };
    const previous = { cash: previousDeals.reduce((s, x) => s + x.deal.cash, 0), revenue: previousDeals.reduce((s, x) => s + x.deal.offer, 0), closed: previousDeals.length, meetingsClosed: previousMeetings.filter((x) => /^(?:closed|deposit)$/i.test(x.meeting.status.trim())).length, booked: previousMeetings.length, taken: previousMeetings.filter((x) => x.meeting.taken).length, show: previousMeetings.length ? previousMeetings.filter((x) => x.meeting.taken).length / previousMeetings.length * 100 : 0, applications: previousApplications };
    const attribution = (field: "cash" | "offer") => [...dated.reduce((map, { deal }) => { const label = deal.source || "Unattributed"; map.set(label, (map.get(label) ?? 0) + deal[field]); return map; }, new Map<string, number>())].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
    return { dated, meetings, cashSeries, revenueSeries, labels, ...current, previous, allTime, cashAttribution: attribution("cash"), revenueAttribution: attribution("offer"), missing: missingDeals.length, missingDeals };
  }, [sheetData, range, customStart, customEnd]);

  const agencyOfferRows = useMemo(() => {
    if (clientId !== agencyClient.id) return [];
    const end = range === "Custom" ? endOfDay(new Date(`${customEnd}T12:00:00`)) : endOfDay();
    const start = range === "Custom" ? new Date(`${customStart}T00:00:00`) : rangeStart(range, end);
    const inRange = (value: string) => { const date = parseSheetDate(value); return !!date && (range === "All time" || (date >= start && date <= end)); };
    return clients.filter((item) => item.id !== agencyClient.id).map((item) => {
      const data = agencySources.find((source) => source.client.id === item.id)?.data;
      const deals = (data?.deals ?? []).filter((deal) => inRange(deal.date));
      const meetings = (data?.meetings ?? []).filter((meeting) => inRange(meeting.date));
      const taken = meetings.filter((meeting) => meeting.taken).length;
      return { client: item, connected: !!data, cash: deals.reduce((sum, deal) => sum + deal.cash, 0), revenue: deals.reduce((sum, deal) => sum + deal.offer, 0), closed: deals.length, showRate: meetings.length ? taken / meetings.length * 100 : 0 };
    }).sort((a, b) => b.cash - a.cash);
  }, [agencySources, clientId, clients, range, customEnd, customStart]);

  const payoutHistory = useMemo(() => sheetData?.sheetPayouts.length ? sheetData.sheetPayouts : payouts, [sheetData, payouts]);
  const closerRows = useMemo(() => {
    const rows = new Map<string, Person>();
    const get = (name: string) => {
      const key = name.toLowerCase();
      if (!rows.has(key)) rows.set(key, { name, role: "Closer", calls: 0, closed: 0, cash: 0, revenue: 0, commission: 0, paid: 0 });
      return rows.get(key)!;
    };
    (sheetData?.closers ?? []).forEach((person) => get(person.name));
    period.meetings.forEach(({ meeting }) => repNames(meeting.closer).forEach((name) => { const row = get(name); if (meeting.taken) row.calls++; if (/^(?:closed|deposit)$/i.test(meeting.status.trim())) row.closed++; }));
    period.dated.forEach(({ deal }) => repNames(deal.closer).forEach((name) => { const row = get(name); row.cash += deal.cash; row.revenue += deal.offer; }));
    const end = range === "Custom" ? endOfDay(new Date(`${customEnd}T12:00:00`)) : endOfDay();
    const start = range === "Custom" ? new Date(`${customStart}T00:00:00`) : rangeStart(range, end);
    rows.forEach((person) => {
      person.commission = person.cash * .10;
      person.paid = payoutHistory.filter((payout) => payout.member.split(":").at(-1)?.toLowerCase() === person.name.toLowerCase()).filter((payout) => { const date = parseSheetDate(payout.date); return !!date && (range === "All time" || (date >= start && date <= end)); }).reduce((sum, payout) => sum + payout.amount, 0);
    });
    return [...rows.values()].sort((a, b) => b.cash - a.cash || b.closed - a.closed);
  }, [payoutHistory, period, range, sheetData, customEnd, customStart]);
  const setters = useMemo(() => {
    const rows = new Map<string, Person>();
    const get = (name: string) => {
      const key = name.toLowerCase();
      if (!rows.has(key)) rows.set(key, { name, role: "Setter", calls: 0, closed: 0, cash: 0, revenue: 0, commission: 0, paid: 0 });
      return rows.get(key)!;
    };
    (sheetData?.setters ?? []).forEach((person) => get(person.name));
    period.meetings.forEach(({ meeting }) => repNames(meeting.setter).forEach((name) => { const row = get(name); row.calls++; if (meeting.taken) row.closed++; }));
    period.dated.forEach(({ deal }) => repNames(deal.setter).forEach((name) => { const row = get(name); row.cash += deal.cash; row.revenue += deal.offer; }));
    const end = range === "Custom" ? endOfDay(new Date(`${customEnd}T12:00:00`)) : endOfDay();
    const start = range === "Custom" ? new Date(`${customStart}T00:00:00`) : rangeStart(range, end);
    rows.forEach((person) => {
      person.commission = person.cash * .05;
      person.paid = payoutHistory.filter((payout) => payout.member.split(":").at(-1)?.toLowerCase() === person.name.toLowerCase()).filter((payout) => { const date = parseSheetDate(payout.date); return !!date && (range === "All time" || (date >= start && date <= end)); }).reduce((sum, payout) => sum + payout.amount, 0);
    });
    return [...rows.values()].sort((a, b) => b.cash - a.cash || b.closed - a.closed);
  }, [payoutHistory, period, range, sheetData, customEnd, customStart]);
  const payoutPeople = useMemo(() => {
    const grouped = new Map<string, Person & { roles: string[]; key: string }>();
    [...closerRows, ...setters, ...(sheetData?.operators ?? [])].forEach((person) => { const current = grouped.get(person.name); if (current) { current.commission += person.commission; current.paid += person.paid; current.roles.push(person.role); } else grouped.set(person.name, { ...person, key: `${person.role}:${person.name}`, roles: [person.role] }); });
    return [...grouped.values()];
  }, [closerRows, setters, sheetData]);
  const filteredPayouts = useMemo(() => {
    if (range === "All time") return payoutHistory;
    const end = range === "Custom" ? endOfDay(new Date(`${customEnd}T12:00:00`)) : endOfDay();
    const start = range === "Custom" ? new Date(`${customStart} 00:00:00`) : rangeStart(range, end);
    return payoutHistory.filter((payout) => { const date = parseSheetDate(payout.date); return !!date && date >= start && date <= end; });
  }, [payoutHistory, range, customStart, customEnd]);
  const adSpend = useMemo(() => metaInsights.reduce((sum, row) => sum + numeric(row.spend), 0), [metaInsights]);
  const metaDeals = useMemo(() => period.dated.filter(({ deal }) => /meta|facebook/i.test(`${deal.source} ${deal.medium}`)), [period]);
  const metaRevenue = metaDeals.reduce((sum, { deal }) => sum + deal.offer, 0); const metaCash = metaDeals.reduce((sum, { deal }) => sum + deal.cash, 0);
  const mediaRows = useMemo(() => {
    const { start, end } = selectedBounds(); const rows = new Map<string, { label: string; source: string; appointments: number; meetings: number; cash: number; revenue: number; closes: number; spend: number }>();
    const get = (label: string, source = "") => { const key = label || "Direct / unattributed"; if (!rows.has(key)) rows.set(key, { label: key, source, appointments: 0, meetings: 0, cash: 0, revenue: 0, closes: 0, spend: 0 }); return rows.get(key)!; };
    (sheetData?.bookings ?? []).forEach((booking) => { const date = parseSheetDate(booking.date); if (!date || date < start || date > end) return; const label = booking.video || booking.campaign || booking.source || booking.leadSource; const row = get(label, booking.source); row.appointments++; const meeting = (sheetData?.meetings ?? []).find((item) => item.email && item.email.toLowerCase() === booking.email.toLowerCase()); if (meeting?.taken) row.meetings++; });
    period.dated.forEach(({ deal }) => { const row = get(deal.video || deal.campaign || deal.source, deal.source); row.cash += deal.cash; row.revenue += deal.offer; row.closes++; });
    metaInsights.forEach((insight) => { const row = get(insight.ad_name || insight.campaign_name || "Meta Ads", "Meta Ads"); row.spend += numeric(insight.spend); });
    return [...rows.values()].sort((a, b) => b.cash - a.cash || b.appointments - a.appointments);
  }, [sheetData, period, metaInsights, range, customStart, customEnd]);

  const growthOperatorSales = (name: string) => period.dated.filter(({ deal }) => deal.growthOperator === name).reduce((totals, { deal }) => ({ cash: totals.cash + deal.cash, revenue: totals.revenue + deal.offer, closes: totals.closes + 1 }), { cash: 0, revenue: 0, closes: 0 });
  const overviewPaidForPayee = (name: string, roles: string[]) => [...(sheetData?.closers ?? []), ...(sheetData?.setters ?? []), ...(sheetData?.operators ?? [])].filter((person) => person.name === name && roles.includes(person.role)).reduce((sum, person) => sum + person.paid, 0);
  const earnedForPayee = (name: string, roles: string[]) => {
    if (name === "MoonRift Media") return period.cash * .15;
    if (name === "King") return period.dated.filter(({ deal }) => /king/i.test(`${deal.source} ${deal.campaign} ${deal.video}`)).reduce((sum, { deal }) => sum + deal.cash, 0) * .55;
    let earned = 0; if (roles.includes("Closer")) earned += period.dated.filter(({ deal }) => deal.closer.split(/\s*\/\s*/).includes(name)).reduce((sum, { deal }) => sum + deal.cash, 0) * .10;
    if (roles.includes("Setter")) earned += period.dated.filter(({ deal }) => deal.setter === name).reduce((sum, { deal }) => sum + deal.cash, 0) * .05;
    if (roles.includes("Growth Operator")) {
      const operator = sheetData?.operators.find((person) => person.role === "Growth Operator" && person.name === name);
      earned += growthOperatorSales(name).cash * (operator?.commissionRate ?? 0);
    }
    return earned;
  };

  async function addClient(e: React.FormEvent) { e.preventDefault(); if (!newName.trim()) return; const id = Date.now(); const created = { id, name: newName.trim(), industry: "New workspace", initials: initials(newName), color: "#3366e8" }; const response = await fetch("/api/workspaces", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind: "workspace", workspaceId: id, ...created }) }); if (!response.ok) { notify("Workspace database is not connected"); return; } setClients((items) => [...items, created]); setClientId(id); setNewName(""); setModal(null); notify("Workspace created and shared"); }
  async function invite(e: React.FormEvent) { e.preventDefault(); if (!email.includes("@")) return; const requestedEmail = email; const response = await fetch("/api/support", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ workspaceId: clientId, workspaceName: client.name, message: `${memberRole} workspace access requested for ${requestedEmail}. Please add this user's ChatGPT account to the ${client.name} subaccount.` }) }); if (!response.ok) { notify("Access request could not be sent"); return; } setModal(null); setEmail(""); void loadSupport(); notify(`Access request sent for ${requestedEmail}`); }
  async function connectSheet(e: React.FormEvent) { e.preventDefault(); const response = await fetch("/api/workspaces", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ workspaceId: clientId, ...client, sheetUrl }) }); if (!response.ok) { notify("Workspace database is not connected"); return; } setSheetUrls((items) => ({ ...items, [clientId]: sheetUrl })); setModal(null); void loadSheet(sheetUrl); notify("Google Sheet connected for every preview"); }
  async function saveSettings(e: React.FormEvent) { e.preventDefault(); const name = workspaceName.trim() || client.name; const updated = { ...client, name, initials: initials(name), avatar: workspaceAvatar.trim() }; const response = await fetch("/api/workspaces", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ workspaceId: clientId, ...updated, sheetUrl: sheetUrls[clientId] || "" }) }); if (!response.ok) { notify("Workspace database is not connected"); return; } setClients((items) => items.map((item) => item.id === clientId ? updated : item)); setModal(null); notify("Workspace updated for every preview"); }
  async function deleteWorkspace() { const workspaces = clients.filter((item) => item.id !== agencyClient.id); if (workspaces.length === 1) { notify("Create another workspace before deleting this one"); return; } if (!window.confirm(`Delete ${client.name}? This removes its saved payouts and settings.`)) return; const response = await fetch(`/api/workspaces?workspaceId=${clientId}`, { method: "DELETE" }); if (!response.ok) { notify("Workspace could not be deleted"); return; } const next = workspaces.find((x) => x.id !== clientId)!; setClients((items) => items.filter((x) => x.id !== clientId)); setClientId(next.id); setModal(null); notify("Workspace deleted from every preview"); }
  async function addPayout(e: React.FormEvent) { e.preventDefault(); const amount = numeric(payoutAmount); if (!payoutMember || amount <= 0) return; const optimistic: Payout = { id: Date.now(), workspaceId: clientId, member: payoutMember, date: payoutDate, method: payoutMethod, amount }; setPayouts((items) => [optimistic, ...items]); setModal(null); setPayoutAmount(""); try { const response = await fetch("/api/workspaces", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(optimistic) }); const result = await response.json() as { sheetSynced?: boolean }; notify(result.sheetSynced ? "Payout recorded and synced to Google Sheets" : "Payout recorded; Google Sheets sync needs connection"); if (response.ok) { void loadWorkspace(); window.setTimeout(() => void loadSheet(sheetUrls[clientId], true), 900); } } catch { notify("Payout recorded locally; sheet sync unavailable"); } }
  async function deletePayout(payout: Payout) {
    if (!window.confirm(`Delete the ${money(payout.amount)} payout for ${payout.member.split(":").at(-1)}?`)) return;
    if (!window.confirm("Confirm again: permanently delete this payout from payout history?")) return;
    setPayouts((items) => items.filter((item) => item.id !== payout.id));
    const response = await fetch(`/api/workspaces?workspaceId=${clientId}&payoutId=${payout.id}`, { method: "DELETE" });
    const result = await response.json() as { sheetSynced?: boolean };
    notify(result.sheetSynced ? "Payout deleted from MoonRift and Google Sheets" : "Payout deleted; Google Sheets sync needs connection");
  }
  function openSettings() { if (clientId === agencyClient.id) { notify("Select an offer to edit its workspace settings"); return; } setWorkspaceName(client.name); setWorkspaceAvatar(client.avatar ?? ""); setModal("settings"); }
  function selectNav(item: string) { setActiveNav(item); setSidebarOpen(false); if (item === "Dashboard") setTab("Overview"); if (item === "Payouts") setTab("Payouts"); if (item === "Media KPIs") setTab("Media KPIs"); if (item === "Sales") setTab("Closed Deals"); if (item === "Team members") setTab("Users"); if (item === "Agency inbox") { setTab("Agency Inbox"); void loadSupport(); } if (item === "Settings") openSettings(); if (item === "Data sources") setTab("Data Sources"); }

  return <main className="app-shell">
    <aside className={`sidebar ${sidebarOpen ? "open" : ""}`}>
      <div className="brand"><span className="brand-mark"><img src="/moonrift-logo.png" alt="" /></span><span>MoonRift</span></div><div className="workspace-label">WORKSPACE</div>
      <button className="client-select" onClick={() => setClientMenu(!clientMenu)}><span className="client-avatar" style={{ background: client.color }}>{client.avatar ? <img src={client.avatar} alt="" /> : client.initials}</span><span><strong>{client.name}</strong><small>{client.industry}</small></span><em>⌄</em></button>
      {clientMenu && <div className="client-popover">{clients.map((c) => <button key={c.id} onClick={() => { setClientId(c.id); setClientMenu(false); if (c.id === agencyClient.id) { setActiveNav("Dashboard"); setTab("Overview"); } }}><span style={{ background: c.color }}>{c.avatar ? <img src={c.avatar} alt="" /> : c.initials}</span><b>{c.name}</b>{c.id === clientId && "✓"}</button>)}<button className="new-client" onClick={() => { setModal("client"); setClientMenu(false); }}>＋ New workspace</button></div>}
      <nav>{[["Dashboard", "◈"], ["Sales", "▤"], ["Payouts", "◇"], ["Media KPIs", "◉"]].map(([item, icon]) => <button key={item} className={activeNav === item ? "active" : ""} onClick={() => selectNav(item)}><span>{icon}</span>{item}</button>)}<div className="nav-line" />{[["Team members", "♙"], ["Data sources", "⌁"], ...(isAgencyAdmin ? [["Agency inbox", "✉"]] : []), ...(clientId === agencyClient.id ? [] : [["Settings", "⚙"]])].map(([item, icon]) => <button key={item} className={activeNav === item ? "active" : ""} onClick={() => selectNav(item)}><span>{icon}</span>{item}</button>)}</nav>
      <div className="sidebar-bottom"><button className="help" onClick={() => setModal("support")}><span>?</span><div><strong>Need help?</strong><small>Message MoonRift Media</small></div></button><div className="profile"><span>PP</span><div><strong>Peter Phan</strong><small>{isAgencyAdmin ? "MoonRift agency admin" : "Workspace user"}</small></div></div></div>
    </aside>
    {sidebarOpen && <button className="scrim" onClick={() => setSidebarOpen(false)} aria-label="Close menu" />}
    <section className="content"><header className="topbar"><button className="menu-btn" onClick={() => setSidebarOpen(true)}>☰</button><div className="crumb"><span>Dashboards</span><b>/</b><strong>{tab}</strong></div><div className="top-actions">{clientId !== agencyClient.id && <button className="invite-btn" onClick={() => setModal("member")}>＋ Invite member</button>}</div></header>
      <div className="dashboard"><div className="page-title"><div><h1>{client.name} <span>{tab}</span></h1></div><div className="title-actions"><button onClick={() => void refreshDashboard()} disabled={refreshing}>{refreshing ? "…" : "↻"} <span>{refreshing ? "Refreshing" : "Refresh data"}</span></button>{clientId !== agencyClient.id && <><button onClick={() => setActionMenu(!actionMenu)}>⋯</button>{actionMenu && <div className="action-menu"><button onClick={openSettings}>Workspace settings</button><button onClick={() => setModal("sheet")}>Manage data source</button></div>}</>}</div></div>
        {["Overview", "Closed Deals", "Payouts", "Media KPIs"].includes(tab) && <div className="filters"><div><label>Date range</label><select value={range} onChange={(e) => setRange(e.target.value)}><option>Last 7 days</option><option>Last 30 days</option><option>This quarter</option><option>Year to date</option><option>All time</option><option>Custom</option></select></div>{range === "Custom" && <><div><label>Start date</label><input type="date" value={customStart} max={customEnd} onChange={(e) => setCustomStart(e.target.value)} /></div><div><label>End date</label><input type="date" value={customEnd} min={customStart} onChange={(e) => setCustomEnd(e.target.value)} /></div></>}<button className="refresh-data" onClick={() => void refreshDashboard()} disabled={refreshing} aria-label="Refresh Google Sheets data">{refreshing ? "Refreshing…" : "↻ Refresh data"}</button><button className={`sheet-pill ${sheetStatus}`} disabled={clientId === agencyClient.id} onClick={() => { if (clientId === agencyClient.id) return; setSheetUrl(sheetUrls[clientId] ?? ""); setModal("sheet"); }}><span>●</span>{sheetStatus === "loading" ? "Syncing…" : clientId === agencyClient.id && sheetStatus === "connected" ? `${agencySources.length} offer${agencySources.length === 1 ? "" : "s"} live` : sheetStatus === "connected" ? `Google Sheets live${sheetData ? ` · ${sheetData.updatedAt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}` : ""}` : sheetStatus === "error" ? "Sheet error" : clientId === agencyClient.id ? "No connected offers" : "Connect sheet"}</button></div>}

        {tab === "Overview" && <>{clientId === agencyClient.id && <section className="agency-overview"><div className="agency-overview-head"><div><span>AGENCY PERFORMANCE</span><h2>Every offer in one clear view</h2></div><strong>{agencyOfferRows.filter((row) => row.connected).length} of {agencyOfferRows.length} connected</strong></div><div className="agency-offer-grid">{agencyOfferRows.map((row) => <button key={row.client.id} onClick={() => { setClientId(row.client.id); setActiveNav("Dashboard"); setTab("Overview"); }}><span className="agency-offer-avatar" style={{ background: row.client.color }}>{row.client.avatar ? <img src={row.client.avatar} alt="" /> : row.client.initials}</span><div><h3>{row.client.name}</h3><small>{row.connected ? `${range} performance` : "Connect a Google Sheet"}</small></div><dl><div><dt>Cash</dt><dd>{money(row.cash)}</dd></div><div><dt>Revenue</dt><dd>{money(row.revenue)}</dd></div><div><dt>Closed</dt><dd>{row.closed}</dd></div><div><dt>Show rate</dt><dd>{row.showRate.toFixed(1)}%</dd></div></dl><em>View offer →</em></button>)}</div></section>}<div className="charts"><Chart data={period.cashSeries} labels={period.labels} color="#8b6cff" fill="rgba(139,108,255,.28)" label="Cash collected by payment date" total={money(period.cash)} /><Chart data={period.revenueSeries} labels={period.labels} color="#38d6b6" fill="rgba(56,214,182,.22)" label="Revenue generated by payment date" total={money(period.revenue)} /></div>
          {period.missing > 0 && <div className="data-warning" tabIndex={0}><span>ⓘ {period.missing} closed {period.missing === 1 ? "deal has" : "deals have"} a missing or invalid Date Closed and {period.missing === 1 ? "is" : "are"} excluded from date-range totals and charts.</span><strong>Hover or focus to view deals</strong><div className="missing-deals-popover" role="tooltip"><div><b>Deals needing a valid Date Closed</b><small>Check these rows in the connected Closed Deals tab.</small></div><ul>{period.missingDeals.map((deal) => <li key={`${deal.workspaceId}-${deal.sheetRow}-${deal.lead}`}><b>{deal.lead}</b><span>{deal.workspaceName || client.name} · row {deal.sheetRow} · {deal.email || deal.phone || "No contact detail"}{deal.date ? ` · current value: ${deal.date}` : ""}</span></li>)}</ul></div></div>}
          <div className="kpi-grid">{[
            ["Cash collected", money(period.cash), period.cash, period.previous.cash],
            ["Revenue generated", money(period.revenue), period.revenue, period.previous.revenue],
            ["Closed deals", String(period.closed), period.closed, period.previous.closed],
            ["Applications", String(period.applications), period.applications, period.previous.applications],
            ["Meetings booked", String(period.booked), period.booked, period.previous.booked],
            ["Meetings taken", String(period.taken), period.taken, period.previous.taken],
            ["Show rate", `${period.show.toFixed(2)}%`, period.show, period.previous.show],
            ["Close rate", `${(period.taken ? period.meetingsClosed / period.taken * 100 : 0).toFixed(2)}%`, period.taken ? period.meetingsClosed / period.taken * 100 : 0, period.previous.taken ? period.previous.meetingsClosed / period.previous.taken * 100 : 0],
            ["Application → booking", `${(period.applications ? period.booked / period.applications * 100 : 0).toFixed(2)}%`, period.applications ? period.booked / period.applications * 100 : 0, period.previous.applications ? period.previous.booked / period.previous.applications * 100 : 0],
            ["Cash to revenue", `${(period.revenue ? period.cash / period.revenue * 100 : 0).toFixed(2)}%`, period.revenue ? period.cash / period.revenue * 100 : 0, period.previous.revenue ? period.previous.cash / period.previous.revenue * 100 : 0],
            ["Cash per closed deal", money(period.closed ? period.cash / period.closed : 0), period.closed ? period.cash / period.closed : 0, period.previous.closed ? period.previous.cash / period.previous.closed : 0],
            ["Average offer value", money(period.closed ? period.revenue / period.closed : 0), period.closed ? period.revenue / period.closed : 0, period.previous.closed ? period.previous.revenue / period.previous.closed : 0],
          ].map(([label, display, current, previous]) => { const change = percentChange(Number(current), Number(previous)); return <article className="kpi" key={String(label)}><span>{label}</span><strong>{display}</strong><small className={period.allTime ? "neutral-change" : change >= 0 ? "positive-change" : "negative-change"}>{period.allTime ? "All available data" : `${change >= 0 ? "↑" : "↓"} ${Math.abs(change).toFixed(1)}% vs prior period`}</small></article>; })}</div>
          <div className="metrics-section"><div className="metrics-title"><div><span>PAID AD METRICS</span><h2>Meta performance based on CRM-attributed revenue</h2></div>{!metaConnected && <button onClick={() => setModal("meta")}>Connect Meta Ads</button>}</div><div className="paid-grid"><article><span>Ad spend</span><strong>{metaConnected ? money(adSpend) : "—"}</strong><small>{metaStatus === "loading" ? "Refreshing Meta data…" : "Pulled from Meta Ads"}</small></article><article><span>Meta-attributed revenue</span><strong>{money(metaRevenue)}</strong><small>From Closed Deals source attribution</small></article><article><span>Meta-attributed cash</span><strong>{money(metaCash)}</strong><small>Cash collected from Meta-sourced deals</small></article><article><span>CRM ROAS</span><strong>{metaConnected && adSpend ? `${(metaRevenue / adSpend).toFixed(2)}×` : "—"}</strong><small>Attributed revenue ÷ Meta ad spend</small></article></div></div>
          <div className="attribution-grid"><AttributionChart title="Cash collected by lead source" items={period.cashAttribution} color={["#8b6cff", "#38d6b6", "#ffad66", "#5aa7ff", "#ef6ea8"]} /><AttributionChart title="Revenue generated by lead source" items={period.revenueAttribution} color={["#38d6b6", "#8b6cff", "#5aa7ff", "#ffad66", "#ef6ea8"]} /></div>
          <div className="performance-grid"><PerformanceTable title="Closer" people={closerRows} range={range} /><PerformanceTable title="Setter" people={setters} range={range} /></div></>}

        {tab === "Closed Deals" && <article className="table-card deals-card"><div className="section-head"><div><h2>Closed Deals</h2><p>Live from the Closed Deals tab in Google Sheets · {range}</p></div><strong>{period.dated.length} deals</strong></div><div className="table-wrap"><table><thead><tr><th>Lead</th><th>Setter</th><th>Closer</th><th>Growth operator</th><th>Source</th><th>Specific ad / video</th><th>Paid through</th><th>Cash collected</th><th>Offer amount</th><th>Amount owed</th><th>Date closed</th><th>Next payment</th></tr></thead><tbody>{period.dated.map(({ deal }) => <tr key={`${deal.workspaceId}-${deal.sheetRow}-${deal.lead}`}><td><div><b>{deal.lead}</b><small>{deal.email || deal.phone}</small></div></td><td>{deal.setter}</td><td>{deal.closer}</td><td>{deal.growthOperator || "—"}</td><td>{deal.source}</td><td>{deal.video || deal.campaign || "—"}</td><td>{deal.method}</td><td>{money(deal.cash)}</td><td>{money(deal.offer)}</td><td>{money(deal.owed)}</td><td>{deal.date || <span className="missing-date">Missing date</span>}</td><td>{deal.next || "—"}</td></tr>)}</tbody></table></div></article>}

        {tab === "Payouts" && <><div className="payout-head"><div><h2>Team, operator & ownership payouts</h2><p>Commission comes from System Overview; dated payment history comes from the Payouts tab when available.</p></div>{clientId !== agencyClient.id && <button onClick={() => { setPayoutMember(payoutPeople[0]?.key ?? ""); setModal("payout"); }}>＋ Add payout</button>}</div><div className="payout-grid">{payoutPeople.map((p) => { const datedPaid = filteredPayouts.filter((x) => x.member.split(":").at(-1) === p.name).reduce((sum, x) => sum + x.amount, 0); const historyPaid = payoutHistory.filter((x) => x.member.split(":").at(-1) === p.name).reduce((sum, x) => sum + x.amount, 0); const sheetPaid = overviewPaidForPayee(p.name, p.roles); const allPaid = historyPaid || sheetPaid; const inRange = range === "All time" && !historyPaid ? sheetPaid : datedPaid; const earned = earnedForPayee(p.name, p.roles); const operatorSales = p.roles.includes("Growth Operator") ? growthOperatorSales(p.name) : null; return <article className="payout-card" key={p.key}><div><span className="person p0">{initials(p.name)}</span><h3>{p.name}<small>{p.roles.join(" · ")}</small></h3></div><dl>{operatorSales && <><div><dt>Attributed cash</dt><dd>{money(operatorSales.cash)}</dd></div><div><dt>Attributed revenue</dt><dd>{money(operatorSales.revenue)}</dd></div><div><dt>Attributed closes</dt><dd>{operatorSales.closes}</dd></div></>}<div><dt>Earned in selected range</dt><dd>{money(earned)}</dd></div><div><dt>Paid in selected range</dt><dd>{money(inRange)}</dd></div><div><dt>Paid out (all time)</dt><dd>{money(allPaid)}</dd></div><div><dt>Remaining for range</dt><dd>{money(Math.max(0, earned - inRange))}</dd></div></dl></article>; })}</div><article className="table-card"><div className="section-head"><div><h2>Payout history</h2><p>{range} · {filteredPayouts.length} dated records</p></div></div><div className="table-wrap"><table><thead><tr><th>Payee</th><th>Role</th><th>Day</th><th>Method</th><th>Amount</th><th></th></tr></thead><tbody>{filteredPayouts.map((p) => <tr key={`${p.workspaceId}-${p.id}`}><td><b>{p.member.split(":").at(-1)}</b></td><td>{p.member.includes(":") ? p.member.split(":")[0] : "Unassigned"}</td><td>{p.date || "No date"}</td><td>{p.method || "—"}</td><td>{money(p.amount)}</td><td>{clientId !== agencyClient.id && <button className="delete-payout" onClick={() => void deletePayout(p)} aria-label={`Delete payout for ${p.member}`}>Delete</button>}</td></tr>)}{!filteredPayouts.length && <tr><td colSpan={6}>No dated payouts in this range.</td></tr>}</tbody></table></div></article></>}
        {tab === "Media KPIs" && <><div className="metrics-section media-summary"><div className="metrics-title"><div><span>MEDIA KPIs</span><h2>Specific ad and video performance</h2></div>{!metaConnected && <button onClick={() => setModal("meta")}>Connect Meta Ads for spend</button>}</div><div className="paid-grid"><article><span>Appointments</span><strong>{mediaRows.reduce((sum, row) => sum + row.appointments, 0)}</strong></article><article><span>Meetings taken</span><strong>{mediaRows.reduce((sum, row) => sum + row.meetings, 0)}</strong></article><article><span>Closed deals</span><strong>{mediaRows.reduce((sum, row) => sum + row.closes, 0)}</strong></article><article><span>Ad spend</span><strong>{metaConnected ? money(adSpend) : "—"}</strong></article></div></div><article className="table-card"><div className="section-head"><div><h2>Creative performance</h2><p>Bookings from Booked Calls; revenue and cash from Closed Deals attribution.</p></div></div><div className="table-wrap"><table><thead><tr><th>Specific ad / video</th><th>Source</th><th>Appointments</th><th>Meetings</th><th>Closes</th><th>Close rate</th><th>Cash collected</th><th>Revenue</th><th>Spend</th><th>CRM ROAS</th></tr></thead><tbody>{mediaRows.map((row) => <tr key={row.label}><td><b>{row.label}</b></td><td>{row.source || "—"}</td><td>{row.appointments}</td><td>{row.meetings}</td><td>{row.closes}</td><td><span className="rate">{row.meetings ? (row.closes / row.meetings * 100).toFixed(1) : 0}%</span></td><td>{money(row.cash)}</td><td>{money(row.revenue)}</td><td>{metaConnected ? money(row.spend) : "—"}</td><td>{row.spend ? `${(row.revenue / row.spend).toFixed(2)}×` : "—"}</td></tr>)}{!mediaRows.length && <tr><td colSpan={10}>No attributed media activity in this range.</td></tr>}</tbody></table></div></article></>}
        {tab === "Data Sources" && <div className="source-grid"><article><span className={`source-icon ${sheetStatus}`}>▦</span><div><h2>Google Sheets</h2><p>Sales CRM, Closed Deals, Payouts, Booked Calls, applications, and attribution.</p><small>{clientId === agencyClient.id ? `${agencySources.length} connected offer${agencySources.length === 1 ? "" : "s"}` : sheetStatus === "connected" ? "Connected and syncing" : "Not connected"}</small></div><button onClick={() => { if (clientId === agencyClient.id) { notify("Select an offer to manage its Google Sheet"); return; } setSheetUrl(sheetUrls[clientId] ?? ""); setModal("sheet"); }}>{clientId === agencyClient.id ? "Select offer" : sheetStatus === "connected" ? "Manage" : "Connect"}</button></article><article><span className={`source-icon ${metaConnected ? "connected" : ""}`}>f</span><div><h2>Meta Ads</h2><p>Daily spend, ad names, clicks, and impressions for CRM-calculated ROAS.</p><small>{metaConnected ? `Connected${metaAccount ? ` · ${metaAccount}` : ""}` : "Not connected"}</small></div><button onClick={() => { if (clientId === agencyClient.id) { notify("Select an offer to manage its Meta ad account"); return; } setModal("meta"); }}>{clientId === agencyClient.id ? "Select offer" : metaConnected ? "Reconnect" : "Connect"}</button></article></div>}
        {tab === "Users" && <article className="users-panel"><div><span>♙</span><h2>Subaccount access</h2><p>Each user signs in with their own ChatGPT account. Workspace access and account switching remain isolated by the agency access list—there are no shared dashboard passwords.</p></div><button onClick={() => setModal("member")}>＋ Invite workspace user</button><div className="user-row"><span>PP</span><div><b>Peter Phan</b><small>peterphan441@gmail.com</small></div><em>Agency owner</em></div><div className="access-note">Workspace deletion is still available under <strong>Settings → Delete workspace</strong>. The workspace switcher in the upper-left is the agency subaccount view.</div></article>}
        {tab === "Agency Inbox" && isAgencyAdmin && <article className="table-card"><div className="section-head"><div><h2>Agency help inbox</h2><p>Support messages from MoonRift subaccounts</p></div><strong>{supportMessages.filter((m) => m.status === "open").length} open</strong></div><div className="support-list">{supportMessages.map((message) => <div className={`support-row ${message.status}`} key={message.id}><div><b>{message.workspaceName}</b><small>{message.senderEmail} · {new Date(message.createdAt).toLocaleString()}</small><p>{message.message}</p></div>{message.status === "open" ? <button onClick={() => void resolveSupport(message.id)}>Mark resolved</button> : <span>Resolved</span>}</div>)}{!supportMessages.length && <div className="empty-support">No help requests yet.</div>}</div></article>}
      </div>
    </section>

    {modal && <div className="modal-wrap" role="dialog" aria-modal="true"><button className="modal-backdrop" onClick={() => setModal(null)} aria-label="Close" /><form className="modal" onSubmit={modal === "client" ? addClient : modal === "member" ? invite : modal === "sheet" ? connectSheet : modal === "meta" ? connectMeta : modal === "support" ? sendSupport : modal === "settings" ? saveSettings : addPayout}><button type="button" className="modal-close" onClick={() => setModal(null)}>×</button><span className="modal-icon">{modal === "payout" ? "$" : modal === "support" ? "?" : modal === "meta" ? "f" : modal === "settings" ? "⚙" : modal === "sheet" ? "▦" : "＋"}</span>
      <h2>{modal === "client" ? "Create workspace" : modal === "member" ? "Invite team member" : modal === "sheet" ? "Connect Google Sheets" : modal === "meta" ? "Connect Meta Ads" : modal === "support" ? "Message MoonRift Media" : modal === "settings" ? "Workspace settings" : "Add payout"}</h2>
      {modal === "client" && <><label>Workspace name</label><input value={newName} onChange={(e) => setNewName(e.target.value)} required /></>}
      {modal === "member" && <><p>MoonRift uses each person&apos;s own ChatGPT sign-in. This sends an access request to the agency inbox so the user can be added to this subaccount.</p><label>Email address</label><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /><label>Access level</label><select value={memberRole} onChange={(e) => setMemberRole(e.target.value)}><option>Viewer</option><option>Editor</option><option>Admin</option></select></>}
      {modal === "sheet" && <><label>Google Sheets URL</label><input type="url" value={sheetUrl} onChange={(e) => setSheetUrl(e.target.value)} required /><div className="access-note">MoonRift reads <strong>System Overview</strong>, <strong>Sales CRM</strong>, <strong>Closed Deals</strong>, <strong>Payouts</strong>, <strong>Booked Calls</strong>, and application events. Link sharing must allow viewers.</div></>}
      {modal === "meta" && <><p>Sign in with Facebook, approve reporting access, and choose the ad account for this workspace. MoonRift calculates ROAS from your CRM-attributed revenue—not Meta&apos;s purchase value.</p><div className="meta-oauth-permissions"><b>MoonRift will be able to:</b><span>✓ View ad accounts you can access</span><span>✓ Read campaign spend and performance</span><span>✓ Match Meta spend to CRM-attributed revenue</span><small>Read-only connection. MoonRift cannot create, edit, publish, or pause ads.</small></div></>}
      {modal === "support" && <><p>Your message will appear in the MoonRift agency inbox for this workspace.</p><label>How can we help?</label><textarea value={supportText} onChange={(e) => setSupportText(e.target.value)} rows={6} placeholder="Describe the issue or request…" required /></>}
      {modal === "settings" && <><label>Workspace name</label><input value={workspaceName} onChange={(e) => setWorkspaceName(e.target.value)} required /><label>Profile picture URL</label><input type="text" value={workspaceAvatar} onChange={(e) => setWorkspaceAvatar(e.target.value)} placeholder="https://… or /workspace-logo.png" /><div className="avatar-preview">{workspaceAvatar ? <img src={workspaceAvatar} alt="" /> : <span style={{ background: client.color }}>{initials(workspaceName || client.name)}</span>}</div><button type="button" className="danger-button" onClick={deleteWorkspace}>Delete workspace</button></>}
      {modal === "payout" && <><label>Payee</label><select value={payoutMember} onChange={(e) => setPayoutMember(e.target.value)} required>{payoutPeople.flatMap((p) => p.roles.map((role) => <option key={`${role}:${p.name}`} value={`${role}:${p.name}`}>{p.name} — {role}</option>))}</select><label>Day</label><input type="date" value={payoutDate} onChange={(e) => setPayoutDate(e.target.value)} required /><label>Method</label><select value={payoutMethod} onChange={(e) => setPayoutMethod(e.target.value)}><option>ACH</option><option>Wire</option><option>Zelle</option><option>PayPal</option><option>Venmo</option><option>Cash</option><option>Other</option></select><label>Amount</label><input type="number" min="0.01" step="0.01" value={payoutAmount} onChange={(e) => setPayoutAmount(e.target.value)} required /></>}
      <div className="modal-actions"><button type="button" onClick={() => setModal(null)}>Cancel</button><button type="submit">{modal === "payout" ? "Record payout" : modal === "support" ? "Send message" : modal === "meta" ? "Continue with Facebook" : modal === "settings" ? "Save changes" : modal === "sheet" ? "Connect & sync" : modal === "member" ? "Request access" : "Create workspace"}</button></div>
    </form></div>}
    {toast && <div className="toast"><span>✓</span>{toast}</div>}
  </main>;
}
