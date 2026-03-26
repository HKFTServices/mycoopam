import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, Banknote, Package, CreditCard, BarChart3, Wallet } from "lucide-react";
import { toast } from "sonner";

const FEATURE_DEFINITIONS = [
  { key: "loans", label: "Loans", description: "Loan applications, approvals, and disbursements", icon: Banknote },
  { key: "asset_manager", label: "Asset Manager (MAM)", description: "Member Asset Manager module", icon: Package },
  { key: "debit_orders", label: "Debit Orders", description: "Recurring debit order management", icon: CreditCard },
  { key: "stock_transactions", label: "Stock Transactions", description: "Stock deposit and withdrawal transactions", icon: BarChart3 },
  { key: "referral_system", label: "Referral System", description: "Referrer and referral house management", icon: Wallet },
];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tenant: { id: string; name: string } | null;
}

const TenantFeaturesDialog = ({ open, onOpenChange, tenant }: Props) => {
  const queryClient = useQueryClient();

  const { data: features = [], isLoading } = useQuery({
    queryKey: ["tenant_features", tenant?.id],
    queryFn: async () => {
      if (!tenant) return [];
      const { data, error } = await (supabase as any)
        .from("tenant_features")
        .select("*")
        .eq("tenant_id", tenant.id);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!tenant && open,
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ featureKey, isEnabled }: { featureKey: string; isEnabled: boolean }) => {
      if (!tenant) throw new Error("No tenant");
      const existing = features.find((f: any) => f.feature_key === featureKey);
      if (existing) {
        const { error } = await (supabase as any)
          .from("tenant_features")
          .update({ is_enabled: isEnabled })
          .eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await (supabase as any)
          .from("tenant_features")
          .insert({
            tenant_id: tenant.id,
            feature_key: featureKey,
            is_enabled: isEnabled,
          });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tenant_features", tenant?.id] });
      toast.success("Feature updated");
    },
    onError: (err: any) => toast.error(err.message),
  });

  const isEnabled = (key: string) => {
    const f = features.find((f: any) => f.feature_key === key);
    return f ? f.is_enabled : true; // default enabled if no row
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Feature Modules — {tenant?.name}</DialogTitle>
          <DialogDescription>
            Enable or disable feature modules for this tenant. Disabled features will be hidden from the tenant's navigation.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-3 py-2">
            {FEATURE_DEFINITIONS.map(feat => (
              <Card key={feat.key} className="border">
                <CardContent className="flex items-center justify-between py-3 px-4">
                  <div className="flex items-center gap-3">
                    <feat.icon className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <Label className="text-sm font-medium">{feat.label}</Label>
                      <p className="text-xs text-muted-foreground">{feat.description}</p>
                    </div>
                  </div>
                  <Switch
                    checked={isEnabled(feat.key)}
                    onCheckedChange={(checked) =>
                      toggleMutation.mutate({ featureKey: feat.key, isEnabled: checked })
                    }
                    disabled={toggleMutation.isPending}
                  />
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default TenantFeaturesDialog;
