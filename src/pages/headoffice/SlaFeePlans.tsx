import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Loader2, Save, DollarSign, TrendingUp, Percent } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { formatCurrency } from "@/lib/formatCurrency";

interface FeePlan {
  id: string;
  plan_code: string;
  plan_label: string;
  plan_type: string;
  setup_fee_excl_vat: number;
  monthly_fee_excl_vat: number;
  deposit_fee_pct: number;
  switch_transfer_withdrawal_fee_pct: number;
  tpv_tier1_threshold: number;
  tpv_tier1_pct_pa: number;
  tpv_tier2_threshold: number;
  tpv_tier2_pct_pa: number;
  tpv_tier3_pct_pa: number;
  additional_inclusions: string | null;
  additional_exclusions: string | null;
  is_active: boolean;
}

const SlaFeePlans = () => {
  const queryClient = useQueryClient();
  const [editingPlan, setEditingPlan] = useState<string | null>(null);
  const [formData, setFormData] = useState<Record<string, string>>({});

  const { data: plans = [], isLoading } = useQuery({
    queryKey: ["sla_fee_plans"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("sla_fee_plans")
        .select("*")
        .order("plan_code");
      if (error) throw error;
      return data as FeePlan[];
    },
  });

  // Fetch tenant SLA agreements to show which tenants selected which plan
  const { data: tenantSlas = [] } = useQuery({
    queryKey: ["tenant_slas_summary"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("tenant_sla")
        .select("id, tenant_id, sla_fee_plan_id, status, signed_at, setup_fee_paid");
      if (error) throw error;
      return data;
    },
  });

  const savePlan = useMutation({
    mutationFn: async (planId: string) => {
      const plan = plans.find((p) => p.id === planId);
      if (!plan) throw new Error("Plan not found");
      const payload: Record<string, any> = { updated_at: new Date().toISOString() };
      const numFields = [
        "setup_fee_excl_vat", "monthly_fee_excl_vat", "deposit_fee_pct", "switch_transfer_withdrawal_fee_pct",
        "tpv_tier1_threshold", "tpv_tier1_pct_pa", "tpv_tier2_threshold",
        "tpv_tier2_pct_pa", "tpv_tier3_pct_pa",
      ];
      for (const field of numFields) {
        if (formData[field] !== undefined) payload[field] = Number(formData[field]);
      }
      if (formData.additional_inclusions !== undefined) payload.additional_inclusions = formData.additional_inclusions;
      if (formData.additional_exclusions !== undefined) payload.additional_exclusions = formData.additional_exclusions;
      if (formData.plan_label !== undefined) payload.plan_label = formData.plan_label;

      const { error } = await (supabase as any)
        .from("sla_fee_plans")
        .update(payload)
        .eq("id", planId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sla_fee_plans"] });
      toast.success("Fee plan saved");
      setEditingPlan(null);
      setFormData({});
    },
    onError: (err: any) => toast.error(err.message),
  });

  const getVal = (plan: FeePlan, key: string) => {
    if (editingPlan === plan.id && formData[key] !== undefined) return formData[key];
    return (plan as any)[key]?.toString() ?? "";
  };

  const updateField = (key: string, value: string) => {
    setFormData((p) => ({ ...p, [key]: value }));
  };

  const startEdit = (plan: FeePlan) => {
    setEditingPlan(plan.id);
    setFormData({});
  };

  const getSlaCount = (planId: string) =>
    tenantSlas.filter((s: any) => s.sla_fee_plan_id === planId).length;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">SLA Fee Plans</h1>
        <p className="text-muted-foreground">
          Manage the fee structures that new co-operatives choose from during registration
        </p>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center gap-3">
              <DollarSign className="h-8 w-8 text-primary" />
              <div>
                <p className="text-2xl font-bold">{plans.length}</p>
                <p className="text-sm text-muted-foreground">Fee Plans</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center gap-3">
              <TrendingUp className="h-8 w-8 text-primary" />
              <div>
                <p className="text-2xl font-bold">{tenantSlas.length}</p>
                <p className="text-sm text-muted-foreground">Active SLAs</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center gap-3">
              <Percent className="h-8 w-8 text-primary" />
              <div>
                <p className="text-2xl font-bold">
                  {tenantSlas.filter((s: any) => s.setup_fee_paid).length}
                </p>
                <p className="text-sm text-muted-foreground">Setup Fees Paid</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Plan Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {plans.map((plan) => {
          const isEditing = editingPlan === plan.id;
          const subscriberCount = getSlaCount(plan.id);
          return (
            <Card key={plan.id} className={isEditing ? "ring-2 ring-primary" : ""}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      {isEditing ? (
                        <Input
                          value={getVal(plan, "plan_label")}
                          onChange={(e) => updateField("plan_label", e.target.value)}
                          className="w-40 font-bold"
                        />
                      ) : (
                        plan.plan_label
                      )}
                      <Badge variant="secondary">{plan.plan_code}</Badge>
                    </CardTitle>
                    <CardDescription>
                      {subscriberCount} tenant{subscriberCount !== 1 ? "s" : ""} on this plan
                    </CardDescription>
                  </div>
                  {!isEditing ? (
                    <Button variant="outline" size="sm" onClick={() => startEdit(plan)}>
                      Edit
                    </Button>
                  ) : (
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => { setEditingPlan(null); setFormData({}); }}
                      >
                        Cancel
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => savePlan.mutate(plan.id)}
                        disabled={savePlan.isPending}
                      >
                        {savePlan.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Save className="h-4 w-4 mr-1" />}
                        Save
                      </Button>
                    </div>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Setup Fee */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground uppercase tracking-wider">Setup Fee (excl. VAT)</Label>
                    {isEditing ? (
                      <Input type="number" step="0.01" value={getVal(plan, "setup_fee_excl_vat")} onChange={(e) => updateField("setup_fee_excl_vat", e.target.value)} />
                    ) : (
                      <p className="text-lg font-semibold">{formatCurrency(plan.setup_fee_excl_vat)}</p>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground uppercase tracking-wider">Monthly Fee (excl. VAT)</Label>
                    {isEditing ? (
                      <Input type="number" step="0.01" value={getVal(plan, "monthly_fee_excl_vat")} onChange={(e) => updateField("monthly_fee_excl_vat", e.target.value)} />
                    ) : (
                      <p className="text-lg font-semibold">{formatCurrency(plan.monthly_fee_excl_vat)}</p>
                    )}
                  </div>
                </div>

                <Separator />

                {/* Transaction Fees */}
                <div>
                  <Label className="text-xs text-muted-foreground uppercase tracking-wider">Transaction Fees (recouped from pools)</Label>
                  <div className="grid grid-cols-2 gap-3 mt-2">
                    <div className="space-y-1">
                      <Label className="text-xs">Deposits %</Label>
                      {isEditing ? (
                        <Input
                          type="number" step="0.01"
                          value={getVal(plan, "deposit_fee_pct")}
                          onChange={(e) => updateField("deposit_fee_pct", e.target.value)}
                        />
                      ) : (
                        <p className="font-medium">{plan.deposit_fee_pct}%</p>
                      )}
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Switches/Transfers/Withdrawals %</Label>
                      {isEditing ? (
                        <Input
                          type="number" step="0.01"
                          value={getVal(plan, "switch_transfer_withdrawal_fee_pct")}
                          onChange={(e) => updateField("switch_transfer_withdrawal_fee_pct", e.target.value)}
                        />
                      ) : (
                        <p className="font-medium">{plan.switch_transfer_withdrawal_fee_pct}%</p>
                      )}
                    </div>
                  </div>
                </div>

                <Separator />

                {/* TPV Tiers */}
                <div>
                  <Label className="text-xs text-muted-foreground uppercase tracking-wider">
                    Recurring Fees (% of Total Pool Value per annum)
                  </Label>
                  <div className="space-y-3 mt-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm">
                        TPV &lt; {isEditing ? (
                          <Input
                            type="number" step="1000000" className="inline w-32"
                            value={getVal(plan, "tpv_tier1_threshold")}
                            onChange={(e) => updateField("tpv_tier1_threshold", e.target.value)}
                          />
                        ) : (
                          formatCurrency(plan.tpv_tier1_threshold)
                        )}
                      </span>
                      {isEditing ? (
                        <Input
                          type="number" step="0.01" className="w-24"
                          value={getVal(plan, "tpv_tier1_pct_pa")}
                          onChange={(e) => updateField("tpv_tier1_pct_pa", e.target.value)}
                        />
                      ) : (
                        <Badge>{plan.tpv_tier1_pct_pa}% p.a.</Badge>
                      )}
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm">
                        {isEditing ? (
                          <>
                            TPV between thresholds →{" "}
                            <Input
                              type="number" step="1000000" className="inline w-32"
                              value={getVal(plan, "tpv_tier2_threshold")}
                              onChange={(e) => updateField("tpv_tier2_threshold", e.target.value)}
                            />
                          </>
                        ) : (
                          <>TPV {formatCurrency(plan.tpv_tier1_threshold)} – {formatCurrency(plan.tpv_tier2_threshold)}</>
                        )}
                      </span>
                      {isEditing ? (
                        <Input
                          type="number" step="0.01" className="w-24"
                          value={getVal(plan, "tpv_tier2_pct_pa")}
                          onChange={(e) => updateField("tpv_tier2_pct_pa", e.target.value)}
                        />
                      ) : (
                        <Badge>{plan.tpv_tier2_pct_pa}% p.a.</Badge>
                      )}
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm">TPV &gt; {formatCurrency(plan.tpv_tier2_threshold)}</span>
                      {isEditing ? (
                        <Input
                          type="number" step="0.01" className="w-24"
                          value={getVal(plan, "tpv_tier3_pct_pa")}
                          onChange={(e) => updateField("tpv_tier3_pct_pa", e.target.value)}
                        />
                      ) : (
                        <Badge>{plan.tpv_tier3_pct_pa}% p.a.</Badge>
                      )}
                    </div>
                  </div>
                </div>

                <Separator />

                {/* Inclusions / Exclusions */}
                <div className="grid grid-cols-1 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Additional Inclusions</Label>
                    {isEditing ? (
                      <Textarea
                        rows={2}
                        value={getVal(plan, "additional_inclusions")}
                        onChange={(e) => updateField("additional_inclusions", e.target.value)}
                        placeholder="List additional services included..."
                      />
                    ) : (
                      <p className="text-sm text-muted-foreground">{plan.additional_inclusions || "—"}</p>
                    )}
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Additional Exclusions</Label>
                    {isEditing ? (
                      <Textarea
                        rows={2}
                        value={getVal(plan, "additional_exclusions")}
                        onChange={(e) => updateField("additional_exclusions", e.target.value)}
                        placeholder="List exclusions..."
                      />
                    ) : (
                      <p className="text-sm text-muted-foreground">{plan.additional_exclusions || "—"}</p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
};

export default SlaFeePlans;
