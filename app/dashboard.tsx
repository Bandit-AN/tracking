"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Client = { id: number; name: string; industry: string; initials: string; color: string; avatar?: string };
type Person = { name: string; role: "Closer" | "Setter"; calls: number; closed: number; cash: number; revenue: number; commission: number; paid: number };
type Deal = { lead: string; phone: string; email: string; setter: string; closer: string; method: string; cash: number; offer: number; owed: number; date: string; next: string; end: string };
type Payout = { id: number; workspaceId: number; member: string; date: string; method: string; amount: number };
type SheetMetrics = { booked: number; taken: number; showRate: number; closers: Person[]; setters: Person[]; deals: Deal[]; updatedAt: Date };

const sheetUrlDefault = "https://docs.google.com/spreadsheets/d/1ahyY64u9uYmcEDFi1XAJRFmnZ_gX_6VQHUnWvswkvmg/edit?usp=sharing";
const clientsSeed: Client[] = [
  { id: 1, name: "Seller Syndicate", industry: "Sales workspace", initials: "SS", color: "#7646ff" },
  { id: 2, name: "Northstar Media", industry: "Creative agency", initials: "NM", color: "#009b85" },
  { id: 3, name: "Luma Health", industry: "Health & wellness", initials: "LH", color: "#d7632e" },
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
  const date = new Date(`${value.trim()} 12:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function rangeStart(range: string, now: Date) {
  const start = new Date(now); start.setHours(0, 0, 0, 0);
  if (range === "Last 7 days") start.setDate(start.getDate() - 6);
  if (range === "Last 30 days") start.setDate(start.getDate() - 29);
  if (range === "This quarter") start.setMonth(Math.floor(start.getMonth() / 3) * 3, 1);
  if (range === "Year to date") start.setMonth(0, 1);
  return start;
}

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

function PerformanceTable({ title, people }: { title: string; people: Person[] }) {
  return <article className="table-card">
    <div className="section-head"><div><h2>{title} performance</h2><p>Sorted by most cash collected</p></div></div>
    <div className="table-wrap"><table><thead><tr><th>{title}</th><th>Calls</th><th>Closed</th><th>Close rate</th><th>Cash collected</th><th>Revenue</th><th>Commission owed</th></tr></thead><tbody>
      {people.map((p, i) => <tr key={p.name}><td><span className={`person p${i % 4}`}>{initials(p.name)}</span><div><b>{p.name}</b><small>{p.role}</small></div></td><td>{p.calls}</td><td>{p.closed}</td><td><span className="rate">{p.calls ? Math.round(p.closed / p.calls * 100) : 0}%</span></td><td>{money(p.cash)}</td><td>{money(p.revenue)}</td><td>{money(Math.max(0, p.commission - p.paid))}</td></tr>)}
      {!people.length && <tr><td colSpan={7}>No team data in this sheet.</td></tr>}
    </tbody></table></div>
  </article>;
}

export function Dashboard() {
  const [clients, setClients] = useState(clientsSeed); const [clientId, setClientId] = useState(1);
  const [range, setRange] = useState("Last 30 days"); const [tab, setTab] = useState("Overview"); const [activeNav, setActiveNav] = useState("Dashboard");
  const [sidebarOpen, setSidebarOpen] = useState(false); const [clientMenu, setClientMenu] = useState(false); const [actionMenu, setActionMenu] = useState(false);
  const [modal, setModal] = useState<"client" | "member" | "sheet" | "settings" | "payout" | null>(null); const [toast, setToast] = useState("");
  const [newName, setNewName] = useState(""); const [email, setEmail] = useState(""); const [workspaceName, setWorkspaceName] = useState(""); const [workspaceAvatar, setWorkspaceAvatar] = useState("");
  const [sheetUrls, setSheetUrls] = useState<Record<number, string>>({ 1: sheetUrlDefault }); const [sheetUrl, setSheetUrl] = useState(sheetUrlDefault);
  const [sheetData, setSheetData] = useState<SheetMetrics | null>(null); const [sheetStatus, setSheetStatus] = useState<"idle" | "loading" | "connected" | "error">("idle");
  const [payouts, setPayouts] = useState<Payout[]>([]); const [payoutMember, setPayoutMember] = useState(""); const [payoutDate, setPayoutDate] = useState(new Date().toISOString().slice(0, 10)); const [payoutMethod, setPayoutMethod] = useState("ACH"); const [payoutAmount, setPayoutAmount] = useState("");
  const client = clients.find((c) => c.id === clientId) ?? clients[0];

  async function loadSheet(url = sheetUrls[clientId]) {
    if (!url) { setSheetData(null); setSheetStatus("idle"); return; }
    setSheetStatus("loading");
    try {
      const id = sheetIdFromUrl(url);
      const getSheet = async (sheet: string) => { const response = await fetch(`/api/sheets?spreadsheetId=${encodeURIComponent(id)}&sheet=${encodeURIComponent(sheet)}`); if (!response.ok) throw new Error(); return parseCsv(await response.text()); };
      const [overview, closed] = await Promise.all([getSheet("System Overview"), getSheet("Closed Deals")]);
      const totalsHeader = overview.findIndex((row) => row.some((cell) => cell.includes("Meetings Booked"))); const totals = overview[totalsHeader + 1] ?? [];
      const section = (name: string, stop: string[]) => { const start = overview.findIndex((row) => row[0]?.trim() === name); if (start < 0) return []; const rows = overview.slice(start + 1); const end = rows.findIndex((row) => stop.includes(row[0]?.trim())); return (end < 0 ? rows : rows.slice(0, end)).filter((row) => row[0]?.trim()); };
      const toPeople = (rows: string[][], role: Person["role"]) => rows.map((row) => ({ name: row[0].trim(), role, calls: numeric(row[1]), closed: numeric(row[2]), revenue: numeric(row[4]), cash: numeric(row[5]), commission: numeric(row[6]), paid: numeric(row[7]) })).sort((a, b) => b.cash - a.cash);
      const header = closed.findIndex((row) => row[0]?.trim() === "Lead Name"); const dealRows = header >= 0 ? closed.slice(header + 1).filter((row) => row[0]?.trim()) : [];
      setSheetData({
        booked: numeric(totals[0]), taken: numeric(totals[1]), showRate: numeric(totals[3]),
        setters: toPeople(section("Setter Name", ["Closer Name"]), "Setter"),
        closers: toPeople(section("Closer Name", ["Operator"]), "Closer"),
        deals: dealRows.map((row) => ({ lead: row[0], phone: row[1], email: row[2], setter: row[3], closer: row[4], method: row[5], cash: numeric(row[6]), offer: numeric(row[7]), owed: numeric(row[8]), date: row[9], next: row[10], end: row[11] })),
        updatedAt: new Date(),
      });
      setSheetStatus("connected");
    } catch { setSheetStatus("error"); setSheetData(null); }
  }

  async function loadWorkspace() {
    try {
      const response = await fetch(`/api/workspaces?workspaceId=${clientId}`); if (!response.ok) return;
      const data = await response.json() as { workspace?: { name?: string; avatar?: string }; payouts?: Payout[] };
      if (data.workspace?.name) setClients((items) => items.map((item) => item.id === clientId ? { ...item, name: data.workspace!.name!, initials: initials(data.workspace!.name!), avatar: data.workspace!.avatar || "" } : item));
      setPayouts(data.payouts ?? []);
    } catch { /* Preview remains usable when local D1 is unavailable. */ }
  }

  useEffect(() => { void loadSheet(); void loadWorkspace(); }, [clientId]);
  const notify = (text: string) => { setToast(text); window.setTimeout(() => setToast(""), 2800); };

  const period = useMemo(() => {
    const now = new Date(); const start = rangeStart(range, now); const dated = (sheetData?.deals ?? []).map((deal) => ({ deal, date: parseSheetDate(deal.date) })).filter((item): item is { deal: Deal; date: Date } => !!item.date && item.date >= start && item.date <= now);
    const days = Math.max(1, Math.ceil((now.getTime() - start.getTime()) / 86400000) + 1); const bucketCount = days <= 30 ? days : Math.min(13, Math.ceil(days / 7)); const bucketDays = Math.ceil(days / bucketCount);
    const cash = Array(bucketCount).fill(0); const revenue = Array(bucketCount).fill(0); const labels = Array(bucketCount).fill("");
    for (let i = 0; i < bucketCount; i++) { const date = new Date(start); date.setDate(start.getDate() + i * bucketDays); labels[i] = date.toLocaleDateString("en-US", { month: "short", day: "numeric" }); }
    dated.forEach(({ deal, date }) => { const index = Math.min(bucketCount - 1, Math.floor((date.getTime() - start.getTime()) / 86400000 / bucketDays)); cash[index] += deal.cash; revenue[index] += deal.offer; });
    const labelStep = Math.max(1, Math.ceil(labels.length / 5)); const shownLabels = labels.filter((_, i) => i % labelStep === 0 || i === labels.length - 1);
    return { dated, cash, revenue, labels: shownLabels, cashTotal: dated.reduce((sum, x) => sum + x.deal.cash, 0), revenueTotal: dated.reduce((sum, x) => sum + x.deal.offer, 0), missing: (sheetData?.deals ?? []).filter((deal) => !parseSheetDate(deal.date)).length };
  }, [sheetData, range]);

  const closerRows = useMemo(() => (sheetData?.closers.length ? sheetData.closers : fallbackPeople).map((person) => ({ ...person, paid: person.paid + payouts.filter((p) => p.member === person.name).reduce((sum, p) => sum + p.amount, 0) })).sort((a, b) => b.cash - a.cash), [sheetData, payouts]);
  const setters = useMemo(() => [...(sheetData?.setters ?? [])].sort((a, b) => b.cash - a.cash), [sheetData]);

  function addClient(e: React.FormEvent) { e.preventDefault(); if (!newName.trim()) return; const id = Date.now(); setClients((items) => [...items, { id, name: newName.trim(), industry: "New workspace", initials: initials(newName), color: "#3366e8" }]); setClientId(id); setNewName(""); setModal(null); notify("Workspace created"); }
  function invite(e: React.FormEvent) { e.preventDefault(); if (!email.includes("@")) return; setModal(null); notify(`Invite sent to ${email}`); setEmail(""); }
  function connectSheet(e: React.FormEvent) { e.preventDefault(); setSheetUrls((items) => ({ ...items, [clientId]: sheetUrl })); setModal(null); void loadSheet(sheetUrl); notify("Google Sheet connected"); }
  async function saveSettings(e: React.FormEvent) { e.preventDefault(); const name = workspaceName.trim() || client.name; setClients((items) => items.map((item) => item.id === clientId ? { ...item, name, initials: initials(name), avatar: workspaceAvatar.trim() } : item)); setModal(null); notify("Workspace updated"); try { await fetch("/api/workspaces", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ workspaceId: clientId, name, avatar: workspaceAvatar.trim() }) }); } catch {} }
  async function deleteWorkspace() { if (!window.confirm(`Delete ${client.name}? This removes its saved payouts and settings.`)) return; try { await fetch(`/api/workspaces?workspaceId=${clientId}`, { method: "DELETE" }); } catch {} const next = clients.find((x) => x.id !== clientId); setClients((items) => items.filter((x) => x.id !== clientId)); if (next) setClientId(next.id); setModal(null); notify("Workspace deleted"); }
  async function addPayout(e: React.FormEvent) { e.preventDefault(); const amount = numeric(payoutAmount); if (!payoutMember || amount <= 0) return; const optimistic: Payout = { id: Date.now(), workspaceId: clientId, member: payoutMember, date: payoutDate, method: payoutMethod, amount }; setPayouts((items) => [optimistic, ...items]); setModal(null); setPayoutAmount(""); notify("Payout recorded"); try { const response = await fetch("/api/workspaces", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(optimistic) }); if (response.ok) void loadWorkspace(); } catch {} }
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
      <div className="dashboard"><div className="page-title"><div><h1>{client.name} <span>{tab}</span></h1><p>Live sales, team performance, and payouts in one place.</p></div><div className="title-actions"><button onClick={() => { void loadSheet(); notify("Dashboard refreshed"); }}>↻ <span>Refresh</span></button><button onClick={() => setActionMenu(!actionMenu)}>⋯</button>{actionMenu && <div className="action-menu"><button onClick={openSettings}>Workspace settings</button><button onClick={() => setModal("sheet")}>Manage data source</button></div>}</div></div>
        <div className="tabs">{["Overview", "Closed Deals", "Payouts", "Media KPIs"].map((t) => <button className={tab === t ? "active" : ""} onClick={() => { setTab(t); setActiveNav(t === "Closed Deals" ? "Sales" : t === "Overview" ? "Dashboard" : t); }} key={t}>{t}</button>)}</div>
        <div className="filters"><div><label>Date range</label><select value={range} onChange={(e) => setRange(e.target.value)}><option>Last 7 days</option><option>Last 30 days</option><option>This quarter</option><option>Year to date</option></select></div><button className={`sheet-pill ${sheetStatus}`} onClick={() => { setSheetUrl(sheetUrls[clientId] ?? ""); setModal("sheet"); }}><span>●</span>{sheetStatus === "loading" ? "Syncing…" : sheetStatus === "connected" ? "Google Sheets live" : sheetStatus === "error" ? "Sheet error" : "Connect sheet"}</button></div>

        {tab === "Overview" && <><div className="charts"><Chart data={period.cash} labels={period.labels} color="#8b6cff" fill="rgba(139,108,255,.28)" label="Cash collected by payment date" total={money(period.cashTotal)} /><Chart data={period.revenue} labels={period.labels} color="#38d6b6" fill="rgba(56,214,182,.22)" label="Revenue generated by payment date" total={money(period.revenueTotal)} /></div>
          {period.missing > 0 && <div className="data-warning">ⓘ {period.missing} closed {period.missing === 1 ? "deal is" : "deals are"} missing a Date Closed and excluded from date-range totals and charts.</div>}
          <div className="kpi-grid"><article className="kpi"><span>Cash collected</span><strong>{money(period.cashTotal)}</strong></article><article className="kpi"><span>Revenue generated</span><strong>{money(period.revenueTotal)}</strong></article><article className="kpi"><span>Closed deals</span><strong>{period.dated.length}</strong></article><article className="kpi"><span>Meetings booked (all time)</span><strong>{sheetData?.booked ?? "—"}</strong></article><article className="kpi"><span>Meetings taken (all time)</span><strong>{sheetData?.taken ?? "—"}</strong></article><article className="kpi"><span>Show rate (all time)</span><strong>{sheetData ? `${sheetData.showRate.toFixed(2)}%` : "—"}</strong></article><article className="kpi"><span>Cash per closed deal</span><strong>{money(period.dated.length ? period.cashTotal / period.dated.length : 0)}</strong></article><article className="kpi"><span>Average offer value</span><strong>{money(period.dated.length ? period.revenueTotal / period.dated.length : 0)}</strong></article></div>
          <PerformanceTable title="Closer" people={closerRows} /><PerformanceTable title="Setter" people={setters} /></>}

        {tab === "Closed Deals" && <article className="table-card deals-card"><div className="section-head"><div><h2>Closed Deals</h2><p>Live from the Closed Deals tab in Google Sheets</p></div><strong>{sheetData?.deals.length ?? 0} deals</strong></div><div className="table-wrap"><table><thead><tr><th>Lead</th><th>Setter</th><th>Closer</th><th>Paid through</th><th>Cash collected</th><th>Offer amount</th><th>Amount owed</th><th>Date closed</th><th>Next payment</th></tr></thead><tbody>{(sheetData?.deals ?? []).map((deal) => <tr key={`${deal.lead}-${deal.phone}`}><td><div><b>{deal.lead}</b><small>{deal.email || deal.phone}</small></div></td><td>{deal.setter}</td><td>{deal.closer}</td><td>{deal.method}</td><td>{money(deal.cash)}</td><td>{money(deal.offer)}</td><td>{money(deal.owed)}</td><td>{deal.date || <span className="missing-date">Missing date</span>}</td><td>{deal.next || "—"}</td></tr>)}</tbody></table></div></article>}

        {tab === "Payouts" && <><div className="payout-head"><div><h2>Closer payouts</h2><p>App payouts are added to the totals imported from your sheet.</p></div><button onClick={() => { setPayoutMember(closerRows[0]?.name ?? ""); setModal("payout"); }}>＋ Add payout</button></div><div className="payout-grid">{closerRows.map((p) => <article className="payout-card" key={p.name}><div><span className="person p0">{initials(p.name)}</span><h3>{p.name}</h3></div><dl><div><dt>Commission earned</dt><dd>{money(p.commission)}</dd></div><div><dt>Paid out</dt><dd>{money(p.paid)}</dd></div><div><dt>Remaining</dt><dd>{money(Math.max(0, p.commission - p.paid))}</dd></div></dl></article>)}</div><article className="table-card"><div className="section-head"><div><h2>Payout history</h2><p>Date, method, and amount</p></div></div><div className="table-wrap"><table><thead><tr><th>Closer</th><th>Day</th><th>Method</th><th>Amount</th></tr></thead><tbody>{payouts.map((p) => <tr key={p.id}><td><b>{p.member}</b></td><td>{p.date}</td><td>{p.method}</td><td>{money(p.amount)}</td></tr>)}{!payouts.length && <tr><td colSpan={4}>No app-recorded payouts yet.</td></tr>}</tbody></table></div></article></>}
        {tab === "Media KPIs" && <div className="empty-panel"><span>◉</span><h2>Media KPIs</h2><p>Connect an ad platform to populate this view.</p></div>}
      </div>
    </section>

    {modal && <div className="modal-wrap" role="dialog" aria-modal="true"><button className="modal-backdrop" onClick={() => setModal(null)} aria-label="Close" /><form className="modal" onSubmit={modal === "client" ? addClient : modal === "member" ? invite : modal === "sheet" ? connectSheet : modal === "settings" ? saveSettings : addPayout}><button type="button" className="modal-close" onClick={() => setModal(null)}>×</button><span className="modal-icon">{modal === "payout" ? "$" : modal === "settings" ? "⚙" : modal === "sheet" ? "▦" : "＋"}</span>
      <h2>{modal === "client" ? "Create workspace" : modal === "member" ? "Invite team member" : modal === "sheet" ? "Connect Google Sheets" : modal === "settings" ? "Workspace settings" : "Add closer payout"}</h2>
      {modal === "client" && <><label>Workspace name</label><input value={newName} onChange={(e) => setNewName(e.target.value)} required /></>}
      {modal === "member" && <><label>Email address</label><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /><label>Access level</label><select><option>Viewer</option><option>Editor</option><option>Admin</option></select></>}
      {modal === "sheet" && <><label>Google Sheets URL</label><input type="url" value={sheetUrl} onChange={(e) => setSheetUrl(e.target.value)} required /><div className="access-note">MoonRift reads <strong>System Overview</strong> and <strong>Closed Deals</strong>. Link sharing must allow viewers.</div></>}
      {modal === "settings" && <><label>Workspace name</label><input value={workspaceName} onChange={(e) => setWorkspaceName(e.target.value)} required /><label>Profile picture URL</label><input type="url" value={workspaceAvatar} onChange={(e) => setWorkspaceAvatar(e.target.value)} placeholder="https://…" /><div className="avatar-preview">{workspaceAvatar ? <img src={workspaceAvatar} alt="" /> : <span style={{ background: client.color }}>{initials(workspaceName || client.name)}</span>}</div><button type="button" className="danger-button" onClick={deleteWorkspace}>Delete workspace</button></>}
      {modal === "payout" && <><label>Closer</label><select value={payoutMember} onChange={(e) => setPayoutMember(e.target.value)} required>{closerRows.map((p) => <option key={p.name}>{p.name}</option>)}</select><label>Day</label><input type="date" value={payoutDate} onChange={(e) => setPayoutDate(e.target.value)} required /><label>Method</label><select value={payoutMethod} onChange={(e) => setPayoutMethod(e.target.value)}><option>ACH</option><option>Wire</option><option>PayPal</option><option>Venmo</option><option>Cash</option><option>Other</option></select><label>Amount</label><input type="number" min="0.01" step="0.01" value={payoutAmount} onChange={(e) => setPayoutAmount(e.target.value)} required /></>}
      <div className="modal-actions"><button type="button" onClick={() => setModal(null)}>Cancel</button><button type="submit">{modal === "payout" ? "Record payout" : modal === "settings" ? "Save changes" : modal === "sheet" ? "Connect & sync" : modal === "member" ? "Send invitation" : "Create workspace"}</button></div>
    </form></div>}
    {toast && <div className="toast"><span>✓</span>{toast}</div>}
  </main>;
}
