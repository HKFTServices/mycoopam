import { useAuth } from "@/contexts/AuthContext";
import { useTenant } from "@/contexts/TenantContext";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Navigate } from "react-router-dom";
import { Loader2 } from "lucide-react";

type AllowedRole = "super_admin" | "tenant_admin" | "manager" | "clerk" | "referrer" | "referral_house";

interface RoleProtectedRouteProps {
  children: React.ReactNode;
  /** Roles that are allowed to access this route. If empty, all authenticated users can access. */
  allowedRoles: AllowedRole[];
  /** Where to redirect unauthorized users. Defaults to /dashboard */
  redirectTo?: string;
}

/**
 * Route-level guard that checks user roles.
 * Must be used INSIDE ProtectedRoute (auth is already verified).
 */
const RoleProtectedRoute = ({
  children,
  allowedRoles,
  redirectTo = "/dashboard",
}: RoleProtectedRouteProps) => {
  const { user } = useAuth();
  const { currentTenant } = useTenant();

  const { data: userRoles, isLoading } = useQuery({
    queryKey: ["user_roles_route_guard", user?.id, currentTenant?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data } = await supabase
        .from("user_roles")
        .select("role, tenant_id")
        .eq("user_id", user.id);
      // Only include roles scoped to the current tenant or global (null tenant_id)
      return (data ?? [])
        .filter((r: any) =>
          r.role === "super_admin" || r.tenant_id === currentTenant?.id || r.tenant_id === null
        )
        .map((r: any) => r.role as string);
    },
    enabled: !!user,
    staleTime: 60_000,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const hasAccess = allowedRoles.some((role) => userRoles?.includes(role));

  if (!hasAccess) {
    return <Navigate to={redirectTo} replace />;
  }

  return <>{children}</>;
};

export default RoleProtectedRoute;
