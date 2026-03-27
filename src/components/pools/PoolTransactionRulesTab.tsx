import { useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/contexts/TenantContext";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Package,
  PackagePlus,
  ArrowLeftRight,
  Repeat,
} from "lucide-react";

/**
 * Fixed list of basic unit-movement transaction types that apply to pools.
 * The `code` field is used as a stable key for persisting rules.
 */
const BASIC_TRANSACTION_TYPES = [
  { code: "deposit_funds", label: "Deposit Funds", description: "Cash deposits into this pool", icon: ArrowDownToLine },
  { code: "withdraw_funds", label: "Withdraw Funds", description: "Cash withdrawals from this pool", icon: ArrowUpFromLine },
  { code: "deposit_stock", label: "Deposit Stock", description: "Stock deposits into this pool", icon: PackagePlus },
  { code: "withdraw_stock", label: "Withdraw Stock", description: "Stock withdrawals from this pool", icon: Package },
  { code: "transfer", label: "Transfer", description: "Unit transfers between member accounts", icon: ArrowLeftRight },
  { code: "switch", label: "Switch", description: "Switch units between pools", icon: Repeat },
] as const;

type Rule = {
  id: string;
  pool_id: string;
  transaction_type_code: string;
  is_allowed: boolean;
};

export const PoolTransactionRulesTab = ({ poolId }: { poolId: string }) => {
  const { currentTenant } = useTenant();
  const queryClient = useQueryClient();

  const { data: rules = [], isLoading } = useQuery({
    queryKey: ["pool_transaction_rules", poolId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("pool_transaction_rules")
        .select("id, pool_id, transaction_type_code, is_allowed")
        .eq("pool_id", poolId);
      if (error) throw error;
      return data as Rule[];
    },
    enabled: !!poolId,
  });

  const ruleMap = useMemo(() => {
    const m: Record<string, Rule> = {};
    rules.forEach((r) => { m[r.transaction_type_code] = r; });
    return m;
  }, [rules]);

  const toggleMutation = useMutation({
    mutationFn: async ({ code, value }: { code: string; value: boolean }) => {
      if (!currentTenant) throw new Error("No tenant");
      const existing = ruleMap[code];
      if (existing) {
        const { error } = await (supabase as any)
          .from("pool_transaction_rules")
          .update({ is_allowed: value })
          .eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await (supabase as any)
          .from("pool_transaction_rules")
          .insert({
            tenant_id: currentTenant.id,
            pool_id: poolId,
            transaction_type_code: code,
            is_allowed: value,
          });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pool_transaction_rules", poolId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) return <p className="text-sm text-muted-foreground py-4">Loading…</p>;

  return (
    <div className="space-y-4 py-2">
      <p className="text-sm text-muted-foreground">
        Enable or disable unit-movement transaction types for this pool.
      </p>

      <div className="grid gap-3">
        {BASIC_TRANSACTION_TYPES.map((tt) => {
          const rule = ruleMap[tt.code];
          const isAllowed = rule?.is_allowed ?? false;
          const Icon = tt.icon;

          return (
            <div
              key={tt.code}
              className="flex items-center justify-between rounded-lg border p-3 hover:bg-muted/50 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 text-primary">
                  <Icon className="h-4 w-4" />
                </div>
                <div>
                  <Label className="text-sm font-medium cursor-pointer">{tt.label}</Label>
                  <p className="text-xs text-muted-foreground">{tt.description}</p>
                </div>
              </div>
              <Switch
                checked={isAllowed}
                onCheckedChange={(v) =>
                  toggleMutation.mutate({ code: tt.code, value: v })
                }
              />
            </div>
          );
        })}
      </div>
    </div>
  );
};
