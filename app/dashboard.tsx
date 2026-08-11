"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth/client";

type Role = "admin" | "team_member" | "student";
type Workspace = {
  id: number;
  name: string;
  industry: string;
  initials: string;
  color: string;
  avatar?: string;
  sheetUrl?: string;
  updatedAt: string;
};
type Person = {
  id: string;
  name: string;
  role: "closer" | "setter" | "operator";
  calls: number;
  closed: number;
  cash: number;
  revenue: number;
  commission: number;
  paid: number;
};
type Deal = {
  id: string;
  lead: string;
  phone: string;
  email: string;
  setter: string;
  closer: string;
  method: string;
  cash: number;
  offer: number;
  owed: number;
  date: string | null;
  next: string | null;
  end: string | null;
};
type Meeting = { id: string; date: string; status: string; taken: boolean };
type Payout = {
  id: number;
  workspaceId: number;
  member: string;
  date: string;
  method: string;
  amount: number;
};
type DashboardData = {
  workspace: Workspace;
  performance: Person[];
  deals: Deal[];
  meetings: Meeting[];
  payouts: Payout[];
  lastSync: {
    status: string;
    recordsImported: number;
    finishedAt: string | null;
  } | null;
  permissions: {
    canManage: boolean;
    canViewTeam: boolean;
    canViewPayouts: boolean;
  };
};
type PortalUser = {
  id: string;
  name: string;
  email: string;
  role: Role;
  status: "active" | "disabled";
  workspaceIds: number[];
};

const money = (value: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value || 0);
const initials = (name: string) =>
  name
    .split(/\s+/)
    .map((word) => word[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

function rangeStart(range: string, now: Date) {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  if (range === "Last 7 days") start.setDate(start.getDate() - 6);
  if (range === "Last 30 days") start.setDate(start.getDate() - 29);
  if (range === "This quarter")
    start.setMonth(Math.floor(start.getMonth() / 3) * 3, 1);
  if (range === "Year to date") start.setMonth(0, 1);
  if (range === "All time") start.setTime(0);
  return start;
}

function Chart({ data, labels }: { data: number[]; labels: string[] }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const element = canvas.current;
    if (!element) return;
    const render = () => {
      const ratio = window.devicePixelRatio || 1;
      const { width, height } = element.getBoundingClientRect();
      element.width = width * ratio;
      element.height = height * ratio;
      const context = element.getContext("2d");
      if (!context) return;
      context.scale(ratio, ratio);
      const values = data.length > 1 ? data : [0, data[0] ?? 0];
      const max = Math.max(...values, 1) * 1.12;
      const points = values.map((value, index) => ({
        x: 8 + (index / (values.length - 1)) * (width - 16),
        y: height - 15 - (value / max) * (height - 30),
      }));
      const gradient = context.createLinearGradient(0, 0, 0, height);
      gradient.addColorStop(0, "rgba(139,108,255,.36)");
      gradient.addColorStop(1, "rgba(139,108,255,0)");
      context.beginPath();
      context.moveTo(points[0].x, height);
      points.forEach((point) => context.lineTo(point.x, point.y));
      context.lineTo(points.at(-1)!.x, height);
      context.closePath();
      context.fillStyle = gradient;
      context.fill();
      context.beginPath();
      points.forEach((point, index) =>
        index
          ? context.lineTo(point.x, point.y)
          : context.moveTo(point.x, point.y),
      );
      context.strokeStyle = "#8b6cff";
      context.lineWidth = 2.5;
      context.stroke();
    };
    render();
    const observer = new ResizeObserver(render);
    observer.observe(element);
    return () => observer.disconnect();
  }, [data]);
  return (
    <article className="chart-card">
      <div className="chart-head">
        <div>
          <span className="chart-dot" /> Cash collected
        </div>
        <strong>{money(data.reduce((sum, value) => sum + value, 0))}</strong>
      </div>
      <canvas ref={canvas} aria-label="Cash collected over time" />
      <div className="chart-axis">
        {labels.map((label, index) => (
          <span key={`${label}-${index}`}>{label}</span>
        ))}
      </div>
    </article>
  );
}

