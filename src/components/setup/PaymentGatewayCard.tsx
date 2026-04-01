import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/contexts/TenantContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Loader2, Save, CreditCard, Shield, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import PaymentMethodsSection from "./PaymentMethodsSection";

const GATEWAYS = [
  { value: "stripe", label: "Stripe" },
  { value: "payfast", label: "PayFast" },
  { value: "paygate", label: "PayGate" },
  { value: "peach", label: "Peach Payments" },
  { value: "other", label: "Other" },
];

interface GatewayForm {
  id: string;
  gateway_name: string;
  is_active: boolean;
  api_key_public: string;
  merchant_id: string;
  gateway_mode: string;
  notes: string;
}

const emptyForm: GatewayForm = {
  id: "",
  gateway_name: "stripe",
  is_active: false,
  api_key_public: "",
  merchant_id: "",
  gateway_mode: "test",
  notes: "",
};

const PaymentGatewayCard = () => {
  const { currentTenant } = useTenant();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<GatewayForm>(emptyForm);

  const { data: gateway, isLoading } = useQuery({
    queryKey: ["tenant_payment_gateway", currentTenant?.id],
    queryFn: async () => {
      if (!currentTenant) return null;
      const { data, error } = await (supabase as any)
        .from("tenant_payment_gateways")
        .select("*")
        .eq("tenant_id", currentTenant.id)
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!currentTenant,
  });

  const gatewayId = gateway?.id;
  useState(() => {});
  if (gateway && gatewayId !== form.id) {
    setForm({
      id: gateway.id,
      gateway_name: gateway.gateway_name ?? "stripe",
      is_active: gateway.is_active ?? false,
      api_key_public: gateway.api_key_public ?? "",
      merchant_id: gateway.merchant_id ?? "",
      gateway_mode: gateway.gateway_mode ?? "test",
      notes: gateway.notes ?? "",
    });
  }

  const isConfigComplete = !!(form.api_key_public || form.merchant_id);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!currentTenant) throw new Error("No tenant");
      const payload = {
        tenant_id: currentTenant.id,
        gateway_name: form.gateway_name,
        is_active: isConfigComplete ? form.is_active : false,
        api_key_public: form.api_key_public || null,
        merchant_id: form.merchant_id || null,
        gateway_mode: form.gateway_mode,
        notes: form.notes || null,
      };
      if (form.id) {
        const { error } = await (supabase as any)
          .from("tenant_payment_gateways")
          .update(payload)
          .eq("id", form.id);
        if (error) throw error;
      } else {
        const { error } = await (supabase as any)
          .from("tenant_payment_gateways")
          .insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tenant_payment_gateway"] });
      toast.success("Payment gateway settings saved");
    },
    onError: (e: any) => toast.error(e.message),
  });

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
    <div className="space-y-4">
      {/* Payment Methods Configuration */}
      <PaymentMethodsSection />

      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <CreditCard className="h-5 w-5" />
            Payment Gateway Configuration
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {!isConfigComplete && (
            <div className="flex items-center gap-2 p-3 rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30">
              <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
              <p className="text-sm text-amber-700 dark:text-amber-400">
                Complete gateway credentials below to enable credit card payments for members.
              </p>
            </div>
          )}

          {isConfigComplete && (
            <div className="flex items-center gap-2 p-3 rounded-lg border border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/30">
              <Shield className="h-4 w-4 text-emerald-600 shrink-0" />
              <p className="text-sm text-emerald-700 dark:text-emerald-400">
                Gateway credentials configured. {form.is_active ? "Credit card payments are active." : "Toggle active to enable credit card payments."}
              </p>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Gateway Provider</Label>
              <Select value={form.gateway_name} onValueChange={(v) => setForm({ ...form, gateway_name: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {GATEWAYS.map((g) => (
                    <SelectItem key={g.value} value={g.value}>{g.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Mode</Label>
              <Select value={form.gateway_mode} onValueChange={(v) => setForm({ ...form, gateway_mode: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="test">
                    <span className="flex items-center gap-2">Test <Badge variant="outline" className="text-xs">Sandbox</Badge></span>
                  </SelectItem>
                  <SelectItem value="live">
                    <span className="flex items-center gap-2">Live <Badge variant="destructive" className="text-xs">Production</Badge></span>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Public / Publishable Key</Label>
              <Input
                value={form.api_key_public}
                onChange={(e) => setForm({ ...form, api_key_public: e.target.value })}
                placeholder="pk_test_..."
              />
            </div>

            <div className="space-y-2">
              <Label>Merchant ID</Label>
              <Input
                value={form.merchant_id}
                onChange={(e) => setForm({ ...form, merchant_id: e.target.value })}
                placeholder="Merchant / Account ID"
              />
            </div>
          </div>

          <div className="flex items-center justify-between rounded-lg border p-4">
            <div>
              <Label className="text-sm font-medium">Enable Credit Card Payments</Label>
              <p className="text-xs text-muted-foreground mt-0.5">
                {isConfigComplete
                  ? "Toggle to enable/disable credit card as a payment method for members."
                  : "Complete gateway credentials above first."}
              </p>
            </div>
            <Switch
              checked={form.is_active}
              onCheckedChange={(v) => setForm({ ...form, is_active: v })}
              disabled={!isConfigComplete}
            />
          </div>

          <div className="space-y-2">
            <Label>Notes</Label>
            <Textarea
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder="Internal notes about this gateway..."
              rows={2}
            />
          </div>

          <div className="flex justify-end">
            <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
              {saveMutation.isPending ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Save className="h-4 w-4 mr-1.5" />}
              Save Gateway Settings
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default PaymentGatewayCard;
