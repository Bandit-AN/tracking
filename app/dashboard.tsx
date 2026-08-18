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
  workspaceId: number;
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
  source: string;
  medium: string;
  campaign: string;
  video: string;
};
type Meeting = {
  id: string;
  workspaceId: number;
  lead: string;
  phone: string;
  email: string;
  setter: string;
  closer: string;
  date: string;
  status: string;
  taken: boolean;
  notes: string;
  recording: string;
  feedback: string;
};
type AttributionEvent = {
  id: string;
  workspaceId: number;
  date: string;
  event: "page_view" | "application_submitted";
  source: string;
  medium: string;
  campaign: string;
  content: string;
  video: string;
};
type Payout = {
  id: number;
  workspaceId: number;
  member: string;
  date: string;
  method: string;
  amount: number;
};
type MetaInsight = {
  id: string;
  workspaceId: number;
  date: string;
  adAccountId: string;
  campaignId: string;
  campaignName: string;
  impressions: number;
  reach: number;
  clicks: number;
  spend: number;
  leads: number;
  purchases: number;
  purchaseValue: number;
};
type MetaConnectionSummary = {
  workspaceId: number;
  adAccountName: string;
  currency: string;
  status: string;
  lastSyncedAt: string | null;
};
type MetaIntegration = {
  configured: boolean;
  connected: boolean;
  connection?: MetaConnectionSummary & {
    metaUserName: string;
    adAccountId: string | null;
    tokenExpiresAt: string | null;
    lastError: string | null;
  };
  accounts: Array<{
    id: string;
    name: string;
    status?: number;
    currency: string;
    timezone: string;
    businessName: string;
  }>;
};
type DashboardData = {
  workspace: Workspace;
  performance: Person[];
  deals: Deal[];
  meetings: Meeting[];
  attributionEvents: AttributionEvent[];
  applicantBaseline: number;
  payouts: Payout[];
  metaInsights: MetaInsight[];
  metaConnections: MetaConnectionSummary[];
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

const SELLER_SYNDICATE_LOGO = "/seller-syndicate-logo.png";
const workspaceAvatar = (workspace?: Pick<Workspace, "name" | "avatar">) =>
  workspace && /seller\s+syndicate/i.test(workspace.name)
    ? SELLER_SYNDICATE_LOGO
    : workspace?.avatar || "";

const isClosedOutcome = (status: string) =>
  /\b(closed|won|sold|paid|deposit)\b/i.test(status) &&
  !/not\s+closed|lost|refund|cancel/i.test(status);

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

function Chart({
  data,
  labels,
  title,
  color,
  fill,
}: {
  data: number[];
  labels: string[];
  title: "Cash collected" | "Revenue" | "Meta ad spend";
  color: string;
  fill: string;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [hovered, setHovered] = useState<number | null>(null);
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
      gradient.addColorStop(0, fill);
      gradient.addColorStop(1, "rgba(0,0,0,0)");
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
      context.strokeStyle = color;
      context.lineWidth = 2.5;
      context.stroke();
      points.forEach((point, index) => {
        if (index !== hovered) return;
        context.beginPath();
        context.arc(point.x, point.y, 5, 0, Math.PI * 2);
        context.fillStyle = "#f8f5ff";
        context.fill();
        context.lineWidth = 3;
        context.strokeStyle = color;
        context.stroke();
      });
    };
    render();
    const observer = new ResizeObserver(render);
    observer.observe(element);
    return () => observer.disconnect();
  }, [color, data, fill, hovered]);
  const hoveredValue = hovered === null ? null : data[hovered];
  const max = Math.max(...data, 1) * 1.12;
  const horizontalPosition = hovered === null
    ? 0
    : 2 + (hovered / Math.max(data.length - 1, 1)) * 96;
  const verticalPosition = hoveredValue === null
    ? 50
    : 90 - (hoveredValue / max) * 78;
  return (
    <article className="chart-card">
      <div className="chart-head">
        <div>
          <span className="chart-dot" style={{ background: color }} /> {title}
        </div>
        <strong>{money(data.reduce((sum, value) => sum + value, 0))}</strong>
      </div>
      <div className="chart-canvas-wrap">
        <canvas
          ref={canvas}
          aria-label={`${title} over time`}
          onMouseMove={(event) => {
            const bounds = event.currentTarget.getBoundingClientRect();
            const count = Math.max(data.length - 1, 1);
            const index = Math.round(((event.clientX - bounds.left - 8) / Math.max(bounds.width - 16, 1)) * count);
            setHovered(Math.max(0, Math.min(data.length - 1, index)));
          }}
          onMouseLeave={() => setHovered(null)}
        />
        {hovered !== null && hoveredValue != null && (
          <div
            className={`chart-tooltip${horizontalPosition > 68 ? " chart-tooltip-left" : ""}`}
            style={{ left: `${horizontalPosition}%`, top: `${verticalPosition}%` }}
          >
            <span>{labels[hovered]}</span><strong>{money(hoveredValue)}</strong>
          </div>
        )}
      </div>
      <div className="chart-axis">
        {labels.map((label, index) => index % Math.max(1, Math.ceil(labels.length / 6)) === 0 || index === labels.length - 1 ? <span key={`${label}-${index}`}>{label}</span> : null)}
      </div>
    </article>
  );
}

