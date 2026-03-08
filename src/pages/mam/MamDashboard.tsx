import { useTenant } from "@/contexts/TenantContext";
import MamEntitySelector from "@/components/mam/MamEntitySelector";
import { useMamEntity } from "@/contexts/MamEntityContext";

const MamDashboard = () => {
  const { currentTenant } = useTenant();
  const { selectedEntity } = useMamEntity();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Member Asset Manager</h1>
        <p className="text-muted-foreground">Overview of member assets, contributions and pool balances.</p>
      </div>

      <MamEntitySelector />

      <div className="rounded-lg border bg-card p-8 text-center text-muted-foreground">
        {selectedEntity
          ? `MAM Dashboard for ${[selectedEntity.name, selectedEntity.last_name].filter(Boolean).join(" ")} — coming soon`
          : "Select an entity to view the dashboard"}
      </div>
    </div>
  );
};

export default MamDashboard;
