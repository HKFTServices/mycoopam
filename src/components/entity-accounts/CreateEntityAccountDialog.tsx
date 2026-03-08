import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/contexts/TenantContext";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const AUTO_NUMBER_ACCOUNT_TYPES = [2, 3, 5, 6, 7]; // Customer, Supplier, Referral House, Legal Entity, Administrator

const CreateEntityAccountDialog = ({ open, onOpenChange }: Props) => {
  const { currentTenant } = useTenant();
  const queryClient = useQueryClient();

  const [entityId, setEntityId] = useState("");
  const [accountTypeId, setAccountTypeId] = useState("");
  const [isApproved, setIsApproved] = useState(false);
  const [isActive, setIsActive] = useState(false);

  // Fetch all entities in tenant
  const { data: entities = [], isLoading: loadingEntities } = useQuery({
    queryKey: ["all_entities", currentTenant?.id],
    queryFn: async () => {
      if (!currentTenant) return [];
      const { data, error } = await (supabase as any)
        .from("entities")
        .select("id, name, last_name, identity_number, registration_number, entity_categories (name, entity_type)")
        .eq("tenant_id", currentTenant.id)
        .eq("is_deleted", false)
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!currentTenant && open,
  });

  // Fetch entity account types
  const { data: accountTypes = [], isLoading: loadingTypes } = useQuery({
    queryKey: ["entity_account_types", currentTenant?.id],
    queryFn: async () => {
      if (!currentTenant) return [];
      const { data, error } = await (supabase as any)
        .from("entity_account_types")
        .select("id, name, account_type, prefix, number_count, is_active")
        .eq("tenant_id", currentTenant.id)
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!currentTenant && open,
  });

  const selectedType = accountTypes.find((t: any) => t.id === accountTypeId);
  const shouldAutoNumber = selectedType && AUTO_NUMBER_ACCOUNT_TYPES.includes(selectedType.account_type);

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!currentTenant || !entityId || !accountTypeId) throw new Error("Missing fields");

      // Check for duplicate entity + account type
      const { data: duplicates, error: dupErr } = await (supabase as any)
        .from("entity_accounts")
        .select("id")
        .eq("entity_id", entityId)
        .eq("entity_account_type_id", accountTypeId)
        .eq("tenant_id", currentTenant.id)
        .limit(1);
      if (dupErr) throw dupErr;
      if (duplicates && duplicates.length > 0) {
        throw new Error("This entity already has an account of this type");
      }
      let accountNumber: string | null = null;

      if (shouldAutoNumber && selectedType) {
        // Find max existing account number for this account type
        const { data: existing, error: fetchErr } = await (supabase as any)
          .from("entity_accounts")
          .select("account_number")
          .eq("tenant_id", currentTenant.id)
          .eq("entity_account_type_id", accountTypeId)
          .not("account_number", "is", null)
          .order("account_number", { ascending: false })
          .limit(1);
        if (fetchErr) throw fetchErr;

        let nextNum = 1;
        if (existing && existing.length > 0 && existing[0].account_number) {
          const raw = existing[0].account_number;
          const numericPart = raw.replace(selectedType.prefix, "");
          const parsed = parseInt(numericPart, 10);
          if (!isNaN(parsed)) nextNum = parsed + 1;
        }

        accountNumber = selectedType.prefix + String(nextNum).padStart(selectedType.number_count, "0");
      }

      const { error } = await (supabase as any)
        .from("entity_accounts")
        .insert({
          entity_id: entityId,
          entity_account_type_id: accountTypeId,
          tenant_id: currentTenant.id,
          account_number: accountNumber,
          is_approved: isApproved,
          is_active: isActive,
          status: isApproved && accountNumber ? "active" : "pending_activation",
        });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Entity account created successfully");
      queryClient.invalidateQueries({ queryKey: ["user_entity_accounts"] });
      queryClient.invalidateQueries({ queryKey: ["user_linked_entities"] });
      resetAndClose();
    },
    onError: (err: any) => {
      toast.error(err.message || "Failed to create entity account");
    },
  });

  const resetAndClose = () => {
    setEntityId("");
    setAccountTypeId("");
    setIsApproved(false);
    setIsActive(false);
    onOpenChange(false);
  };

  const entityLabel = (e: any) => {
    const full = [e.name, e.last_name].filter(Boolean).join(" ");
    const id = e.identity_number || e.registration_number || "";
    return id ? `${full} (${id})` : full;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create Entity Account</DialogTitle>
          <DialogDescription>Select an entity and account type to create a new account.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Entity */}
          <div className="space-y-2">
            <Label>Entity</Label>
            <Select value={entityId} onValueChange={setEntityId}>
              <SelectTrigger>
                <SelectValue placeholder={loadingEntities ? "Loading…" : "Select an entity"} />
              </SelectTrigger>
              <SelectContent>
                {entities.map((e: any) => (
                  <SelectItem key={e.id} value={e.id}>{entityLabel(e)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Account Type */}
          <div className="space-y-2">
            <Label>Account Type</Label>
            <Select value={accountTypeId} onValueChange={setAccountTypeId}>
              <SelectTrigger>
                <SelectValue placeholder={loadingTypes ? "Loading…" : "Select account type"} />
              </SelectTrigger>
              <SelectContent>
                {accountTypes.map((t: any) => (
                  <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Auto-number info */}
          {shouldAutoNumber && selectedType && (
            <p className="text-xs text-muted-foreground rounded bg-muted px-3 py-2">
              Account number will be auto-allocated using prefix <strong>{selectedType.prefix}</strong>.
            </p>
          )}

          {/* Approved & Active toggles */}
          <div className="flex items-center justify-between">
            <Label htmlFor="is-approved">Is Approved</Label>
            <Switch id="is-approved" checked={isApproved} onCheckedChange={setIsApproved} />
          </div>
          <div className="flex items-center justify-between">
            <Label htmlFor="is-active">Is Active</Label>
            <Switch id="is-active" checked={isActive} onCheckedChange={setIsActive} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={resetAndClose}>Cancel</Button>
          <Button
            onClick={() => createMutation.mutate()}
            disabled={!entityId || !accountTypeId || createMutation.isPending}
          >
            {createMutation.isPending && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default CreateEntityAccountDialog;
