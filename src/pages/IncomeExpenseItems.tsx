import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/contexts/TenantContext";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Archive, AlertTriangle } from "lucide-react";
import { MobileTableHint } from "@/components/ui/mobile-table-hint";

type IncomeExpenseItem = {
  id: string;
  tenant_id: string;
  item_code: string;
  description: string;
  recurrence_type: string;
  debit_control_account_id: string | null;
  credit_control_account_id: string | null;
  amount: number;
  percentage: number;
  tax_type_id: string | null;
  is_active: boolean;
  is_deleted: boolean;
  created_at: string;
  updated_at: string;
};

type ControlAccount = { id: string; name: string };
type TaxType = { id: string; name: string; percentage: number };

const IncomeExpenseItems = () => {
  const { currentTenant } = useTenant();
  const [search, setSearch] = useState("");
  const [filterRecurrence, setFilterRecurrence] = useState<string>("all");

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["income_expense_items", currentTenant?.id],
    queryFn: async () => {
      if (!currentTenant) return [];
      const { data, error } = await (supabase as any)
        .from("income_expense_items").select("*")
        .eq("tenant_id", currentTenant.id)
        .eq("is_deleted", false)
        .order("item_code");
      if (error) throw error;
      return data as IncomeExpenseItem[];
    },
    enabled: !!currentTenant,
  });

  const { data: controlAccounts = [] } = useQuery({
    queryKey: ["control_accounts_list", currentTenant?.id],
    queryFn: async () => {
      if (!currentTenant) return [];
      const { data, error } = await (supabase as any)
        .from("control_accounts").select("id, name")
        .eq("tenant_id", currentTenant.id).order("name");
      if (error) throw error;
      return data as ControlAccount[];
    },
    enabled: !!currentTenant,
  });

  const { data: taxTypes = [] } = useQuery({
    queryKey: ["tax_types_list"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("tax_types").select("id, name, percentage")
        .order("name");
      if (error) throw error;
      return data as TaxType[];
    },
    enabled: !!currentTenant,
  });

  const caMap = Object.fromEntries(controlAccounts.map((ca) => [ca.id, ca.name]));

  const filtered = items.filter((i) => {
    const matchSearch = i.item_code.toLowerCase().includes(search.toLowerCase()) ||
      i.description.toLowerCase().includes(search.toLowerCase());
    const matchRecurrence = filterRecurrence === "all" || i.recurrence_type === filterRecurrence;
    return matchSearch && matchRecurrence;
  });

  return (
    <div className="space-y-4 sm:space-y-6 animate-fade-in">
      <div className="flex items-center gap-3">
        <Archive className="h-6 w-6 sm:h-8 sm:w-8 text-muted-foreground shrink-0" />
        <div>
          <h1 className="text-lg sm:text-2xl font-bold tracking-tight">Income / Expense Items</h1>
          <p className="text-muted-foreground text-xs sm:text-sm mt-0.5">
            Read-only view of historical accounting rules.
          </p>
        </div>
      </div>

      <MobileTableHint />

      <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30 p-3">
        <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
        <p className="text-sm text-amber-700 dark:text-amber-400">
          This table is preserved for historical reporting. All new operating transactions should be posted through the <strong>Operating Journals</strong> page.
        </p>
      </div>

      <div className="flex gap-3 items-center flex-wrap max-w-3xl">
        <Input placeholder="Search items..." value={search} onChange={(e) => setSearch(e.target.value)} className="flex-1 min-w-[200px]" />
        <Select value={filterRecurrence} onValueChange={setFilterRecurrence}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="All Types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="monthly">Monthly</SelectItem>
            <SelectItem value="ad_hoc">Ad-hoc</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Code</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Recurrence</TableHead>
                <TableHead>Debit Account</TableHead>
                <TableHead>Credit Account</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>%</TableHead>
                <TableHead>Tax Type</TableHead>
                <TableHead>Active</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">Loading…</TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">No items found.</TableCell></TableRow>
              ) : (
                filtered.map((item) => {
                  const taxType = taxTypes.find((t) => t.id === item.tax_type_id);
                  return (
                    <TableRow key={item.id} className={!item.is_active ? "opacity-50" : ""}>
                      <TableCell className="font-medium font-mono">{item.item_code}</TableCell>
                      <TableCell>{item.description}</TableCell>
                      <TableCell>
                        <Badge variant={item.recurrence_type === "monthly" ? "default" : "secondary"}>
                          {item.recurrence_type === "monthly" ? "Monthly" : "Ad-hoc"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs">{caMap[item.debit_control_account_id ?? ""] ?? "—"}</TableCell>
                      <TableCell className="text-xs">{caMap[item.credit_control_account_id ?? ""] ?? "—"}</TableCell>
                      <TableCell>{item.amount ? item.amount.toFixed(2) : "—"}</TableCell>
                      <TableCell>{item.percentage ? `${item.percentage}%` : "—"}</TableCell>
                      <TableCell className="text-xs">{taxType ? `${taxType.name} (${taxType.percentage}%)` : "—"}</TableCell>
                      <TableCell>
                        <Badge variant={item.is_active ? "default" : "secondary"}>
                          {item.is_active ? "Yes" : "No"}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};

export default IncomeExpenseItems;