export function Dashboard({
  initialWorkspaces,
  currentUser,
  initialWorkspaceId,
  initialTab,
  initialNotice,
}: {
  initialWorkspaces: Workspace[];
  currentUser: { name: string; email: string; role: Role };
  initialWorkspaceId: number;
  initialTab: string;
  initialNotice: string;
}) {
  const router = useRouter();
  const [workspaces, setWorkspaces] = useState(initialWorkspaces);
  const [workspaceId, setWorkspaceId] = useState(initialWorkspaceId);
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(
    currentUser.role === "admin" || Boolean(initialWorkspaces.length),
  );
  const [error, setError] = useState("");
  const [tab, setTab] = useState(initialTab);
  const [range, setRange] = useState("Last 30 days");
  const [outcomeFilter, setOutcomeFilter] = useState("All outcomes");
  const [customStart, setCustomStart] = useState(() => {
    const start = new Date();
    start.setDate(start.getDate() - 29);
    return start.toISOString().slice(0, 10);
  });
  const [customEnd, setCustomEnd] = useState(new Date().toISOString().slice(0, 10));
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [toast, setToast] = useState(initialNotice);
  const [modal, setModal] = useState<
    "workspace" | "payout" | "account" | "edit-account" | null
  >(null);
  const [selectedUser, setSelectedUser] = useState<PortalUser | null>(null);
  const [users, setUsers] = useState<PortalUser[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [metaIntegration, setMetaIntegration] = useState<MetaIntegration | null>(null);
  const [metaLoading, setMetaLoading] = useState(false);

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

  const loadMetaIntegration = useCallback(async () => {
    if (currentUser.role !== "admin" || workspaceId <= 0) return;
    setMetaLoading(true);
    try {
      const response = await fetch(`/api/integrations/meta?workspaceId=${workspaceId}`);
      if (!response.ok) throw new Error("Meta connection could not be loaded");
      setMetaIntegration((await response.json()) as MetaIntegration);
    } catch (loadError) {
      notify(loadError instanceof Error ? loadError.message : "Meta connection failed");
    } finally {
      setMetaLoading(false);
    }
  }, [currentUser.role, workspaceId]);

  useEffect(() => {
    if (!initialNotice) return;
    const timeout = window.setTimeout(() => setToast(""), 4200);
    window.history.replaceState(null, "", "/dashboard");
    return () => window.clearTimeout(timeout);
  }, [initialNotice]);

  useEffect(() => {
    if (tab === "Settings" && workspaceId > 0 && currentUser.role === "admin") {
      let cancelled = false;
      void fetch(`/api/integrations/meta?workspaceId=${workspaceId}`)
        .then(async (response) => {
          if (!response.ok) throw new Error("Meta connection could not be loaded");
          const integration = (await response.json()) as MetaIntegration;
          if (!cancelled) setMetaIntegration(integration);
        })
        .catch((loadError: unknown) => {
          if (!cancelled) notify(loadError instanceof Error ? loadError.message : "Meta connection failed");
        });
      return () => { cancelled = true; };
    }
  }, [currentUser.role, tab, workspaceId]);

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
    const attributionEvents = (data?.attributionEvents ?? []).filter((event) => inRange(event.date));
    const payouts = (data?.payouts ?? []).filter((payout) => inRange(payout.date));
    const metaInsights = (data?.metaInsights ?? []).filter((insight) => inRange(insight.date));
    const earliestActivity = [
      ...deals.map((deal) => deal.date).filter(Boolean),
      ...metaInsights.map((insight) => insight.date),
    ].sort()[0];
    const chartStart = range === "All time" && earliestActivity
      ? new Date(`${earliestActivity}T00:00:00`)
      : start;
    const totalDays = Math.max(
      1,
      Math.ceil((now.getTime() - chartStart.getTime()) / 86_400_000) + 1,
    );
    const bucketCount = Math.min(totalDays, 120);
    const bucketDays = Math.max(1, Math.ceil(totalDays / bucketCount));
    const cashSeries = Array(bucketCount).fill(0) as number[];
    const revenueSeries = Array(bucketCount).fill(0) as number[];
    const metaSpendSeries = Array(bucketCount).fill(0) as number[];
    const labels = Array.from({ length: bucketCount }, (_, index) => {
      const date = new Date(chartStart);
      date.setDate(date.getDate() + index * bucketDays);
      return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    });
    deals.forEach((deal) => {
      const date = new Date(`${deal.date}T12:00:00`);
      const index = Math.min(
        bucketCount - 1,
        Math.max(0, Math.floor((date.getTime() - chartStart.getTime()) / 86_400_000 / bucketDays)),
      );
      cashSeries[index] += deal.cash;
      revenueSeries[index] += deal.offer;
    });
    metaInsights.forEach((insight) => {
      const date = new Date(`${insight.date}T12:00:00`);
      const index = Math.min(
        bucketCount - 1,
        Math.max(0, Math.floor((date.getTime() - chartStart.getTime()) / 86_400_000 / bucketDays)),
      );
      metaSpendSeries[index] += insight.spend;
    });
    const metaCampaignMap = new Map<string, {
      workspaceId: number;
      campaignId: string;
      campaignName: string;
      impressions: number;
      reach: number;
      clicks: number;
      spend: number;
      leads: number;
      purchases: number;
      purchaseValue: number;
    }>();
    for (const insight of metaInsights) {
      const key = `${insight.workspaceId}:${insight.campaignId}`;
      const campaign = metaCampaignMap.get(key) ?? {
        workspaceId: insight.workspaceId,
        campaignId: insight.campaignId,
        campaignName: insight.campaignName,
        impressions: 0,
        reach: 0,
        clicks: 0,
        spend: 0,
        leads: 0,
        purchases: 0,
        purchaseValue: 0,
      };
      campaign.impressions += insight.impressions;
      campaign.reach += insight.reach;
      campaign.clicks += insight.clicks;
      campaign.spend += insight.spend;
      campaign.leads += insight.leads;
      campaign.purchases += insight.purchases;
      campaign.purchaseValue += insight.purchaseValue;
      metaCampaignMap.set(key, campaign);
    }
    const rankByCash = (role: "closer" | "setter") => {
      const people = new Map<string, Person>();
      for (const deal of deals) {
        const name = (role === "closer" ? deal.closer : deal.setter).trim();
        if (!name) continue;
        const key = name.toLowerCase();
        const person = people.get(key) ?? {
          id: `${role}:${key}`,
          name,
          role,
          calls: 0,
          closed: 0,
          cash: 0,
          revenue: 0,
          commission: 0,
          paid: 0,
        };
        person.closed += 1;
        person.cash += deal.cash;
        person.revenue += deal.offer;
        people.set(key, person);
      }
      return [...people.values()].sort(
        (left, right) => right.cash - left.cash || right.closed - left.closed,
      );
    };
    const taken = meetings.filter((meeting) => meeting.taken).length;
    const crmCloses = meetings.filter((meeting) =>
      isClosedOutcome(meeting.status),
    ).length;
    const applications = attributionEvents.filter((event) => event.event === "application_submitted");
    const sourceAttribution = new Map<string, { source: string; deals: number; cash: number; revenue: number }>();
    for (const deal of deals) {
      const source = deal.source.trim() || "Unattributed";
      const key = source.toLowerCase();
      const item = sourceAttribution.get(key) ?? { source, deals: 0, cash: 0, revenue: 0 };
      item.deals += 1;
      item.cash += deal.cash;
      item.revenue += deal.offer;
      sourceAttribution.set(key, item);
    }
    const youtubeLabel = (video: string, content: string, campaign: string, medium = "") => {
      if (medium.trim().toLowerCase() === "bio link" || campaign.trim().toLowerCase() === "organic") {
        return "yt-bio";
      }
      return video || content || campaign || "Unlabeled YouTube traffic";
    };
    const youtube = new Map<string, { video: string; views: number; applicants: number; deals: number; cash: number }>();
    for (const event of attributionEvents) {
      if (event.source !== "youtube") continue;
      const video = youtubeLabel(event.video, event.content, event.campaign, event.medium);
      const key = video.toLowerCase();
      const item = youtube.get(key) ?? { video, views: 0, applicants: 0, deals: 0, cash: 0 };
      if (event.event === "page_view") item.views += 1;
      if (event.event === "application_submitted") item.applicants += 1;
      youtube.set(key, item);
    }
    for (const deal of deals) {
      if (deal.source.toLowerCase() !== "youtube") continue;
      const video = youtubeLabel(deal.video, "", deal.campaign, deal.medium);
      const key = video.toLowerCase();
      const item = youtube.get(key) ?? { video, views: 0, applicants: 0, deals: 0, cash: 0 };
      item.deals += 1;
      item.cash += deal.cash;
      youtube.set(key, item);
    }
    const workspacePerformance = data?.workspace.id === 0
      ? workspaces.map((workspace) => {
          const workspaceDeals = deals.filter(
            (deal) => deal.workspaceId === workspace.id,
          );
          const workspaceMeetings = meetings.filter(
            (meeting) => meeting.workspaceId === workspace.id,
          );
          const workspaceApplications = applications.filter(
            (event) => event.workspaceId === workspace.id,
          ).length + 17;
          const workspaceTaken = workspaceMeetings.filter(
            (meeting) => meeting.taken,
          ).length;
          const workspaceCloses = workspaceMeetings.filter((meeting) =>
            isClosedOutcome(meeting.status),
          ).length;
          const cash = workspaceDeals.reduce((sum, deal) => sum + deal.cash, 0);
          const revenue = workspaceDeals.reduce((sum, deal) => sum + deal.offer, 0);
          return {
            ...workspace,
            applications: workspaceApplications,
            meetings: workspaceMeetings.length,
            taken: workspaceTaken,
            closes: workspaceCloses,
            cash,
            revenue,
            showRate: workspaceMeetings.length
              ? Math.round((workspaceTaken / workspaceMeetings.length) * 100)
              : 0,
            closeRate: workspaceTaken
              ? Math.round((workspaceCloses / workspaceTaken) * 100)
              : 0,
            cashToRevenue: revenue ? Math.round((cash / revenue) * 100) : 0,
          };
        }).sort((left, right) => right.cash - left.cash)
      : [];
    return {
      deals,
      meetings,
      payouts,
      cashSeries,
      revenueSeries,
      metaSpendSeries,
      labels,
      cash: deals.reduce((sum, deal) => sum + deal.cash, 0),
      revenue: deals.reduce((sum, deal) => sum + deal.offer, 0),
      taken,
      crmCloses,
      applicants: applications.length + (data?.applicantBaseline ?? 0),
      meta: {
        insights: metaInsights,
        campaigns: [...metaCampaignMap.values()].sort((left, right) => right.spend - left.spend),
        spend: metaInsights.reduce((sum, insight) => sum + insight.spend, 0),
        impressions: metaInsights.reduce((sum, insight) => sum + insight.impressions, 0),
        reach: metaInsights.reduce((sum, insight) => sum + insight.reach, 0),
        clicks: metaInsights.reduce((sum, insight) => sum + insight.clicks, 0),
        leads: metaInsights.reduce((sum, insight) => sum + insight.leads, 0),
        purchases: metaInsights.reduce((sum, insight) => sum + insight.purchases, 0),
        purchaseValue: metaInsights.reduce((sum, insight) => sum + insight.purchaseValue, 0),
      },
      workspacePerformance,
      sourceAttribution: [...sourceAttribution.values()].sort((left, right) => right.deals - left.deals),
      youtube: [...youtube.values()].sort((left, right) => {
        const leftRate = left.views ? left.applicants / left.views : 0;
        const rightRate = right.views ? right.applicants / right.views : 0;
        return right.cash - left.cash || rightRate - leftRate;
      }),
      closers: rankByCash("closer"),
      setters: rankByCash("setter"),
    };
  }, [data, range, customStart, customEnd, workspaces]);

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
    router.refresh();
    await loadDashboard();
    notify("Client subaccount settings saved");
  }

  async function deleteWorkspace(formData: FormData) {
    const confirmationOne = String(formData.get("confirmationOne"));
    const confirmationTwo = String(formData.get("confirmationTwo"));
    await submitJson(`/api/workspaces?kind=workspace&workspaceId=${workspaceId}`, "DELETE", {
      confirmationOne,
      confirmationTwo,
    });
    const response = await fetch("/api/workspaces");
    const next = ((await response.json()) as { workspaces: Workspace[] }).workspaces;
    setWorkspaces(next);
    setWorkspaceId(0);
    setTab("Overview");
    notify("Client subaccount permanently deleted");
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
      newPassword: String(formData.get("newPassword") || ""),
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

  async function saveMetaAccount(adAccountId: string) {
    setMetaLoading(true);
    try {
      const result = await submitJson("/api/integrations/meta", "PATCH", {
        workspaceId,
        adAccountId,
      }) as { recordsImported?: number };
      await Promise.all([loadMetaIntegration(), loadDashboard()]);
      notify(`Meta connected · ${result.recordsImported ?? 0} campaign-day records synced`);
    } finally {
      setMetaLoading(false);
    }
  }

  async function syncMetaData() {
    setMetaLoading(true);
    try {
      const result = await submitJson("/api/integrations/meta", "POST", { workspaceId }) as { recordsImported?: number };
      await Promise.all([loadMetaIntegration(), loadDashboard()]);
      notify(`${result.recordsImported ?? 0} Meta campaign-day records synced`);
    } finally {
      setMetaLoading(false);
    }
  }

  async function disconnectMeta() {
    if (!window.confirm("Disconnect Meta and remove its imported ad insights from this workspace?")) return;
    setMetaLoading(true);
    try {
      await submitJson("/api/integrations/meta", "DELETE", { workspaceId });
      setMetaIntegration({ configured: true, connected: false, accounts: [] });
      await loadDashboard();
      notify("Meta disconnected");
    } finally {
      setMetaLoading(false);
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
    "Media",
    "Sales CRM",
    ...(currentUser.role === "student" ? [] : ["Team", "Payouts"]),
    ...(currentUser.role === "admin" ? ["Users", "Settings"] : []),
  ];
  const currentWorkspace = data?.workspace ?? workspaces.find((item) => item.id === workspaceId);
  const currentWorkspaceLogo = workspaceAvatar(currentWorkspace);
  const pageHeading = workspaceId === 0
    ? (tab === "Overview" ? "Agency Overview" : `Agency ${tab}`)
    : `${currentWorkspace?.name ?? "MoonRift Media"}${tab === "Overview" ? " Overview" : ` ${tab}`}`;

  return (
    <div className="app-shell">
      <aside className={`sidebar${sidebarOpen ? " open" : ""}`}>
        <div className="brand">
          <span className="brand-mark"><Image src="/moonrift-logo.png" alt="" width={28} height={28} priority /></span>
          <span>MoonRift Media</span>
        </div>
        <div className="workspace-label">CLIENT SUBACCOUNT</div>
        <div className="workspace-current">
          {currentWorkspaceLogo === SELLER_SYNDICATE_LOGO ? (
            <Image
              src={SELLER_SYNDICATE_LOGO}
              alt="Seller Syndicate"
              width={38}
              height={38}
            />
          ) : (
            <span style={{ background: currentWorkspace?.color || "#7646ff" }}>
              {workspaceId === 0 ? "MR" : initials(currentWorkspace?.name || "Client")}
            </span>
          )}
          <div>
            <b>{currentWorkspace?.name || "Agency overview"}</b>
            <small>{currentWorkspace?.industry || "All client offers"}</small>
          </div>
        </div>
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
              <span>{item === "Overview" ? "⌂" : item === "Media" ? "▥" : item === "Sales CRM" ? "◇" : item === "Team" ? "♙" : item === "Payouts" ? "$" : "⚙"}</span>
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
      {sidebarOpen && <button className="scrim" onClick={() => setSidebarOpen(false)} aria-label="Close menu" />}

      <main className="content">
        <header className="topbar">
          <button className="menu-btn" onClick={() => setSidebarOpen(true)} aria-label="Open menu">☰</button>
          <div><b>MoonRift Media Client Portal</b></div>
          <span className="live-badge"><i /> Live database</span>
        </header>
        <div className="dashboard">
          <div className="page-title">
            <div>
              <h1>{pageHeading}</h1>
              <p>{workspaceId === 0 ? "Agency-wide performance across every client offer." : "Live sales, team performance, and payouts for this client offer."}</p>
            </div>
            {data?.permissions.canManage && (
              <div className="title-actions">
                <button onClick={() => void syncData()}>↻ <span>Sync data</span></button>
              </div>
            )}
          </div>

          <div className="filters">
            <div><label>Date range</label><select value={range} onChange={(event) => setRange(event.target.value)}><option>Today</option><option>Last 7 days</option><option>Last 30 days</option><option>This quarter</option><option>Year to date</option><option>All time</option><option>Custom</option></select></div>
            {range === "Custom" && <><div><label>Start date</label><input type="date" value={customStart} max={customEnd} onChange={(event) => setCustomStart(event.target.value)} /></div><div><label>End date</label><input type="date" value={customEnd} min={customStart} onChange={(event) => setCustomEnd(event.target.value)} /></div></>}
          </div>
          {loading && <div className="state-card" role="status">Loading live portal data…</div>}
          {error && <div className="state-card error-state"><b>Dashboard unavailable</b><p>{error}</p><button onClick={() => void loadDashboard()}>Try again</button></div>}
          {!loading && !error && !workspaces.length && currentUser.role !== "admin" && <div className="state-card"><b>No subaccount access</b><p>A MoonRift Media administrator must assign this account to a client subaccount.</p></div>}

          {!loading && !error && data && tab === "Overview" && (
            <>
              <section className="kpi-grid">
                <article className="kpi"><span>Cash collected</span><strong>{money(period.cash)}</strong></article>
                <article className="kpi"><span>Revenue contracted</span><strong>{money(period.revenue)}</strong></article>
                <article className="kpi"><span>Applicants</span><strong>{period.applicants}</strong></article>
                <article className="kpi"><span>Closed deals</span><strong>{period.crmCloses}</strong></article>
                <article className="kpi"><span>Meetings taken</span><strong>{period.taken}</strong></article>
                <article className="kpi"><span>Show rate</span><strong>{period.meetings.length ? Math.round((period.taken / period.meetings.length) * 100) : 0}%</strong></article>
                <article className="kpi"><span>Close rate</span><strong>{period.taken ? Math.round((period.crmCloses / period.taken) * 100) : 0}%</strong></article>
                <article className="kpi"><span>Cash to revenue</span><strong>{period.revenue ? Math.round((period.cash / period.revenue) * 100) : 0}%</strong></article>
              </section>
              <section className="media-kpis" aria-label="Media KPIs">
                <div className="section-head"><div><h2>Media KPIs</h2><p>Applications from the Applications tab; meetings and closes from Sales CRM.</p></div></div>
                <div>
                  <article><span>Applications</span><strong>{period.applicants}</strong></article>
                  <article><span>Meetings</span><strong>{period.meetings.length}</strong></article>
                  <article><span>Closes</span><strong>{period.crmCloses}</strong></article>
                </div>
              </section>
              <div className="charts">
                <Chart data={period.cashSeries} labels={period.labels} title="Cash collected" color="#8b6cff" fill="rgba(139,108,255,.36)" />
                <Chart data={period.revenueSeries} labels={period.labels} title="Revenue" color="#ffac00" fill="rgba(255,172,0,.28)" />
              </div>
              {workspaceId === 0 && (
                <AgencyWorkspacePerformance rows={period.workspacePerformance} />
              )}
              <div className="performance-layout">
                <ConversionFunnel applicants={period.applicants} booked={period.meetings.length} taken={period.taken} closed={period.crmCloses} />
                {data.permissions.canViewTeam && <div className="leaderboard-stack"><RankedPerformanceTable title="Top closers" people={period.closers} /><RankedPerformanceTable title="Top setters" people={period.setters} /></div>}
              </div>
              <AttributionSection sources={period.sourceAttribution} youtube={period.youtube} totalDeals={period.deals.length} />
            </>
          )}

          {!loading && !error && data && tab === "Sales CRM" && (
            <SalesCrm meetings={period.meetings} outcome={outcomeFilter} onOutcomeChange={setOutcomeFilter} />
          )}

          {!loading && !error && data && tab === "Media" && (
            <MetaAdsDashboard
              meta={period.meta}
              spendSeries={period.metaSpendSeries}
              labels={period.labels}
              connections={data.metaConnections}
              workspaces={workspaces}
              isAgency={workspaceId === 0}
              canManage={currentUser.role === "admin"}
              onOpenSettings={() => setTab("Settings")}
            />
          )}

          {!loading && !error && data && tab === "Team" && <div className="leaderboard-stack team-leaderboards"><RankedPerformanceTable title="Top closers" people={period.closers} /><RankedPerformanceTable title="Top setters" people={period.setters} /></div>}

          {!loading && !error && data && tab === "Payouts" && (
            <><div className="payout-head"><div><h2>Team payouts</h2><p>Persistent payout history with administrator attribution.</p></div>{data.permissions.canManage && <button onClick={() => setModal("payout")}>＋ Add payout</button>}</div><article className="table-card"><div className="table-wrap"><table><thead><tr><th>Payee</th><th>Date</th><th>Method</th><th>Amount</th></tr></thead><tbody>{period.payouts.map((payout) => <tr key={payout.id}><td><b>{payout.member}</b></td><td>{payout.date}</td><td>{payout.method}</td><td>{money(payout.amount)}</td></tr>)}{!period.payouts.length && <tr><td colSpan={4}>No payouts in this date range.</td></tr>}</tbody></table></div></article></>
          )}

          {!loading && !error && tab === "Users" && (
            <><div className="payout-head"><div><h2>Portal users</h2><p>Manage roles, status, and client subaccount access.</p></div><button onClick={() => { setSelectedUser(null); setModal("account"); }}>＋ Create account</button></div>{usersLoading ? <div className="state-card">Loading accounts…</div> : <article className="table-card"><div className="table-wrap"><table><thead><tr><th>User</th><th>Role</th><th>Subaccounts</th><th>Status</th><th></th></tr></thead><tbody>{users.map((user) => <tr key={user.id}><td><div><b>{user.name}</b><small>{user.email}</small></div></td><td>{user.role.replace("_", " ")}</td><td>{user.role === "admin" ? "All" : user.workspaceIds.length}</td><td><span className={`status ${user.status}`}>{user.status}</span></td><td><div className="row-actions"><button onClick={() => { setSelectedUser(user); setModal("edit-account"); }}>Edit</button><button className="delete-payout" onClick={() => void toggleUser(user)}>{user.status === "active" ? "Disable" : "Enable"}</button></div></td></tr>)}{!users.length && <tr><td colSpan={5}>No portal accounts yet.</td></tr>}</tbody></table></div></article>}</>
          )}

          {!loading && !error && data && tab === "Settings" && (
            workspaceId === 0 ? <div className="state-card"><b>Select a client subaccount</b><p>Settings and deletion apply to one client subaccount at a time.</p></div> :
            <section className="settings-page">
              <MetaIntegrationSettings
                key={workspaceId}
                integration={metaIntegration}
                loading={metaLoading}
                workspaceId={workspaceId}
                onSelect={(accountId) => void saveMetaAccount(accountId).catch((submitError) => notify(submitError instanceof Error ? submitError.message : "Meta account could not be saved"))}
                onSync={() => void syncMetaData().catch((submitError) => notify(submitError instanceof Error ? submitError.message : "Meta sync failed"))}
                onDisconnect={() => void disconnectMeta().catch((submitError) => notify(submitError instanceof Error ? submitError.message : "Meta could not be disconnected"))}
              />
              <form className="settings-card" onSubmit={(event) => { event.preventDefault(); void updateWorkspace(new FormData(event.currentTarget)).catch((submitError) => notify(submitError instanceof Error ? submitError.message : "Settings could not be saved")); }}>
                <div><h2>Data source settings</h2><p>Choose the Google Sheet this subaccount imports from.</p></div>
                <label>Client or offer name</label><input name="name" defaultValue={data.workspace.name} required />
                <label>Industry / offer type</label><input name="industry" defaultValue={data.workspace.industry} required />
                <label>Profile image URL</label><input name="avatar" type="url" defaultValue={data.workspace.avatar} />
                <label>Google Sheets URL</label><input name="sheetUrl" type="url" defaultValue={data.workspace.sheetUrl} placeholder="https://docs.google.com/spreadsheets/d/…" required />
                <button type="submit">Save settings</button>
              </form>
              <form className="settings-card danger-zone" onSubmit={(event) => { event.preventDefault(); void deleteWorkspace(new FormData(event.currentTarget)).catch((submitError) => notify(submitError instanceof Error ? submitError.message : "Subaccount could not be deleted")); }}>
                <div><h2>Delete this client view</h2><p>This permanently deletes the subaccount and its database records. The Google Sheet itself is not deleted.</p></div>
                <label>Type <b>{data.workspace.name}</b></label><input name="confirmationOne" autoComplete="off" required />
                <label>Type the name again</label><input name="confirmationTwo" autoComplete="off" required />
                <button type="submit">Permanently delete {data.workspace.name}</button>
              </form>
            </section>
          )}
        </div>
      </main>

      {modal && <Modal title={modal === "workspace" ? "Create client subaccount" : modal === "payout" ? "Record payout" : modal === "edit-account" ? "Edit portal account" : "Create portal account"} onClose={() => { setModal(null); setSelectedUser(null); }} onSubmit={async (formData) => { try { if (modal === "workspace") await createWorkspace(formData); if (modal === "payout") await addPayout(formData); if (modal === "account") await createAccount(formData); if (modal === "edit-account") await updateAccount(formData); } catch (submitError) { notify(submitError instanceof Error ? submitError.message : "Request failed"); } }}>
        {modal === "workspace" && <><label>Client or offer name</label><input name="name" required minLength={2} /><label>Industry / offer type</label><input name="industry" defaultValue="Client offer" required /></>}
        {modal === "payout" && <><label>Payee</label><select name="member" required>{data?.performance.map((person) => <option key={person.id} value={`${person.role}:${person.name}`}>{person.name} — {person.role}</option>)}</select><label>Date</label><input name="date" type="date" defaultValue={new Date().toISOString().slice(0, 10)} required /><label>Method</label><select name="method"><option>ACH</option><option>Wire</option><option>Zelle</option><option>PayPal</option><option>Venmo</option><option>Other</option></select><label>Amount</label><input name="amount" type="number" min="0.01" step="0.01" required /></>}
        {modal === "account" && <><label>Full name</label><input name="name" required minLength={2} /><label>Email</label><input name="email" type="email" required /><label>Temporary password</label><input name="password" type="password" minLength={12} autoComplete="new-password" required /><small className="field-help">Use 12+ characters and share it through a secure channel. The password is hashed by Neon Auth and is never stored in portal tables.</small><label>Role</label><select name="role"><option value="team_member">Team member</option><option value="student">Client</option><option value="admin">Agency admin</option></select><fieldset><legend>Client subaccount access</legend>{workspaces.map((workspace) => <label className="check-row" key={workspace.id}><input type="checkbox" name="workspaceIds" value={workspace.id} /> {workspace.name}</label>)}</fieldset></>}
        {modal === "edit-account" && selectedUser && <><div className="access-note"><b>{selectedUser.name}</b><br />{selectedUser.email}</div><label>Role</label><select name="role" defaultValue={selectedUser.role}><option value="team_member">Team member</option><option value="student">Client</option><option value="admin">Agency admin</option></select><label>Status</label><select name="status" defaultValue={selectedUser.status}><option value="active">Active</option><option value="disabled">Disabled</option></select><label>New password (optional)</label><input name="newPassword" type="password" minLength={12} autoComplete="new-password" /><small className="field-help">Leave blank to keep the current password. Passwords are hashed by Neon Auth and never stored in portal records.</small><fieldset><legend>Client subaccount access</legend>{workspaces.map((workspace) => <label className="check-row" key={workspace.id}><input type="checkbox" name="workspaceIds" value={workspace.id} defaultChecked={selectedUser.workspaceIds.includes(workspace.id)} /> {workspace.name}</label>)}</fieldset></>}
      </Modal>}
      {toast && <div className="toast" role="status">✓ {toast}</div>}
    </div>
  );
}

function MetaIntegrationSettings({
  integration,
  loading,
  workspaceId,
  onSelect,
  onSync,
  onDisconnect,
}: {
  integration: MetaIntegration | null;
  loading: boolean;
  workspaceId: number;
  onSelect: (accountId: string) => void;
  onSync: () => void;
  onDisconnect: () => void;
}) {
  const [selectedAccount, setSelectedAccount] = useState("");
  const effectiveAccount = selectedAccount || integration?.connection?.adAccountId || "";

  return (
    <article className="settings-card integration-card">
      <div className="integration-heading">
        <span className="meta-mark">f</span>
        <div>
          <h2>Meta Ads</h2>
          <p>Connect this client&apos;s Facebook ad account and sync campaign performance automatically.</p>
        </div>
        <span className={`integration-status ${integration?.connected ? "connected" : ""}`}>
          {integration?.connected ? "Connected" : "Not connected"}
        </span>
      </div>
      {loading && !integration && <p>Loading Meta connection…</p>}
      {integration && !integration.configured && (
        <div className="integration-notice">
          <b>Meta app configuration required</b>
          <p>Add the Meta App ID, App Secret, token-encryption key, and production application URL in Vercel before connecting clients.</p>
        </div>
      )}
      {integration?.configured && !integration.connected && (
        <div className="integration-actions">
          <a className="meta-connect" href={`/api/integrations/meta/connect?workspaceId=${workspaceId}`}>
            Connect Meta
          </a>
          <small>The client signs into Facebook and grants read-only advertising access.</small>
        </div>
      )}
      {integration?.connected && (
        <>
          <div className="connection-summary">
            <div><span>Connected as</span><b>{integration.connection?.metaUserName || "Meta user"}</b></div>
            <div><span>Last synced</span><b>{integration.connection?.lastSyncedAt ? new Date(integration.connection.lastSyncedAt).toLocaleString() : "Waiting for first sync"}</b></div>
          </div>
          <label>Facebook ad account</label>
          <select
            value={effectiveAccount}
            onChange={(event) => setSelectedAccount(event.target.value)}
            disabled={loading}
          >
            <option value="">Select an ad account</option>
            {integration.accounts.map((account) => (
              <option key={account.id} value={account.id} disabled={account.status !== undefined && account.status !== 1}>
                {account.name} · {account.id}{account.businessName ? ` · ${account.businessName}` : ""}
              </option>
            ))}
          </select>
          {integration.connection?.lastError && <p className="integration-error">{integration.connection.lastError}</p>}
          <div className="integration-buttons">
            <button type="button" disabled={loading || !effectiveAccount} onClick={() => onSelect(effectiveAccount)}>
              {loading ? "Working…" : "Save account & sync"}
            </button>
            <button type="button" disabled={loading || !integration.connection?.adAccountId} onClick={onSync}>Sync now</button>
            <button type="button" className="disconnect-button" disabled={loading} onClick={onDisconnect}>Disconnect</button>
          </div>
          <small className="field-help">Tokens are encrypted server-side. Portal users and client browsers never receive Meta credentials.</small>
        </>
      )}
    </article>
  );
}

function MetaAdsDashboard({
  meta,
  spendSeries,
  labels,
  connections,
  workspaces,
  isAgency,
  canManage,
  onOpenSettings,
}: {
  meta: {
    campaigns: Array<{
      workspaceId: number;
      campaignId: string;
      campaignName: string;
      impressions: number;
      reach: number;
      clicks: number;
      spend: number;
      leads: number;
      purchases: number;
      purchaseValue: number;
    }>;
    spend: number;
    impressions: number;
    reach: number;
    clicks: number;
    leads: number;
    purchases: number;
    purchaseValue: number;
  };
  spendSeries: number[];
  labels: string[];
  connections: MetaConnectionSummary[];
  workspaces: Workspace[];
  isAgency: boolean;
  canManage: boolean;
  onOpenSettings: () => void;
}) {
  const number = (value: number) => new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(value || 0);
  const workspaceName = (id: number) => workspaces.find((workspace) => workspace.id === id)?.name || `Workspace ${id}`;
  const ctr = meta.impressions ? (meta.clicks / meta.impressions) * 100 : 0;
  const cpc = meta.clicks ? meta.spend / meta.clicks : 0;
  const cpl = meta.leads ? meta.spend / meta.leads : 0;
  const roas = meta.spend ? meta.purchaseValue / meta.spend : 0;
  const activeConnections = connections.filter((connection) => connection.status === "active").length;

  return (
    <section className="meta-dashboard">
      <div className="meta-dashboard-head">
        <div><span>META ADS</span><h2>{isAgency ? "Agency paid media performance" : "Facebook advertising performance"}</h2><p>Read-only campaign insights synced from Meta&apos;s Marketing API.</p></div>
        <div className="meta-connection-count"><i /> {activeConnections} connected {activeConnections === 1 ? "account" : "accounts"}</div>
      </div>
      {!connections.length && !meta.campaigns.length ? (
        <div className="state-card">
          <b>No Meta ad account connected</b>
          <p>{isAgency ? "Connect Meta inside each client workspace to build the agency-wide view." : "Connect a Facebook ad account to begin importing spend and campaign results."}</p>
          {canManage && !isAgency && <button onClick={onOpenSettings}>Open integration settings</button>}
        </div>
      ) : (
        <>
          <div className="meta-kpis">
            <article><span>Ad spend</span><strong>{money(meta.spend)}</strong></article>
            <article><span>Impressions</span><strong>{number(meta.impressions)}</strong></article>
            <article><span>Reach</span><strong>{number(meta.reach)}</strong></article>
            <article><span>Clicks</span><strong>{number(meta.clicks)}</strong></article>
            <article><span>CTR</span><strong>{ctr.toFixed(2)}%</strong></article>
            <article><span>CPC</span><strong>{money(cpc)}</strong></article>
            <article><span>Meta leads</span><strong>{number(meta.leads)}</strong></article>
            <article><span>Cost per lead</span><strong>{money(cpl)}</strong></article>
            <article><span>Purchases</span><strong>{number(meta.purchases)}</strong></article>
            <article><span>Meta ROAS</span><strong>{roas.toFixed(2)}×</strong></article>
          </div>
          <div className="meta-chart"><Chart data={spendSeries} labels={labels} title="Meta ad spend" color="#3b82f6" fill="rgba(59,130,246,.3)" /></div>
          <article className="table-card meta-campaigns">
            <div className="section-head"><div><h2>Campaign performance</h2><p>Meta-reported results for the selected portal date range</p></div></div>
            <div className="table-wrap"><table><thead><tr>{isAgency && <th>Workspace</th>}<th>Campaign</th><th>Spend</th><th>Impressions</th><th>Clicks</th><th>CTR</th><th>Leads</th><th>CPL</th><th>Purchases</th><th>ROAS</th></tr></thead><tbody>
              {meta.campaigns.map((campaign) => {
                const campaignCtr = campaign.impressions ? (campaign.clicks / campaign.impressions) * 100 : 0;
                const campaignCpl = campaign.leads ? campaign.spend / campaign.leads : 0;
                const campaignRoas = campaign.spend ? campaign.purchaseValue / campaign.spend : 0;
                return <tr key={`${campaign.workspaceId}:${campaign.campaignId}`}>{isAgency && <td>{workspaceName(campaign.workspaceId)}</td>}<td><b>{campaign.campaignName}</b></td><td>{money(campaign.spend)}</td><td>{number(campaign.impressions)}</td><td>{number(campaign.clicks)}</td><td>{campaignCtr.toFixed(2)}%</td><td>{number(campaign.leads)}</td><td>{money(campaignCpl)}</td><td>{number(campaign.purchases)}</td><td>{campaignRoas.toFixed(2)}×</td></tr>;
              })}
              {!meta.campaigns.length && <tr><td colSpan={isAgency ? 10 : 9}>No Meta campaign activity in this date range.</td></tr>}
            </tbody></table></div>
          </article>
          <p className="meta-attribution-note">Leads, purchases, purchase value, and ROAS are Meta-attributed results. Your Sales CRM remains the source of truth for booked calls, closes, cash collected, and contracted revenue.</p>
        </>
      )}
    </section>
  );
}

function AgencyWorkspacePerformance({ rows }: {
  rows: Array<Workspace & {
    applications: number;
    meetings: number;
    taken: number;
    closes: number;
    cash: number;
    revenue: number;
    showRate: number;
    closeRate: number;
    cashToRevenue: number;
  }>;
}) {
  return (
    <section className="agency-workspaces" aria-label="Offer performance by workspace">
      <div className="section-head">
        <div>
          <h2>Offer performance</h2>
          <p>Every client workspace compared across the selected date range.</p>
        </div>
      </div>
      <article className="table-card">
        <div className="table-wrap">
          <table>
            <thead><tr><th>Offer</th><th>Cash</th><th>Revenue</th><th>Applications</th><th>Meetings</th><th>Taken</th><th>Closes</th><th>Show rate</th><th>Close rate</th><th>Cash / revenue</th></tr></thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td><div className="workspace-table-name">{workspaceAvatar(row) === SELLER_SYNDICATE_LOGO ? <Image src={SELLER_SYNDICATE_LOGO} alt="" width={34} height={34} /> : <span style={{ background: row.color }}>{row.initials || initials(row.name)}</span>}<div><b>{row.name}</b><small>{row.industry}</small></div></div></td>
                  <td><b>{money(row.cash)}</b></td><td>{money(row.revenue)}</td><td>{row.applications}</td><td>{row.meetings}</td><td>{row.taken}</td><td>{row.closes}</td><td>{row.showRate}%</td><td>{row.closeRate}%</td><td>{row.cashToRevenue}%</td>
                </tr>
              ))}
              {!rows.length && <tr><td colSpan={10}>No client workspaces are available yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </article>
    </section>
  );
}

