import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/contexts/TenantContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, CheckCircle2, XCircle, ChevronDown, ChevronRight, Eye, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { formatCurrency } from "@/lib/formatCurrency";

interface LegacyCftEntry {
  id: string;
  cft_id: string;
  parent_id: string;
  entry_type_id: string;
  tx_type_id: string;
  entity_id: string;
  cash_account_id: string;
  debit: number;
  credit: number;
  is_bank: boolean;
  transaction_date: string;
  description: string;
}

interface GlMapping {
  entry_type_id: string;
  entry_type_name: string;
  gl_account_id: string | null;
  gl_account_code?: string;
  gl_account_name?: string;
  split_rule: any;
  notes: string | null;
}

interface ControlAccountMap {
  legacy_id: string;
  new_id: string;
  name: string;
  pool_name: string | null;
}

const TRANSACTION_TYPES = [
  { id: "1912", name: "Deposit Funds" },
  { id: "1945", name: "Withdrawal" },
  { id: "1953", name: "Stock Purchase" },
  { id: "1954", name: "Stock Sale" },
  { id: "1952", name: "Income Expense" },
  { id: "1959", name: "Loan (Payout)" },
  { id: "1960", name: "Grant" },
  { id: "1915", name: "Switching" },
  { id: "1914", name: "Transfer" },
  { id: "1916", name: "Deposit Metal" },
];

