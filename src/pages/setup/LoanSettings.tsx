import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/contexts/TenantContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Loader2, Save, Banknote } from "lucide-react";
import { toast } from "sonner";
import { useState, useEffect } from "react";

const LoanSettings = () => {
  const { currentTenant } = useTenant();
  const queryClient = useQueryClient();

  const { data: settings, isLoading } = useQuery({
    queryKey: ["loan_settings", currentTenant?.id],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("loan_settings")
        .select("*")
        .eq("tenant_id", currentTenant!.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!currentTenant?.id,
  });

  const [form, setForm] = useState({
    max_term_months: 12,
    pool_value_multiple: 1.0,
    interest_type: "simple",
    interest_rate_low: 5.0,
    interest_rate_medium: 8.0,
    interest_rate_high: 12.0,
    loan_fee_low: 150,
    loan_fee_medium: 200,
    loan_fee_high: 300,
  });

  useEffect(() => {
    if (settings) {
      setForm({
        max_term_months: settings.max_term_months,
        pool_value_multiple: Number(settings.pool_value_multiple),
        interest_type: settings.interest_type,
        interest_rate_low: Number(settings.interest_rate_low),
        interest_rate_medium: Number(settings.interest_rate_medium),
        interest_rate_high: Number(settings.interest_rate_high),
        loan_fee_low: Number(settings.loan_fee_low),
        loan_fee_medium: Number(settings.loan_fee_medium),
        loan_fee_high: Number(settings.loan_fee_high),
      });
    }
  }, [settings]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!currentTenant) throw new Error("No tenant");
      const payload = { ...form, tenant_id: currentTenant.id };
      if (settings?.id) {
        const { error } = await (supabase as any)
          .from("loan_settings")
          .update(payload)
          .eq("id", settings.id);
        if (error) throw error;
      } else {
        const { error } = await (supabase as any)
          .from("loan_settings")
          .insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Loan settings saved");
      queryClient.invalidateQueries({ queryKey: ["loan_settings"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  if (isLoading) return <div className="flex justify-center p-12"><Loader2 className="h-6 w-6 animate-spin" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Banknote className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-lg sm:text-2xl font-bold">Loan Settings</h1>
          <p className="text-xs sm:text-sm text-muted-foreground">Configure loan rules, interest rates and fees</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* General Settings */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">General Rules</CardTitle>
            <CardDescription>Maximum term and pool value limits</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Max Payment Term (Months)</Label>
              <Input
                type="number"
                min={1}
                max={120}
                value={form.max_term_months}
                onChange={(e) => setForm((f) => ({ ...f, max_term_months: parseInt(e.target.value) || 12 }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Multiple of Pool Value</Label>
              <Input
                type="number"
                min={0.1}
                step={0.1}
                value={form.pool_value_multiple}
                onChange={(e) => setForm((f) => ({ ...f, pool_value_multiple: parseFloat(e.target.value) || 1 }))}
              />
              <p className="text-xs text-muted-foreground">Max loan = member's pool value × this multiple</p>
            </div>
            <div className="space-y-2">
              <Label>Interest Type</Label>
              <Select value={form.interest_type} onValueChange={(v) => setForm((f) => ({ ...f, interest_type: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="simple">Simple Interest</SelectItem>
                  <SelectItem value="compound">Compound Interest</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Interest Rates & Fees by Risk */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Interest Rates & Fees by Risk Level</CardTitle>
            <CardDescription>Annual interest rate (%) and once-off loan fee (R)</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {(["low", "medium", "high"] as const).map((risk) => (
                <div key={risk} className="space-y-3">
                  <h4 className="text-sm font-semibold capitalize text-center">{risk} Risk</h4>
                  <Separator />
                  <div className="space-y-2">
                    <Label className="text-xs">Interest Rate (% p.a.)</Label>
                    <Input
                      type="number"
                      min={0}
                      step={0.5}
                      value={form[`interest_rate_${risk}` as keyof typeof form]}
                      onChange={(e) => setForm((f) => ({ ...f, [`interest_rate_${risk}`]: parseFloat(e.target.value) || 0 }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs">Loan Fee (R)</Label>
                    <Input
                      type="number"
                      min={0}
                      step={10}
                      value={form[`loan_fee_${risk}` as keyof typeof form]}
                      onChange={(e) => setForm((f) => ({ ...f, [`loan_fee_${risk}`]: parseFloat(e.target.value) || 0 }))}
                    />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <Button className="w-full sm:w-auto" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
        {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
        Save Settings
      </Button>
    </div>
  );
};

export default LoanSettings;