function SalesCrm({ meetings, outcome, onOutcomeChange }: {
  meetings: Meeting[];
  outcome: string;
  onOutcomeChange: (value: string) => void;
}) {
  const outcomes = [...new Set(meetings.map((meeting) => meeting.status).filter(Boolean))].sort();
  const visible = outcome === "All outcomes"
    ? meetings
    : meetings.filter((meeting) => meeting.status === outcome);
  return <><div className="crm-head"><div><h2>Sales CRM</h2><p>All booked calls, outcomes, notes, and recordings from Google Sheets.</p></div><div><label>Outcome</label><select value={outcome} onChange={(event) => onOutcomeChange(event.target.value)}><option>All outcomes</option>{outcomes.map((item) => <option key={item}>{item}</option>)}</select></div></div><article className="table-card crm-card"><div className="section-head"><div><h2>Booked calls</h2><p>{visible.length} of {meetings.length} calls shown</p></div></div><div className="table-wrap"><table><thead><tr><th>Lead</th><th>Outcome</th><th>Meeting</th><th>Setter</th><th>Closer</th><th>Notes / feedback</th><th>Recording</th></tr></thead><tbody>{visible.map((meeting) => <tr key={meeting.id}><td><div><b>{meeting.lead || "Unnamed lead"}</b><small>{meeting.email || meeting.phone || "No contact details"}</small></div></td><td><span className={`crm-status ${meeting.status.toLowerCase().replace(/[^a-z]+/g, "-")}`}>{meeting.status}</span></td><td>{meeting.date}</td><td>{meeting.setter || "—"}</td><td>{meeting.closer || "—"}</td><td><div className="crm-notes">{meeting.notes || meeting.feedback || "—"}{meeting.notes && meeting.feedback && <small>{meeting.feedback}</small>}</div></td><td>{meeting.recording ? <a className="recording-link" href={meeting.recording} target="_blank" rel="noopener noreferrer">▶ Open call</a> : "—"}</td></tr>)}{!visible.length && <tr><td colSpan={7}>No calls match this outcome and date range.</td></tr>}</tbody></table></div></article></>;
}

