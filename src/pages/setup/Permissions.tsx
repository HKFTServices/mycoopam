import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/contexts/TenantContext";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Loader2, ShieldCheck, Info } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

// Role hierarchy for cascade display
const ROLE_HIERARCHY: Record<string, number> = {
  super_admin: 6,
  tenant_admin: 5,
  manager: 4,
  clerk: 3,
  full_member: 2,
  associated_member: 1,
  referrer: 1,
  referral_house: 1,
  member: 0,
};

const PERMISSION_RESOURCES = [
  { category: "Dashboard & Portfolio", items: [
    { resource: "dashboard", action: "view", label: "View Dashboard" },
    { resource: "portfolio", action: "view", label: "View Portfolio" },
    { resource: "statements", action: "view", label: "View Statements" },
    { resource: "statements", action: "download", label: "Download Statements" },
  ]},
  { category: "Transactions", items: [
    { resource: "transactions", action: "view", label: "View Transactions" },
    { resource: "transactions", action: "create", label: "Create Transactions" },
    { resource: "transactions", action: "approve", label: "Approve Transactions" },
    { resource: "transactions", action: "manage", label: "Manage All Transactions" },
  ]},
  { category: "Debit Orders", items: [
    { resource: "debit_orders", action: "view", label: "View Debit Orders" },
    { resource: "debit_orders", action: "create", label: "Create Debit Orders" },
    { resource: "debit_orders", action: "approve", label: "Approve Debit Orders" },
  ]},
  { category: "Entities & Accounts", items: [
    { resource: "entities", action: "view", label: "View Entities" },
    { resource: "entities", action: "edit", label: "Edit Entities" },
    { resource: "entities", action: "manage", label: "Manage All Entities" },
    { resource: "entity_accounts", action: "view", label: "View Entity Accounts" },
    { resource: "entity_accounts", action: "edit", label: "Edit Entity Accounts" },
    { resource: "entity_accounts", action: "approve", label: "Approve Entity Accounts" },
    { resource: "entity_accounts", action: "manage", label: "Manage Entity Accounts" },
  ]},
  { category: "Approvals", items: [
    { resource: "approvals", action: "view", label: "View Approvals Queue" },
    { resource: "approvals", action: "approve", label: "Process Approvals" },
  ]},
  { category: "Loans", items: [
    { resource: "loans", action: "view", label: "View Loans" },
    { resource: "loans", action: "apply", label: "Apply for Loans" },
    { resource: "loans", action: "approve", label: "Approve Loans" },
    { resource: "loans", action: "disburse", label: "Disburse Loans" },
  ]},
  { category: "Daily Prices", items: [
    { resource: "daily_prices", action: "view", label: "View Daily Prices" },
    { resource: "daily_prices", action: "manage", label: "Manage Daily Prices" },
  ]},
  { category: "Campaigns & Messages", items: [
    { resource: "campaigns", action: "view", label: "View Campaigns" },
    { resource: "campaigns", action: "send", label: "Send Campaigns" },
    { resource: "campaigns", action: "manage", label: "Manage Campaign Templates" },
  ]},
  { category: "Reports & Commissions", items: [
    { resource: "reports", action: "view", label: "View Reports" },
    { resource: "reports", action: "export", label: "Export Reports" },
    { resource: "commissions", action: "view", label: "View Own Commissions" },
    { resource: "commissions", action: "pay", label: "Process Commission Payments" },
  ]},
  { category: "Users & Memberships", items: [
    { resource: "users", action: "view", label: "View Users" },
    { resource: "users", action: "manage", label: "Manage Users" },
    { resource: "users", action: "assign_roles", label: "Assign User Roles" },
    { resource: "memberships", action: "manage", label: "Manage Memberships" },
  ]},
  { category: "Pools & Items", items: [
    { resource: "pools", action: "view", label: "View Pools" },
    { resource: "pools", action: "manage", label: "Manage Pools" },
    { resource: "items", action: "view", label: "View Items" },
    { resource: "items", action: "manage", label: "Manage Items" },
  ]},
  { category: "Fees & GL", items: [
    { resource: "fees", action: "view", label: "View Fees" },
    { resource: "fees", action: "manage", label: "Manage Fees" },
    { resource: "fees.admin_share", action: "edit", label: "Edit Administrator Share %" },
    { resource: "gl_accounts", action: "view", label: "View GL Accounts" },
    { resource: "gl_accounts", action: "manage", label: "Manage GL Accounts" },
    { resource: "ledger", action: "view", label: "View Ledger Entries" },
    { resource: "ledger", action: "post", label: "Post Ledger Entries" },
    { resource: "operating_journals", action: "manage", label: "Manage Operating Journals" },
  ]},
  { category: "Tenant Setup", items: [
    { resource: "tenant_setup", action: "view", label: "View Tenant Setup" },
    { resource: "tenant_setup", action: "manage", label: "Manage Tenant Setup" },
    { resource: "tenant_config", action: "manage", label: "Manage Tenant Configuration" },
    { resource: "communications", action: "manage", label: "Manage Communications" },
  ]},
];

const CONFIGURABLE_ROLES = [
  { value: "tenant_admin", label: "Tenant Admin" },
  { value: "manager", label: "Manager" },
  { value: "clerk", label: "Clerk" },
  { value: "full_member", label: "Full Member" },
  { value: "associated_member", label: "Associated Member" },
  { value: "referrer", label: "Referrer" },
  { value: "referral_house", label: "Referral House" },
];

type PermissionRow = {
  id: string;
  tenant_id: string;
  role: string;
  resource: string;
  action: string;
  is_allowed: boolean;
};

