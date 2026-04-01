import { useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/contexts/TenantContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Loader2, Wallet, Landmark, Repeat2, CreditCard, Banknote, Bitcoin } from "lucide-react";
import { toast } from "sonner";

const METHOD_ICONS: Record<string, React.ElementType> = {
  eft: Landmark,
  debit_order: Repeat2,
  card: CreditCard,
  crypto: Bitcoin,
  cash: Banknote,
};

const DEFAULT_METHODS = [
  { method_code: "eft", method_label: "EFT (Bank Transfer)", display_order: 1 },
  { method_code: "debit_order", method_label: "Debit Order", display_order: 2 },
  { method_code: "card", method_label: "Card Payment", display_order: 3 },
  { method_code: "crypto", method_label: "Crypto Payment", display_order: 4 },
  { method_code: "cash", method_label: "Cash Deposit", display_order: 5 },
];

interface PaymentMethod {
  id: string;
  method_code: string;
  method_label: string;
  is_enabled: boolean;
  fee_type_id: string | null;
  display_order: number;
}

const PaymentMethodsSection = () => {
  const { currentTenant } = useTenant();
  const queryClient = useQueryClient();

  const { data: methods, isLoading, isFetched } = useQuery({
    queryKey: ["tenant_payment_methods", currentTenant?.id],
    queryFn: async () => {
      if (!currentTenant) return [];
      const { data, error } = await (supabase as any)
        .from("tenant_payment_methods")
        .select("*")
        .eq("tenant_id", currentTenant.id)
        .order("display_order");
      if (error) throw error;
      return (data || []) as PaymentMethod[];
    },
    enabled: !!currentTenant,
  });

  // Auto-seed default methods if none exist
  const seedMutation = useMutation({
    mutationFn: async () => {
      if (!currentTenant) throw new Error("No tenant");
      const rows = DEFAULT_METHODS.map((m) => ({
        tenant_id: currentTenant.id,
        method_code: m.method_code,
        method_label: m.method_label,
        is_enabled: m.method_code === "eft", // EFT enabled by default
        display_order: m.display_order,
      }));
      const { error } = await (supabase as any)
        .from("tenant_payment_methods")
        .insert(rows);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tenant_payment_methods"] });
    },
    onError: (e: any) => toast.error("Failed to create default methods: " + e.message),
  });

  useEffect(() => {
    if (isFetched && methods && methods.length === 0 && !seedMutation.isPending && !seedMutation.isSuccess) {
      seedMutation.mutate();
    }
  }, [isFetched, methods]);

  const { data: feeTypes } = useQuery({
    queryKey: ["transaction_fee_types", currentTenant?.id],
    queryFn: async () => {
      if (!currentTenant) return [];
      const { data, error } = await (supabase as any)
        .from("transaction_fee_types")
        .select("id, name, code")
        .eq("tenant_id", currentTenant.id)
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return data || [];
    },
    enabled: !!currentTenant,
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, is_enabled }: { id: string; is_enabled: boolean }) => {
      const { error } = await (supabase as any)
        .from("tenant_payment_methods")
        .update({ is_enabled })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tenant_payment_methods"] });
      toast.success("Payment method updated");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const feeLinkMutation = useMutation({
    mutationFn: async ({ id, fee_type_id }: { id: string; fee_type_id: string | null }) => {
      const { error } = await (supabase as any)
        .from("tenant_payment_methods")
        .update({ fee_type_id })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tenant_payment_methods"] });
      toast.success("Fee link updated");
    },
    onError: (e: any) => toast.error(e.message),
  });

  if (isLoading || seedMutation.isPending) {
    return (
      <Card>
        <CardContent className="flex justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (!methods || methods.length === 0) {
    return null; // Will be seeded momentarily
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Wallet className="h-5 w-5" />
          Deposit Payment Methods
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1">
        <p className="text-sm text-muted-foreground mb-4">
          Enable or disable payment methods available to members when depositing funds. Link each method to a fee type from your fee structure.
        </p>

        <div className="space-y-3">
          {methods.map((m) => {
            const Icon = METHOD_ICONS[m.method_code] || Wallet;
            return (
              <div
                key={m.id}
                className="flex items-center justify-between gap-4 rounded-lg border p-3"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div className="min-w-0">
                    <Label className="text-sm font-medium">{m.method_label}</Label>
                    {m.is_enabled && (
                      <div className="mt-1">
                        <Select
                          value={m.fee_type_id || "none"}
                          onValueChange={(v) =>
                            feeLinkMutation.mutate({
                              id: m.id,
                              fee_type_id: v === "none" ? null : v,
                            })
                          }
                        >
                          <SelectTrigger className="h-7 text-xs w-[220px]">
                            <SelectValue placeholder="Link fee type..." />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">No fee</SelectItem>
                            {(feeTypes || []).map((ft: any) => (
                              <SelectItem key={ft.id} value={ft.id}>
                                {ft.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {m.is_enabled && (
                    <Badge variant="outline" className="text-xs text-emerald-600 border-emerald-300">
                      Active
                    </Badge>
                  )}
                  <Switch
                    checked={m.is_enabled}
                    onCheckedChange={(v) =>
                      toggleMutation.mutate({ id: m.id, is_enabled: v })
                    }
                  />
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
};

export default PaymentMethodsSection;
