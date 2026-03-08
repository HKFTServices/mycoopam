import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency } from "@/lib/formatCurrency";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";

interface Props {
  tenantId: string;
  entityAccountId: string;
  existingEntries: any[];
  isRecent: boolean;
}

const BudgetStep = ({ tenantId, entityAccountId, existingEntries, isRecent }: Props) => {
  const queryClient = useQueryClient();

  const { data: categories = [], isLoading } = useQuery({
    queryKey: ["budget_categories", tenantId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("budget_categories")
        .select("*")
        .eq("tenant_id", tenantId)
        .eq("is_active", true)
        .order("category_type")
        .order("sort_order");
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!tenantId,
  });

  const [amounts, setAmounts] = useState<Record<string, number>>({});

  // Initialize from existing entries
  useEffect(() => {
    if (existingEntries.length > 0) {
      const map: Record<string, number> = {};
      existingEntries.forEach((e: any) => {
        map[e.budget_category_id] = Number(e.amount);
      });
      setAmounts(map);
    }
  }, [existingEntries]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      // Delete existing entries and re-insert
      await (supabase as any)
        .from("loan_budget_entries")
        .delete()
        .eq("entity_account_id", entityAccountId)
        .eq("tenant_id", tenantId);

      const rows = Object.entries(amounts)
        .filter(([, amount]) => amount > 0)
        .map(([categoryId, amount]) => ({
          tenant_id: tenantId,
          entity_account_id: entityAccountId,
          budget_category_id: categoryId,
          amount,
        }));

      if (rows.length > 0) {
        const { error } = await (supabase as any).from("loan_budget_entries").insert(rows);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Budget saved");
      queryClient.invalidateQueries({ queryKey: ["loan_budget_entries"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  if (isLoading) return <div className="flex justify-center p-8"><Loader2 className="h-5 w-5 animate-spin" /></div>;

  if (categories.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <p>No budget categories configured. Please ask your administrator to set up budget categories first.</p>
      </div>
    );
  }

  const incomeCategories = categories.filter((c: any) => c.category_type === "income");
  const expenseCategories = categories.filter((c: any) => c.category_type === "expense");

  const totalIncome = incomeCategories.reduce((sum: number, c: any) => sum + (amounts[c.id] || 0), 0);
  const totalExpenses = expenseCategories.reduce((sum: number, c: any) => sum + (amounts[c.id] || 0), 0);
  const surplus = totalIncome - totalExpenses;

  return (
    <div className="space-y-4 pb-4">
      {isRecent && (
        <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg p-3 text-sm text-blue-700 dark:text-blue-300">
          Your budget was completed recently. Review the figures below and update if needed.
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Income */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-emerald-600 dark:text-emerald-400">Monthly Income</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {incomeCategories.map((c: any) => (
              <div key={c.id} className="flex items-center gap-2">
                <label className="text-xs flex-1 min-w-0 truncate">{c.name}</label>
                <Input
                  type="number"
                  min={0}
                  step={100}
                  className="w-28 text-right text-sm"
                  value={amounts[c.id] || ""}
                  placeholder="0"
                  onChange={(e) => setAmounts((a) => ({ ...a, [c.id]: parseFloat(e.target.value) || 0 }))}
                />
              </div>
            ))}
            <div className="flex justify-between pt-2 border-t text-sm font-semibold text-emerald-600">
              <span>Total Income</span>
              <span>{formatCurrency(totalIncome)}</span>
            </div>
          </CardContent>
        </Card>

        {/* Expenses */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-red-600 dark:text-red-400">Monthly Expenses</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {expenseCategories.map((c: any) => (
              <div key={c.id} className="flex items-center gap-2">
                <label className="text-xs flex-1 min-w-0 truncate">{c.name}</label>
                <Input
                  type="number"
                  min={0}
                  step={100}
                  className="w-28 text-right text-sm"
                  value={amounts[c.id] || ""}
                  placeholder="0"
                  onChange={(e) => setAmounts((a) => ({ ...a, [c.id]: parseFloat(e.target.value) || 0 }))}
                />
              </div>
            ))}
            <div className="flex justify-between pt-2 border-t text-sm font-semibold text-red-600">
              <span>Total Expenses</span>
              <span>{formatCurrency(totalExpenses)}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Summary */}
      <Card className={surplus >= 0 ? "border-emerald-200 dark:border-emerald-800" : "border-red-200 dark:border-red-800"}>
        <CardContent className="py-3">
          <div className="flex justify-between items-center">
            <span className="text-sm font-semibold">Monthly Surplus / (Deficit)</span>
            <span className={`text-lg font-bold ${surplus >= 0 ? "text-emerald-600" : "text-red-600"}`}>
              {formatCurrency(surplus)}
            </span>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button size="sm" variant="outline" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
          {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Save className="h-4 w-4 mr-1" />}
          Save Budget
        </Button>
      </div>
    </div>
  );
};

export default BudgetStep;
