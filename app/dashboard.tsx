"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Client = { id: number; name: string; industry: string; initials: string; color: string; avatar?: string };
type Person = { name: string; role: "Closer" | "Setter" | "Operator"; calls: number; closed: number; cash: number; revenue: number; commission: number; paid: number };
type Deal = { lead: string; phone: string; email: string; setter: string; closer: string; method: string; cash: number; offer: number; owed: number; date: string; next: string; end: string };
type Meeting = { date: string; taken: boolean };
type Payout = { id: number; workspaceId: number; member: string; date: string; method: string; amount: number };
type SheetMetrics = { booked: number; taken: number; showRate: number; closers: Person[]; setters: Person[]; operators: Person[]; deals: Deal[]; meetings: Meeting[]; applicationDates: string[]; updatedAt: Date };

const sheetUrlDefault = "https://docs.google.com/spreadsheets/d/1ahyY64u9uYmcEDFi1XAJRFmnZ_gX_6VQHUnWvswkvmg/edit?usp=sharing";
const clientsSeed: Client[] = [
  { id: 1, name: "Seller Syndicate", industry: "Sales workspace", initials: "SS", color: "#7646ff" },
];
const fallbackPeople: Person[] = [
  { name: "Dillon Reed", role: "Closer", calls: 40, closed: 31, cash: 97850, revenue: 128000, commission: 9785, paid: 6000 },
  { name: "Zain Carter", role: "Closer", calls: 22, closed: 16, cash: 66000, revenue: 94500, commission: 6600, paid: 4000 },
];

const money = (value: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value || 0);
const numeric = (value = "") => Number(value.replace(/[$,%\s,]/g, "")) || 0;
const sheetIdFromUrl = (value: string) => value.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/)?.[1] ?? value.trim();
const initials = (name: string) => name.split(/\s+/).map((word) => word[0]).join("").slice(0, 2).toUpperCase();

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

function Chart({ data, labels, color, fill, label, total }: { data: number[]; labels: string[]; color: string; fill: string; label: string; total: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const el = canvas.current; if (!el) return;
    const render = () => {
      const ratio = window.devicePixelRatio || 1; const { width, height } = el.getBoundingClientRect();
      el.width = width * ratio; el.height = height * ratio;
      const ctx = el.getContext("2d"); if (!ctx) return; ctx.scale(ratio, ratio);
      const values = data.length > 1 ? data : [0, ...(data || [0])]; const max = Math.max(...values, 1) * 1.12;
      for (let i = 0; i < 4; i++) { const y = 15 + ((height - 30) / 3) * i; ctx.strokeStyle = "rgba(130,120,150,.16)"; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke(); }
      const points = values.map((v, i) => ({ x: 8 + i / (values.length - 1) * (width - 16), y: height - 15 - v / max * (height - 30) }));
      const gradient = ctx.createLinearGradient(0, 0, 0, height); gradient.addColorStop(0, fill); gradient.addColorStop(1, "rgba(0,0,0,0)");
      ctx.beginPath(); ctx.moveTo(points[0].x, height); points.forEach((p) => ctx.lineTo(p.x, p.y)); ctx.lineTo(points.at(-1)!.x, height); ctx.closePath(); ctx.fillStyle = gradient; ctx.fill();
      ctx.beginPath(); points.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); ctx.strokeStyle = color; ctx.lineWidth = 2.5; ctx.stroke();
      points.forEach((p) => { ctx.beginPath(); ctx.arc(p.x, p.y, 3, 0, Math.PI * 2); ctx.fillStyle = "#fff"; ctx.fill(); ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.stroke(); });
    };
    render(); const ro = new ResizeObserver(render); ro.observe(el); return () => ro.disconnect();
  }, [data, color, fill]);
  return <article className="chart-card"><div className="chart-head"><div><span className="chart-dot" style={{ background: color }} />{label}</div><strong>{total}</strong></div><canvas ref={canvas} aria-label={`${label} by payment date`} /><div className="chart-axis">{labels.map((x, i) => <span key={`${x}-${i}`}>{x}</span>)}</div></article>;
}