function RankedPerformanceTable({ title, people }: { title: string; people: Person[] }) {
  return <article className="table-card ranking-card"><div className="section-head"><div><h2>{title}</h2><p>Ranked by cash collected for the selected date range</p></div></div><div className="table-wrap"><table><thead><tr><th>Rank</th><th>Team member</th><th>Closed</th><th>Cash collected</th><th>Revenue</th><th>Cash / close</th></tr></thead><tbody>{people.map((person, index) => <tr key={person.id}><td><span className={`rank-badge rank-${index + 1}`}>{index + 1}</span></td><td><span className={`person p${index % 4}`}>{initials(person.name)}</span><b>{person.name}</b></td><td>{person.closed}</td><td><b>{money(person.cash)}</b></td><td>{money(person.revenue)}</td><td>{money(person.closed ? person.cash / person.closed : 0)}</td></tr>)}{!people.length && <tr><td colSpan={6}>No {title.toLowerCase()} with closed deals in this date range.</td></tr>}</tbody></table></div></article>;
}

function ConversionFunnel({ applicants, booked, taken, closed }: { applicants: number; booked: number; taken: number; closed: number }) {
  const stages = [
    { label: "Applicants", value: applicants, width: "100%" },
    { label: "Booked calls", value: booked, width: "82%" },
    { label: "Meetings taken", value: taken, width: "64%" },
    { label: "Closed", value: closed, width: "46%" },
  ];
  return <article className="funnel-card" aria-label="Offer conversion funnel"><div className="section-head"><div><h2>Offer funnel</h2><p>Current applicants and selected-period conversions</p></div></div><div className="funnel-visual">{stages.map((stage, index) => { const next = stages[index + 1]; const advance = next && stage.value ? Math.round((next.value / stage.value) * 100) : 0; return <div className="funnel-step" key={stage.label}><div className={`funnel-stage stage-${index + 1}`} style={{ width: stage.width }}><span>{stage.label}</span><strong>{stage.value}</strong></div>{next && <div className="funnel-transition"><strong>{advance}% advance</strong><span>{100 - advance}% drop-off</span></div>}</div>; })}</div></article>;
}

