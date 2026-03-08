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
import { Loader2, ShieldCheck } from "lucide-react";

// Define resources and their labels grouped by category
const PERMISSION_RESOURCES = [
  { category: "Fees", items: [
    { resource: "fees.admin_share", action: "edit", label: "Edit Administrator Share %" },
    { resource: "fees.fee_types", action: "manage", label: "Manage Fee Types" },
    { resource: "fees.fee_rules", action: "manage", label: "Manage Fee Rules" },
  ]},
  { category: "Pools", items: [
    { resource: "pools", action: "manage", label: "Manage Pools" },
  ]},
  { category: "Items", items: [
    { resource: "items", action: "manage", label: "Manage Items" },
  ]},
  { category: "Entities", items: [
    { resource: "entities", action: "manage", label: "Manage Entities" },
    { resource: "entity_accounts", action: "manage", label: "Manage Entity Accounts" },
    { resource: "entity_accounts", action: "approve", label: "Approve Entity Accounts" },
  ]},
  { category: "Transactions", items: [
    { resource: "transactions", action: "manage", label: "Manage Transactions" },
    { resource: "transactions", action: "approve", label: "Approve Transactions" },
    { resource: "operating_journals", action: "manage", label: "Manage Operating Journals" },
  ]},
  { category: "Users", items: [
    { resource: "users", action: "manage", label: "Manage Users" },
    { resource: "memberships", action: "manage", label: "Manage Memberships" },
  ]},
  { category: "Setup", items: [
    { resource: "gl_accounts", action: "manage", label: "Manage GL Accounts" },
    { resource: "communications", action: "manage", label: "Manage Communications" },
    { resource: "tenant_config", action: "manage", label: "Manage Tenant Configuration" },
  ]},
];

const CONFIGURABLE_ROLES = [
  { value: "super_admin", label: "Super Admin" },
  { value: "tenant_admin", label: "Tenant Admin" },
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
  const [selectedRole, setSelectedRole] = useState("tenant_admin");

  // Check if user is super_admin or tenant_admin
  const { data: userRole = "member" } = useQuery({
    queryKey: ["user_role_permissions", user?.id, currentTenant?.id],
    queryFn: async () => {
      if (!user) return "member";
      const { data: roles } = await supabase
        .from("user_roles")
        .select("role, tenant_id")
        .eq("user_id", user.id);
      if ((roles ?? []).some((r: any) => r.role === "super_admin")) return "super_admin";
      return "member";
    },
    enabled: !!user,
  });

  const canManage = userRole === "super_admin";

  // Fetch existing permissions for current tenant + selected role
  const { data: permissions = [], isLoading } = useQuery({
    queryKey: ["permissions", currentTenant?.id, selectedRole],
    queryFn: async () => {
      if (!currentTenant) return [];
      const { data, error } = await (supabase as any)
        .from("permissions")
        .select("*")
        .eq("tenant_id", currentTenant.id)
        .eq("role", selectedRole);
      if (error) throw error;
      return (data ?? []) as PermissionRow[];
    },
    enabled: !!currentTenant,
  });

  // Upsert a permission toggle
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
      queryClient.invalidateQueries({ queryKey: ["permissions", currentTenant?.id, selectedRole] });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const isAllowed = (resource: string, action: string) => {
    const perm = permissions.find(p => p.resource === resource && p.action === action);
    return perm?.is_allowed ?? false;
  };

  if (!canManage) {
    return (
      <div className="space-y-6 animate-fade-in">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Permissions</h1>
          <p className="text-muted-foreground text-sm mt-1">You do not have access to manage permissions.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <ShieldCheck className="h-6 w-6" /> Permissions
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Configure what each role can do within the current cooperative.
        </p>
      </div>

      <div className="max-w-xs">
        <Select value={selectedRole} onValueChange={setSelectedRole}>
          <SelectTrigger>
            <SelectValue placeholder="Select role" />
          </SelectTrigger>
          <SelectContent>
            {CONFIGURABLE_ROLES.map(r => (
              <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
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
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Permission</TableHead>
                      <TableHead className="w-24 text-center">Allowed</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {group.items.map(item => (
                      <TableRow key={`${item.resource}_${item.action}`}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <span className="text-sm">{item.label}</span>
                            <Badge variant="outline" className="text-[10px]">{item.action}</Badge>
                          </div>
                        </TableCell>
                        <TableCell className="text-center">
                          <Checkbox
                            checked={isAllowed(item.resource, item.action)}
                            onCheckedChange={(checked) => {
                              toggleMutation.mutate({
                                resource: item.resource,
                                action: item.action,
                                is_allowed: !!checked,
                              });
                            }}
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

export default Permissions;
