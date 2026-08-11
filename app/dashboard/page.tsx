import { Dashboard } from "@/app/dashboard";
import { accessibleWorkspaces, requirePortalPage } from "@/lib/auth/authorization";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const context = await requirePortalPage();
  const workspaces = await accessibleWorkspaces(context);

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
    />
  );
}