const LegacyGlAllocation = () => {
  const { currentTenant } = useTenant();
  const [selectedTxType, setSelectedTxType] = useState("1912");
  const [expandedParents, setExpandedParents] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [cftEntries, setCftEntries] = useState<LegacyCftEntry[]>([]);

  // Fetch GL mappings for selected transaction type
  const { data: glMappings } = useQuery({
    queryKey: ["legacy-gl-mappings", currentTenant?.id, selectedTxType],
    queryFn: async () => {
      if (!currentTenant) return [];
      const { data } = await supabase
        .from("legacy_gl_mappings")
        .select("entry_type_id, entry_type_name, gl_account_id, split_rule, notes")
        .eq("tenant_id", currentTenant.id)
        .eq("transaction_type_id", selectedTxType);

      if (!data?.length) return [];

      // Get GL account details
      const glIds = data.filter(d => d.gl_account_id).map(d => d.gl_account_id!);
      const { data: glAccounts } = await supabase
        .from("gl_accounts")
        .select("id, code, name")
        .in("id", glIds);

      const glMap = Object.fromEntries((glAccounts ?? []).map(g => [g.id, g]));

      return data.map(d => ({
        ...d,
        gl_account_code: d.gl_account_id ? glMap[d.gl_account_id]?.code : undefined,
        gl_account_name: d.gl_account_id ? glMap[d.gl_account_id]?.name : undefined,
      })) as GlMapping[];
    },
    enabled: !!currentTenant,
  });

  // Fetch control account mappings
  const { data: controlAccounts } = useQuery({
    queryKey: ["legacy-control-accounts", currentTenant?.id],
    queryFn: async () => {
      if (!currentTenant) return [];
      const { data: mappings } = await supabase
        .from("legacy_id_mappings")
        .select("legacy_id, new_id")
        .eq("table_name", "control_accounts")
        .eq("tenant_id", currentTenant.id);

      if (!mappings?.length) return [];

      const caIds = mappings.map(m => m.new_id);
      const { data: cas } = await supabase
        .from("control_accounts")
        .select("id, name, pool_id, pools(name)")
        .in("id", caIds);

      const caMap = Object.fromEntries((cas ?? []).map((c: any) => [c.id, c]));

      return mappings.map(m => ({
        legacy_id: m.legacy_id,
        new_id: m.new_id,
        name: caMap[m.new_id]?.name ?? "Unknown",
        pool_name: caMap[m.new_id]?.pools?.name ?? null,
      })) as ControlAccountMap[];
    },
    enabled: !!currentTenant,
  });

  // Fetch entity account mappings for resolving EntityID
  const { data: entityAccountMap } = useQuery({
    queryKey: ["entity-accounts-map", currentTenant?.id],
    queryFn: async () => {
      if (!currentTenant) return {};
      const { data } = await supabase
        .from("entity_accounts")
        .select("client_account_id, account_number, entity_id, entities(name, last_name)")
        .eq("tenant_id", currentTenant.id)
        .not("client_account_id", "is", null);

      return Object.fromEntries(
        (data ?? []).map((ea: any) => [
          String(ea.client_account_id),
          {
            account_number: ea.account_number,
            entity_name: [ea.entities?.name, ea.entities?.last_name].filter(Boolean).join(" "),
          },
        ])
      );
    },
    enabled: !!currentTenant,
  });

  const loadTransactions = async () => {
    if (!currentTenant) return;
    setLoading(true);
    try {
      // Fetch ALL cashflow_transactions with pagination to avoid the 1000-row default limit
      let allRows: { legacy_id: string; notes: string | null }[] = [];
      const PAGE_SIZE = 1000;
      let from = 0;
      let hasMore = true;

      while (hasMore) {
        const { data: page, error } = await supabase
          .from("legacy_id_mappings")
          .select("legacy_id, notes")
          .eq("table_name", "cashflow_transactions")
          .eq("tenant_id", currentTenant.id)
          .like("notes", `%"Type_TransactionID":"${selectedTxType}"%`)
          .range(from, from + PAGE_SIZE - 1);

        if (error) throw error;
        allRows = allRows.concat(page ?? []);
        hasMore = (page?.length ?? 0) === PAGE_SIZE;
        from += PAGE_SIZE;
      }

      const fromDate = new Date("2025-03-01");
      const entries: LegacyCftEntry[] = [];
      const rootCftIds: string[] = [];

      for (const row of allRows) {
        try {
          const n = JSON.parse(row.notes ?? "{}");
          const txDate = new Date(n.TransactionDate);
          if (txDate < fromDate) continue;

          entries.push({
            id: row.legacy_id,
            cft_id: n.ID,
            parent_id: n.ParentID ?? "0",
            entry_type_id: n.Type_TransactionEntryID ?? "0",
            tx_type_id: n.Type_TransactionID ?? "0",
            entity_id: n.EntityID ?? "0",
            cash_account_id: n.CashAccountID ?? "0",
            debit: parseFloat(n.Debit) || 0,
            credit: parseFloat(n.Credit) || 0,
            is_bank: n.IsBank === "1",
            transaction_date: n.TransactionDate?.split("T")[0] ?? n.TransactionDate?.split(" ")[0] ?? "",
            description: "",
          });

          if (n.ParentID === "0") {
            rootCftIds.push(n.ID);
          }
        } catch {}
      }

      // Now fetch child entries that belong to root transactions but have different Type_TransactionID
      if (rootCftIds.length > 0) {
        // Fetch children — they reference ParentID matching our roots
        let childRows: { legacy_id: string; notes: string | null }[] = [];
        let childFrom = 0;
        let childHasMore = true;

        while (childHasMore) {
          const { data: childPage, error: childErr } = await supabase
            .from("legacy_id_mappings")
            .select("legacy_id, notes")
            .eq("table_name", "cashflow_transactions")
            .eq("tenant_id", currentTenant.id)
            .not("notes", "like", `%"ParentID":"0"%`)
            .range(childFrom, childFrom + PAGE_SIZE - 1);

          if (childErr) throw childErr;
          childRows = childRows.concat(childPage ?? []);
          childHasMore = (childPage?.length ?? 0) === PAGE_SIZE;
          childFrom += PAGE_SIZE;
        }

        const existingCftIds = new Set(entries.map(e => e.cft_id));
        const rootIdSet = new Set(rootCftIds);

        for (const row of childRows) {
          try {
            const n = JSON.parse(row.notes ?? "{}");
            if (rootIdSet.has(n.ParentID) && !existingCftIds.has(n.ID)) {
              entries.push({
                id: row.legacy_id,
                cft_id: n.ID,
                parent_id: n.ParentID,
                entry_type_id: n.Type_TransactionEntryID ?? "0",
                tx_type_id: n.Type_TransactionID ?? "0",
                entity_id: n.EntityID ?? "0",
                cash_account_id: n.CashAccountID ?? "0",
                debit: parseFloat(n.Debit) || 0,
                credit: parseFloat(n.Credit) || 0,
                is_bank: n.IsBank === "1",
                transaction_date: n.TransactionDate?.split("T")[0] ?? n.TransactionDate?.split(" ")[0] ?? "",
                description: "",
              });
            }
          } catch {}
        }
      }

      setCftEntries(entries);
      toast.success(`Loaded ${entries.length} entries from 1 Mar 2025`);
    } catch (err: any) {
      toast.error("Failed to load: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  // Group entries by parent
  const grouped = useMemo(() => {
    const roots = cftEntries.filter(e => e.parent_id === "0");
    const children = cftEntries.filter(e => e.parent_id !== "0");

    const groups: { root: LegacyCftEntry; children: LegacyCftEntry[] }[] = [];
    for (const root of roots) {
      groups.push({
        root,
        children: children
          .filter(c => c.parent_id === root.cft_id)
          .sort((a, b) => parseInt(a.cft_id) - parseInt(b.cft_id)),
      });
    }
    return groups.sort((a, b) => a.root.transaction_date.localeCompare(b.root.transaction_date));
  }, [cftEntries]);

  const toggleParent = (parentId: string) => {
    setExpandedParents(prev => {
      const next = new Set(prev);
      next.has(parentId) ? next.delete(parentId) : next.add(parentId);
      return next;
    });
  };

  const expandAll = () => {
    setExpandedParents(new Set(grouped.map(g => g.root.cft_id)));
  };

  const getGlMapping = (entryTypeId: string): GlMapping | undefined => {
    return glMappings?.find(m => m.entry_type_id === entryTypeId);
  };

  const getControlAccountName = (cashAccountId: string): string => {
    if (cashAccountId === "0") return "—";
    const ca = controlAccounts?.find(c => c.legacy_id === cashAccountId);
    return ca ? `${ca.name}${ca.pool_name ? ` (${ca.pool_name})` : ""}` : `CA#${cashAccountId}`;
  };

  const getEntityName = (entityId: string): string => {
    if (entityId === "0") return "—";
    const ea = entityAccountMap?.[entityId];
    return ea ? `${ea.entity_name} (${ea.account_number})` : `Entity#${entityId}`;
  };

  const getGlLabel = (entry: LegacyCftEntry): { label: string; mapped: boolean } => {
    const mapping = getGlMapping(entry.entry_type_id);
    if (!mapping) return { label: "❌ No mapping", mapped: false };
    
    if (mapping.split_rule) {
      const splits = mapping.split_rule.splits;
      if (splits) {
        return {
          label: splits.map((s: any) => s.description).join(" + "),
          mapped: true,
        };
      }
    }

    if (mapping.entry_type_id === "1924") {
      // Cash control - resolve via CashAccountID
      return { label: `→ ${getControlAccountName(entry.cash_account_id)}`, mapped: true };
    }

    if (mapping.gl_account_code) {
      return { label: `${mapping.gl_account_code} ${mapping.gl_account_name}`, mapped: true };
    }

    return { label: "⚠️ GL not set", mapped: false };
  };

  const selectedTypeName = TRANSACTION_TYPES.find(t => t.id === selectedTxType)?.name ?? selectedTxType;
  const mappedCount = glMappings?.length ?? 0;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Legacy GL Allocation</CardTitle>
          <CardDescription>
            Browse legacy CFT transactions from <strong>1 Mar 2025</strong> onwards and verify GL account mappings.
            Select a transaction type, load entries, and review the allocation per leg.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-3 items-end">
            <div className="space-y-1">
              <label className="text-sm font-medium">Transaction Type</label>
              <Select value={selectedTxType} onValueChange={v => { setSelectedTxType(v); setCftEntries([]); }}>
                <SelectTrigger className="w-[250px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TRANSACTION_TYPES.map(t => (
                    <SelectItem key={t.id} value={t.id}>{t.name} ({t.id})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={loadTransactions} disabled={loading || !currentTenant} className="gap-2">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />}
              Load Transactions
            </Button>
            {grouped.length > 0 && (
              <Button variant="outline" size="sm" onClick={expandAll}>
                Expand All ({grouped.length})
              </Button>
            )}
          </div>

          {/* Mapping summary */}
          {mappedCount > 0 && (
            <div className="rounded-md border p-3 bg-muted/50">
              <p className="text-sm font-medium mb-2">GL Mappings for {selectedTypeName}:</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {glMappings?.map(m => (
                  <div key={m.entry_type_id} className="text-xs flex items-center gap-2">
                    <Badge variant="secondary" className="font-mono">{m.entry_type_id}</Badge>
                    <span className="font-medium">{m.entry_type_name}</span>
                    <span className="text-muted-foreground">
                      → {m.gl_account_code ? `${m.gl_account_code} ${m.gl_account_name}` :
                         m.split_rule ? "Split rule" :
                         m.notes?.includes("CashAccountID") ? "Via Control Acct" : "—"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {mappedCount === 0 && !loading && (
            <div className="rounded-md border border-destructive/50 p-3 bg-destructive/5">
              <p className="text-sm text-destructive">No GL mappings configured for {selectedTypeName}. Set up mappings before allocating.</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Transaction groups */}
      {grouped.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center justify-between">
              <span>{selectedTypeName} — {grouped.length} transactions from 1 Mar 2025</span>
              <div className="flex gap-2">
                {(() => {
                  const balanced = grouped.filter(g => {
                    const allEntries = [g.root, ...g.children];
                    const d = allEntries.reduce((s, e) => s + e.debit, 0);
                    const c = allEntries.reduce((s, e) => s + e.credit, 0);
                    return Math.abs(d - c) < 0.01;
                  }).length;
                  const unbalanced = grouped.length - balanced;
                  return (
                    <>
                      <Badge variant="outline" className="gap-1">
                        <CheckCircle2 className="h-3 w-3 text-green-600" /> {balanced} balanced
                      </Badge>
                      {unbalanced > 0 && (
                        <Badge variant="destructive" className="gap-1">
                          <AlertTriangle className="h-3 w-3" /> {unbalanced} unbalanced
                        </Badge>
                      )}
                      <Badge variant="outline">{cftEntries.length} total legs</Badge>
                    </>
                  );
                })()}
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8"></TableHead>
                    <TableHead className="text-xs">CFT ID</TableHead>
                    <TableHead className="text-xs">Date</TableHead>
                    <TableHead className="text-xs">Entry Type</TableHead>
                    <TableHead className="text-xs">Entity</TableHead>
                    <TableHead className="text-xs">Control Account</TableHead>
                    <TableHead className="text-xs text-right">Debit</TableHead>
                     <TableHead className="text-xs text-right">Credit</TableHead>
                     <TableHead className="text-xs text-right">Balance</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {grouped.map(g => {
                    const isExpanded = expandedParents.has(g.root.cft_id);
                    const rootGl = getGlLabel(g.root);
                    const allMapped = [g.root, ...g.children].every(e => getGlLabel(e).mapped);
                    const totalDebit = g.root.debit + g.children.reduce((s, c) => s + c.debit, 0);
                    const totalCredit = g.root.credit + g.children.reduce((s, c) => s + c.credit, 0);
                    const balance = totalDebit - totalCredit;
                    const isBalanced = Math.abs(balance) < 0.01;
                    const rootMapping = getGlMapping(g.root.entry_type_id);

                    return (
                      <>
                        {/* Root row */}
                        <TableRow
                          key={`root-${g.root.cft_id}`}
                          className={`cursor-pointer hover:bg-muted/50 font-medium ${!isBalanced ? 'bg-destructive/5' : ''}`}
                          onClick={() => toggleParent(g.root.cft_id)}
                        >
                          <TableCell className="px-2">
                            {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                          </TableCell>
                          <TableCell className="text-xs font-mono">{g.root.cft_id}</TableCell>
                          <TableCell className="text-xs">{g.root.transaction_date}</TableCell>
                          <TableCell className="text-xs">
                            <Badge variant="outline" className="font-mono text-[10px]">
                              {g.root.entry_type_id}
                            </Badge>
                            <span className="ml-1 text-muted-foreground">{rootMapping?.entry_type_name ?? ""}</span>
                          </TableCell>
                          <TableCell className="text-xs">{getEntityName(g.root.entity_id)}</TableCell>
                          <TableCell className="text-xs">{getControlAccountName(g.root.cash_account_id)}</TableCell>
                          <TableCell className="text-xs text-right font-mono">
                            {totalDebit > 0 ? formatCurrency(totalDebit) : ""}
                          </TableCell>
                          <TableCell className="text-xs text-right font-mono">
                            {totalCredit > 0 ? formatCurrency(totalCredit) : ""}
                          </TableCell>
                          <TableCell className="text-xs text-right font-mono">
                            {isBalanced ? (
                              <Badge variant="outline" className="text-[10px] gap-1">
                                <CheckCircle2 className="h-3 w-3 text-green-600" /> ✓
                              </Badge>
                            ) : (
                              <Badge variant="destructive" className="text-[10px] gap-1">
                                <AlertTriangle className="h-3 w-3" /> {formatCurrency(Math.abs(balance))}
                              </Badge>
                            )}
                          </TableCell>
                        </TableRow>

                        {/* Child rows */}
                        {isExpanded && (
                          <>
                            {/* Root detail */}
                            <TableRow key={`detail-root-${g.root.cft_id}`} className="bg-muted/30">
                              <TableCell></TableCell>
                              <TableCell className="text-xs font-mono text-muted-foreground">{g.root.cft_id}</TableCell>
                              <TableCell className="text-xs text-muted-foreground">{g.root.transaction_date}</TableCell>
                              <TableCell className="text-xs">
                                <Badge variant="secondary" className="font-mono text-[10px]">{g.root.entry_type_id}</Badge>
                                <span className="ml-1">{rootMapping?.entry_type_name ?? ""}</span>
                              </TableCell>
                              <TableCell className="text-xs">{getEntityName(g.root.entity_id)}</TableCell>
                              <TableCell className="text-xs">{getControlAccountName(g.root.cash_account_id)}</TableCell>
                              <TableCell className="text-xs text-right font-mono">
                                {g.root.debit > 0 ? formatCurrency(g.root.debit) : ""}
                              </TableCell>
                              <TableCell className="text-xs text-right font-mono">
                                {g.root.credit > 0 ? formatCurrency(g.root.credit) : ""}
                              </TableCell>
                              <TableCell className="text-xs">
                                <span className={rootGl.mapped ? "text-foreground" : "text-destructive"}>
                                  {rootGl.label}
                                </span>
                              </TableCell>
                            </TableRow>

                            {g.children.map(child => {
                              const childGl = getGlLabel(child);
                              const childMapping = getGlMapping(child.entry_type_id);
                              return (
                                <TableRow key={`child-${child.cft_id}`} className="bg-muted/30">
                                  <TableCell></TableCell>
                                  <TableCell className="text-xs font-mono text-muted-foreground">{child.cft_id}</TableCell>
                                  <TableCell className="text-xs text-muted-foreground">{child.transaction_date}</TableCell>
                                  <TableCell className="text-xs">
                                    <Badge variant="secondary" className="font-mono text-[10px]">{child.entry_type_id}</Badge>
                                    <span className="ml-1">{childMapping?.entry_type_name ?? ""}</span>
                                  </TableCell>
                                  <TableCell className="text-xs">{getEntityName(child.entity_id)}</TableCell>
                                  <TableCell className="text-xs">{getControlAccountName(child.cash_account_id)}</TableCell>
                                  <TableCell className="text-xs text-right font-mono">
                                    {child.debit > 0 ? formatCurrency(child.debit) : ""}
                                  </TableCell>
                                  <TableCell className="text-xs text-right font-mono">
                                    {child.credit > 0 ? formatCurrency(child.credit) : ""}
                                  </TableCell>
                                  <TableCell className="text-xs">
                                    <span className={childGl.mapped ? "text-foreground" : "text-destructive"}>
                                      {childGl.label}
                                    </span>
                                  </TableCell>
                                </TableRow>
                              );
                            })}
                          </>
                        )}
                      </>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default LegacyGlAllocation;
