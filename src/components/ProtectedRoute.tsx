import { useAuth } from "@/contexts/AuthContext";
import { useTenant } from "@/contexts/TenantContext";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Navigate, useLocation } from "react-router-dom";
import { Loader2 } from "lucide-react";

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { session, user, profile, loading } = useAuth();
  const { currentTenant, loading: tenantLoading } = useTenant();
  const location = useLocation();

  // Check user roles to skip per-tenant entity check for admins
  const { data: userRoles = [], isLoading: rolesLoading } = useQuery({
    queryKey: ["protected_route_roles", user?.id],
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
  const isTenantAdmin = userRoles.some((r: any) =>
    r.role === "tenant_admin" && (!r.tenant_id || r.tenant_id === currentTenant?.id)
  );
  const isAdmin = isSuperAdmin || isTenantAdmin;

  // Check if user has an entity relationship in the current tenant
  // Skip for admins — they manage tenants and may not have entities in every one
  const { data: hasEntityInTenant, isLoading: entityCheckLoading } = useQuery({
    queryKey: ["has_entity_in_tenant", user?.id, currentTenant?.id],
    queryFn: async () => {
      if (!user || !currentTenant) return null;
      const { data } = await (supabase as any)
        .from("user_entity_relationships")
        .select("entity_id")
        .eq("user_id", user.id)
        .eq("tenant_id", currentTenant.id)
        .eq("is_primary", true)
        .maybeSingle();
      return !!data?.entity_id;
    },
    enabled: !!user && !!currentTenant && !isAdmin,
  });

  if (loading || tenantLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/auth" replace />;
  }

  const isOnboardingRoute = location.pathname === "/onboarding" || location.pathname === "/membership-application";

  // Per-tenant onboarding check — only for non-admin regular users
  if (
    !isAdmin &&
    currentTenant &&
    !entityCheckLoading &&
    !rolesLoading &&
    hasEntityInTenant === false &&
    !isOnboardingRoute
  ) {
    return <Navigate to="/onboarding" replace />;
  }

  // Redirect incomplete profiles to onboarding (legacy check)
  const regStatus = (profile as any)?.registration_status;
  const needsOnboarding = (profile as any)?.needs_onboarding;

  if (
    profile &&
    !isAdmin &&
    regStatus === "incomplete" &&
    hasEntityInTenant !== true &&
    !isOnboardingRoute
  ) {
    return <Navigate to="/onboarding" replace />;
  }

  // Redirect registered legacy users who haven't completed onboarding
  if (
    profile &&
    !isAdmin &&
    regStatus === "registered" &&
    needsOnboarding === true &&
    hasEntityInTenant !== true &&
    !isOnboardingRoute
  ) {
    return <Navigate to="/onboarding" replace />;
  }

  // Show pending approval message for users awaiting document review
  if (
    profile &&
    !isAdmin &&
    regStatus === "pending_approval" &&
    !isOnboardingRoute
  ) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="max-w-md text-center space-y-4 p-8">
          <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
            <Loader2 className="h-8 w-8 text-primary animate-spin" />
          </div>
          <h2 className="text-xl font-semibold">Registration Under Review</h2>
          <p className="text-muted-foreground text-sm">
            Your registration documents are being reviewed. You'll receive an email once your account has been approved.
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};

export default ProtectedRoute;
