import { useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/contexts/TenantContext";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";

type TransactionType = { id: string; name: string; code: string; is_active: boolean };
type Rule = { id: string; transaction_type_id: string; allow_to: boolean; allow_from: boolean };

export const PoolTransactionRulesTab = ({ poolId }: { poolId: string }) => {
  const { currentTenant } = useTenant();
  const queryClient = useQueryClient();

  const { data: transactionTypes = [] } = useQuery({
    queryKey: ["transaction_types"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("transaction_types")
        .select("id, name, code, is_active")
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return data as TransactionType[];
    },
  });

  const { data: rules = [], isLoading } = useQuery({
    queryKey: ["pool_transaction_rules", poolId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("pool_transaction_rules")
        .select("id, transaction_type_id, allow_to, allow_from")
        .eq("pool_id", poolId);
      if (error) throw error;
      return data as Rule[];
    },
    enabled: !!poolId,
  });

  const ruleMap = useMemo(() => {
    const m: Record<string, Rule> = {};
    rules.forEach((r) => { m[r.transaction_type_id] = r; });
    return m;
  }, [rules]);

  const upsertMutation = useMutation({
    mutationFn: async ({
      transactionTypeId,
      field,
      value,
    }: {
      transactionTypeId: string;
      field: "allow_to" | "allow_from";
      value: boolean;
    }) => {
      if (!currentTenant) throw new Error("No tenant");
      const existing = ruleMap[transactionTypeId];
      if (existing) {
        const { error } = await (supabase as any)
          .from("pool_transaction_rules")
          .update({ [field]: value })
          .eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await (supabase as any)
          .from("pool_transaction_rules")
          .insert({
            tenant_id: currentTenant.id,
            pool_id: poolId,
            transaction_type_id: transactionTypeId,
            [field]: value,
          });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pool_transaction_rules", poolId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-3 py-2">
      <p className="text-sm text-muted-foreground">
        Configure which transaction types are allowed <strong>To</strong> (deposit into) and <strong>From</strong> (withdraw from) this pool.
      </p>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : transactionTypes.length === 0 ? (
        <p className="text-sm text-muted-foreground">No active transaction types found.</p>
      ) : (
        <div className="rounded-md border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Transaction Type</TableHead>
                <TableHead className="text-center w-24">To</TableHead>
                <TableHead className="text-center w-24">From</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {transactionTypes.map((tt) => {
                const rule = ruleMap[tt.id];
                return (
                  <TableRow key={tt.id}>
                    <TableCell className="font-medium">{tt.name}</TableCell>
                    <TableCell className="text-center">
                      <Checkbox
                        checked={rule?.allow_to ?? false}
                        onCheckedChange={(v) =>
                          upsertMutation.mutate({
                            transactionTypeId: tt.id,
                            field: "allow_to",
                            value: !!v,
                          })
                        }
                      />
                    </TableCell>
                    <TableCell className="text-center">
                      <Checkbox
                        checked={rule?.allow_from ?? false}
                        onCheckedChange={(v) =>
                          upsertMutation.mutate({
                            transactionTypeId: tt.id,
                            field: "allow_from",
                            value: !!v,
                          })
                        }
                      />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
};
