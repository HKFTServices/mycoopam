import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/contexts/TenantContext";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Archive, AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import { MobileTableHint } from "@/components/ui/mobile-table-hint";
import { toast } from "sonner";

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
  bankflow: string | null;
  gl_account_id: string | null;
  created_at: string;
  updated_at: string;
};

type GlAccount = { id: string; code: string; name: string; gl_type: string };
type ControlAccount = { id: string; name: string };
type TaxType = { id: string; name: string; percentage: number };

type LegacyEntry = {
  legacy_id: string;
  tx_date: string;
  debit: number;
  credit: number;
  description: string | null;
  type_tx_id: string | null;
  parent_id: string | null;
  entity_name: string | null;
};

const IncomeExpenseItems = () => {
  const { currentTenant } = useTenant();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [filterRecurrence, setFilterRecurrence] = useState<string>("all");
  const [tab, setTab] = useState("items");

  // GL selections per item (item.id → gl_account_id)
  const [glSelections, setGlSelections] = useState<Record<string, string>>({});
  // GL selections per legacy entry (legacy_id → gl_account_id)
  const [legacyGlSelections, setLegacyGlSelections] = useState<Record<string, string>>({});
  const [selectedLegacy, setSelectedLegacy] = useState<Set<string>>(new Set());

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

  const { data: glAccounts = [] } = useQuery({
    queryKey: ["gl_accounts_ie", currentTenant?.id],
    queryFn: async () => {
      if (!currentTenant) return [];
      const { data, error } = await (supabase as any)
        .from("gl_accounts").select("id, code, name, gl_type")
        .eq("tenant_id", currentTenant.id)
        .eq("is_active", true)
        .order("code");
      if (error) throw error;
      return data as GlAccount[];
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
    queryKey: ["tax_types_list", currentTenant?.id],
    queryFn: async () => {
      if (!currentTenant) return [];
      const { data, error } = await (supabase as any)
        .from("tax_types").select("id, name, percentage")
        .eq("tenant_id", currentTenant!.id)
        .order("name");
      if (error) throw error;
      return data as TaxType[];
    },
    enabled: !!currentTenant,
  });

  // Legacy unposted entries (type 1988 = income/expense CFT entries)
  const { data: legacyEntries = [], isLoading: legacyLoading } = useQuery({
    queryKey: ["legacy_ie_entries", currentTenant?.id],
    queryFn: async () => {
      if (!currentTenant) return [];

      // Fetch all legacy CFT entries
      const { data, error } = await (supabase as any)
        .from("legacy_id_mappings")
        .select("legacy_id, notes, new_id")
        .eq("table_name", "cashflow_transactions")
        .eq("tenant_id", currentTenant.id)
        .order("legacy_id");
      if (error) throw error;

      // Fetch income_expense_items legacy mappings to resolve IncExpID → item
      const { data: ieMappings } = await (supabase as any)
        .from("legacy_id_mappings")
        .select("legacy_id, new_id")
        .eq("table_name", "income_expense_items")
        .eq("tenant_id", currentTenant.id);
      const ieMap = new Map<string, string>();
      (ieMappings || []).forEach((m: any) => ieMap.set(m.legacy_id, m.new_id));

      // Filter to type 1988 entries (income/expense transactions)
      const entries: any[] = data || [];
      const type1988 = entries.filter((e: any) => {
        try {
          const n = JSON.parse(e.notes);
          return n.Type_TransactionEntryID === "1988";
        } catch { return false; }
      });

      // Check which have active CFT entries (already posted)
      const newIds = type1988.map((e: any) => e.new_id).filter(Boolean);
      let activeIds = new Set<string>();
      if (newIds.length > 0) {
        for (let i = 0; i < newIds.length; i += 50) {
          const batch = newIds.slice(i, i + 50);
          const { data: activeCfts } = await (supabase as any)
            .from("cashflow_transactions")
            .select("id")
            .in("id", batch)
            .eq("is_active", true);
          if (activeCfts) activeCfts.forEach((c: any) => activeIds.add(c.id));
        }
      }

      return type1988
        .filter((e: any) => !activeIds.has(e.new_id))
        .map((e: any) => {
          const n = JSON.parse(e.notes);
          const incExpId = n.IncExpID || null;
          const ieItemId = incExpId ? ieMap.get(incExpId) || null : null;
          return {
            legacy_id: e.legacy_id,
            tx_date: n.TransactionDate?.split(" ")[0] || "",
            debit: parseFloat(n.Debit || "0"),
            credit: parseFloat(n.Credit || "0"),
            description: n.Description || null,
            type_tx_id: n.Type_TransactionID || null,
            parent_id: n.ParentID || null,
            entity_name: null,
            is_bank: n.IsBank === "1" || n.IsBank === 1,
            inc_exp_item_id: ieItemId,
          } as LegacyEntry;
        })
        .sort((a: LegacyEntry, b: LegacyEntry) => a.tx_date.localeCompare(b.tx_date));
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

  const incomeGlAccounts = useMemo(() => glAccounts.filter(g => g.gl_type === "income" || g.gl_type === "expense"), [glAccounts]);

  // Save GL account selection on an item
  const saveGlMutation = useMutation({
    mutationFn: async ({ itemId, glAccountId }: { itemId: string; glAccountId: string }) => {
      const { error } = await (supabase as any)
        .from("income_expense_items")
        .update({ gl_account_id: glAccountId })
        .eq("id", itemId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["income_expense_items"] });
      toast.success("GL account saved");
    },
    onError: (e: any) => toast.error("Failed to save: " + e.message),
  });

  // Post selected legacy entries
  const [posting, setPosting] = useState(false);
  const postLegacyEntries = async () => {
    if (selectedLegacy.size === 0) {
      toast.error("No entries selected");
      return;
    }
    const unassigned = [...selectedLegacy].filter(id => !legacyGlSelections[id]);
    if (unassigned.length > 0) {
      toast.error(`${unassigned.length} selected entries have no GL account assigned`);
      return;
    }

    setPosting(true);
    try {
      const bankGl = glAccounts.find(g => g.code === "1000");
      if (!bankGl) throw new Error("Bank GL account (1000) not found");

      const entries = legacyEntries.filter(e => selectedLegacy.has(e.legacy_id));
      const rows: any[] = [];

      for (const entry of entries) {
        const glId = legacyGlSelections[entry.legacy_id];
        const isIncome = entry.credit > 0;
        const amount = isIncome ? entry.credit : entry.debit;

        // Bank entry
        rows.push({
          tenant_id: currentTenant!.id,
          transaction_date: entry.tx_date,
          gl_account_id: bankGl.id,
          entry_type: isIncome ? "bank_receipt" : "bank_payment",
          debit: isIncome ? amount : 0,
          credit: isIncome ? 0 : amount,
          is_bank: true,
          description: `Legacy I/E BK#${entry.legacy_id}`,
          legacy_transaction_id: entry.legacy_id,
          status: "approved",
          is_active: true,
        });

        // Contra GL entry
        rows.push({
          tenant_id: currentTenant!.id,
          transaction_date: entry.tx_date,
          gl_account_id: glId,
          entry_type: "income_expense",
          debit: isIncome ? 0 : amount,
          credit: isIncome ? amount : 0,
          is_bank: false,
          description: `Legacy I/E BK#${entry.legacy_id}`,
          legacy_transaction_id: entry.legacy_id,
          status: "approved",
          is_active: true,
        });
      }

      // Insert in batches of 100
      for (let i = 0; i < rows.length; i += 100) {
        const batch = rows.slice(i, i + 100);
        const { error } = await (supabase as any)
          .from("cashflow_transactions")
          .insert(batch);
        if (error) throw error;
      }

      toast.success(`Posted ${entries.length} entries (${rows.length} CFT rows)`);
      setSelectedLegacy(new Set());
      setLegacyGlSelections({});
      queryClient.invalidateQueries({ queryKey: ["legacy_ie_entries"] });
    } catch (e: any) {
      toast.error("Post failed: " + e.message);
    } finally {
      setPosting(false);
    }
  };

  const toggleSelectAll = () => {
    if (selectedLegacy.size === legacyEntries.length) {
      setSelectedLegacy(new Set());
    } else {
      setSelectedLegacy(new Set(legacyEntries.map(e => e.legacy_id)));
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedLegacy(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const bulkAssignGl = (glId: string) => {
    const updates: Record<string, string> = {};
    selectedLegacy.forEach(id => { updates[id] = glId; });
    setLegacyGlSelections(prev => ({ ...prev, ...updates }));
    toast.success(`Assigned GL to ${selectedLegacy.size} entries`);
  };

  return (
    <div className="space-y-4 sm:space-y-6 animate-fade-in">
      <div className="flex items-center gap-3">
        <Archive className="h-6 w-6 sm:h-8 sm:w-8 text-muted-foreground shrink-0" />
        <div>
          <h1 className="text-lg sm:text-2xl font-bold tracking-tight">Income / Expense Items</h1>
          <p className="text-muted-foreground text-xs sm:text-sm mt-0.5">
            Manage GL allocations and post legacy income/expense entries.
          </p>
        </div>
      </div>

      <MobileTableHint />

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="items">Item Templates ({items.length})</TabsTrigger>
          <TabsTrigger value="legacy">
            Unposted Legacy Entries
            {legacyEntries.length > 0 && (
              <Badge variant="destructive" className="ml-2">{legacyEntries.length}</Badge>
            )}
          </TabsTrigger>
        </TabsList>

        {/* ── Item Templates Tab ── */}
        <TabsContent value="items" className="space-y-4">
          <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30 p-3">
            <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
            <p className="text-sm text-amber-700 dark:text-amber-400">
              Assign a GL account to each item template. Items with <strong>Bank = Yes</strong> will generate a bank entry when posted.
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
                    <TableHead>Bank</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead className="min-w-[220px]">GL Account</TableHead>
                    <TableHead>Active</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Loading…</TableCell></TableRow>
                  ) : filtered.length === 0 ? (
                    <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No items found.</TableCell></TableRow>
                  ) : (
                    filtered.map((item) => {
                      const currentGl = glSelections[item.id] || item.gl_account_id || "";
                      const glMatch = glAccounts.find(g => g.id === currentGl);
                      return (
                        <TableRow key={item.id} className={!item.is_active ? "opacity-50" : ""}>
                          <TableCell className="font-medium font-mono text-xs">{item.item_code}</TableCell>
                          <TableCell className="text-xs">{item.description}</TableCell>
                          <TableCell>
                            <Badge variant={item.recurrence_type === "monthly" ? "default" : "secondary"} className="text-xs">
                              {item.recurrence_type === "monthly" ? "Monthly" : "Ad-hoc"}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge variant={item.bankflow === "1" ? "default" : "secondary"} className="text-xs">
                              {item.bankflow === "1" ? "Yes" : "No"}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs">{item.amount ? item.amount.toFixed(2) : "—"}</TableCell>
                          <TableCell>
                            <Select
                              value={currentGl || "unset"}
                              onValueChange={(val) => {
                                if (val === "unset") return;
                                setGlSelections(prev => ({ ...prev, [item.id]: val }));
                                saveGlMutation.mutate({ itemId: item.id, glAccountId: val });
                              }}
                            >
                              <SelectTrigger className="h-8 text-xs w-full">
                                <SelectValue placeholder="Select GL…">
                                  {glMatch ? `${glMatch.code} – ${glMatch.name}` : "Select GL…"}
                                </SelectValue>
                              </SelectTrigger>
                              <SelectContent>
                                {incomeGlAccounts.map(gl => (
                                  <SelectItem key={gl.id} value={gl.id} className="text-xs">
                                    {gl.code} – {gl.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell>
                            <Badge variant={item.is_active ? "default" : "secondary"} className="text-xs">
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
        </TabsContent>

        {/* ── Unposted Legacy Entries Tab ── */}
        <TabsContent value="legacy" className="space-y-4">
          <div className="flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/30 p-3">
            <AlertTriangle className="h-4 w-4 text-blue-600 shrink-0" />
            <p className="text-sm text-blue-700 dark:text-blue-400">
              These are legacy income/expense transactions that have not yet been posted to the General Ledger. 
              Select a GL account for each, then post. Entries with credits are <strong>Income</strong>, debits are <strong>Expenses</strong>.
              Each will create a bank entry (GL 1000) and a contra GL entry.
            </p>
          </div>

          {legacyEntries.length > 0 && (
            <div className="flex flex-wrap gap-2 items-center">
              <Button variant="outline" size="sm" onClick={toggleSelectAll}>
                {selectedLegacy.size === legacyEntries.length ? "Deselect All" : "Select All"}
              </Button>
              {selectedLegacy.size > 0 && (
                <>
                  <span className="text-sm text-muted-foreground">{selectedLegacy.size} selected —</span>
                  <Select onValueChange={bulkAssignGl}>
                    <SelectTrigger className="h-8 text-xs w-[240px]">
                      <SelectValue placeholder="Bulk assign GL…" />
                    </SelectTrigger>
                    <SelectContent>
                      {incomeGlAccounts.map(gl => (
                        <SelectItem key={gl.id} value={gl.id} className="text-xs">
                          {gl.code} – {gl.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button size="sm" onClick={postLegacyEntries} disabled={posting}>
                    {posting ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <CheckCircle2 className="h-4 w-4 mr-1" />}
                    Post Selected
                  </Button>
                </>
              )}
            </div>
          )}

          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">✓</TableHead>
                    <TableHead>BK#</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className="text-right">Debit</TableHead>
                    <TableHead className="text-right">Credit</TableHead>
                    <TableHead className="min-w-[220px]">GL Account</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {legacyLoading ? (
                    <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Loading…</TableCell></TableRow>
                  ) : legacyEntries.length === 0 ? (
                    <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      <CheckCircle2 className="h-5 w-5 inline mr-2 text-green-500" />
                      All legacy income/expense entries have been posted.
                    </TableCell></TableRow>
                  ) : (
                    legacyEntries.map((entry) => {
                      const isIncome = entry.credit > 0;
                      const currentGl = legacyGlSelections[entry.legacy_id] || "";
                      const glMatch = glAccounts.find(g => g.id === currentGl);
                      return (
                        <TableRow key={entry.legacy_id} className={selectedLegacy.has(entry.legacy_id) ? "bg-accent/50" : ""}>
                          <TableCell>
                            <input
                              type="checkbox"
                              checked={selectedLegacy.has(entry.legacy_id)}
                              onChange={() => toggleSelect(entry.legacy_id)}
                              className="h-4 w-4"
                            />
                          </TableCell>
                          <TableCell className="font-mono text-xs">{entry.legacy_id}</TableCell>
                          <TableCell className="text-xs">{entry.tx_date?.split("T")[0]}</TableCell>
                          <TableCell>
                            <Badge variant={isIncome ? "default" : "secondary"} className="text-xs">
                              {isIncome ? "Income" : "Expense"}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right text-xs font-mono">
                            {entry.debit > 0 ? entry.debit.toFixed(2) : "—"}
                          </TableCell>
                          <TableCell className="text-right text-xs font-mono">
                            {entry.credit > 0 ? entry.credit.toFixed(2) : "—"}
                          </TableCell>
                          <TableCell>
                            <Select
                              value={currentGl || "unset"}
                              onValueChange={(val) => {
                                if (val === "unset") return;
                                setLegacyGlSelections(prev => ({ ...prev, [entry.legacy_id]: val }));
                              }}
                            >
                              <SelectTrigger className="h-8 text-xs w-full">
                                <SelectValue placeholder="Select GL…">
                                  {glMatch ? `${glMatch.code} – ${glMatch.name}` : "Select GL…"}
                                </SelectValue>
                              </SelectTrigger>
                              <SelectContent>
                                {incomeGlAccounts.map(gl => (
                                  <SelectItem key={gl.id} value={gl.id} className="text-xs">
                                    {gl.code} – {gl.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {legacyEntries.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Summary</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">Total Entries</p>
                  <p className="font-bold">{legacyEntries.length}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Income (Credits)</p>
                  <p className="font-bold text-green-600">
                    R {legacyEntries.filter(e => e.credit > 0).reduce((s, e) => s + e.credit, 0).toFixed(2)}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">Expenses (Debits)</p>
                  <p className="font-bold text-red-600">
                    R {legacyEntries.filter(e => e.debit > 0).reduce((s, e) => s + e.debit, 0).toFixed(2)}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">GL Assigned</p>
                  <p className="font-bold">
                    {Object.keys(legacyGlSelections).length} / {legacyEntries.length}
                  </p>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default IncomeExpenseItems;
