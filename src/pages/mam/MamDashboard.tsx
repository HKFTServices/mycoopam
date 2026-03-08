import { useTenant } from "@/contexts/TenantContext";

const MamDashboard = () => {
  const { currentTenant } = useTenant();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Member Asset Manager</h1>
        <p className="text-muted-foreground">Overview of member assets, contributions and pool balances.</p>
      </div>
      <div className="rounded-lg border bg-card p-8 text-center text-muted-foreground">
        MAM Dashboard — coming soon
      </div>
    </div>
  );
};

export default MamDashboard;
