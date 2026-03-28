import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/contexts/TenantContext";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Building2 } from "lucide-react";
import AdminDashboardSkeleton from "@/components/dashboard/AdminDashboardSkeleton";
import UserDashboardSkeleton from "@/components/dashboard/UserDashboardSkeleton";
import AdminDashboard from "@/components/dashboard/AdminDashboard";
import MemberDashboard from "@/components/dashboard/MemberDashboard";

const Dashboard = () => {
  const { currentTenant, tenants, loading: tenantLoading } = useTenant();
  const { user, loading: authLoading } = useAuth();
  const tenantId = currentTenant?.id;

  // User roles
  const { data: userRoles = [], isLoading: rolesLoading } = useQuery({
    queryKey: ["user_roles", user?.id, tenantId],
    queryFn: async () => {
      if (!user) return [];
      const { data } = await (supabase as any)
        .from("user_roles")
        .select("role, tenant_id")
        .eq("user_id", user.id);
      return data ?? [];
    },
    enabled: !!user,
  });

  const isSuperAdmin = userRoles.some((r: any) => r.role === "super_admin");
  const isTenantAdmin = userRoles.some((r: any) => {
    if (r.role !== "tenant_admin") return false;
    return !r.tenant_id || r.tenant_id === tenantId;
  });
  const isAdmin = isSuperAdmin || isTenantAdmin;

  // Show loading while resolving auth/tenant/roles
  if (authLoading || tenantLoading || (!!currentTenant && rolesLoading)) {
    return isAdmin ? <AdminDashboardSkeleton /> : <UserDashboardSkeleton />;
  }

  // No tenant assigned
  if (tenants.length === 0) {
    return (
      <div className="space-y-6 animate-fade-in">
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <div className="h-14 w-14 rounded-2xl bg-accent flex items-center justify-center mb-4">
              <Building2 className="h-7 w-7 text-accent-foreground" />
            </div>
            <h3 className="text-lg font-semibold mb-2">No cooperative assigned</h3>
            <p className="text-muted-foreground max-w-sm">
              Contact your administrator to be added, or wait for an invitation.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!tenantId) return null;

  // Route to the correct dashboard
  if (isAdmin) {
    return <AdminDashboard tenantId={tenantId} isSuperAdmin={isSuperAdmin} isTenantAdmin={isTenantAdmin} />;
  }

  return <MemberDashboard tenantId={tenantId} />;
};

export default Dashboard;