function AttributionSection({ sources, youtube, totalDeals }: {
  sources: Array<{ source: string; deals: number; cash: number; revenue: number }>;
  youtube: Array<{ video: string; views: number; applicants: number; deals: number; cash: number }>;
  totalDeals: number;
}) {
  const bestVideo = [...youtube].sort((left, right) => {
    const leftRate = left.views ? left.applicants / left.views : 0;
    const rightRate = right.views ? right.applicants / right.views : 0;
    return rightRate - leftRate || right.cash - left.cash;
  })[0];
  return <section className="attribution-section" aria-label="Marketing attribution"><div className="attribution-heading"><div><span>ATTRIBUTION</span><h2>Where closed deals come from</h2><p>Closed-deal share and YouTube campaign performance for the selected date range.</p></div>{bestVideo && <div className="best-video"><span>Best YouTube conversion</span><strong>{bestVideo.video}</strong><small>{bestVideo.views ? Math.round((bestVideo.applicants / bestVideo.views) * 100) : 0}% visitor-to-applicant</small></div>}</div><div className="attribution-grid"><article className="attribution-card"><div className="section-head"><div><h2>Closed deals by source</h2><p>Percentage of selected-period deals</p></div></div><div className="source-list">{sources.map((source) => { const percentage = totalDeals ? Math.round((source.deals / totalDeals) * 100) : 0; return <div className="source-row" key={source.source}><div><b>{source.source}</b><span>{source.deals} deals · {money(source.cash)}</span></div><strong>{percentage}%</strong><i><span style={{ width: `${percentage}%` }} /></i></div>; })}{!sources.length && <p className="attribution-empty">No closed deals in this date range.</p>}</div></article><article className="attribution-card"><div className="section-head"><div><h2>YouTube landing-page performance</h2><p>UTM landing visits, applications, and attributed cash</p></div></div><div className="table-wrap"><table><thead><tr><th>Video / campaign</th><th>Landing visits</th><th>Applicants</th><th>Conversion</th><th>Deals</th><th>Cash made</th></tr></thead><tbody>{youtube.map((video) => <tr key={video.video}><td><b>{video.video}</b></td><td>{video.views}</td><td>{video.applicants}</td><td>{video.views ? Math.round((video.applicants / video.views) * 100) : 0}%</td><td>{video.deals}</td><td><b>{money(video.cash)}</b></td></tr>)}{!youtube.length && <tr><td colSpan={6}>No YouTube-attributed traffic in this date range.</td></tr>}</tbody></table></div></article></div><p className="attribution-note">Landing visits are website page-view events with YouTube UTMs, not YouTube video views. Closed-deal Source, Medium, Campaign, and Video fields connect revenue to each platform and video.</p></section>;
}

function Modal({ title, onClose, onSubmit, children }: { title: string; onClose: () => void; onSubmit: (formData: FormData) => Promise<void>; children: React.ReactNode }) {
  const [saving, setSaving] = useState(false);
  return <div className="modal-wrap" role="dialog" aria-modal="true" aria-label={title}><button className="modal-backdrop" onClick={onClose} aria-label="Close" /><form className="modal" onSubmit={(event) => { event.preventDefault(); setSaving(true); void onSubmit(new FormData(event.currentTarget)).finally(() => setSaving(false)); }}><button type="button" className="modal-close" onClick={onClose}>×</button><span className="modal-icon">◆</span><h2>{title}</h2>{children}<div className="modal-actions"><button type="button" onClick={onClose}>Cancel</button><button type="submit" disabled={saving}>{saving ? "Saving…" : "Save"}</button></div></form></div>;
}