function PerformanceTable({ title, people }: { title: "Closer" | "Setter"; people: Person[] }) {
  const rateLabel = title === "Setter" ? "Show rate" : "Close rate";
  return <article className="table-card">
    <div className="section-head"><div><h2>{title} performance</h2><p>Sorted by most cash collected</p></div></div>
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
  const [modal, setModal] = useState<"client" | "member" | "sheet" | "settings" | "payout" | null>(null); const [toast, setToast] = useState("");
  const [newName, setNewName] = useState(""); const [email, setEmail] = useState(""); const [workspaceName, setWorkspaceName] = useState(""); const [workspaceAvatar, setWorkspaceAvatar] = useState("");
  const [sheetUrls, setSheetUrls] = useState<Record<number, string>>({ 1: sheetUrlDefault }); const [sheetUrl, setSheetUrl] = useState(sheetUrlDefault);
  const [sheetData, setSheetData] = useState<SheetMetrics | null>(null); const [sheetStatus, setSheetStatus] = useState<"idle" | "loading" | "connected" | "error">("idle");
  const [refreshing, setRefreshing] = useState(false);
  const [payouts, setPayouts] = useState<Payout[]>([]); const [payoutMember, setPayoutMember] = useState(""); const [payoutDate, setPayoutDate] = useState(new Date().toISOString().slice(0, 10)); const [payoutMethod, setPayoutMethod] = useState("ACH"); const [payoutAmount, setPayoutAmount] = useState("");
  const client = clients.find((c) => c.id === clientId) ?? clients[0];

  async function loadSheet(url = sheetUrls[clientId], force = false) {
    if (!url) { setSheetData(null); setSheetStatus("idle"); return; }
    setSheetStatus("loading");
    try {
      const id = sheetIdFromUrl(url);
      const getSheet = async (sheet: string) => { const response = await fetch(`/api/sheets?spreadsheetId=${encodeURIComponent(id)}&sheet=${encodeURIComponent(sheet)}${force ? `&refresh=${Date.now()}` : ""}`, { cache: "no-store" }); if (!response.ok) throw new Error(); return parseCsv(await response.text()); };
      const [overview, closed, crm, events] = await Promise.all([getSheet("System Overview"), getSheet("Closed Deals"), getSheet("Sales CRM"), getSheet("Events")]);
      const totalsHeader = overview.findIndex((row) => row.some((cell) => cell.includes("Meetings Booked"))); const totals = overview[totalsHeader + 1] ?? [];
      const section = (name: string, stop: string[]) => { const start = overview.findIndex((row) => row[0]?.trim() === name); if (start < 0) return []; const rows = overview.slice(start + 1); const end = rows.findIndex((row) => stop.includes(row[0]?.trim())); return (end < 0 ? rows : rows.slice(0, end)).filter((row) => row[0]?.trim()); };
      const toPeople = (rows: string[][], role: Person["role"]) => rows.map((row) => ({ name: row[0].trim(), role, calls: numeric(row[1]), closed: numeric(row[2]), revenue: numeric(row[4]), cash: numeric(row[5]), commission: numeric(row[6]), paid: numeric(row[7]) })).sort((a, b) => b.cash - a.cash);
      const operatorRows = section("Operator", []);
      const header = closed.findIndex((row) => row[0]?.trim() === "Lead Name"); const dealRows = header >= 0 ? closed.slice(header + 1).filter((row) => row[0]?.trim()) : [];
      setSheetData({
        booked: numeric(totals[0]), taken: numeric(totals[1]), showRate: numeric(totals[3]),
        setters: toPeople(section("Setter Name", ["Closer Name"]), "Setter"),
        closers: toPeople(section("Closer Name", ["Operator"]), "Closer"),
        operators: operatorRows.map((row) => ({ name: row[0], role: "Operator" as const, calls: 0, closed: 0, revenue: 0, cash: 0, commission: numeric(row[2]), paid: numeric(row[3]) })),
        deals: dealRows.map((row) => ({ lead: row[0], phone: row[1], email: row[2], setter: row[3], closer: row[4], method: row[5], cash: numeric(row[6]), offer: numeric(row[7]), owed: numeric(row[8]), date: row[9], next: row[10], end: row[11] })),
        meetings: crm.filter((row) => parseSheetDate(row[6])).map((row) => ({ date: row[6], taken: !!row[3] && !/no show|rescheduled/i.test(row[3]) })),
        applicationDates: events.filter((row) => row[1]?.trim() === "application_submitted" && parseSheetDate(row[0])).map((row) => row[0]),
        updatedAt: new Date(),
      });
      setSheetStatus("connected");
    } catch { setSheetStatus("error"); setSheetData(null); }
  }

  async function loadWorkspace() {
    try {
      const response = await fetch(`/api/workspaces?workspaceId=${clientId}`); if (!response.ok) return;
      const data = await response.json() as { workspace?: { name?: string; avatar?: string; industry?: string; initials?: string; color?: string; sheetUrl?: string }; payouts?: Payout[] };
      if (data.workspace?.name) {
        setClients((items) => items.map((item) => item.id === clientId ? { ...item, name: data.workspace!.name!, initials: data.workspace!.initials || initials(data.workspace!.name!), avatar: data.workspace!.avatar || "", industry: data.workspace!.industry || item.industry, color: data.workspace!.color || item.color } : item));
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
        const normalized = data.workspaces.map((item) => ({ ...item, id: Number(item.id), initials: item.initials || initials(item.name), color: item.color || "#7646ff" }));
        setClients(normalized); setSheetUrls(Object.fromEntries(data.workspaces.filter((item) => item.sheetUrl).map((item) => [Number(item.id), item.sheetUrl!] as const)));
        if (!normalized.some((item) => item.id === clientId)) setClientId(normalized[0].id);
      }
    } catch {}
  }

  useEffect(() => { void loadWorkspaceList(); }, []);
  useEffect(() => { void loadSheet(); void loadWorkspace(); }, [clientId]);
  const notify = (text: string) => { setToast(text); window.setTimeout(() => setToast(""), 2800); };

  async function refreshDashboard() {
    setRefreshing(true);
    await Promise.all([loadSheet(sheetUrls[clientId], true), loadWorkspace()]);
    setRefreshing(false);
    notify("Latest Google Sheets data loaded");
  }

  const period = useMemo(() => {
    const now = range === "Custom" ? endOfDay(new Date(`${customEnd}T12:00:00`)) : endOfDay(); const start = range === "Custom" ? new Date(`${customStart}T00:00:00`) : rangeStart(range, now);
    const allTime = range === "All time"; const dateInPeriod = (date: Date) => allTime || (date >= start && date <= now);
    const dated = (sheetData?.deals ?? []).map((deal) => ({ deal, date: parseSheetDate(deal.date) })).filter((item): item is { deal: Deal; date: Date } => !!item.date && dateInPeriod(item.date));
    const spanStart = allTime && dated.length ? new Date(Math.min(...dated.map((x) => x.date.getTime()))) : start;
    const days = Math.max(1, Math.ceil((now.getTime() - spanStart.getTime()) / 86400000) + 1); const bucketCount = days <= 30 ? days : Math.min(13, Math.ceil(days / 7)); const bucketDays = Math.ceil(days / bucketCount);
    const cashSeries = Array(bucketCount).fill(0); const revenueSeries = Array(bucketCount).fill(0); const labels = Array(bucketCount).fill("");
    for (let i = 0; i < bucketCount; i++) { const date = new Date(spanStart); date.setDate(spanStart.getDate() + i * bucketDays); labels[i] = date.toLocaleDateString("en-US", { month: "short", day: "numeric" }); }
    dated.forEach(({ deal, date }) => { const index = Math.min(bucketCount - 1, Math.floor((date.getTime() - spanStart.getTime()) / 86400000 / bucketDays)); cashSeries[index] += deal.cash; revenueSeries[index] += deal.offer; });
    const labelStep = Math.max(1, Math.ceil(labels.length / 5)); const shownLabels = labels.filter((_, i) => i % labelStep === 0 || i === labels.length - 1);
    const meetings = (sheetData?.meetings ?? []).map((meeting) => ({ meeting, date: parseSheetDate(meeting.date)! })).filter((x) => x.date && dateInPeriod(x.date));
    const booked = allTime ? sheetData?.booked ?? meetings.length : meetings.length; const taken = allTime ? sheetData?.taken ?? meetings.filter((x) => x.meeting.taken).length : meetings.filter((x) => x.meeting.taken).length;
    const periodMs = now.getTime() - start.getTime() + 1; const previousStart = new Date(start.getTime() - periodMs); const previousEnd = new Date(start.getTime() - 1);
    const previousDeals = allTime ? [] : (sheetData?.deals ?? []).map((deal) => ({ deal, date: parseSheetDate(deal.date) })).filter((x): x is { deal: Deal; date: Date } => !!x.date && x.date >= previousStart && x.date <= previousEnd);
    const previousMeetings = allTime ? [] : (sheetData?.meetings ?? []).map((meeting) => ({ meeting, date: parseSheetDate(meeting.date) })).filter((x) => !!x.date && x.date >= previousStart && x.date <= previousEnd);
    const applications = (sheetData?.applicationDates ?? []).map(parseSheetDate).filter((date): date is Date => !!date && dateInPeriod(date)).length;
    const previousApplications = allTime ? 0 : (sheetData?.applicationDates ?? []).map(parseSheetDate).filter((date): date is Date => !!date && date >= previousStart && date <= previousEnd).length;
    const current = { cash: dated.reduce((sum, x) => sum + x.deal.cash, 0), revenue: dated.reduce((sum, x) => sum + x.deal.offer, 0), closed: dated.length, booked, taken, show: booked ? taken / booked * 100 : 0, applications };
    const previous = { cash: previousDeals.reduce((s, x) => s + x.deal.cash, 0), revenue: previousDeals.reduce((s, x) => s + x.deal.offer, 0), closed: previousDeals.length, booked: previousMeetings.length, taken: previousMeetings.filter((x) => x.meeting.taken).length, show: previousMeetings.length ? previousMeetings.filter((x) => x.meeting.taken).length / previousMeetings.length * 100 : 0, applications: previousApplications };
    return { dated, cashSeries, revenueSeries, labels: shownLabels, ...current, previous, allTime, missing: (sheetData?.deals ?? []).filter((deal) => !parseSheetDate(deal.date)).length, meetingMissing: Math.max(0, (sheetData?.booked ?? 0) - (sheetData?.meetings.length ?? 0)) };
  }, [sheetData, range, customStart, customEnd]);

  const closerRows = useMemo(() => (sheetData?.closers.length ? sheetData.closers : fallbackPeople).map((person) => ({ ...person, paid: person.paid + payouts.filter((p) => p.member === person.name).reduce((sum, p) => sum + p.amount, 0) })).sort((a, b) => b.cash - a.cash), [sheetData, payouts]);
  const setters = useMemo(() => [...(sheetData?.setters ?? [])].sort((a, b) => b.cash - a.cash), [sheetData]);
  const payoutPeople = useMemo(() => [...closerRows, ...setters, ...(sheetData?.operators ?? [])].map((person) => ({ ...person, key: `${person.role}:${person.name}`, paid: person.paid + payouts.filter((p) => p.member === `${person.role}:${person.name}`).reduce((sum, p) => sum + p.amount, 0) })), [closerRows, setters, sheetData, payouts]);
  const filteredPayouts = useMemo(() => {
    if (range === "All time") return payouts;
    const end = range === "Custom" ? endOfDay(new Date(`${customEnd}T12:00:00`)) : endOfDay();
    const start = range === "Custom" ? new Date(`${customStart} 00:00:00`) : rangeStart(range, end);
    return payouts.filter((payout) => { const date = new Date(`${payout.date} 12:00:00`); return date >= start && date <= end; });
  }, [payouts, range, customStart, customEnd]);

  async function addClient(e: React.FormEvent) { e.preventDefault(); if (!newName.trim()) return; const id = Date.now(); const created = { id, name: newName.trim(), industry: "New workspace", initials: initials(newName), color: "#3366e8" }; const response = await fetch("/api/workspaces", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind: "workspace", workspaceId: id, ...created }) }); if (!response.ok) { notify("Workspace database is not connected"); return; } setClients((items) => [...items, created]); setClientId(id); setNewName(""); setModal(null); notify("Workspace created and shared"); }
  function invite(e: React.FormEvent) { e.preventDefault(); if (!email.includes("@")) return; setModal(null); notify(`Invite sent to ${email}`); setEmail(""); }
  async function connectSheet(e: React.FormEvent) { e.preventDefault(); const response = await fetch("/api/workspaces", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ workspaceId: clientId, ...client, sheetUrl }) }); if (!response.ok) { notify("Workspace database is not connected"); return; } setSheetUrls((items) => ({ ...items, [clientId]: sheetUrl })); setModal(null); void loadSheet(sheetUrl); notify("Google Sheet connected for every preview"); }
  async function saveSettings(e: React.FormEvent) { e.preventDefault(); const name = workspaceName.trim() || client.name; const updated = { ...client, name, initials: initials(name), avatar: workspaceAvatar.trim() }; const response = await fetch("/api/workspaces", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ workspaceId: clientId, ...updated, sheetUrl: sheetUrls[clientId] || "" }) }); if (!response.ok) { notify("Workspace database is not connected"); return; } setClients((items) => items.map((item) => item.id === clientId ? updated : item)); setModal(null); notify("Workspace updated for every preview"); }
  async function deleteWorkspace() { if (clients.length === 1) { notify("Create another workspace before deleting this one"); return; } if (!window.confirm(`Delete ${client.name}? This removes its saved payouts and settings.`)) return; const response = await fetch(`/api/workspaces?workspaceId=${clientId}`, { method: "DELETE" }); if (!response.ok) { notify("Workspace could not be deleted"); return; } const next = clients.find((x) => x.id !== clientId)!; setClients((items) => items.filter((x) => x.id !== clientId)); setClientId(next.id); setModal(null); notify("Workspace deleted from every preview"); }
  async function addPayout(e: React.FormEvent) { e.preventDefault(); const amount = numeric(payoutAmount); if (!payoutMember || amount <= 0) return; const optimistic: Payout = { id: Date.now(), workspaceId: clientId, member: payoutMember, date: payoutDate, method: payoutMethod, amount }; setPayouts((items) => [optimistic, ...items]); setModal(null); setPayoutAmount(""); try { const response = await fetch("/api/workspaces", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(optimistic) }); const result = await response.json() as { sheetSynced?: boolean }; notify(result.sheetSynced ? "Payout recorded and synced to Google Sheets" : "Payout recorded; Google Sheets sync needs connection"); if (response.ok) void loadWorkspace(); } catch { notify("Payout recorded locally; sheet sync unavailable"); } }
  async function deletePayout(payout: Payout) {
    if (!window.confirm(`Delete the ${money(payout.amount)} payout for ${payout.member.split(":").at(-1)}?`)) return;
    if (!window.confirm("Confirm again: permanently delete this payout from payout history?")) return;
    setPayouts((items) => items.filter((item) => item.id !== payout.id));
    const response = await fetch(`/api/workspaces?workspaceId=${clientId}&payoutId=${payout.id}`, { method: "DELETE" });
    const result = await response.json() as { sheetSynced?: boolean };
    notify(result.sheetSynced ? "Payout deleted from MoonRift and Google Sheets" : "Payout deleted; Google Sheets sync needs connection");
  }
  function openSettings() { setWorkspaceName(client.name); setWorkspaceAvatar(client.avatar ?? ""); setModal("settings"); }
  function selectNav(item: string) { setActiveNav(item); setSidebarOpen(false); if (item === "Dashboard") setTab("Overview"); if (item === "Payouts") setTab("Payouts"); if (item === "Media KPIs") setTab("Media KPIs"); if (item === "Sales") setTab("Closed Deals"); if (item === "Team members") setModal("member"); if (item === "Settings") openSettings(); if (item === "Data sources") { setSheetUrl(sheetUrls[clientId] ?? ""); setModal("sheet"); } }

  return <main className="app-shell">
    <aside className={`sidebar ${sidebarOpen ? "open" : ""}`}>
      <div className="brand"><span className="brand-mark"><img src="/moonrift-logo.png" alt="" /></span><span>MoonRift</span></div><div className="workspace-label">WORKSPACE</div>
      <button className="client-select" onClick={() => setClientMenu(!clientMenu)}><span className="client-avatar" style={{ background: client.color }}>{client.avatar ? <img src={client.avatar} alt="" /> : client.initials}</span><span><strong>{client.name}</strong><small>{client.industry}</small></span><em>⌄</em></button>
      {clientMenu && <div className="client-popover">{clients.map((c) => <button key={c.id} onClick={() => { setClientId(c.id); setClientMenu(false); }}><span style={{ background: c.color }}>{c.avatar ? <img src={c.avatar} alt="" /> : c.initials}</span><b>{c.name}</b>{c.id === clientId && "✓"}</button>)}<button className="new-client" onClick={() => { setModal("client"); setClientMenu(false); }}>＋ New workspace</button></div>}
      <nav>{[["Dashboard", "◈"], ["Sales", "▤"], ["Payouts", "◇"], ["Media KPIs", "◉"]].map(([item, icon]) => <button key={item} className={activeNav === item ? "active" : ""} onClick={() => selectNav(item)}><span>{icon}</span>{item}</button>)}<div className="nav-line" />{[["Team members", "♙"], ["Data sources", "⌁"], ["Settings", "⚙"]].map(([item, icon]) => <button key={item} className={activeNav === item ? "active" : ""} onClick={() => selectNav(item)}><span>{icon}</span>{item}</button>)}</nav>
      <div className="sidebar-bottom"><button className="help" onClick={() => notify("Help center opened")}><span>?</span><div><strong>Need help?</strong><small>Visit the help center</small></div></button><div className="profile"><span>JS</span><div><strong>Jordan Smith</strong><small>Workspace admin</small></div></div></div>
    </aside>
    {sidebarOpen && <button className="scrim" onClick={() => setSidebarOpen(false)} aria-label="Close menu" />}
    <section className="content"><header className="topbar"><button className="menu-btn" onClick={() => setSidebarOpen(true)}>☰</button><div className="crumb"><span>Dashboards</span><b>/</b><strong>{tab}</strong></div><div className="top-actions"><button className="invite-btn" onClick={() => setModal("member")}>＋ Invite member</button></div></header>
      <div className="dashboard"><div className="page-title"><div><h1>{client.name} <span>{tab}</span></h1><p>Live sales, team performance, and payouts in one place.</p></div><div className="title-actions"><button onClick={() => void refreshDashboard()} disabled={refreshing}>{refreshing ? "…" : "↻"} <span>{refreshing ? "Refreshing" : "Refresh data"}</span></button><button onClick={() => setActionMenu(!actionMenu)}>⋯</button>{actionMenu && <div className="action-menu"><button onClick={openSettings}>Workspace settings</button><button onClick={() => setModal("sheet")}>Manage data source</button></div>}</div></div>
        {activeNav !== "Team members" && <div className="filters"><div><label>Date range</label><select value={range} onChange={(e) => setRange(e.target.value)}><option>Last 7 days</option><option>Last 30 days</option><option>This quarter</option><option>Year to date</option><option>All time</option><option>Custom</option></select></div>{range === "Custom" && <><div><label>Start date</label><input type="date" value={customStart} max={customEnd} onChange={(e) => setCustomStart(e.target.value)} /></div><div><label>End date</label><input type="date" value={customEnd} min={customStart} onChange={(e) => setCustomEnd(e.target.value)} /></div></>}<button className={`sheet-pill ${sheetStatus}`} onClick={() => { setSheetUrl(sheetUrls[clientId] ?? ""); setModal("sheet"); }}><span>●</span>{sheetStatus === "loading" ? "Syncing…" : sheetStatus === "connected" ? `Google Sheets live${sheetData ? ` · ${sheetData.updatedAt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}` : ""}` : sheetStatus === "error" ? "Sheet error" : "Connect sheet"}</button></div>}

        {tab === "Overview" && <><div className="charts"><Chart data={period.cashSeries} labels={period.labels} color="#8b6cff" fill="rgba(139,108,255,.28)" label="Cash collected by payment date" total={money(period.cash)} /><Chart data={period.revenueSeries} labels={period.labels} color="#38d6b6" fill="rgba(56,214,182,.22)" label="Revenue generated by payment date" total={money(period.revenue)} /></div>
          {period.missing > 0 && <div className="data-warning">ⓘ {period.missing} closed {period.missing === 1 ? "deal is" : "deals are"} missing a Date Closed and excluded from date-range totals and charts.</div>}
          {!period.allTime && period.meetingMissing > 0 && <div className="data-warning">ⓘ {period.meetingMissing} CRM meetings do not have a Meeting Date, so they are excluded from date-range meeting metrics.</div>}
          <div className="kpi-grid">{[
            ["Cash collected", money(period.cash), period.cash, period.previous.cash],
            ["Revenue generated", money(period.revenue), period.revenue, period.previous.revenue],
            ["Closed deals", String(period.closed), period.closed, period.previous.closed],
            ["Applications", String(period.applications), period.applications, period.previous.applications],
            ["Meetings booked", String(period.booked), period.booked, period.previous.booked],
            ["Meetings taken", String(period.taken), period.taken, period.previous.taken],
            ["Show rate", `${period.show.toFixed(2)}%`, period.show, period.previous.show],
            ["Cash per closed deal", money(period.closed ? period.cash / period.closed : 0), period.closed ? period.cash / period.closed : 0, period.previous.closed ? period.previous.cash / period.previous.closed : 0],
            ["Average offer value", money(period.closed ? period.revenue / period.closed : 0), period.closed ? period.revenue / period.closed : 0, period.previous.closed ? period.previous.revenue / period.previous.closed : 0],
          ].map(([label, display, current, previous]) => { const change = percentChange(Number(current), Number(previous)); return <article className="kpi" key={String(label)}><span>{label}</span><strong>{display}</strong><small className={period.allTime ? "neutral-change" : change >= 0 ? "positive-change" : "negative-change"}>{period.allTime ? "All available data" : `${change >= 0 ? "↑" : "↓"} ${Math.abs(change).toFixed(1)}% vs prior period`}</small></article>; })}</div>
          <PerformanceTable title="Closer" people={closerRows} /><PerformanceTable title="Setter" people={setters} /></>}

        {tab === "Closed Deals" && <article className="table-card deals-card"><div className="section-head"><div><h2>Closed Deals</h2><p>Live from the Closed Deals tab in Google Sheets</p></div><strong>{sheetData?.deals.length ?? 0} deals</strong></div><div className="table-wrap"><table><thead><tr><th>Lead</th><th>Setter</th><th>Closer</th><th>Paid through</th><th>Cash collected</th><th>Offer amount</th><th>Amount owed</th><th>Date closed</th><th>Next payment</th></tr></thead><tbody>{(sheetData?.deals ?? []).map((deal) => <tr key={`${deal.lead}-${deal.phone}`}><td><div><b>{deal.lead}</b><small>{deal.email || deal.phone}</small></div></td><td>{deal.setter}</td><td>{deal.closer}</td><td>{deal.method}</td><td>{money(deal.cash)}</td><td>{money(deal.offer)}</td><td>{money(deal.owed)}</td><td>{deal.date || <span className="missing-date">Missing date</span>}</td><td>{deal.next || "—"}</td></tr>)}</tbody></table></div></article>}

        {tab === "Payouts" && <><div className="payout-head"><div><h2>Team & operator payouts</h2><p>Closers, setters, and MoonRift Media operator revenue share.</p></div><button onClick={() => { setPayoutMember(payoutPeople[0]?.key ?? ""); setModal("payout"); }}>＋ Add payout</button></div><div className="payout-grid">{payoutPeople.map((p) => { const inRange = filteredPayouts.filter((x) => x.member === p.key).reduce((sum, x) => sum + x.amount, 0); return <article className="payout-card" key={p.key}><div><span className="person p0">{initials(p.name)}</span><h3>{p.name}<small>{p.role}</small></h3></div><dl><div><dt>{p.role === "Operator" ? "Revenue share earned" : "Commission earned"}</dt><dd>{money(p.commission)}</dd></div><div><dt>Paid out (all time)</dt><dd>{money(p.paid)}</dd></div><div><dt>Selected range</dt><dd>{money(inRange)}</dd></div><div><dt>Remaining</dt><dd>{money(Math.max(0, p.commission - p.paid))}</dd></div></dl></article>; })}</div><article className="table-card"><div className="section-head"><div><h2>Payout history</h2><p>{range} · {filteredPayouts.length} records</p></div></div><div className="table-wrap"><table><thead><tr><th>Payee</th><th>Day</th><th>Method</th><th>Amount</th><th></th></tr></thead><tbody>{filteredPayouts.map((p) => <tr key={p.id}><td><b>{p.member.includes(":") ? p.member.split(":").reverse().join(" · ") : p.member}</b></td><td>{p.date}</td><td>{p.method}</td><td>{money(p.amount)}</td><td><button className="delete-payout" onClick={() => void deletePayout(p)} aria-label={`Delete payout for ${p.member}`}>Delete</button></td></tr>)}{!filteredPayouts.length && <tr><td colSpan={5}>No payouts in this date range.</td></tr>}</tbody></table></div></article></>}
        {tab === "Media KPIs" && <div className="empty-panel"><span>◉</span><h2>Media KPIs</h2><p>Connect an ad platform to populate this view.</p></div>}
      </div>
    </section>

    {modal && <div className="modal-wrap" role="dialog" aria-modal="true"><button className="modal-backdrop" onClick={() => setModal(null)} aria-label="Close" /><form className="modal" onSubmit={modal === "client" ? addClient : modal === "member" ? invite : modal === "sheet" ? connectSheet : modal === "settings" ? saveSettings : addPayout}><button type="button" className="modal-close" onClick={() => setModal(null)}>×</button><span className="modal-icon">{modal === "payout" ? "$" : modal === "settings" ? "⚙" : modal === "sheet" ? "▦" : "＋"}</span>
      <h2>{modal === "client" ? "Create workspace" : modal === "member" ? "Invite team member" : modal === "sheet" ? "Connect Google Sheets" : modal === "settings" ? "Workspace settings" : "Add payout"}</h2>
      {modal === "client" && <><label>Workspace name</label><input value={newName} onChange={(e) => setNewName(e.target.value)} required /></>}
      {modal === "member" && <><label>Email address</label><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /><label>Access level</label><select><option>Viewer</option><option>Editor</option><option>Admin</option></select></>}
      {modal === "sheet" && <><label>Google Sheets URL</label><input type="url" value={sheetUrl} onChange={(e) => setSheetUrl(e.target.value)} required /><div className="access-note">MoonRift reads <strong>System Overview</strong>, <strong>Sales CRM</strong>, and <strong>Closed Deals</strong>. Link sharing must allow viewers.</div></>}
      {modal === "settings" && <><label>Workspace name</label><input value={workspaceName} onChange={(e) => setWorkspaceName(e.target.value)} required /><label>Profile picture URL</label><input type="url" value={workspaceAvatar} onChange={(e) => setWorkspaceAvatar(e.target.value)} placeholder="https://…" /><div className="avatar-preview">{workspaceAvatar ? <img src={workspaceAvatar} alt="" /> : <span style={{ background: client.color }}>{initials(workspaceName || client.name)}</span>}</div><button type="button" className="danger-button" onClick={deleteWorkspace}>Delete workspace</button></>}
      {modal === "payout" && <><label>Payee</label><select value={payoutMember} onChange={(e) => setPayoutMember(e.target.value)} required>{payoutPeople.map((p) => <option key={p.key} value={p.key}>{p.name} — {p.role}</option>)}</select><label>Day</label><input type="date" value={payoutDate} onChange={(e) => setPayoutDate(e.target.value)} required /><label>Method</label><select value={payoutMethod} onChange={(e) => setPayoutMethod(e.target.value)}><option>ACH</option><option>Wire</option><option>Zelle</option><option>PayPal</option><option>Venmo</option><option>Cash</option><option>Other</option></select><label>Amount</label><input type="number" min="0.01" step="0.01" value={payoutAmount} onChange={(e) => setPayoutAmount(e.target.value)} required /></>}
      <div className="modal-actions"><button type="button" onClick={() => setModal(null)}>Cancel</button><button type="submit">{modal === "payout" ? "Record payout" : modal === "settings" ? "Save changes" : modal === "sheet" ? "Connect & sync" : modal === "member" ? "Send invitation" : "Create workspace"}</button></div>
    </form></div>}
    {toast && <div className="toast"><span>✓</span>{toast}</div>}
  </main>;
}
