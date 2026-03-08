import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useTenant } from "@/contexts/TenantContext";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Home, UserCheck, CheckCircle } from "lucide-react";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entityId: string;
  entityName: string;
}

const ApplyReferrerDialog = ({ open, onOpenChange, entityId, entityName }: Props) => {
  const { user } = useAuth();
  const { currentTenant } = useTenant();
  const queryClient = useQueryClient();
  const [selectedHouseId, setSelectedHouseId] = useState("");

  // Fetch all active Referral House accounts across the tenant
  const { data: referralHouses = [], isLoading } = useQuery({
    queryKey: ["all_referral_houses", currentTenant?.id],
    queryFn: async () => {
      if (!currentTenant) return [];
      const { data, error } = await (supabase as any)
        .from("entity_accounts")
        .select(`
          id, account_number, entity_id,
          entity_account_types!inner(account_type),
          entities!inner(name, last_name)
        `)
        .eq("tenant_id", currentTenant.id)
        .eq("entity_account_types.account_type", 5)
        .in("status", ["active", "approved"])
        .eq("is_active", true);
      if (error) throw error;
      return (data ?? []).map((h: any) => ({
        id: h.id,
        entityId: h.entity_id,
        accountNumber: h.account_number,
        name: [h.entities?.name, h.entities?.last_name].filter(Boolean).join(" "),
      }));
    },
    enabled: !!currentTenant && open,
  });

  // Check if already has a pending/approved referrer application
  const { data: existingApplication } = useQuery({
    queryKey: ["existing_referrer_app", entityId, currentTenant?.id],
    queryFn: async () => {
      if (!entityId || !currentTenant || !user) return null;
      const { data } = await (supabase as any)
        .from("referrers")
        .select("id, status, referrer_number, referral_house_account_id")
        .eq("entity_id", entityId)
        .eq("tenant_id", currentTenant.id)
        .in("status", ["pending", "approved"])
        .limit(1);
      return data?.[0] ?? null;
    },
    enabled: !!entityId && !!currentTenant && !!user && open,
  });

  const applyMutation = useMutation({
    mutationFn: async () => {
      if (!user || !currentTenant || !selectedHouseId) throw new Error("Missing data");

      const house = referralHouses.find((h: any) => h.id === selectedHouseId);
      if (!house) throw new Error("Referral House not found");

      // Create pending referrer record (no role or number yet — allocated on approval)
      const { error } = await (supabase as any)
        .from("referrers")
        .insert({
          user_id: user.id,
          entity_id: entityId,
          referral_house_entity_id: house.entityId,
          referral_house_account_id: selectedHouseId,
          referrer_number: "PENDING",
          tenant_id: currentTenant.id,
          status: "pending",
          is_active: false,
        });
      if (error) throw error;
      return house.name;
    },
    onSuccess: (houseName) => {
      toast.success(`Referrer application submitted under ${houseName} — awaiting manager approval`);
      queryClient.invalidateQueries({ queryKey: ["existing_referrer_app"] });
      queryClient.invalidateQueries({ queryKey: ["referrer_info"] });
      queryClient.invalidateQueries({ queryKey: ["pending_referrer_approvals"] });
      queryClient.invalidateQueries({ queryKey: ["pending_approvals_count"] });
      onOpenChange(false);
    },
    onError: (err: any) => toast.error(err.message || "Failed to submit application"),
  });

  const alreadyApplied = !!existingApplication;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserCheck className="h-5 w-5 text-primary" />
            Apply as Referrer
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Applicant info */}
          <div className="rounded-lg border border-border bg-muted/30 p-3">
            <p className="text-xs text-muted-foreground">Applying for</p>
            <p className="font-semibold text-sm">{entityName}</p>
          </div>

          {alreadyApplied ? (
            <div className="rounded-xl border-2 border-primary/30 bg-primary/5 p-4 text-center space-y-2">
              <CheckCircle className="h-8 w-8 text-primary mx-auto" />
              <p className="font-semibold text-sm">
                {existingApplication.status === "approved"
                  ? `Already registered as Referrer: ${existingApplication.referrer_number}`
                  : "Application already submitted — awaiting approval"}
              </p>
              <Badge variant={existingApplication.status === "approved" ? "default" : "secondary"}>
                {existingApplication.status === "approved" ? "Approved" : "Pending"}
              </Badge>
            </div>
          ) : (
            <>
              <div className="space-y-2">
                <p className="text-sm font-medium">Select Referral House</p>
                <p className="text-xs text-muted-foreground">
                  Choose which Referral House you'd like to register under. Your referrer number will be a sub-number of this house.
                </p>
              </div>

              <div className="rounded-lg border border-border bg-muted/40 p-3 space-y-1">
                <p className="text-xs font-medium text-foreground">ℹ️ Important</p>
                <p className="text-xs text-muted-foreground">
                  Every referrer must operate under a Referral House. If you wish to refer in your personal capacity, you must first register as a Referral House and then apply as a Referrer under that house.
                </p>
              </div>

              {isLoading ? (
                <div className="flex justify-center py-6">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : referralHouses.length === 0 ? (
                <div className="rounded-lg border border-border bg-muted/30 p-4 text-center">
                  <p className="text-sm text-muted-foreground">No active Referral Houses found</p>
                </div>
              ) : (
                <div className="grid gap-2 max-h-64 overflow-y-auto">
                  {referralHouses.map((house: any) => {
                    const isSelected = selectedHouseId === house.id;
                    return (
                      <button
                        key={house.id}
                        onClick={() => setSelectedHouseId(house.id)}
                        className={`flex items-center gap-3 p-3 rounded-xl border-2 text-left transition-all duration-200 ${
                          isSelected
                            ? "border-primary bg-primary/5 shadow-sm"
                            : "border-border hover:border-primary/30 hover:bg-muted/20"
                        }`}
                      >
                        <div className={`h-10 w-10 rounded-lg flex items-center justify-center shrink-0 ${
                          isSelected ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                        }`}>
                          <Home className="h-5 w-5" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-sm truncate">{house.name}</p>
                          <code className="text-[11px] font-mono text-muted-foreground">{house.accountNumber}</code>
                        </div>
                        {isSelected && (
                          <CheckCircle className="h-5 w-5 text-primary shrink-0" />
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          {!alreadyApplied && (
            <Button
              onClick={() => applyMutation.mutate()}
              disabled={!selectedHouseId || applyMutation.isPending}
              className="gap-1.5"
            >
              {applyMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <UserCheck className="h-4 w-4" />
              )}
              Submit Application
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ApplyReferrerDialog;
