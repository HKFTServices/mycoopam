import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useTenant } from "@/contexts/TenantContext";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Info, XCircle, CheckCircle2, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useState, useMemo } from "react";

interface DashboardAlert {
  id: string;
  severity: "critical" | "warning" | "info" | "success";
  title: string;
  description: string;
  action?: { label: string; to: string };
}

const severityConfig = {
  critical: {
    icon: XCircle,
    className: "border-destructive/50 bg-destructive/10 text-destructive",
    iconClassName: "text-destructive",
  },
  warning: {
    icon: AlertTriangle,
    className: "border-[hsl(var(--warning))]/50 bg-[hsl(var(--warning))]/10 text-[hsl(var(--warning))]",
    iconClassName: "text-[hsl(var(--warning))]",
  },
  info: {
    icon: Info,
    className: "border-[hsl(var(--info))]/50 bg-[hsl(var(--info))]/10 text-[hsl(var(--info))]",
    iconClassName: "text-[hsl(var(--info))]",
  },
  success: {
    icon: CheckCircle2,
    className: "border-[hsl(var(--success))]/50 bg-[hsl(var(--success))]/10 text-[hsl(var(--success))]",
    iconClassName: "text-[hsl(var(--success))]",
  },
};

const DashboardAlerts = () => {
  const { user } = useAuth();
  const { currentTenant } = useTenant();
  const navigate = useNavigate();
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  const tenantId = currentTenant?.id;

  const { data: roles = [] } = useQuery({
    queryKey: ["dashboard_alert_roles", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id);
      return (data ?? []).map((r: any) => r.role as string);
    },
    enabled: !!user,
  });

  const isAdmin = roles.some((r) =>
    ["super_admin", "tenant_admin"].includes(r)
  );

  // Check pending approvals for admins
  const { data: pendingApprovals = 0 } = useQuery({
    queryKey: ["pending_approval_count", tenantId],
    queryFn: async () => {
      if (!tenantId) return 0;
      const { count, error } = await supabase
        .from("transactions")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
        .eq("status", "pending");
      if (error) return 0;
      return count ?? 0;
    },
    enabled: !!tenantId && isAdmin,
    refetchInterval: 60000,
  });

  // Check if entity profile is incomplete for members
  const { data: profileIncomplete = false } = useQuery({
    queryKey: ["profile_complete_check", tenantId, user?.id],
    queryFn: async () => {
      if (!tenantId || !user) return false;
      const { data } = await supabase
        .from("entities")
        .select("id, contact_number, email_address")
        .eq("tenant_id", tenantId)
        .eq("creator_user_id", user.id)
        .eq("is_deleted", false)
        .limit(1)
        .maybeSingle();
      if (!data) return true; // No entity at all
      return !data.contact_number || !data.email_address;
    },
    enabled: !!tenantId && !!user,
  });

  // Check SMTP config for tenant admins
  const { data: smtpMissing = false } = useQuery({
    queryKey: ["smtp_check", tenantId],
    queryFn: async () => {
      if (!tenantId) return false;
      const { data } = await (supabase as any)
        .from("tenant_settings")
        .select("setting_value")
        .eq("tenant_id", tenantId)
        .eq("setting_key", "use_global_email_settings")
        .maybeSingle();
      // If using global, no issue
      if (data?.setting_value === "true") return false;
      // Check if own SMTP is configured
      const { data: host } = await (supabase as any)
        .from("tenant_settings")
        .select("setting_value")
        .eq("tenant_id", tenantId)
        .eq("setting_key", "smtp_host")
        .maybeSingle();
      return !host?.setting_value;
    },
    enabled: !!tenantId && isAdmin,
  });

  const alerts = useMemo<DashboardAlert[]>(() => {
    const list: DashboardAlert[] = [];

    if (isAdmin && pendingApprovals > 0) {
      list.push({
        id: "pending-approvals",
        severity: "warning",
        title: `${pendingApprovals} pending approval${pendingApprovals > 1 ? "s" : ""}`,
        description: "There are transactions awaiting your review.",
        action: { label: "Review now", to: "/dashboard/account-approvals" },
      });
    }

    if (profileIncomplete) {
      list.push({
        id: "profile-incomplete",
        severity: "info",
        title: "Complete your profile",
        description:
          "Your entity profile is missing some details. Complete it to access all features.",
        action: { label: "Update profile", to: "/dashboard" },
      });
    }

    if (isAdmin && smtpMissing) {
      list.push({
        id: "smtp-missing",
        severity: "warning",
        title: "Email settings not configured",
        description:
          "Email notifications may not be sent. Configure your email settings or enable global email.",
        action: {
          label: "Configure",
          to: "/dashboard/setup/tenant-configuration",
        },
      });
    }

    return list.filter((a) => !dismissed.has(a.id));
  }, [isAdmin, pendingApprovals, profileIncomplete, smtpMissing, dismissed]);

  if (alerts.length === 0) return null;

  return (
    <div className="space-y-3 mb-4">
      {alerts.map((alert) => {
        const config = severityConfig[alert.severity];
        const Icon = config.icon;
        return (
          <Alert key={alert.id} className={config.className}>
            <Icon className={`h-4 w-4 ${config.iconClassName}`} />
            <div className="flex-1 ml-2">
              <AlertTitle className="text-sm font-semibold">
                {alert.title}
              </AlertTitle>
              <AlertDescription className="text-xs mt-1 opacity-90">
                {alert.description}
              </AlertDescription>
              {alert.action && (
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-2 h-7 text-xs"
                  onClick={() => navigate(alert.action!.to)}
                >
                  {alert.action.label}
                </Button>
              )}
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="absolute top-2 right-2 h-6 w-6 p-0 opacity-60 hover:opacity-100"
              onClick={() =>
                setDismissed((prev) => new Set([...prev, alert.id]))
              }
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </Alert>
        );
      })}
    </div>
  );
};

export default DashboardAlerts;
