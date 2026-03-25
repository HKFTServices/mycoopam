import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/contexts/TenantContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Loader2, CheckCircle2, XCircle, ChevronDown, ChevronRight, Eye, AlertTriangle, Play, FileSearch } from "lucide-react";
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
  { id: "1953", name: "Stock Purchase" },
  { id: "1954", name: "Stock Sale" },
  { id: "1952", name: "Income Expense" },
  { id: "1959", name: "Loan (Payout)" },
  { id: "1960", name: "Grant" },
  { id: "2000", name: "Loan Write-off" },
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

      const glIds = data.filter(d => d.gl_account_id).map(d => d.gl_account_id!);
      const { data: glAccounts } = await supabase
        .from("gl_accounts")
        .select("id, code, name")
        .in("id", glIds);

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

      return data.map(d => ({
        ...d,
        gl_account_code: d.gl_account_id ? glMap[d.gl_account_id]?.code : undefined,
        gl_account_name: d.gl_account_id ? glMap[d.gl_account_id]?.name : undefined,
        control_account_name: d.control_account_id
          ? `${caMap[d.control_account_id]?.name ?? "Unknown"} (${caMap[d.control_account_id]?.pools?.name ?? ""})`
          : undefined,
      })) as GlMapping[];
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
          .select("legacy_id, notes")
          .eq("table_name", "cashflow_transactions")
          .eq("tenant_id", currentTenant.id)
          .range(from, from + PAGE_SIZE - 1);

        if (error) throw error;
        allRows = allRows.concat(page ?? []);
        hasMore = (page?.length ?? 0) === PAGE_SIZE;
        from += PAGE_SIZE;
      }

      const fromDate = new Date("2025-03-01");
      const allParsed: { entry: LegacyCftEntry; txTypeId: string }[] = [];

      for (const row of allRows) {
        try {
          const n = JSON.parse(row.notes ?? "{}");
          const txDate = new Date(n.TransactionDate);
          if (txDate < fromDate) continue;

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
              transaction_date: n.TransactionDate?.split("T")[0] ?? n.TransactionDate?.split(" ")[0] ?? "",
              description: "",
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

      setCftEntries(entries);
      toast.success(`Loaded ${entries.length} entries from 1 Mar 2025`);
    } catch (err: any) {
      toast.error("Failed to load: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  // Group entries by parent (orphans already re-parented during loading)
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
      return { label: `→ ${getControlAccountName(entry.cash_account_id)}`, mapped: true };
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

    return { label: "⚠️ GL not set", mapped: false };
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

    const proposed: ProposedCftEntry[] = [];

    // Pool deposit entry type IDs (all resolve via CashAccountID)
    const poolDepositEntryTypes = new Set([
      "1924", // Member Fees
      "1927", "1928", "1929", "1930", // Asset, Reserve, Health, Health Reserve
      "1986", // Member Account
      "1989", // Funeral Fund
      "1994", // Crypto
      "2006", // Gold
    ]);

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
      else if (entry.entry_type_id === "1922" && mapping.split_rule?.splits) {
        for (const split of mapping.split_rule.splits) {
          proposed.push({
            description: split.description,
            debit: 0,
            credit: split.amount,
            gl_account_id: split.gl_account_id,
            gl_account_label: split.description,
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
        const isFeeEntry = entry.entry_type_id === "1924"; // Member Fees go to admin/fee GL
        const glId = isFeeEntry
          ? (tenantGlConfig?.membershipFeeGlId ?? null)
          : (tenantGlConfig?.poolAllocationGlId ?? null);
        const glLabel = isFeeEntry
          ? (tenantGlConfig?.membershipFeeGlLabel ?? "Fee Income")
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

    // Balance check: only count entries that have a GL account (exclude cash control-only entries)
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
  const postEntries = async () => {
    if (!currentTenant) return;
    const balanced = proposedGroups.filter(g => g.isBalanced);
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
            is_bank: e.entry_type === "bank_receipt",
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

      toast.success(`Posted ${toInsert.length} entries from ${balanced.length} transaction groups`);
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
                      <>
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
                            <span className="ml-1 text-muted-foreground">{rootMapping?.entry_type_name ?? ""}</span>
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
                      </>
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
              onClick={postEntries}
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
