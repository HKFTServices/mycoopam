import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Loader2, AlertCircle } from "lucide-react";
import { formatCurrency } from "@/lib/formatCurrency";

export type MembershipSelection = "full" | "associated";

interface MembershipTypeStepProps {
  tenantId: string;
  selected: MembershipSelection;
  onSelect: (type: MembershipSelection) => void;
}

const MembershipTypeCard = ({
  type,
  label,
  description,
  shareAmount,
  joiningFee,
  monthlyFee,
  currencySymbol,
  selected,
  onSelect,
}: {
  type: MembershipSelection;
  label: string;
  description: string;
  shareAmount: number;
  joiningFee: number;
  monthlyFee: number;
  currencySymbol: string;
  selected: boolean;
  onSelect: () => void;
}) => (
  <button
    type="button"
    onClick={onSelect}
    className={`w-full text-left rounded-xl border-2 p-5 transition-all ${
      selected
        ? "border-primary bg-primary/5 shadow-sm"
        : "border-border bg-card hover:border-primary/40"
    } cursor-pointer`}
  >
    <div className="flex items-start justify-between mb-3">
      <div>
        <h3 className="text-base font-semibold">{label}</h3>
        <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
      </div>
      <div className={`h-5 w-5 rounded-full border-2 flex items-center justify-center ${
        selected ? "border-primary" : "border-muted-foreground/40"
      }`}>
        {selected && <div className="h-2.5 w-2.5 rounded-full bg-primary" />}
      </div>
    </div>
    <div className="space-y-2">
      <div className="flex justify-between items-center text-sm">
        <span className="text-muted-foreground">Share Amount (once-off)</span>
        <span className="font-semibold">{formatCurrency(shareAmount, currencySymbol)}</span>
      </div>
      <div className="flex justify-between items-center text-sm">
        <span className="text-muted-foreground">Joining Fee (once-off)</span>
        <span className="font-semibold">{formatCurrency(joiningFee, currencySymbol)}</span>
      </div>
      <div className="flex justify-between items-center text-sm">
        <span className="text-muted-foreground">Monthly Fee</span>
        <span className="font-semibold">{formatCurrency(monthlyFee, currencySymbol)}</span>
      </div>
      <div className="border-t border-border pt-2 mt-2 flex justify-between items-center text-sm font-semibold">
        <span>Total to Join</span>
        <span className="text-primary">{formatCurrency(shareAmount + joiningFee, currencySymbol)}</span>
      </div>
    </div>
  </button>
);

export const useTenantMembershipConfig = (tenantId?: string) => {
  return useQuery({
    queryKey: ["tenant_config_membership", tenantId],
    queryFn: async () => {
      if (!tenantId) return null;
      const { data } = await (supabase as any)
        .from("tenant_configuration")
        .select("full_membership_enabled, full_membership_share_amount, full_membership_fee, full_membership_monthly_fee, associated_membership_enabled, associated_membership_share_amount, associated_membership_fee, associated_membership_monthly_fee, currency_symbol")
        .eq("tenant_id", tenantId)
        .maybeSingle();
      return data;
    },
    enabled: !!tenantId,
  });
};

const MembershipTypeStep = ({ tenantId, selected, onSelect }: MembershipTypeStepProps) => {
  const { data: tenantConfig, isLoading } = useTenantMembershipConfig(tenantId);

  const fullEnabled = tenantConfig?.full_membership_enabled ?? true;
  const assocEnabled = tenantConfig?.associated_membership_enabled ?? false;
  const currencySymbol = tenantConfig?.currency_symbol || "R";
  const bothEnabled = fullEnabled && assocEnabled;

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex justify-center py-12">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Select Membership Type</CardTitle>
        <CardDescription>
          {bothEnabled
            ? "Choose the membership type that best suits your needs"
            : "The following membership type is available"}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {!fullEnabled && !assocEnabled ? (
          <div className="flex items-center gap-2 text-amber-600 bg-amber-50 dark:bg-amber-950/30 rounded-lg p-4 text-sm">
            <AlertCircle className="h-4 w-4 flex-shrink-0" />
            No membership types are currently enabled. Please contact your administrator.
          </div>
        ) : (
          <div className={`grid gap-4 ${bothEnabled ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1 max-w-md"}`}>
            {fullEnabled && (
              <MembershipTypeCard
                type="full"
                label="Full Membership"
                description="Full voting rights and all benefits"
                shareAmount={tenantConfig?.full_membership_share_amount ?? 0}
                joiningFee={tenantConfig?.full_membership_fee ?? 0}
                monthlyFee={tenantConfig?.full_membership_monthly_fee ?? 0}
                currencySymbol={currencySymbol}
                selected={selected === "full"}
                onSelect={() => onSelect("full")}
              />
            )}
            {assocEnabled && (
              <MembershipTypeCard
                type="associated"
                label="Associated Membership"
                description="Limited membership with reduced fees"
                shareAmount={tenantConfig?.associated_membership_share_amount ?? 0}
                joiningFee={tenantConfig?.associated_membership_fee ?? 0}
                monthlyFee={tenantConfig?.associated_membership_monthly_fee ?? 0}
                currencySymbol={currencySymbol}
                selected={selected === "associated"}
                onSelect={() => onSelect("associated")}
              />
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default MembershipTypeStep;
