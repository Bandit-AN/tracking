"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Client = { id: number; name: string; industry: string; initials: string; color: string };
type Person = { name: string; role: string; calls: number; taken: number; closed: number; cash: number; revenue: number };

const clientsSeed: Client[] = [
  { id: 1, name: "Apex Consulting", industry: "Business coaching", initials: "AC", color: "#7646ff" },
  { id: 2, name: "Northstar Media", industry: "Creative agency", initials: "NM", color: "#009b85" },
  { id: 3, name: "Luma Health", industry: "Health & wellness", initials: "LH", color: "#d7632e" },
];

const people: Person[] = [
  { name: "Dillon Reed", role: "Closer", calls: 40, taken: 38, closed: 31, cash: 97850, revenue: 128000 },
  { name: "Zain Carter", role: "Closer", calls: 22, taken: 17, closed: 16, cash: 66000, revenue: 94500 },
  { name: "Jordan James", role: "Closer", calls: 9, taken: 8, closed: 6, cash: 16950, revenue: 32100 },
  { name: "Maya Torres", role: "Closer", calls: 10, taken: 4, closed: 4, cash: 4700, revenue: 43000 },
];

const baseSeries = [18, 20, 34, 52, 55, 47, 39, 51, 63, 76, 82, 94];
const revenueSeries = [22, 31, 47, 72, 65, 55, 49, 63, 79, 71, 88, 102];

function money(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
}

function Chart({ data, color, fill, label, total }: { data: number[]; color: string; fill: string; label: string; total: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const render = () => {
      const ratio = window.devicePixelRatio || 1;
      const { width, height } = el.getBoundingClientRect();
      el.width = width * ratio;
      el.height = height * ratio;
      const ctx = el.getContext("2d");
      if (!ctx) return;
      ctx.scale(ratio, ratio);
      const pad = { x: 8, y: 14 };
      const max = Math.max(...data) * 1.08;
      ctx.strokeStyle = "rgba(114, 108, 135, .15)";
      ctx.lineWidth = 1;
      for (let i = 0; i < 4; i++) {
        const y = pad.y + ((height - pad.y * 2) / 3) * i;
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke();
      }
      const points = data.map((v, i) => ({
        x: pad.x + (i / (data.length - 1)) * (width - pad.x * 2),
        y: height - pad.y - (v / max) * (height - pad.y * 2),
      }));
      const gradient = ctx.createLinearGradient(0, 0, 0, height);
      gradient.addColorStop(0, fill);
      gradient.addColorStop(1, "rgba(255,255,255,0)");
      ctx.beginPath(); ctx.moveTo(points[0].x, height);
      points.forEach((p) => ctx.lineTo(p.x, p.y));
      ctx.lineTo(points.at(-1)!.x, height); ctx.closePath();
      ctx.fillStyle = gradient; ctx.fill();
      ctx.beginPath();
      points.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y));
      ctx.strokeStyle = color; ctx.lineWidth = 2.5; ctx.lineJoin = "round"; ctx.lineCap = "round"; ctx.stroke();
      points.forEach((p) => {
        ctx.beginPath(); ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
        ctx.fillStyle = "#fff"; ctx.fill(); ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.stroke();
      });
    };
    render();
    const ro = new ResizeObserver(render); ro.observe(el);
    return () => ro.disconnect();
  }, [data, color, fill]);

  return (
    <article className="chart-card">
      <div className="chart-head">
        <div><span className="chart-dot" style={{ background: color }} />{label}</div>
        <strong>{total}</strong>
      </div>
      <canvas ref={canvas} aria-label={`${label} trend chart`} />
      <div className="chart-axis"><span>Jun 1</span><span>Jun 8</span><span>Jun 15</span><span>Jun 22</span><span>Jun 30</span></div>
    </article>
  );
}

const kpis = [
  { label: "Cash collected", value: "$185,500", change: "+12.4%", up: true, spark: [24, 32, 31, 43, 49, 62, 68] },
  { label: "Revenue generated", value: "$297,600", change: "+8.7%", up: true, spark: [31, 37, 35, 51, 48, 66, 72] },
  { label: "Calls due", value: "81", change: "-3.2%", up: false, spark: [69, 62, 65, 54, 58, 51, 47] },
  { label: "Calls taken", value: "67", change: "+5.1%", up: true, spark: [38, 42, 51, 47, 62, 67, 64] },
  { label: "Show rate", value: "86.42%", change: "+2.4%", up: true, spark: [51, 48, 58, 61, 64, 70, 75] },
  { label: "Close rate", value: "85.07%", change: "+6.3%", up: true, spark: [44, 54, 50, 62, 67, 63, 78] },
  { label: "Cash per call", value: "$2,769", change: "+9.8%", up: true, spark: [33, 39, 46, 43, 55, 61, 69] },
  { label: "Average order value", value: "$3,254", change: "-1.1%", up: false, spark: [66, 61, 63, 57, 54, 56, 52] },
];

