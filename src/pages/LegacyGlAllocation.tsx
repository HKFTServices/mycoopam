import React, { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/contexts/TenantContext";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Loader2, CheckCircle2, XCircle, ChevronDown, ChevronRight, Eye, AlertTriangle, Play, FileSearch, CalendarIcon } from "lucide-react";
import { toast } from "sonner";
import { formatCurrency } from "@/lib/formatCurrency";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

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
  inc_exp_id: string;
  fee_id: string;
}

interface IncExpItem {
  id: string;
  item_code: string;
  description: string;
  gl_account_id: string | null;
  gl_code: string | null;
  gl_name: string | null;
  credit_control_account_id: string | null;
  debit_control_account_id: string | null;
}

interface GlMapping {
  entry_type_id: string;
  entry_type_name: string;
  gl_account_id: string | null;
  gl_account_code?: string;
  gl_account_name?: string;
  control_account_id: string | null;
  control_account_name?: string;
  split_rule: any;
  notes: string | null;
}

interface ControlAccountMap {
  legacy_id: string;
  new_id: string;
  name: string;
  pool_name: string | null;
}

interface ProposedCftEntry {
  description: string;
  debit: number;
  credit: number;
  gl_account_id: string | null;
  gl_account_label: string;
  control_account_id: string | null;
  control_account_label: string;
  pool_id: string | null;
  entity_account_id: string | null;
  transaction_date: string;
  entry_type: string;
  reference: string;
  legacy_transaction_id: string;
}

interface ProposedGroup {
  root: LegacyCftEntry;
  children: LegacyCftEntry[];
  entries: ProposedCftEntry[];
  totalDebit: number;
  totalCredit: number;
  isBalanced: boolean;
  entityName: string;
}

const TRANSACTION_TYPES = [
  { id: "1912", name: "Deposit Funds" },
  { id: "1945", name: "Withdrawal" },
  { id: "1914", name: "Switching" },
  { id: "1952", name: "Income Expense" },
  { id: "1953", name: "Stock Purchase" },
  { id: "1954", name: "Stock Sale" },
  { id: "1959", name: "Loan (Payout)" },
  { id: "1960", name: "Grant" },
  { id: "2000", name: "Loan Write-off" },
];

