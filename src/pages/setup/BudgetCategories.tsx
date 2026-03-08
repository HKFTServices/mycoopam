import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/contexts/TenantContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, Plus, Trash2, ClipboardList } from "lucide-react";
import { toast } from "sonner";
import { useState } from "react";

const BudgetCategories = () => {
  const { currentTenant } = useTenant();
  const queryClient = useQueryClient();
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState<"income" | "expense">("expense");

  const { data: categories = [], isLoading } = useQuery({
    queryKey: ["budget_categories", currentTenant?.id],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("budget_categories")
        .select("*")
        .eq("tenant_id", currentTenant!.id)
        .order("category_type")
        .order("sort_order");
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!currentTenant?.id,
  });

  const addMutation = useMutation({
    mutationFn: async () => {
      if (!newName.trim()) throw new Error("Name is required");
      const { error } = await (supabase as any)
        .from("budget_categories")
        .insert({
          tenant_id: currentTenant!.id,
          name: newName.trim(),
          category_type: newType,
          sort_order: categories.filter((c: any) => c.category_type === newType).length,
        });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Category added");
      setNewName("");
      queryClient.invalidateQueries({ queryKey: ["budget_categories"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any)
        .from("budget_categories")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Category removed");
      queryClient.invalidateQueries({ queryKey: ["budget_categories"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const seedDefaults = useMutation({
    mutationFn: async () => {
      const defaults = [
        { name: "Salary / Wages", category_type: "income", sort_order: 0 },
        { name: "Investment Income", category_type: "income", sort_order: 1 },
        { name: "Rental Income", category_type: "income", sort_order: 2 },
        { name: "Other Income", category_type: "income", sort_order: 3 },
        { name: "Rent / Bond", category_type: "expense", sort_order: 0 },
        { name: "Food / Groceries", category_type: "expense", sort_order: 1 },
        { name: "Transport / Fuel", category_type: "expense", sort_order: 2 },
        { name: "Utilities (Water, Electricity)", category_type: "expense", sort_order: 3 },
        { name: "Insurance", category_type: "expense", sort_order: 4 },
        { name: "Medical Aid", category_type: "expense", sort_order: 5 },
        { name: "School / Education", category_type: "expense", sort_order: 6 },
        { name: "Telephone / Internet", category_type: "expense", sort_order: 7 },
        { name: "Clothing", category_type: "expense", sort_order: 8 },
        { name: "Entertainment", category_type: "expense", sort_order: 9 },
        { name: "Existing Loan Repayments", category_type: "expense", sort_order: 10 },
        { name: "Other Expenses", category_type: "expense", sort_order: 11 },
      ];
      const rows = defaults.map((d) => ({ ...d, tenant_id: currentTenant!.id }));
      const { error } = await (supabase as any).from("budget_categories").insert(rows);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Default categories created");
      queryClient.invalidateQueries({ queryKey: ["budget_categories"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  if (isLoading) return <div className="flex justify-center p-12"><Loader2 className="h-6 w-6 animate-spin" /></div>;

  const incomeCategories = categories.filter((c: any) => c.category_type === "income");
  const expenseCategories = categories.filter((c: any) => c.category_type === "expense");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <ClipboardList className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Budget Categories</h1>
            <p className="text-sm text-muted-foreground">Configure income and expense items for loan affordability assessments</p>
          </div>
        </div>
        {categories.length === 0 && (
          <Button variant="outline" onClick={() => seedDefaults.mutate()} disabled={seedDefaults.isPending}>
            {seedDefaults.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            Seed Default Categories
          </Button>
        )}
      </div>

      {/* Add new */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex gap-3 items-end">
            <div className="flex-1 space-y-1">
              <label className="text-xs font-medium">Category Name</label>
              <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. Medical Aid" />
            </div>
            <div className="w-40 space-y-1">
              <label className="text-xs font-medium">Type</label>
              <Select value={newType} onValueChange={(v: any) => setNewType(v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="income">Income</SelectItem>
                  <SelectItem value="expense">Expense</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button onClick={() => addMutation.mutate()} disabled={addMutation.isPending || !newName.trim()}>
              <Plus className="h-4 w-4 mr-1" /> Add
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Income */}
        <Card>
          <CardHeader><CardTitle className="text-base text-emerald-600">Income Sources</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead className="w-16"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {incomeCategories.map((c: any) => (
                  <TableRow key={c.id}>
                    <TableCell className="text-sm">{c.name}</TableCell>
                    <TableCell>
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => deleteMutation.mutate(c.id)}>
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {incomeCategories.length === 0 && (
                  <TableRow><TableCell colSpan={2} className="text-center text-muted-foreground text-sm">No income categories</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Expenses */}
        <Card>
          <CardHeader><CardTitle className="text-base text-red-600">Expense Items</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead className="w-16"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {expenseCategories.map((c: any) => (
                  <TableRow key={c.id}>
                    <TableCell className="text-sm">{c.name}</TableCell>
                    <TableCell>
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => deleteMutation.mutate(c.id)}>
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {expenseCategories.length === 0 && (
                  <TableRow><TableCell colSpan={2} className="text-center text-muted-foreground text-sm">No expense categories</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default BudgetCategories;