const Permissions = () => {
  const { currentTenant } = useTenant();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedRole, setSelectedRole] = useState("manager");

  const { data: userRole = "member" } = useQuery({
    queryKey: ["user_role_permissions", user?.id, currentTenant?.id],
    queryFn: async () => {
      if (!user) return "member";
      const { data: roles } = await supabase
        .from("user_roles")
        .select("role, tenant_id")
        .eq("user_id", user.id);
      if ((roles ?? []).some((r: any) => r.role === "super_admin")) return "super_admin";
      if ((roles ?? []).some((r: any) => r.role === "tenant_admin" && r.tenant_id === currentTenant?.id)) return "tenant_admin";
      return "member";
    },
    enabled: !!user,
  });

  const canManage = userRole === "super_admin" || userRole === "tenant_admin";

  // Fetch ALL permissions for current tenant (all roles) for cascade display
  const { data: allPermissions = [], isLoading } = useQuery({
    queryKey: ["permissions_all", currentTenant?.id],
    queryFn: async () => {
      if (!currentTenant) return [];
      const { data, error } = await (supabase as any)
        .from("permissions")
        .select("*")
        .eq("tenant_id", currentTenant.id);
      if (error) throw error;
      return (data ?? []) as PermissionRow[];
    },
    enabled: !!currentTenant,
  });

  const permissions = allPermissions.filter(p => p.role === selectedRole);

  const toggleMutation = useMutation({
    mutationFn: async ({ resource, action, is_allowed }: { resource: string; action: string; is_allowed: boolean }) => {
      if (!currentTenant) throw new Error("No tenant");
      const existing = permissions.find(p => p.resource === resource && p.action === action);
      if (existing) {
        const { error } = await (supabase as any)
          .from("permissions")
          .update({ is_allowed })
          .eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await (supabase as any)
          .from("permissions")
          .insert({
            tenant_id: currentTenant.id,
            role: selectedRole,
            resource,
            action,
            is_allowed,
          });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["permissions_all", currentTenant?.id] });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const isAllowed = (resource: string, action: string) => {
    const perm = permissions.find(p => p.resource === resource && p.action === action);
    return perm?.is_allowed ?? false;
  };

  // Check if permission is inherited from a lower role
  const isInherited = (resource: string, action: string) => {
    const selectedLevel = ROLE_HIERARCHY[selectedRole] ?? 0;
    // Find if any role below this one has this permission
    return allPermissions.some(p =>
      p.resource === resource &&
      p.action === action &&
      p.is_allowed &&
      p.role !== selectedRole &&
      (ROLE_HIERARCHY[p.role] ?? 0) < selectedLevel
    );
  };

  if (!canManage) {
    return (
      <div className="space-y-6 animate-fade-in">
        <div>
          <h1 className="text-lg sm:text-2xl font-bold tracking-tight">Permissions</h1>
          <p className="text-muted-foreground text-xs sm:text-sm mt-1">You do not have access to manage permissions.</p>
        </div>
      </div>
    );
  }

  // tenant_admin can only configure roles below them
  const availableRoles = CONFIGURABLE_ROLES.filter(r => {
    if (userRole === "super_admin") return true;
    const userLevel = ROLE_HIERARCHY[userRole] ?? 0;
    const roleLevel = ROLE_HIERARCHY[r.value] ?? 0;
    return roleLevel < userLevel;
  });

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-lg sm:text-2xl font-bold tracking-tight flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 sm:h-6 sm:w-6" /> Permissions
        </h1>
        <p className="text-muted-foreground text-xs sm:text-sm mt-1">
          Configure what each role can do. Permissions cascade upward — higher roles inherit all lower-role permissions.
        </p>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="w-full sm:max-w-xs">
          <Select value={selectedRole} onValueChange={setSelectedRole}>
            <SelectTrigger>
              <SelectValue placeholder="Select role" />
            </SelectTrigger>
            <SelectContent>
              {availableRoles.map(r => (
                <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger>
              <Info className="h-4 w-4 text-muted-foreground" />
            </TooltipTrigger>
            <TooltipContent className="max-w-xs">
              <p className="text-xs">
                <strong>Cascade:</strong> Super Admin → Tenant Admin → Manager → Clerk → Member.
                Each role automatically inherits all permissions from roles below it.
              </p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="space-y-6">
          {PERMISSION_RESOURCES.map(group => (
            <Card key={group.category}>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">{group.category}</CardTitle>
                <CardDescription className="text-xs">
                  Permissions for {CONFIGURABLE_ROLES.find(r => r.value === selectedRole)?.label ?? selectedRole}
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <div className="w-full overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Permission</TableHead>
                        <TableHead className="w-24 text-center">Allowed</TableHead>
                        <TableHead className="w-24 text-center">Inherited</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {group.items.map(item => {
                        const inherited = isInherited(item.resource, item.action);
                        const directlyAllowed = isAllowed(item.resource, item.action);
                        return (
                          <TableRow key={`${item.resource}_${item.action}`}>
                            <TableCell>
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-sm">{item.label}</span>
                                <Badge variant="outline" className="text-[10px]">{item.action}</Badge>
                              </div>
                            </TableCell>
                            <TableCell className="text-center">
                              <Checkbox
                                checked={directlyAllowed}
                                onCheckedChange={(checked) => {
                                  toggleMutation.mutate({
                                    resource: item.resource,
                                    action: item.action,
                                    is_allowed: !!checked,
                                  });
                                }}
                              />
                            </TableCell>
                            <TableCell className="text-center">
                              {inherited && (
                                <Badge variant="secondary" className="text-[10px]">
                                  Inherited
                                </Badge>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

export default Permissions;
