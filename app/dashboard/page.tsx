import { Dashboard } from "@/app/dashboard";
import { accessibleWorkspaces, requirePortalPage } from "@/lib/auth/authorization";

export const dynamic = "force-dynamic";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ workspaceId?: string; tab?: string; meta?: string }>;
}) {
  const context = await requirePortalPage();
  const workspaces = await accessibleWorkspaces(context);
  const query = await searchParams;
  const requestedWorkspaceId = Number(query.workspaceId);
  const initialWorkspaceId =
    context.portalUser.role === "admin" &&
    workspaces.some((workspace) => workspace.id === requestedWorkspaceId)
      ? requestedWorkspaceId
      : context.portalUser.role === "admin"
        ? 0
        : (workspaces[0]?.id ?? 0);
  const initialTab =
    context.portalUser.role === "admin" && query.tab === "Settings"
      ? "Settings"
      : "Overview";
  const initialNotice =
    query.meta === "connected"
      ? "Meta connected. Ad data will begin syncing."
      : query.meta === "select_account"
        ? "Meta connected. Select an ad account to finish setup."
        : query.meta === "cancelled"
          ? "Meta connection was cancelled."
          : query.meta === "failed" || query.meta === "invalid_state"
            ? "Meta connection could not be completed."
            : "";

  return (
    <Dashboard
      initialWorkspaces={workspaces.map((workspace) => ({
        ...workspace,
        updatedAt: workspace.updatedAt.toISOString(),
      }))}
      currentUser={{
        name: context.portalUser.name,
        email: context.portalUser.email,
        role: context.portalUser.role,
      }}
      initialWorkspaceId={initialWorkspaceId}
      initialTab={initialTab}
      initialNotice={initialNotice}
    />
  );
}