const LegacyGlAllocation = () => {
  const { currentTenant } = useTenant();
  const { user } = useAuth();
  const [selectedTxType, setSelectedTxType] = useState("1912");
  const [expandedParents, setExpandedParents] = useState<Set<string>>(new Set());
  const [dateFrom, setDateFrom] = useState<Date>(new Date("2025-03-01"));
  const [dateTo, setDateTo] = useState<Date>(new Date());
  const [loading, setLoading] = useState(false);
  const [cftEntries, setCftEntries] = useState<LegacyCftEntry[]>([]);
  const [showPreview, setShowPreview] = useState(false);
  const [proposedGroups, setProposedGroups] = useState<ProposedGroup[]>([]);
  const [posting, setPosting] = useState(false);
  const [expandedPreview, setExpandedPreview] = useState<Set<string>>(new Set());

  // Fetch GL mappings for selected transaction type
  const { data: glMappings } = useQuery({
    queryKey: ["legacy-gl-mappings", currentTenant?.id, selectedTxType],
    queryFn: async () => {
      if (!currentTenant) return [];
      const { data } = await supabase
        .from("legacy_gl_mappings")
        .select("entry_type_id, entry_type_name, gl_account_id, control_account_id, split_rule, notes")
        .eq("tenant_id", currentTenant.id)
        .eq("transaction_type_id", selectedTxType);

      if (!data?.length) return [];

      // Collect GL IDs from both direct mappings and split rules
      const glIds = data.filter(d => d.gl_account_id).map(d => d.gl_account_id!);
      for (const d of data) {
        const sr = d.split_rule as any;
        if (sr?.splits) {
          for (const s of sr.splits) {
            if (s.gl_account_id) glIds.push(s.gl_account_id);
          }
        }
      }
      const uniqueGlIds = [...new Set(glIds)];
      const { data: glAccounts } = uniqueGlIds.length > 0
        ? await supabase.from("gl_accounts").select("id, code, name").in("id", uniqueGlIds)
        : { data: [] };

      const glMap = Object.fromEntries((glAccounts ?? []).map(g => [g.id, g]));

      const caIds = data.filter(d => d.control_account_id).map(d => d.control_account_id!);
      let caMap: Record<string, any> = {};
      if (caIds.length > 0) {
        const { data: cas } = await supabase
          .from("control_accounts")
          .select("id, name, pool_id, pools!control_accounts_pool_id_fkey(name)")
          .in("id", caIds);
        caMap = Object.fromEntries((cas ?? []).map((c: any) => [c.id, c]));
      }

      return data.map(d => {
        // Enrich split rules with GL codes
        let enrichedSplitRule = d.split_rule;
        const sr = d.split_rule as any;
        if (sr?.splits) {
          enrichedSplitRule = {
            ...sr,
            splits: sr.splits.map((s: any) => ({
              ...s,
              gl_code: s.gl_account_id ? glMap[s.gl_account_id]?.code : undefined,
              gl_name: s.gl_account_id ? glMap[s.gl_account_id]?.name : undefined,
            })),
          };
        }
        return {
          ...d,
          split_rule: enrichedSplitRule,
          gl_account_code: d.gl_account_id ? glMap[d.gl_account_id]?.code : undefined,
          gl_account_name: d.gl_account_id ? glMap[d.gl_account_id]?.name : undefined,
          control_account_name: d.control_account_id
            ? `${caMap[d.control_account_id]?.name ?? "Unknown"} (${caMap[d.control_account_id]?.pools?.name ?? ""})`
            : undefined,
        };
      }) as GlMapping[];
    },
    enabled: !!currentTenant,
  });

  // Fetch control account mappings (legacy_id -> new control_account with pool)
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
        .select("id, name, account_type, pool_id, pools!control_accounts_pool_id_fkey(name)")
        .in("id", caIds);

      const caMap = Object.fromEntries((cas ?? []).map((c: any) => [c.id, c]));

      return mappings.map(m => ({
        legacy_id: m.legacy_id,
        new_id: m.new_id,
        name: caMap[m.new_id]?.name ?? "Unknown",
        pool_name: caMap[m.new_id]?.pools?.name ?? null,
        account_type: caMap[m.new_id]?.account_type ?? null,
        pool_id: caMap[m.new_id]?.pool_id ?? null,
      })) as (ControlAccountMap & { account_type: string | null; pool_id: string | null })[];
    },
    enabled: !!currentTenant,
  });

  // Fetch all control accounts for finding loan control by pool
  const { data: allControlAccounts } = useQuery({
    queryKey: ["all-control-accounts", currentTenant?.id],
    queryFn: async () => {
      if (!currentTenant) return [];
      const { data } = await supabase
        .from("control_accounts")
        .select("id, name, account_type, pool_id, pools!control_accounts_pool_id_fkey(name)")
        .eq("tenant_id", currentTenant.id);
      return data ?? [];
    },
    enabled: !!currentTenant,
  });

  // Fetch tenant configuration GL account IDs (to match new deposit posting pattern)
  const { data: tenantGlConfig } = useQuery({
    queryKey: ["tenant-gl-config", currentTenant?.id],
    queryFn: async () => {
      if (!currentTenant) return null;
      const { data } = await (supabase as any)
        .from("tenant_configuration")
        .select("pool_allocation_gl_account_id, membership_fee_gl_account_id, bank_gl_account_id")
        .eq("tenant_id", currentTenant.id)
        .maybeSingle();
      if (!data) return null;
      // Fetch GL account labels
      const glIds = [data.pool_allocation_gl_account_id, data.membership_fee_gl_account_id, data.bank_gl_account_id].filter(Boolean);
      const { data: glAccounts } = await supabase
        .from("gl_accounts")
        .select("id, code, name")
        .in("id", glIds);
      const glMap = Object.fromEntries((glAccounts ?? []).map(g => [g.id, g]));
      return {
        poolAllocationGlId: data.pool_allocation_gl_account_id as string | null,
        poolAllocationGlLabel: data.pool_allocation_gl_account_id ? `${glMap[data.pool_allocation_gl_account_id]?.code} ${glMap[data.pool_allocation_gl_account_id]?.name}` : "",
        membershipFeeGlId: data.membership_fee_gl_account_id as string | null,
        membershipFeeGlLabel: data.membership_fee_gl_account_id ? `${glMap[data.membership_fee_gl_account_id]?.code} ${glMap[data.membership_fee_gl_account_id]?.name}` : "",
        bankGlId: data.bank_gl_account_id as string | null,
        bankGlLabel: data.bank_gl_account_id ? `${glMap[data.bank_gl_account_id]?.code} ${glMap[data.bank_gl_account_id]?.name}` : "",
      };
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
        .select("id, client_account_id, account_number, entity_id, entities(name, last_name)")
        .eq("tenant_id", currentTenant.id)
        .not("client_account_id", "is", null);

      return Object.fromEntries(
        (data ?? []).map((ea: any) => [
          String(ea.client_account_id),
          {
            id: ea.id,
            account_number: ea.account_number,
            entity_id: ea.entity_id,
            entity_name: [ea.entities?.name, ea.entities?.last_name].filter(Boolean).join(" "),
          },
        ])
      );
    },
    enabled: !!currentTenant,
  });

  // Fetch income/expense items with GL account mapping (keyed by legacy_id)
  const { data: incExpMap } = useQuery({
    queryKey: ["inc-exp-items-map", currentTenant?.id],
    queryFn: async () => {
      if (!currentTenant) return {};
      // Get legacy mappings for income_expense_items
      const { data: mappings } = await supabase
        .from("legacy_id_mappings")
        .select("legacy_id, new_id")
        .eq("table_name", "income_expense_items")
        .eq("tenant_id", currentTenant.id);
      if (!mappings?.length) return {};

      const itemIds = mappings.map(m => m.new_id);
      const { data: items } = await (supabase as any)
        .from("income_expense_items")
        .select("id, item_code, description, gl_account_id, credit_control_account_id, debit_control_account_id")
        .in("id", itemIds);

      // Fetch GL account details for items that have gl_account_id
      const glIds = (items ?? []).filter((i: any) => i.gl_account_id).map((i: any) => i.gl_account_id);
      let glMap: Record<string, any> = {};
      if (glIds.length > 0) {
        const { data: gls } = await supabase.from("gl_accounts").select("id, code, name").in("id", glIds);
        glMap = Object.fromEntries((gls ?? []).map(g => [g.id, g]));
      }

      const itemMap = Object.fromEntries((items ?? []).map((i: any) => [i.id, i]));
      const result: Record<string, IncExpItem> = {};
      for (const m of mappings) {
        const item = itemMap[m.new_id];
        if (item) {
          const gl = item.gl_account_id ? glMap[item.gl_account_id] : null;
          result[m.legacy_id] = {
            id: item.id,
            item_code: item.item_code,
            description: item.description,
            gl_account_id: item.gl_account_id,
            gl_code: gl?.code ?? null,
            gl_name: gl?.name ?? null,
            credit_control_account_id: item.credit_control_account_id,
            debit_control_account_id: item.debit_control_account_id,
          };
        }
      }
      return result;
    },
    enabled: !!currentTenant,
  });

  const loadTransactions = async () => {
    if (!currentTenant) return;
    setLoading(true);
    try {
      // Load ALL CFT entries in a single pass (no type filter)
      let allRows: { legacy_id: string; notes: string | null }[] = [];
      const PAGE_SIZE = 1000;
      let from = 0;
      let hasMore = true;

      while (hasMore) {
        const { data: page, error } = await supabase
          .from("legacy_id_mappings")
          .select("legacy_id, notes, is_posted")
          .eq("table_name", "cashflow_transactions")
          .eq("tenant_id", currentTenant.id)
          .eq("is_posted", false)
          .range(from, from + PAGE_SIZE - 1);

        if (error) throw error;
        allRows = allRows.concat(page ?? []);
        hasMore = (page?.length ?? 0) === PAGE_SIZE;
        from += PAGE_SIZE;
      }

      const filterFrom = dateFrom;
      const filterTo = dateTo;
      const allParsed: { entry: LegacyCftEntry; txTypeId: string }[] = [];

      for (const row of allRows) {
        try {
          const n = JSON.parse(row.notes ?? "{}");
          const txDate = new Date(n.TransactionDate);
          if (txDate < filterFrom || txDate > filterTo) continue;

          allParsed.push({
            entry: {
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
              transaction_date: (n.TransactionDate ?? "").split("T")[0].split(" ")[0],
              description: "",
              inc_exp_id: n.IncExpID ?? "0",
              fee_id: n.FeeID ?? "0",
            },
            txTypeId: n.Type_TransactionID ?? "0",
          });
        } catch {}
      }

      // Collect all root IDs for the selected transaction type
      const rootIds = new Set(
        allParsed
          .filter(p => p.entry.parent_id === "0" && p.txTypeId === selectedTxType)
          .map(p => p.entry.cft_id)
      );

      // Collect entries: roots of selected type + ALL their children (any type) + orphan 1978s matching by entity+date
      const entries: LegacyCftEntry[] = [];
      const addedIds = new Set<string>();

      // 1. Add roots of the selected type
      for (const p of allParsed) {
        if (rootIds.has(p.entry.cft_id)) {
          entries.push(p.entry);
          addedIds.add(p.entry.cft_id);
        }
      }

      // 2. Add all children whose ParentID matches a root
      for (const p of allParsed) {
        if (p.entry.parent_id !== "0" && rootIds.has(p.entry.parent_id) && !addedIds.has(p.entry.cft_id)) {
          entries.push(p.entry);
          addedIds.add(p.entry.cft_id);
        }
      }

      // 3. Add orphan root entries (ParentID=0) that should be grouped with deposits
      //    e.g. loan instalments (1978), membership shares (1922) with matching entity+date
      const rootByEntityDate = new Map<string, string>();
      for (const e of entries) {
        if (rootIds.has(e.cft_id)) {
          const key = `${e.entity_id}|${e.transaction_date.split(" ")[0]}`;
          rootByEntityDate.set(key, e.cft_id);
        }
      }

      for (const p of allParsed) {
        if (addedIds.has(p.entry.cft_id)) continue;
        if (p.entry.parent_id !== "0") continue;
        // Only adopt orphans that are NOT themselves a different transaction type root with children
        if (p.entry.entry_type_id === "1978" || p.entry.entry_type_id === "1922") {
          const key = `${p.entry.entity_id}|${p.entry.transaction_date.split(" ")[0]}`;
          if (rootByEntityDate.has(key)) {
            // Re-parent this orphan as a child of the matching deposit root
            p.entry.parent_id = rootByEntityDate.get(key)!;
            entries.push(p.entry);
            addedIds.add(p.entry.cft_id);
          }
        }
      }

      // Debug: verify key entries are loaded
      const check12497 = entries.filter(e => e.cft_id === "12497" || e.parent_id === "12497");
      console.log("CFT 12497 group:", check12497.map(e => `${e.cft_id} (parent=${e.parent_id}, entry=${e.entry_type_id}, DR=${e.debit}, CR=${e.credit})`));

      setCftEntries(entries);
      toast.success(`Loaded ${entries.length} entries from 1 Mar 2025`);
    } catch (err: any) {
      toast.error("Failed to load: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  // Group entries by parent (orphans already re-parented during loading)
  // Deduplicate by cft_id to prevent duplicate groups
  const grouped = useMemo(() => {
    const seenRoots = new Set<string>();
    const roots = cftEntries.filter(e => {
      if (e.parent_id !== "0") return false;
      if (seenRoots.has(e.cft_id)) return false;
      seenRoots.add(e.cft_id);
      return true;
    });
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
    if (!mapping) return { label: "No mapping", mapped: false };
    
    if (mapping.split_rule) {
      const splits = (mapping.split_rule as any).splits;
      if (splits) {
        const splitLabels = splits.map((s: any) => {
          const glCode = s.gl_code ? `${s.gl_code} ` : "";
          return `${glCode}${s.description}`;
        });
        return {
          label: splitLabels.join(" + "),
          mapped: true,
        };
      }
    }

    if (mapping.entry_type_id === "1924") {
      const glPart = mapping.gl_account_code ? `${mapping.gl_account_code} ${mapping.gl_account_name} | ` : "";
      return { label: `${glPart}→ ${getControlAccountName(entry.cash_account_id)}`, mapped: true };
    }

    const parts: string[] = [];
    if (mapping.gl_account_code) {
      parts.push(`${mapping.gl_account_code} ${mapping.gl_account_name}`);
    }
    if (mapping.control_account_name) {
      parts.push(`⇢ ${mapping.control_account_name}`);
    }

    if (parts.length > 0) {
      return { label: parts.join(" | "), mapped: true };
    }

    return { label: "GL not set", mapped: false };
  };

  // ═══════════════════════════════════════════════════════════════
  // Build proposed balanced CFT entries for a single group
  // ═══════════════════════════════════════════════════════════════
  const memberAcctLoanControl = allControlAccounts?.find(ca => ca.name === "Member Account Loans");
  const memberAcctCashControl = allControlAccounts?.find(ca => ca.name === "Member Account Cash");

  const buildProposedForGroup = (group: { root: LegacyCftEntry; children: LegacyCftEntry[] }): ProposedGroup => {
    const allEntries = [group.root, ...group.children];
    const rootEntry = group.root;
    const entityId = rootEntry.entity_id;
    const eaInfo = entityAccountMap?.[entityId];
    const txDate = rootEntry.transaction_date;
    const rootCftId = rootEntry.cft_id;
    const isDepFunds = rootEntry.tx_type_id === "1912" || rootEntry.entry_type_id === "1921";
    const isWithdrawal = rootEntry.tx_type_id === "1945";
    const isSwitching = rootEntry.tx_type_id === "1914";
    const isIncomeExpense = rootEntry.tx_type_id === "1952";
    const isStockPurchase = rootEntry.tx_type_id === "1953";
    const isStockSale = rootEntry.tx_type_id === "1954";
    const isGrant = rootEntry.tx_type_id === "1960";
    // Check if this transaction includes a Share entry (1922) — determines fee treatment
    const hasShareEntry = allEntries.some(e => e.entry_type_id === "1922");

    const proposed: ProposedCftEntry[] = [];

    // Pool deposit entry type IDs (all resolve via CashAccountID)
    const poolDepositEntryTypes = new Set([
      "0",    // Generic legacy pool allocation (resolve via CashAccountID)
      "1924", // Member Fees
      "1927", "1928", "1929", "1930", // Asset, Reserve, Health, Health Reserve
      "1986", // Member Account
      "1989", // Funeral Fund
      "1994", // Crypto
      "2006", // Gold
      "2008", // Silver
    ]);

    // Pool withdrawal entry type IDs
    const poolWithdrawalEntryTypes = new Set([
      "0",    // Generic
      "1931", // Asset
      "1932", // Reserve
      "1933", // Health
      "1934", // Health Reserve
      "1964", // Member Account
      "1990", // Funeral Fund
      "1995", // Crypto
      "2007", // Gold
      "2009", // Silver
    ]);

    // Withdrawal fee entry types
    const withdrawalFeeEntryTypes = new Set(["1936", "1940"]);

    // Switching entry types
    const switchingPoolEntryTypes = new Set(["1955", "0"]);

    // Stock entry types (resolve via CashAccountID)
    const stockPoolEntryTypes = new Set(["0", "1932", "1964", "1995", "2007", "2009"]);

    for (const entry of allEntries) {
      const mapping = getGlMapping(entry.entry_type_id);
      if (!mapping) continue;

      const amount = entry.debit > 0 ? entry.debit : entry.credit;
      if (amount === 0) continue;

      // ── Bank Receipt (1921) ── DR Bank GL (cash in)
      if (entry.entry_type_id === "1921") {
        proposed.push({
          description: "Bank Deposit",
          debit: amount, credit: 0,
          gl_account_id: tenantGlConfig?.bankGlId ?? mapping.gl_account_id,
          gl_account_label: tenantGlConfig?.bankGlLabel ?? `${mapping.gl_account_code} ${mapping.gl_account_name}`,
          control_account_id: null, control_account_label: "",
          pool_id: null, entity_account_id: eaInfo?.id ?? null,
          transaction_date: txDate, entry_type: "bank_receipt",
          reference: `Legacy CFT ${rootCftId}`, legacy_transaction_id: rootCftId,
        });
      }
      // ── Membership Fee (1922) — Split: CR Join Share GL + CR Fee Income GL ──
      else if (entry.entry_type_id === "1922" && (mapping.split_rule as any)?.splits) {
        for (const split of (mapping.split_rule as any).splits) {
          const glLabel = split.gl_code ? `${split.gl_code} ${split.description}` : split.description;
          proposed.push({
            description: split.description,
            debit: 0,
            credit: split.amount,
            gl_account_id: split.gl_account_id,
            gl_account_label: glLabel,
            control_account_id: null, control_account_label: "",
            pool_id: null, entity_account_id: eaInfo?.id ?? null,
            transaction_date: txDate, entry_type: "membership_fee",
            reference: `Legacy CFT ${rootCftId}`, legacy_transaction_id: rootCftId,
          });
        }
      }
      // ── Loan Instalment (1978) — Triple entry ──
      else if (entry.entry_type_id === "1978") {
        const repaymentAmount = entry.debit > 0 ? entry.debit : entry.credit;
        // 1. CR Member Loans GL (1025)
        proposed.push({
          description: "Loan Repayment",
          debit: 0, credit: repaymentAmount,
          gl_account_id: mapping.gl_account_id,
          gl_account_label: `${mapping.gl_account_code} ${mapping.gl_account_name}`,
          control_account_id: null, control_account_label: "",
          pool_id: null, entity_account_id: eaInfo?.id ?? null,
          transaction_date: txDate, entry_type: "loan_repayment",
          reference: `Legacy CFT ${rootCftId}`, legacy_transaction_id: rootCftId,
        });
        // 2. CR Loan Control (Member Account)
        proposed.push({
          description: "Loan Repayment — Loan Control CR",
          debit: 0, credit: repaymentAmount,
          gl_account_id: null, gl_account_label: "",
          control_account_id: memberAcctLoanControl?.id ?? mapping.control_account_id,
          control_account_label: memberAcctLoanControl?.name ?? "Member Account Loans",
          pool_id: memberAcctCashControl?.pool_id ?? null, entity_account_id: eaInfo?.id ?? null,
          transaction_date: txDate, entry_type: "loan_control_cr",
          reference: `Legacy CFT ${rootCftId}`, legacy_transaction_id: rootCftId,
        });
        // 3. DR Cash Control (Member Account)
        proposed.push({
          description: "Loan Repayment — Cash Control DR",
          debit: repaymentAmount, credit: 0,
          gl_account_id: null, gl_account_label: "",
          control_account_id: memberAcctCashControl?.id ?? null,
          control_account_label: memberAcctCashControl?.name ?? "Member Account Cash",
          pool_id: memberAcctCashControl?.pool_id ?? null, entity_account_id: eaInfo?.id ?? null,
          transaction_date: txDate, entry_type: "cash_control_dr",
          reference: `Legacy CFT ${rootCftId}`, legacy_transaction_id: rootCftId,
        });
      }
      // ── Pool Deposit entries — DR Cash Control + CR Member Interest GL ──
      // Matches new deposit pattern: DR pool cash control (cash flowing in),
      // GL = Member Interest (2020) for pool allocations, Fee Income (4010) for fees
      else if (isDepFunds && poolDepositEntryTypes.has(entry.entry_type_id)) {
        const ca = controlAccounts?.find(c => c.legacy_id === entry.cash_account_id);
        const poolName = ca?.pool_name ?? ca?.name ?? `CA#${entry.cash_account_id}`;
        const isFeeEntry = entry.entry_type_id === "1924";
        // 1924 always maps to Administration Income (4000) from the mapping.
        // Membership Fee Income (4010) is only used inside the 1922 split (R199).
        const glId = isFeeEntry
          ? (mapping.gl_account_id ?? null)
          : (tenantGlConfig?.poolAllocationGlId ?? null);
        const glLabel = isFeeEntry
          ? (mapping.gl_account_code ? `${mapping.gl_account_code} ${mapping.gl_account_name}` : "Administration Fee Income")
          : (tenantGlConfig?.poolAllocationGlLabel ?? "Member Interest");

        // 1. DR Cash Control — cash flowing into the pool
        proposed.push({
          description: `${mapping.entry_type_name ?? "Pool Deposit"} — ${poolName}`,
          debit: amount, credit: 0,
          gl_account_id: null, gl_account_label: "",
          control_account_id: ca?.new_id ?? null,
          control_account_label: ca ? `${ca.name} (${ca.pool_name})` : `CA#${entry.cash_account_id}`,
          pool_id: (ca as any)?.pool_id ?? null, entity_account_id: eaInfo?.id ?? null,
          transaction_date: txDate, entry_type: "pool_deposit",
          reference: `Legacy CFT ${rootCftId}`, legacy_transaction_id: rootCftId,
        });
        // 2. CR GL Account — Member Interest (BS) or Fee Income (IS)
        proposed.push({
          description: `${isFeeEntry ? "Fee Income" : "Member Interest"} — ${poolName}`,
          debit: 0, credit: amount,
          gl_account_id: glId, gl_account_label: glLabel,
          control_account_id: null, control_account_label: "",
          pool_id: (ca as any)?.pool_id ?? null, entity_account_id: eaInfo?.id ?? null,
          transaction_date: txDate, entry_type: isFeeEntry ? "fee_income" : "member_interest",
          reference: `Legacy CFT ${rootCftId}`, legacy_transaction_id: rootCftId,
        });
      }
      // ── Withdrawal pool entries — CR Cash Control + DR Member Interest GL ──
      // Opposite of deposit: cash flows out of pool
      else if (isWithdrawal && poolWithdrawalEntryTypes.has(entry.entry_type_id)) {
        const ca = controlAccounts?.find(c => c.legacy_id === entry.cash_account_id);
        const poolName = ca?.pool_name ?? ca?.name ?? `CA#${entry.cash_account_id}`;
        // 1. CR Cash Control — cash leaving the pool
        proposed.push({
          description: `${mapping.entry_type_name ?? "Pool Withdrawal"} — ${poolName}`,
          debit: 0, credit: amount,
          gl_account_id: null, gl_account_label: "",
          control_account_id: ca?.new_id ?? null,
          control_account_label: ca ? `${ca.name} (${ca.pool_name})` : `CA#${entry.cash_account_id}`,
          pool_id: (ca as any)?.pool_id ?? null, entity_account_id: eaInfo?.id ?? null,
          transaction_date: txDate, entry_type: "pool_withdrawal",
          reference: `Legacy CFT ${rootCftId}`, legacy_transaction_id: rootCftId,
        });
        // 2. DR GL Account — Member Interest (units being redeemed)
        proposed.push({
          description: `Member Interest — ${poolName}`,
          debit: amount, credit: 0,
          gl_account_id: tenantGlConfig?.poolAllocationGlId ?? null,
          gl_account_label: tenantGlConfig?.poolAllocationGlLabel ?? "Member Interest",
          control_account_id: null, control_account_label: "",
          pool_id: (ca as any)?.pool_id ?? null, entity_account_id: eaInfo?.id ?? null,
          transaction_date: txDate, entry_type: "member_interest_dr",
          reference: `Legacy CFT ${rootCftId}`, legacy_transaction_id: rootCftId,
        });
      }
      // ── Withdrawal fee entries (1936 Courier, 1940 Admin) — DR Admin Cash Control + CR Fee Income GL ──
      // Fees paid from units: the pool redemption already CR'd the pool cash control,
      // so the fee flows INTO admin cash (debit) and is recognized as income (credit).
      else if (isWithdrawal && withdrawalFeeEntryTypes.has(entry.entry_type_id)) {
        const ca = controlAccounts?.find(c => c.legacy_id === entry.cash_account_id);
        const poolName = ca?.pool_name ?? ca?.name ?? `CA#${entry.cash_account_id}`;
        const feeGlId = entry.entry_type_id === "1936"
          ? "7c3ca82b-ef31-406e-91a8-20ddc4306b0f" // 4040 Courier Fee Income
          : "6cf12752-95ba-499c-a86c-3c17fe2407f5"; // 4000 Administration Income
        const feeGlLabel = entry.entry_type_id === "1936" ? "4040 Courier Fee Income" : "4000 Administration Income";
        // 1. DR Admin Cash Control — fee flows into admin
        proposed.push({
          description: `${mapping.entry_type_name ?? "Fee"} — ${poolName}`,
          debit: amount, credit: 0,
          gl_account_id: null, gl_account_label: "",
          control_account_id: ca?.new_id ?? null,
          control_account_label: ca ? `${ca.name} (${ca.pool_name})` : `CA#${entry.cash_account_id}`,
          pool_id: (ca as any)?.pool_id ?? null, entity_account_id: eaInfo?.id ?? null,
          transaction_date: txDate, entry_type: "withdrawal_fee",
          reference: `Legacy CFT ${rootCftId}`, legacy_transaction_id: rootCftId,
        });
        // 2. CR Fee Income GL (income is always credited)
        proposed.push({
          description: `${mapping.entry_type_name ?? "Fee"} Income`,
          debit: 0, credit: amount,
          gl_account_id: feeGlId, gl_account_label: feeGlLabel,
          control_account_id: null, control_account_label: "",
          pool_id: (ca as any)?.pool_id ?? null, entity_account_id: eaInfo?.id ?? null,
          transaction_date: txDate, entry_type: "fee_income_cr",
          reference: `Legacy CFT ${rootCftId}`, legacy_transaction_id: rootCftId,
        });
      }
      // ── Switching (1955) — CR source pool cash control + DR dest pool cash control ──
      // Each switch entry has debit on dest and credit on source
      else if (isSwitching && switchingPoolEntryTypes.has(entry.entry_type_id)) {
        const ca = controlAccounts?.find(c => c.legacy_id === entry.cash_account_id);
        const poolName = ca?.pool_name ?? ca?.name ?? `CA#${entry.cash_account_id}`;
        if (entry.debit > 0) {
          // DR destination pool cash control
          proposed.push({
            description: `Switch In — ${poolName}`,
            debit: entry.debit, credit: 0,
            gl_account_id: null, gl_account_label: "",
            control_account_id: ca?.new_id ?? null,
            control_account_label: ca ? `${ca.name} (${ca.pool_name})` : `CA#${entry.cash_account_id}`,
            pool_id: (ca as any)?.pool_id ?? null, entity_account_id: eaInfo?.id ?? null,
            transaction_date: txDate, entry_type: "switch_in",
            reference: `Legacy CFT ${rootCftId}`, legacy_transaction_id: rootCftId,
          });
        }
        if (entry.credit > 0) {
          // CR source pool cash control
          proposed.push({
            description: `Switch Out — ${poolName}`,
            debit: 0, credit: entry.credit,
            gl_account_id: null, gl_account_label: "",
            control_account_id: ca?.new_id ?? null,
            control_account_label: ca ? `${ca.name} (${ca.pool_name})` : `CA#${entry.cash_account_id}`,
            pool_id: (ca as any)?.pool_id ?? null, entity_account_id: eaInfo?.id ?? null,
            transaction_date: txDate, entry_type: "switch_out",
            reference: `Legacy CFT ${rootCftId}`, legacy_transaction_id: rootCftId,
          });
        }
      }
      // ── Switching admin fee (1939) ──
      else if (isSwitching && entry.entry_type_id === "1939") {
        const ca = controlAccounts?.find(c => c.legacy_id === entry.cash_account_id);
        const poolName = ca?.pool_name ?? ca?.name ?? `CA#${entry.cash_account_id}`;
        proposed.push({
          description: `Switching Admin Fee — ${poolName}`,
          debit: 0, credit: amount,
          gl_account_id: null, gl_account_label: "",
          control_account_id: ca?.new_id ?? null,
          control_account_label: ca ? `${ca.name} (${ca.pool_name})` : `CA#${entry.cash_account_id}`,
          pool_id: (ca as any)?.pool_id ?? null, entity_account_id: eaInfo?.id ?? null,
          transaction_date: txDate, entry_type: "switch_fee",
          reference: `Legacy CFT ${rootCftId}`, legacy_transaction_id: rootCftId,
        });
        proposed.push({
          description: "Switching Admin Fee Income",
          debit: amount, credit: 0,
          gl_account_id: "6cf12752-95ba-499c-a86c-3c17fe2407f5", gl_account_label: "4000 Administration Income",
          control_account_id: null, control_account_label: "",
          pool_id: (ca as any)?.pool_id ?? null, entity_account_id: eaInfo?.id ?? null,
          transaction_date: txDate, entry_type: "fee_income_dr",
          reference: `Legacy CFT ${rootCftId}`, legacy_transaction_id: rootCftId,
        });
      }
      // ── Income/Expense (1988) — Resolve IncExpID for description & GL ──
      // Inc/Exp transactions move cash between control accounts and GL.
      // No unit redemption / member interest involved.
      else if (isIncomeExpense && entry.entry_type_id === "1988") {
        const ca = controlAccounts?.find(c => c.legacy_id === entry.cash_account_id);
        const poolName = ca?.pool_name ?? ca?.name ?? `CA#${entry.cash_account_id}`;
        const incExpItem = entry.inc_exp_id !== "0" ? incExpMap?.[entry.inc_exp_id] : null;
        const itemDesc = incExpItem?.description ?? incExpItem?.item_code ?? "Income/Expense";
        const amount = entry.debit > 0 ? entry.debit : entry.credit;

        if (entry.is_bank) {
          // ── BANK TRANSACTION ──
          // Expense paid from bank: DR Expense GL, CR Bank GL
          // Income received to bank: DR Bank GL, CR Income GL
          const isExpense = entry.credit > 0; // CFT credit = cash leaving pool = expense

          // 1. Expense/Income GL entry
          proposed.push({
            description: `${itemDesc} — ${poolName}`,
            debit: isExpense ? amount : 0,
            credit: isExpense ? 0 : amount,
            gl_account_id: incExpItem?.gl_account_id ?? null,
            gl_account_label: incExpItem?.gl_code ? `${incExpItem.gl_code} ${incExpItem.gl_name}` : `No GL mapped (${itemDesc})`,
            control_account_id: null, control_account_label: "",
            pool_id: (ca as any)?.pool_id ?? null, entity_account_id: eaInfo?.id ?? null,
            transaction_date: txDate, entry_type: "income_expense_gl",
            reference: `Legacy CFT ${rootCftId}`, legacy_transaction_id: rootCftId,
          });
          // 2. Bank GL entry (opposite side)
          proposed.push({
            description: `Bank — ${itemDesc}`,
            debit: isExpense ? 0 : amount,
            credit: isExpense ? amount : 0,
            gl_account_id: tenantGlConfig?.bankGlId ?? null,
            gl_account_label: tenantGlConfig?.bankGlLabel ?? "Bank Account",
            control_account_id: null, control_account_label: "",
            pool_id: null, entity_account_id: eaInfo?.id ?? null,
            transaction_date: txDate, entry_type: "bank_payment",
            reference: `Legacy CFT ${rootCftId}`, legacy_transaction_id: rootCftId,
          });
          // 3. Cash control entry (pool cash movement)
          proposed.push({
            description: `${itemDesc} — ${poolName} Cash`,
            debit: entry.debit, credit: entry.credit,
            gl_account_id: null, gl_account_label: "",
            control_account_id: ca?.new_id ?? null,
            control_account_label: ca ? `${ca.name} (${ca.pool_name})` : `CA#${entry.cash_account_id}`,
            pool_id: (ca as any)?.pool_id ?? null, entity_account_id: eaInfo?.id ?? null,
            transaction_date: txDate, entry_type: "income_expense",
            reference: `Legacy CFT ${rootCftId}`, legacy_transaction_id: rootCftId,
          });
        } else {
          // ── JOURNAL ENTRY (no bank): Cash control + GL ──
          // 1. Cash control entry
          proposed.push({
            description: `${itemDesc} — ${poolName}`,
            debit: entry.debit, credit: entry.credit,
            gl_account_id: null, gl_account_label: "",
            control_account_id: ca?.new_id ?? null,
            control_account_label: ca ? `${ca.name} (${ca.pool_name})` : `CA#${entry.cash_account_id}`,
            pool_id: (ca as any)?.pool_id ?? null, entity_account_id: eaInfo?.id ?? null,
            transaction_date: txDate, entry_type: "income_expense",
            reference: `Legacy CFT ${rootCftId}`, legacy_transaction_id: rootCftId,
          });
          // 2. GL entry (opposite side)
          proposed.push({
            description: `${itemDesc} — GL`,
            debit: entry.credit, credit: entry.debit,
            gl_account_id: incExpItem?.gl_account_id ?? null,
            gl_account_label: incExpItem?.gl_code ? `${incExpItem.gl_code} ${incExpItem.gl_name}` : `No GL mapped (${itemDesc})`,
            control_account_id: null, control_account_label: "",
            pool_id: (ca as any)?.pool_id ?? null, entity_account_id: eaInfo?.id ?? null,
            transaction_date: txDate, entry_type: "income_expense_gl",
            reference: `Legacy CFT ${rootCftId}`, legacy_transaction_id: rootCftId,
          });
        }
      }
      // ── Stock Purchase (1948) / Stock Sale (1949) — Stock control entries ──
      // Purchase: Stock Control DR (stock in). Sale: Stock Control CR (stock out).
      else if ((isStockPurchase && entry.entry_type_id === "1948") || (isStockSale && entry.entry_type_id === "1949")) {
        const ca = controlAccounts?.find(c => c.legacy_id === entry.cash_account_id);
        const poolName = ca?.pool_name ?? ca?.name ?? `CA#${entry.cash_account_id}`;
        const amount = entry.debit > 0 ? entry.debit : entry.credit;
        proposed.push({
          description: `${isStockPurchase ? "Stock Purchase" : "Stock Sale"} — ${poolName}`,
          debit: isStockPurchase ? amount : 0,
          credit: isStockSale ? amount : 0,
          gl_account_id: "ea027bb8-2079-4020-a382-2ad00e8ae296", gl_account_label: "1030 Stock control",
          control_account_id: null, control_account_label: "",
          pool_id: (ca as any)?.pool_id ?? null, entity_account_id: eaInfo?.id ?? null,
          transaction_date: txDate, entry_type: isStockPurchase ? "stock_purchase" : "stock_sale",
          reference: `Legacy CFT ${rootCftId}`, legacy_transaction_id: rootCftId,
        });
      }
      // ── Stock Purchase/Sale pool allocations — Cash Control only (no Member Interest) ──
      else if ((isStockPurchase || isStockSale) && stockPoolEntryTypes.has(entry.entry_type_id)) {
        const ca = controlAccounts?.find(c => c.legacy_id === entry.cash_account_id);
        const poolName = ca?.pool_name ?? ca?.name ?? `CA#${entry.cash_account_id}`;
        proposed.push({
          description: `${mapping.entry_type_name ?? "Pool Allocation"} — ${poolName}`,
          debit: entry.debit, credit: entry.credit,
          gl_account_id: null, gl_account_label: "",
          control_account_id: ca?.new_id ?? null,
          control_account_label: ca ? `${ca.name} (${ca.pool_name})` : `CA#${entry.cash_account_id}`,
          pool_id: (ca as any)?.pool_id ?? null, entity_account_id: eaInfo?.id ?? null,
          transaction_date: txDate, entry_type: "stock_pool_allocation",
          reference: `Legacy CFT ${rootCftId}`, legacy_transaction_id: rootCftId,
        });
      }
      // ── Fallback for non-deposit or unmapped entries ──
      else {
        const ca = controlAccounts?.find(c => c.legacy_id === entry.cash_account_id);
        proposed.push({
          description: `${mapping.entry_type_name ?? "Entry"} — ${ca?.pool_name ?? ca?.name ?? ""}`,
          debit: entry.debit, credit: entry.credit,
          gl_account_id: mapping.gl_account_id, gl_account_label: mapping.gl_account_code ? `${mapping.gl_account_code} ${mapping.gl_account_name}` : "",
          control_account_id: ca?.new_id ?? mapping.control_account_id ?? null,
          control_account_label: ca ? `${ca.name} (${ca.pool_name})` : (mapping.control_account_name ?? ""),
          pool_id: (ca as any)?.pool_id ?? null, entity_account_id: eaInfo?.id ?? null,
          transaction_date: txDate, entry_type: mapping.entry_type_name ?? "other",
          reference: `Legacy CFT ${rootCftId}`, legacy_transaction_id: rootCftId,
        });
      }
    }

    // ── Withdrawal bank payment — only pool redemption entries that are is_bank ──
    // Fee entries (paid from units or otherwise) are handled separately as fee income;
    // the bank payment should reflect only the net payout to the member.
    if (isWithdrawal) {
      // Gross pool redemption (includes fees paid from units)
      const grossRedemption = allEntries
        .filter(e => e.is_bank && poolWithdrawalEntryTypes.has(e.entry_type_id))
        .reduce((sum, e) => sum + (e.debit > 0 ? e.debit : e.credit), 0);
      // Subtract fees paid from units — these don't flow to the bank
      const feesFromUnits = allEntries
        .filter(e => withdrawalFeeEntryTypes.has(e.entry_type_id))
        .reduce((sum, e) => sum + (e.debit > 0 ? e.debit : e.credit), 0);
      const bankTotal = grossRedemption - feesFromUnits;
      if (bankTotal > 0) {
        proposed.push({
          description: "Bank Payment",
          debit: 0, credit: bankTotal,
          gl_account_id: tenantGlConfig?.bankGlId ?? null,
          gl_account_label: tenantGlConfig?.bankGlLabel ?? "Bank",
          control_account_id: null, control_account_label: "",
          pool_id: null, entity_account_id: eaInfo?.id ?? null,
          transaction_date: txDate, entry_type: "bank_payment",
          reference: `Legacy CFT ${rootCftId}`, legacy_transaction_id: rootCftId,
        });
      } else {
        // Fallback: if no is_bank entries but GL entries are out of balance, insert bank payment for the imbalance
        const glCheck = proposed.filter(e => e.gl_account_id);
        const dr = glCheck.reduce((s, e) => s + e.debit, 0);
        const cr = glCheck.reduce((s, e) => s + e.credit, 0);
        const imbalance = Math.abs(dr - cr);
        if (imbalance > 0.01) {
          proposed.push({
            description: "Bank Payment (missing)",
            debit: dr > cr ? 0 : imbalance,
            credit: dr > cr ? imbalance : 0,
            gl_account_id: tenantGlConfig?.bankGlId ?? null,
            gl_account_label: tenantGlConfig?.bankGlLabel ?? "Bank",
            control_account_id: null, control_account_label: "",
            pool_id: null, entity_account_id: eaInfo?.id ?? null,
            transaction_date: txDate, entry_type: "bank_payment",
            reference: `Legacy CFT ${rootCftId}`, legacy_transaction_id: rootCftId,
          });
        }
      }
    }

    // ── Stock Purchase / Stock Sale — Bank entry for total amount ──
    // Sum all 1948 (purchase) or 1949 (sale) entries to get the total stock value,
    // then add a balancing Bank GL entry.
    if (isStockPurchase || isStockSale) {
      const stockEntries = allEntries.filter(e =>
        (isStockPurchase && e.entry_type_id === "1948") ||
        (isStockSale && e.entry_type_id === "1949")
      );
      const stockTotal = stockEntries.reduce((sum, e) => sum + (e.debit > 0 ? e.debit : e.credit), 0);
      if (stockTotal > 0) {
        proposed.push({
          description: isStockPurchase ? "Bank Payment — Stock Purchase" : "Bank Receipt — Stock Sale",
          debit: isStockPurchase ? 0 : stockTotal,
          credit: isStockPurchase ? stockTotal : 0,
          gl_account_id: tenantGlConfig?.bankGlId ?? null,
          gl_account_label: tenantGlConfig?.bankGlLabel ?? "Bank",
          control_account_id: null, control_account_label: "",
          pool_id: null, entity_account_id: eaInfo?.id ?? null,
          transaction_date: txDate, entry_type: isStockPurchase ? "bank_payment" : "bank_receipt",
          reference: `Legacy CFT ${rootCftId}`, legacy_transaction_id: rootCftId,
        });
      }
    }

    const glEntries = proposed.filter(e => e.gl_account_id);
    const totalDebit = glEntries.reduce((s, e) => s + e.debit, 0);
    const totalCredit = glEntries.reduce((s, e) => s + e.credit, 0);
    const isBalanced = Math.abs(totalDebit - totalCredit) < 0.01;

    return {
      root: group.root,
      children: group.children,
      entries: proposed,
      totalDebit,
      totalCredit,
      isBalanced,
      entityName: eaInfo?.entity_name ?? `Entity#${entityId}`,
    };
  };

  // Build all proposed groups (memoized)
  const allProposed = useMemo(() => {
    if (!glMappings?.length || !controlAccounts || !grouped.length) return [];
    return grouped.map(g => buildProposedForGroup(g));
  }, [grouped, glMappings, controlAccounts, allControlAccounts, entityAccountMap, tenantGlConfig]);

  const buildPreview = () => {
    setProposedGroups(allProposed);
    setExpandedPreview(new Set());
    setShowPreview(true);
  };

  // ═══════════════════════════════════════════════════════════════
  // POST: Commit the proposed entries to cashflow_transactions
  // ═══════════════════════════════════════════════════════════════
  const postEntries = async (groups?: ProposedGroup[]) => {
    if (!currentTenant) return;
    const source = groups ?? proposedGroups;
    const balanced = source.filter(g => g.isBalanced);
    if (balanced.length === 0) {
      toast.error("No balanced groups to post");
      return;
    }

    setPosting(true);
    try {
      // Check which legacy_transaction_ids are already posted
      const legacyIds = [...new Set(balanced.flatMap(g => g.entries.map(e => e.legacy_transaction_id)))];
      const { data: existing } = await supabase
        .from("cashflow_transactions")
        .select("legacy_transaction_id")
        .in("legacy_transaction_id", legacyIds);

      const alreadyPosted = new Set((existing ?? []).map(e => e.legacy_transaction_id));

      const toInsert = balanced
        .filter(g => !alreadyPosted.has(g.root.cft_id))
        .flatMap(g =>
          g.entries.map(e => ({
            tenant_id: currentTenant.id,
            transaction_date: e.transaction_date,
            description: e.description,
            debit: e.debit,
            credit: e.credit,
            gl_account_id: e.gl_account_id,
            control_account_id: e.control_account_id,
            pool_id: e.pool_id,
            entity_account_id: e.entity_account_id,
            entry_type: e.entry_type,
            reference: e.reference,
            legacy_transaction_id: e.legacy_transaction_id,
            is_bank: e.entry_type === "bank_receipt" || e.entry_type === "bank_payment",
            is_active: true,
          }))
        );

      if (toInsert.length === 0) {
        toast.info("All groups already posted");
        setShowPreview(false);
        setPosting(false);
        return;
      }

      // Insert in batches of 100
      const BATCH = 100;
      for (let i = 0; i < toInsert.length; i += BATCH) {
        const batch = toInsert.slice(i, i + BATCH);
        const { error } = await supabase.from("cashflow_transactions").insert(batch);
        if (error) throw error;
      }

      // Mark legacy_id_mappings as posted
      const postedRootIds = balanced
        .filter(g => !alreadyPosted.has(g.root.cft_id))
        .map(g => g.root.cft_id);

      if (postedRootIds.length > 0) {
        // Collect all legacy CFT IDs in the posted groups (root + children)
        const allCftIds = balanced
          .filter(g => !alreadyPosted.has(g.root.cft_id))
          .flatMap(g => [g.root.cft_id, ...g.children.map(c => c.cft_id)]);

        const uniqueCftIds = [...new Set(allCftIds)];
        const MARK_BATCH = 100;
        for (let i = 0; i < uniqueCftIds.length; i += MARK_BATCH) {
          const batch = uniqueCftIds.slice(i, i + MARK_BATCH);
          await (supabase as any)
            .from("legacy_id_mappings")
            .update({
              is_posted: true,
              posted_at: new Date().toISOString(),
              posted_by: user?.id ?? null,
            })
            .eq("table_name", "cashflow_transactions")
            .eq("tenant_id", currentTenant.id)
            .in("legacy_id", batch);
        }
      }

      toast.success(`Posted ${toInsert.length} entries from ${balanced.length - alreadyPosted.size} transaction groups`);
      setShowPreview(false);
    } catch (err: any) {
      toast.error("Post failed: " + err.message);
    } finally {
      setPosting(false);
    }
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
            Select a transaction type, load entries, preview the proposed balanced CFT postings, then post.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-3 items-end">
            <div className="space-y-1">
              <label className="text-sm font-medium">From Date</label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("w-[160px] justify-start text-left font-normal")}>
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {format(dateFrom, "dd MMM yyyy")}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={dateFrom} onSelect={d => d && setDateFrom(d)} initialFocus className={cn("p-3 pointer-events-auto")} />
                </PopoverContent>
              </Popover>
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">To Date</label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("w-[160px] justify-start text-left font-normal")}>
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {format(dateTo, "dd MMM yyyy")}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={dateTo} onSelect={d => d && setDateTo(d)} initialFocus className={cn("p-3 pointer-events-auto")} />
                </PopoverContent>
              </Popover>
            </div>
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
              <>
                <Button variant="outline" size="sm" onClick={expandAll}>
                  Expand All ({grouped.length})
                </Button>
                <Button variant="secondary" size="sm" onClick={buildPreview} className="gap-2">
                  <FileSearch className="h-4 w-4" />
                  Preview CFT Posting
                </Button>
                {allProposed.filter(g => g.isBalanced).length > 0 && (
                  <Button
                    size="sm"
                    onClick={() => {
                      postEntries(allProposed);
                    }}
                    disabled={posting}
                    className="gap-2"
                  >
                    {posting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                    Post {allProposed.filter(g => g.isBalanced).length} Balanced Groups
                  </Button>
                )}
              </>
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
              <span>{selectedTypeName} — {allProposed.length} transactions from 1 Mar 2025</span>
              <div className="flex gap-2">
                {(() => {
                  const bal = allProposed.filter(g => g.isBalanced).length;
                  const unbal = allProposed.length - bal;
                  return (
                    <>
                      <Badge variant="outline" className="gap-1">
                        <CheckCircle2 className="h-3 w-3 text-green-600" /> {bal} balanced
                      </Badge>
                      {unbal > 0 && (
                        <Badge variant="destructive" className="gap-1">
                          <AlertTriangle className="h-3 w-3" /> {unbal} unbalanced
                        </Badge>
                      )}
                      <Badge variant="outline">
                        {allProposed.reduce((s, g) => s + g.entries.length, 0)} proposed entries
                      </Badge>
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
                  {allProposed.map(pg => {
                    const isExpanded = expandedParents.has(pg.root.cft_id);
                    const rootMapping = getGlMapping(pg.root.entry_type_id);

                    return (
                      <React.Fragment key={`group-${pg.root.cft_id}`}>
                        {/* Summary row */}
                        <TableRow
                          key={`root-${pg.root.cft_id}`}
                          className={`cursor-pointer hover:bg-muted/50 font-medium ${!pg.isBalanced ? 'bg-destructive/5' : ''}`}
                          onClick={() => toggleParent(pg.root.cft_id)}
                        >
                          <TableCell className="px-2">
                            {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                          </TableCell>
                          <TableCell className="text-xs font-mono">{pg.root.cft_id}</TableCell>
                          <TableCell className="text-xs">{pg.root.transaction_date}</TableCell>
                          <TableCell className="text-xs">
                            <Badge variant="outline" className="font-mono text-[10px]">
                              {pg.entries.length} entries
                            </Badge>
                            <span className="ml-1 text-muted-foreground">
                              {rootMapping?.entry_type_name ?? ""}
                              {pg.root.inc_exp_id !== "0" && incExpMap?.[pg.root.inc_exp_id]
                                ? ` — ${incExpMap[pg.root.inc_exp_id].description}`
                                : ""}
                            </span>
                          </TableCell>
                          <TableCell className="text-xs">{pg.entityName}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">Proposed</TableCell>
                          <TableCell className="text-xs text-right font-mono">
                            {pg.totalDebit > 0 ? formatCurrency(pg.totalDebit) : ""}
                          </TableCell>
                          <TableCell className="text-xs text-right font-mono">
                            {pg.totalCredit > 0 ? formatCurrency(pg.totalCredit) : ""}
                          </TableCell>
                          <TableCell className="text-xs text-right font-mono">
                            {pg.isBalanced ? (
                              <Badge variant="outline" className="text-[10px] gap-1">
                                <CheckCircle2 className="h-3 w-3 text-green-600" /> ✓
                              </Badge>
                            ) : (
                              <Badge variant="destructive" className="text-[10px] gap-1">
                                <AlertTriangle className="h-3 w-3" /> {formatCurrency(Math.abs(pg.totalDebit - pg.totalCredit))}
                              </Badge>
                            )}
                          </TableCell>
                        </TableRow>

                        {/* Expanded: show PROPOSED balanced entries */}
                        {isExpanded && pg.entries.map((e, i) => (
                          <TableRow key={`proposed-${pg.root.cft_id}-${i}`} className="bg-muted/30">
                            <TableCell></TableCell>
                            <TableCell className="text-xs font-mono text-muted-foreground">{pg.root.cft_id}</TableCell>
                            <TableCell className="text-xs text-muted-foreground">{e.transaction_date}</TableCell>
                            <TableCell className="text-xs font-medium">{e.description}</TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {e.gl_account_label || "—"}
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {e.control_account_label || "—"}
                            </TableCell>
                            <TableCell className="text-xs text-right font-mono">
                              {e.debit > 0 ? formatCurrency(e.debit) : ""}
                            </TableCell>
                            <TableCell className="text-xs text-right font-mono">
                              {e.credit > 0 ? formatCurrency(e.credit) : ""}
                            </TableCell>
                            <TableCell></TableCell>
                          </TableRow>
                        ))}
                      </React.Fragment>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ═══════════ PREVIEW DIALOG ═══════════ */}
      <Dialog open={showPreview} onOpenChange={setShowPreview}>
        <DialogContent className="max-w-5xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Preview CFT Posting — {selectedTypeName}</DialogTitle>
            <DialogDescription>
              Review the proposed balanced entries below. Only balanced groups (DR = CR) will be posted.
            </DialogDescription>
          </DialogHeader>

          <div className="flex gap-3 mb-2">
            {(() => {
              const bal = proposedGroups.filter(g => g.isBalanced).length;
              const unbal = proposedGroups.length - bal;
              return (
                <>
                  <Badge variant="outline" className="gap-1">
                    <CheckCircle2 className="h-3 w-3 text-green-600" /> {bal} balanced
                  </Badge>
                  {unbal > 0 && (
                    <Badge variant="destructive" className="gap-1">
                      <AlertTriangle className="h-3 w-3" /> {unbal} unbalanced
                    </Badge>
                  )}
                  <Badge variant="outline">
                    {proposedGroups.reduce((s, g) => s + g.entries.length, 0)} total CFT entries
                  </Badge>
                </>
              );
            })()}
          </div>

          <div className="space-y-1">
            {proposedGroups.map(pg => {
              const isOpen = expandedPreview.has(pg.root.cft_id);
              return (
                <div key={pg.root.cft_id} className={`border rounded-md ${!pg.isBalanced ? 'border-destructive/50 bg-destructive/5' : ''}`}>
                  <div
                    className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-muted/50"
                    onClick={() => {
                      setExpandedPreview(prev => {
                        const n = new Set(prev);
                        n.has(pg.root.cft_id) ? n.delete(pg.root.cft_id) : n.add(pg.root.cft_id);
                        return n;
                      });
                    }}
                  >
                    {isOpen ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
                    <span className="text-xs font-mono font-medium">CFT {pg.root.cft_id}</span>
                    <span className="text-xs text-muted-foreground">{pg.root.transaction_date}</span>
                    <span className="text-xs">{pg.entityName}</span>
                    <span className="ml-auto text-xs font-mono">
                      DR {formatCurrency(pg.totalDebit)} | CR {formatCurrency(pg.totalCredit)}
                    </span>
                    {pg.isBalanced ? (
                      <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
                    ) : (
                      <XCircle className="h-4 w-4 text-destructive shrink-0" />
                    )}
                  </div>

                  {isOpen && (
                    <div className="px-3 pb-2">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="text-xs">Description</TableHead>
                            <TableHead className="text-xs text-right">DR</TableHead>
                            <TableHead className="text-xs text-right">CR</TableHead>
                            <TableHead className="text-xs">GL Account</TableHead>
                            <TableHead className="text-xs">Control Account</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {pg.entries.map((e, i) => (
                            <TableRow key={i} className="text-xs">
                              <TableCell>{e.description}</TableCell>
                              <TableCell className="text-right font-mono">
                                {e.debit > 0 ? formatCurrency(e.debit) : ""}
                              </TableCell>
                              <TableCell className="text-right font-mono">
                                {e.credit > 0 ? formatCurrency(e.credit) : ""}
                              </TableCell>
                              <TableCell className="text-muted-foreground">{e.gl_account_label || "—"}</TableCell>
                              <TableCell className="text-muted-foreground">{e.control_account_label || "—"}</TableCell>
                            </TableRow>
                          ))}
                          <TableRow className="font-bold border-t-2">
                            <TableCell>Total</TableCell>
                            <TableCell className="text-right font-mono">{formatCurrency(pg.totalDebit)}</TableCell>
                            <TableCell className="text-right font-mono">{formatCurrency(pg.totalCredit)}</TableCell>
                            <TableCell></TableCell>
                            <TableCell>
                              {pg.isBalanced ? (
                                <Badge variant="outline" className="text-[10px] gap-1">
                                  <CheckCircle2 className="h-3 w-3 text-green-600" /> Balanced
                                </Badge>
                              ) : (
                                <Badge variant="destructive" className="text-[10px] gap-1">
                                  <AlertTriangle className="h-3 w-3" /> Off by {formatCurrency(Math.abs(pg.totalDebit - pg.totalCredit))}
                                </Badge>
                              )}
                            </TableCell>
                          </TableRow>
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setShowPreview(false)}>Cancel</Button>
            <Button
              onClick={() => postEntries()}
              disabled={posting || proposedGroups.filter(g => g.isBalanced).length === 0}
              className="gap-2"
            >
              {posting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
              Post {proposedGroups.filter(g => g.isBalanced).length} Balanced Groups
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default LegacyGlAllocation;