export function Dashboard({
  initialWorkspaces,
  currentUser,
}: {
  initialWorkspaces: Workspace[];
  currentUser: { name: string; email: string; role: Role };
}) {
  const router = useRouter();
  const [workspaces, setWorkspaces] = useState(initialWorkspaces);
  const [workspaceId, setWorkspaceId] = useState(
    currentUser.role === "admin" ? 0 : (initialWorkspaces[0]?.id ?? 0),
  );
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(
    currentUser.role === "admin" || Boolean(initialWorkspaces.length),
  );
  const [error, setError] = useState("");
  const [tab, setTab] = useState("Overview");
  const [range, setRange] = useState("Last 30 days");
  const [customStart, setCustomStart] = useState(() => {
    const start = new Date();
    start.setDate(start.getDate() - 29);
    return start.toISOString().slice(0, 10);
  });
  const [customEnd, setCustomEnd] = useState(new Date().toISOString().slice(0, 10));
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [toast, setToast] = useState("");
  const [modal, setModal] = useState<
    "workspace" | "settings" | "payout" | "account" | "edit-account" | null
  >(null);
  const [selectedUser, setSelectedUser] = useState<PortalUser | null>(null);
  const [users, setUsers] = useState<PortalUser[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);

  const notify = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 3200);
  };

  const loadDashboard = useCallback(async () => {
    if (workspaceId === 0 && currentUser.role !== "admin") return;
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/dashboard?workspaceId=${workspaceId}`);
      if (!response.ok) throw new Error("Dashboard data could not be loaded");
      setData((await response.json()) as DashboardData);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Dashboard error");
    } finally {
      setLoading(false);
    }
  }, [workspaceId, currentUser.role]);

  const loadUsers = useCallback(async () => {
    if (currentUser.role !== "admin") return;
    setUsersLoading(true);
    try {
      const response = await fetch("/api/admin/users");
      if (!response.ok) throw new Error();
      setUsers(((await response.json()) as { users: PortalUser[] }).users);
    } catch {
      notify("User accounts could not be loaded");
    } finally {
      setUsersLoading(false);
    }
  }, [currentUser.role]);

  useEffect(() => {
    if (workspaceId === 0 && currentUser.role !== "admin") return;
    let cancelled = false;
    void fetch(`/api/dashboard?workspaceId=${workspaceId}`)
      .then(async (response) => {
        if (!response.ok) throw new Error("Dashboard data could not be loaded");
        const nextData = (await response.json()) as DashboardData;
        if (!cancelled) setData(nextData);
      })
      .catch((loadError: unknown) => {
        if (!cancelled) {
          setError(
            loadError instanceof Error ? loadError.message : "Dashboard error",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [workspaceId, currentUser.role]);

  const period = useMemo(() => {
    const now = range === "Custom" ? new Date(`${customEnd}T23:59:59`) : new Date();
    const start =
      range === "Custom"
        ? new Date(`${customStart}T00:00:00`)
        : rangeStart(range, now);
    const inRange = (value: string | null) => {
      if (!value) return false;
      const date = new Date(`${value}T12:00:00`);
      return range === "All time" || (date >= start && date <= now);
    };
    const deals = (data?.deals ?? []).filter((deal) => inRange(deal.date));
    const meetings = (data?.meetings ?? []).filter((meeting) => inRange(meeting.date));
    const payouts = (data?.payouts ?? []).filter((payout) => inRange(payout.date));
    const bucketCount = 6;
    const totalDays = Math.max(
      1,
      Math.ceil((now.getTime() - start.getTime()) / 86_400_000) + 1,
    );
    const bucketDays = Math.max(1, Math.ceil(totalDays / bucketCount));
    const series = Array(bucketCount).fill(0) as number[];
    const labels = Array.from({ length: bucketCount }, (_, index) => {
      const date = new Date(start);
      date.setDate(date.getDate() + index * bucketDays);
      return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    });
    deals.forEach((deal) => {
      const date = new Date(`${deal.date}T12:00:00`);
      const index = Math.min(
        bucketCount - 1,
        Math.max(0, Math.floor((date.getTime() - start.getTime()) / 86_400_000 / bucketDays)),
      );
      series[index] += deal.cash;
    });
    return {
      deals,
      meetings,
      payouts,
      series,
      labels,
      cash: deals.reduce((sum, deal) => sum + deal.cash, 0),
      revenue: deals.reduce((sum, deal) => sum + deal.offer, 0),
      taken: meetings.filter((meeting) => meeting.taken).length,
    };
  }, [data, range, customStart, customEnd]);

  async function submitJson(url: string, method: string, body: unknown) {
    const response = await fetch(url, {
      method,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const result = (await response.json()) as { error?: string };
    if (!response.ok) throw new Error(result.error || "Request failed");
    return result;
  }

  async function createWorkspace(formData: FormData) {
    await submitJson("/api/workspaces", "POST", {
      kind: "workspace",
      name: String(formData.get("name")),
      industry: String(formData.get("industry")),
      initials: initials(String(formData.get("name"))),
      color: "#7646ff",
    });
    const response = await fetch("/api/workspaces");
    const next = ((await response.json()) as { workspaces: Workspace[] }).workspaces;
    setWorkspaces(next);
    setWorkspaceId(next.at(-1)?.id ?? workspaceId);
    setModal(null);
    notify("Client subaccount created");
  }

  async function updateWorkspace(formData: FormData) {
    await submitJson("/api/workspaces", "PATCH", {
      workspaceId,
      name: String(formData.get("name")),
      industry: String(formData.get("industry")),
      avatar: String(formData.get("avatar")),
      sheetUrl: String(formData.get("sheetUrl")),
    });
    setModal(null);
    router.refresh();
    await loadDashboard();
    notify("Client subaccount settings saved");
  }

  async function addPayout(formData: FormData) {
    await submitJson("/api/workspaces", "POST", {
      workspaceId,
      member: String(formData.get("member")),
      date: String(formData.get("date")),
      method: String(formData.get("method")),
      amount: Number(formData.get("amount")),
    });
    setModal(null);
    await loadDashboard();
    notify("Payout recorded");
  }

  async function createAccount(formData: FormData) {
    const workspaceIds = formData.getAll("workspaceIds").map(Number);
    await submitJson("/api/admin/users", "POST", {
      name: String(formData.get("name")),
      email: String(formData.get("email")),
      password: String(formData.get("password")),
      role: String(formData.get("role")),
      workspaceIds,
    });
    setModal(null);
    await loadUsers();
    notify("Account created. Share the temporary password securely.");
  }

  async function updateAccount(formData: FormData) {
    if (!selectedUser) throw new Error("Select an account to update");
    await submitJson("/api/admin/users", "PATCH", {
      userId: selectedUser.id,
      role: String(formData.get("role")),
      status: String(formData.get("status")),
      workspaceIds: formData.getAll("workspaceIds").map(Number),
    });
    setModal(null);
    setSelectedUser(null);
    await loadUsers();
    notify("Account access updated");
  }

  async function syncData() {
    try {
      const response = await fetch(`/api/workspaces/${workspaceId}/sync`, {
        method: "POST",
      });
      const result = (await response.json()) as {
        error?: string;
        recordsImported?: number;
      };
      if (!response.ok) throw new Error(result.error || "Sync failed");
      await loadDashboard();
      notify(`${result.recordsImported ?? 0} live records synchronized`);
    } catch (syncError) {
      notify(syncError instanceof Error ? syncError.message : "Sync failed");
    }
  }

  async function toggleUser(user: PortalUser) {
    const nextStatus = user.status === "active" ? "disabled" : "active";
    try {
      await submitJson("/api/admin/users", "PATCH", {
        userId: user.id,
        role: user.role,
        status: nextStatus,
        workspaceIds: user.workspaceIds,
      });
      await loadUsers();
      notify(`Account ${nextStatus}`);
    } catch (toggleError) {
      notify(toggleError instanceof Error ? toggleError.message : "Update failed");
    }
  }

  async function signOut() {
    await authClient.signOut();
    router.replace("/auth/sign-in");
    router.refresh();
  }

  const navigation = [
    "Overview",
    "Closed Deals",
    ...(currentUser.role === "student" ? [] : ["Team", "Payouts"]),
    ...(currentUser.role === "admin" ? ["Users"] : []),
  ];
  const currentWorkspace = data?.workspace ?? workspaces.find((item) => item.id === workspaceId);

  return (
    <div className="app-shell">
      <aside className={sidebarOpen ? "open" : ""}>
        <div className="brand">
          <span className="brand-mark"><Image src="/moonrift-logo.png" alt="" width={28} height={28} priority /></span>
          <span>MoonRift Media</span>
        </div>
        <div className="workspace-label">CLIENT SUBACCOUNT</div>
        <select
          className="workspace-select"
          value={workspaceId}
          onChange={(event) => { setLoading(true); setError(""); setWorkspaceId(Number(event.target.value)); }}
          aria-label="Client subaccount"
        >
          {currentUser.role === "admin" && (
            <option value={0}>Agency overview — all offers</option>
          )}
          {workspaces.map((workspace) => (
            <option key={workspace.id} value={workspace.id}>{workspace.name}</option>
          ))}
        </select>
        {currentUser.role === "admin" && (
          <button
            className="new-workspace-button"
            onClick={() => setModal("workspace")}
          >
            ＋ New subaccount
          </button>
        )}
        <nav>
          {navigation.map((item) => (
            <button
              key={item}
              className={tab === item ? "active" : ""}
              onClick={() => { setTab(item); setSidebarOpen(false); if (item === "Users") void loadUsers(); }}
            >
              <span>{item === "Overview" ? "⌂" : item === "Closed Deals" ? "◇" : item === "Team" ? "♙" : item === "Payouts" ? "$" : "⚙"}</span>
              {item}
            </button>
          ))}
        </nav>
        <div className="sidebar-user">
          <span>{initials(currentUser.name)}</span>
          <div><b>{currentUser.name}</b><small>{currentUser.role.replace("_", " ")}</small></div>
          <button onClick={() => void signOut()} aria-label="Log out">↪</button>
        </div>
      </aside>
      {sidebarOpen && <button className="mobile-backdrop" onClick={() => setSidebarOpen(false)} aria-label="Close menu" />}

      <main>
        <header>
          <button className="hamburger" onClick={() => setSidebarOpen(true)} aria-label="Open menu">☰</button>
          <div><b>MoonRift Media Client Portal</b><small>Secure offer intelligence</small></div>
          <span className="live-badge"><i /> Live database</span>
        </header>
        <div className="dashboard">
          <div className="page-title">
            <div>
              <h1>{currentWorkspace?.name ?? "MoonRift Media"} <span>{tab}</span></h1>
              <p>{workspaceId === 0 ? "Agency-wide performance across every client offer." : "Live sales, team performance, and payouts for this client offer."}</p>
            </div>
            {data?.permissions.canManage && (
              <div className="title-actions">
                <button onClick={() => void syncData()}>↻ <span>Sync data</span></button>
                <button onClick={() => setModal("settings")}>⚙</button>
              </div>
            )}
          </div>

          <div className="filters">
            <div><label>Date range</label><select value={range} onChange={(event) => setRange(event.target.value)}><option>Last 7 days</option><option>Last 30 days</option><option>This quarter</option><option>Year to date</option><option>All time</option><option>Custom</option></select></div>
            {range === "Custom" && <><div><label>Start date</label><input type="date" value={customStart} max={customEnd} onChange={(event) => setCustomStart(event.target.value)} /></div><div><label>End date</label><input type="date" value={customEnd} min={customStart} onChange={(event) => setCustomEnd(event.target.value)} /></div></>}
            {data?.lastSync && <span className={`sheet-pill ${data.lastSync.status === "succeeded" ? "connected" : "error"}`}>● {data.lastSync.status === "succeeded" ? "Database current" : "Sync needs attention"}</span>}
          </div>

          {loading && <div className="state-card" role="status">Loading live portal data…</div>}
          {error && <div className="state-card error-state"><b>Dashboard unavailable</b><p>{error}</p><button onClick={() => void loadDashboard()}>Try again</button></div>}
          {!loading && !error && !workspaces.length && currentUser.role !== "admin" && <div className="state-card"><b>No subaccount access</b><p>A MoonRift Media administrator must assign this account to a client subaccount.</p></div>}

          {!loading && !error && data && tab === "Overview" && (
            <>
              <section className="kpi-grid">
                <article><span>Cash collected</span><strong>{money(period.cash)}</strong><small>Selected period</small></article>
                <article><span>Revenue contracted</span><strong>{money(period.revenue)}</strong><small>{period.deals.length} closed deals</small></article>
                <article><span>Meetings booked</span><strong>{period.meetings.length}</strong><small>{period.taken} taken</small></article>
                <article><span>Show rate</span><strong>{period.meetings.length ? Math.round((period.taken / period.meetings.length) * 100) : 0}%</strong><small>Selected period</small></article>
              </section>
              <Chart data={period.series} labels={period.labels} />
              {data.permissions.canViewTeam && <PerformanceTable people={data.performance} />}
            </>
          )}

          {!loading && !error && data && tab === "Closed Deals" && (
            <article className="table-card deals-card"><div className="section-head"><div><h2>Closed deals</h2><p>Normalized live records from Neon</p></div><strong>{period.deals.length} deals</strong></div><div className="table-wrap"><table><thead><tr><th>Lead</th><th>Setter</th><th>Closer</th><th>Paid through</th><th>Cash</th><th>Offer</th><th>Owed</th><th>Closed</th><th>Next payment</th></tr></thead><tbody>{period.deals.map((deal) => <tr key={deal.id}><td><div><b>{deal.lead}</b><small>{deal.email || deal.phone}</small></div></td><td>{deal.setter || "—"}</td><td>{deal.closer || "—"}</td><td>{deal.method || "—"}</td><td>{money(deal.cash)}</td><td>{money(deal.offer)}</td><td>{money(deal.owed)}</td><td>{deal.date || "—"}</td><td>{deal.next || "—"}</td></tr>)}{!period.deals.length && <tr><td colSpan={9}>No closed deals in this date range.</td></tr>}</tbody></table></div></article>
          )}

          {!loading && !error && data && tab === "Team" && <PerformanceTable people={data.performance} />}

          {!loading && !error && data && tab === "Payouts" && (
            <><div className="payout-head"><div><h2>Team payouts</h2><p>Persistent payout history with administrator attribution.</p></div>{data.permissions.canManage && <button onClick={() => setModal("payout")}>＋ Add payout</button>}</div><article className="table-card"><div className="table-wrap"><table><thead><tr><th>Payee</th><th>Date</th><th>Method</th><th>Amount</th></tr></thead><tbody>{period.payouts.map((payout) => <tr key={payout.id}><td><b>{payout.member}</b></td><td>{payout.date}</td><td>{payout.method}</td><td>{money(payout.amount)}</td></tr>)}{!period.payouts.length && <tr><td colSpan={4}>No payouts in this date range.</td></tr>}</tbody></table></div></article></>
          )}

          {!loading && !error && tab === "Users" && (
            <><div className="payout-head"><div><h2>Portal users</h2><p>Manage roles, status, and client subaccount access.</p></div><button onClick={() => { setSelectedUser(null); setModal("account"); }}>＋ Create account</button></div>{usersLoading ? <div className="state-card">Loading accounts…</div> : <article className="table-card"><div className="table-wrap"><table><thead><tr><th>User</th><th>Role</th><th>Subaccounts</th><th>Status</th><th></th></tr></thead><tbody>{users.map((user) => <tr key={user.id}><td><div><b>{user.name}</b><small>{user.email}</small></div></td><td>{user.role.replace("_", " ")}</td><td>{user.role === "admin" ? "All" : user.workspaceIds.length}</td><td><span className={`status ${user.status}`}>{user.status}</span></td><td><div className="row-actions"><button onClick={() => { setSelectedUser(user); setModal("edit-account"); }}>Edit</button><button className="delete-payout" onClick={() => void toggleUser(user)}>{user.status === "active" ? "Disable" : "Enable"}</button></div></td></tr>)}{!users.length && <tr><td colSpan={5}>No portal accounts yet.</td></tr>}</tbody></table></div></article>}</>
          )}
        </div>
      </main>

      {modal && <Modal title={modal === "workspace" ? "Create client subaccount" : modal === "settings" ? "Client subaccount settings" : modal === "payout" ? "Record payout" : modal === "edit-account" ? "Edit portal account" : "Create portal account"} onClose={() => { setModal(null); setSelectedUser(null); }} onSubmit={async (formData) => { try { if (modal === "workspace") await createWorkspace(formData); if (modal === "settings") await updateWorkspace(formData); if (modal === "payout") await addPayout(formData); if (modal === "account") await createAccount(formData); if (modal === "edit-account") await updateAccount(formData); } catch (submitError) { notify(submitError instanceof Error ? submitError.message : "Request failed"); } }}>
        {modal === "workspace" && <><label>Client or offer name</label><input name="name" required minLength={2} /><label>Industry / offer type</label><input name="industry" defaultValue="Client offer" required /></>}
        {modal === "settings" && <><label>Client or offer name</label><input name="name" defaultValue={data?.workspace.name} required /><label>Industry / offer type</label><input name="industry" defaultValue={data?.workspace.industry} required /><label>Profile image URL</label><input name="avatar" type="url" defaultValue={data?.workspace.avatar} /><label>Google Sheets URL</label><input name="sheetUrl" type="url" defaultValue={data?.workspace.sheetUrl} /><div className="access-note">The sheet is read only by the server. Imported records are normalized into Neon and never exposed through a public sheet proxy.</div></>}
        {modal === "payout" && <><label>Payee</label><select name="member" required>{data?.performance.map((person) => <option key={person.id} value={`${person.role}:${person.name}`}>{person.name} — {person.role}</option>)}</select><label>Date</label><input name="date" type="date" defaultValue={new Date().toISOString().slice(0, 10)} required /><label>Method</label><select name="method"><option>ACH</option><option>Wire</option><option>Zelle</option><option>PayPal</option><option>Venmo</option><option>Other</option></select><label>Amount</label><input name="amount" type="number" min="0.01" step="0.01" required /></>}
        {modal === "account" && <><label>Full name</label><input name="name" required minLength={2} /><label>Email</label><input name="email" type="email" required /><label>Temporary password</label><input name="password" type="password" minLength={12} autoComplete="new-password" required /><small className="field-help">Use 12+ characters and share it through a secure channel. The password is hashed by Neon Auth and is never stored in portal tables.</small><label>Role</label><select name="role"><option value="team_member">Team member</option><option value="student">Client</option><option value="admin">Agency admin</option></select><fieldset><legend>Client subaccount access</legend>{workspaces.map((workspace) => <label className="check-row" key={workspace.id}><input type="checkbox" name="workspaceIds" value={workspace.id} /> {workspace.name}</label>)}</fieldset></>}
        {modal === "edit-account" && selectedUser && <><div className="access-note"><b>{selectedUser.name}</b><br />{selectedUser.email}</div><label>Role</label><select name="role" defaultValue={selectedUser.role}><option value="team_member">Team member</option><option value="student">Client</option><option value="admin">Agency admin</option></select><label>Status</label><select name="status" defaultValue={selectedUser.status}><option value="active">Active</option><option value="disabled">Disabled</option></select><fieldset><legend>Client subaccount access</legend>{workspaces.map((workspace) => <label className="check-row" key={workspace.id}><input type="checkbox" name="workspaceIds" value={workspace.id} defaultChecked={selectedUser.workspaceIds.includes(workspace.id)} /> {workspace.name}</label>)}</fieldset></>}
      </Modal>}
      {toast && <div className="toast" role="status">✓ {toast}</div>}
    </div>
  );
}

function PerformanceTable({ people }: { people: Person[] }) {
  return <article className="table-card"><div className="section-head"><div><h2>Team performance</h2><p>Live synchronized records</p></div></div><div className="table-wrap"><table><thead><tr><th>Team member</th><th>Role</th><th>Calls</th><th>Closed</th><th>Rate</th><th>Cash</th><th>Revenue</th><th>Commission owed</th></tr></thead><tbody>{people.map((person, index) => <tr key={person.id}><td><span className={`person p${index % 4}`}>{initials(person.name)}</span><b>{person.name}</b></td><td>{person.role}</td><td>{person.calls}</td><td>{person.closed}</td><td><span className="rate">{person.calls ? Math.round((person.closed / person.calls) * 100) : 0}%</span></td><td>{money(person.cash)}</td><td>{money(person.revenue)}</td><td>{money(Math.max(0, person.commission - person.paid))}</td></tr>)}{!people.length && <tr><td colSpan={8}>No team performance records. Ask an admin to synchronize the data source.</td></tr>}</tbody></table></div></article>;
}

function Modal({ title, onClose, onSubmit, children }: { title: string; onClose: () => void; onSubmit: (formData: FormData) => Promise<void>; children: React.ReactNode }) {
  const [saving, setSaving] = useState(false);
  return <div className="modal-wrap" role="dialog" aria-modal="true" aria-label={title}><button className="modal-backdrop" onClick={onClose} aria-label="Close" /><form className="modal" onSubmit={(event) => { event.preventDefault(); setSaving(true); void onSubmit(new FormData(event.currentTarget)).finally(() => setSaving(false)); }}><button type="button" className="modal-close" onClick={onClose}>×</button><span className="modal-icon">◆</span><h2>{title}</h2>{children}<div className="modal-actions"><button type="button" onClick={onClose}>Cancel</button><button type="submit" disabled={saving}>{saving ? "Saving…" : "Save"}</button></div></form></div>;
}