function Spark({ values, up }: { values: number[]; up: boolean }) {
  return <div className="spark" aria-hidden="true">{values.map((v, i) => <i key={i} style={{ height: `${v}%`, background: up ? "#7148f5" : "#c6bddf" }} />)}</div>;
}

export function Dashboard() {
  const [clients, setClients] = useState(clientsSeed);
  const [clientId, setClientId] = useState(1);
  const [range, setRange] = useState("Last 30 days");
  const [tab, setTab] = useState("Overview");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [clientMenu, setClientMenu] = useState(false);
  const [modal, setModal] = useState<"client" | "member" | null>(null);
  const [toast, setToast] = useState("");
  const [newName, setNewName] = useState("");
  const [email, setEmail] = useState("");
  const client = clients.find((c) => c.id === clientId)!;

  const scaled = useMemo(() => {
    const factor = clientId === 1 ? 1 : clientId === 2 ? .74 : .52;
    return {
      cash: money(185500 * factor),
      revenue: money(297600 * factor),
      cashSeries: baseSeries.map((v) => v * factor),
      revenueSeries: revenueSeries.map((v) => v * factor),
    };
  }, [clientId]);

  function notify(text: string) {
    setToast(text); window.setTimeout(() => setToast(""), 2800);
  }

  function addClient(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    const id = Date.now();
    const initials = newName.trim().split(/\s+/).map((x) => x[0]).join("").slice(0, 2).toUpperCase();
    setClients((items) => [...items, { id, name: newName.trim(), industry: "New subaccount", initials, color: "#3366e8" }]);
    setClientId(id); setNewName(""); setModal(null); notify("Subaccount created successfully");
  }

  function invite(e: React.FormEvent) {
    e.preventDefault();
    if (!email.includes("@")) return;
    setModal(null); notify(`Invite sent to ${email}`); setEmail("");
  }

  return (
    <main className="app-shell">
      <aside className={`sidebar ${sidebarOpen ? "open" : ""}`}>
        <div className="brand"><span className="brand-mark"><b /><b /><b /></span><span>Metricly</span></div>
        <div className="workspace-label">WORKSPACE</div>
        <button className="client-select" onClick={() => setClientMenu(!clientMenu)}>
          <span className="client-avatar" style={{ background: client.color }}>{client.initials}</span>
          <span><strong>{client.name}</strong><small>{client.industry}</small></span><em>⌄</em>
        </button>
        {clientMenu && <div className="client-popover">
          {clients.map((c) => <button key={c.id} onClick={() => { setClientId(c.id); setClientMenu(false); }}><span style={{ background: c.color }}>{c.initials}</span><b>{c.name}</b>{c.id === clientId && "✓"}</button>)}
          <button className="new-client" onClick={() => { setModal("client"); setClientMenu(false); }}>＋ New subaccount</button>
        </div>}
        <nav>
          <a className="active"><span>▦</span> Dashboard</a>
          <a><span>◫</span> Sales</a>
          <a><span>♢</span> Payments</a>
          <a><span>◎</span> Media KPIs</a>
          <div className="nav-line" />
          <a><span>♙</span> Team members</a>
          <a><span>⚙</span> Settings</a>
        </nav>
        <div className="sidebar-bottom">
          <button className="help"><span>?</span><div><strong>Need help?</strong><small>Visit the help center</small></div></button>
          <div className="profile"><span>JS</span><div><strong>Jordan Smith</strong><small>Workspace admin</small></div><button>⋮</button></div>
        </div>
      </aside>
      {sidebarOpen && <button className="scrim" onClick={() => setSidebarOpen(false)} aria-label="Close menu" />}

      <section className="content">
        <header className="topbar">
          <button className="menu-btn" onClick={() => setSidebarOpen(true)}>☰</button>
          <div className="crumb"><span>Dashboards</span><b>/</b><strong>Sales performance</strong></div>
          <div className="top-actions">
            <button className="icon-btn" aria-label="Notifications">♢<i /></button>
            <button className="invite-btn" onClick={() => setModal("member")}>＋ Invite member</button>
          </div>
        </header>

        <div className="dashboard">
          <div className="page-title">
            <div><h1>{client.name} <span>Sales Report</span></h1><p>Track revenue, calls, and team performance in one place.</p></div>
            <div className="title-actions"><button>⇩ <span>Export</span></button><button>⋯</button></div>
          </div>

          <div className="tabs">
            {["Overview", "Payments", "Media KPIs"].map((t) => <button className={tab === t ? "active" : ""} onClick={() => setTab(t)} key={t}>{t}</button>)}
          </div>

          <div className="filters">
            <div><label>Setter</label><select><option>All setters</option><option>Maya Torres</option><option>Chris Green</option></select></div>
            <div><label>Closer</label><select><option>All closers</option>{people.map((p) => <option key={p.name}>{p.name}</option>)}</select></div>
            <div><label>Date range</label><select value={range} onChange={(e) => setRange(e.target.value)}><option>Last 7 days</option><option>Last 30 days</option><option>This quarter</option><option>Year to date</option></select></div>
            <button className="refresh" onClick={() => notify("Dashboard data refreshed")}>↻</button>
          </div>

          {tab === "Overview" ? <>
            <div className="charts">
              <Chart data={scaled.cashSeries} color="#6442e8" fill="rgba(100,66,232,.25)" label="Cash collected" total={scaled.cash} />
              <Chart data={scaled.revenueSeries} color="#008e7d" fill="rgba(0,142,125,.22)" label="Revenue generated" total={scaled.revenue} />
            </div>
            <div className="kpi-grid">
              {kpis.map((k, i) => <article className="kpi" key={k.label}><div className="kpi-top"><span>{k.label}</span><small className={k.up ? "up" : "down"}>{k.up ? "↗" : "↘"} {k.change}</small></div><strong>{i === 0 ? scaled.cash : i === 1 ? scaled.revenue : k.value}</strong><Spark values={k.spark} up={k.up} /></article>)}
            </div>
            <article className="table-card">
              <div className="section-head"><div><h2>Closer performance</h2><p>Individual sales activity and outcomes</p></div><button>View full report →</button></div>
              <div className="table-wrap"><table><thead><tr><th>Closer</th><th>Calls due</th><th>Calls taken</th><th>Calls closed</th><th>Close rate</th><th>Cash collected</th><th>Revenue</th></tr></thead><tbody>
                {people.map((p, i) => <tr key={p.name}><td><span className={`person p${i}`}>{p.name.split(" ").map((n) => n[0]).join("")}</span><div><b>{p.name}</b><small>{p.role}</small></div></td><td>{p.calls}</td><td>{p.taken}</td><td>{p.closed}</td><td><span className="rate">{Math.round(p.closed / p.taken * 100)}%</span></td><td>{money(p.cash)}</td><td>{money(p.revenue)}</td></tr>)}
              </tbody></table></div>
            </article>
          </> : <div className="empty-panel"><span>{tab === "Payments" ? "▣" : "◎"}</span><h2>{tab} dashboard</h2><p>This view is ready for your connected {tab === "Payments" ? "payment processor" : "ad platform"} data.</p><button onClick={() => notify("Data source setup opened")}>Connect data source</button></div>}
        </div>
      </section>

      {modal && <div className="modal-wrap" role="dialog" aria-modal="true">
        <button className="modal-backdrop" onClick={() => setModal(null)} aria-label="Close" />
        <form className="modal" onSubmit={modal === "client" ? addClient : invite}>
          <button type="button" className="modal-close" onClick={() => setModal(null)}>×</button>
          <span className="modal-icon">{modal === "client" ? "▦" : "♙"}</span>
          <h2>{modal === "client" ? "Create a subaccount" : "Invite a team member"}</h2>
          <p>{modal === "client" ? "Set up a separate client workspace with its own dashboard and members." : `Give someone access to ${client.name}'s dashboards.`}</p>
          {modal === "client" ? <><label>Client or company name</label><input autoFocus value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. Acme Growth" required /><label>Industry</label><select><option>Consulting & coaching</option><option>Agency</option><option>Health & wellness</option><option>Other</option></select></> : <><label>Email address</label><input autoFocus type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="teammate@company.com" required /><label>Access level</label><select><option>Viewer — can view dashboards</option><option>Editor — can manage dashboard data</option><option>Admin — can manage this subaccount</option></select><div className="access-note">This invite only grants access to <strong>{client.name}</strong>.</div></>}
          <div className="modal-actions"><button type="button" onClick={() => setModal(null)}>Cancel</button><button type="submit">{modal === "client" ? "Create subaccount" : "Send invitation"}</button></div>
        </form>
      </div>}
      {toast && <div className="toast"><span>✓</span>{toast}</div>}
    </main>
  );
}
