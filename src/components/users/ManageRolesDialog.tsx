import { useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";

const ASSIGNABLE_ROLES = [
  { value: "tenant_admin", label: "Tenant Admin", description: "Full cooperative administration" },
  { value: "manager", label: "Manager", description: "Approve transactions and applications" },
  { value: "clerk", label: "Clerk", description: "Initiate transactions, first-level processing" },
  { value: "full_member", label: "Full Member", description: "Standard cooperative member" },
  { value: "associated_member", label: "Associated Member", description: "Limited membership" },
  { value: "referrer", label: "Referrer", description: "Can refer new members" },
  { value: "referral_house", label: "Referral House", description: "View commissions for all linked referrers" },
] as const;

interface ManageRolesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  userName: string;
  tenantId: string;
  isSuperAdmin: boolean;
}

const ManageRolesDialog = ({ open, onOpenChange, userId, userName, tenantId, isSuperAdmin }: ManageRolesDialogProps) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedRoles, setSelectedRoles] = useState<Set<string>>(new Set());

  const { data: currentRoles = [], isLoading } = useQuery({
    queryKey: ["user_roles_manage", userId, tenantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_roles")
        .select("id, role, tenant_id")
        .eq("user_id", userId);
      if (error) throw error;
      return data ?? [];
    },
    enabled: open && !!userId,
  });

  useEffect(() => {
    if (currentRoles.length > 0 || open) {
      const tenantRoles = currentRoles
        .filter((r) => r.tenant_id === tenantId)
        .map((r) => r.role);
      setSelectedRoles(new Set(tenantRoles));
    }
  }, [currentRoles, tenantId, open]);

  const hasSuperAdminRole = currentRoles.some((r) => r.role === "super_admin" && r.tenant_id === null);

  const saveMutation = useMutation({
    mutationFn: async () => {
      // Get current tenant roles
      const existingTenantRoles = currentRoles.filter((r) => r.tenant_id === tenantId);
      const existingRoleSet = new Set(existingTenantRoles.map((r) => r.role));

      // Roles to add
      const toAdd = [...selectedRoles].filter((r) => !existingRoleSet.has(r as any));
      // Roles to remove
      const toRemove = existingTenantRoles.filter((r) => !selectedRoles.has(r.role));

      // Delete removed roles
      for (const role of toRemove) {
        const { error } = await supabase
          .from("user_roles")
          .delete()
          .eq("id", role.id);
        if (error) throw error;
      }

      // Insert new roles
      for (const roleName of toAdd) {
        const { error } = await (supabase as any)
          .from("user_roles")
          .insert({ user_id: userId, role: roleName, tenant_id: tenantId });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tenant_users"] });
      queryClient.invalidateQueries({ queryKey: ["user_roles_manage", userId] });
      toast({ title: "Roles updated", description: `Roles for ${userName} have been saved.` });
      onOpenChange(false);
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const toggleRole = (role: string) => {
    setSelectedRoles((prev) => {
      const next = new Set(prev);
      if (next.has(role)) next.delete(role);
      else next.add(role);
      return next;
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Manage Roles</DialogTitle>
          <DialogDescription>
            Assign roles for <strong>{userName}</strong> in this cooperative.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-3">
            {hasSuperAdminRole && (
              <div className="flex items-center gap-2 p-2 rounded-md bg-muted">
                <Badge variant="destructive">super admin</Badge>
                <span className="text-xs text-muted-foreground">Global role (cannot be changed here)</span>
              </div>
            )}

            {ASSIGNABLE_ROLES.map((role) => (
              <label
                key={role.value}
                className="flex items-start gap-3 p-3 rounded-lg border cursor-pointer hover:bg-muted/50 transition-colors"
              >
                <Checkbox
                  checked={selectedRoles.has(role.value)}
                  onCheckedChange={() => toggleRole(role.value)}
                  className="mt-0.5"
                />
                <div>
                  <div className="text-sm font-medium">{role.label}</div>
                  <div className="text-xs text-muted-foreground">{role.description}</div>
                </div>
              </label>
            ))}

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
                {saveMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save Roles
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default ManageRolesDialog;
