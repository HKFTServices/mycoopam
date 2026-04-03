import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useTenant } from "@/contexts/TenantContext";
import { formatLocalDate } from "@/lib/formatDate";
import { generateAdminInvoiceHtml, openInvoicePrintWindow, type AdminInvoiceData } from "@/lib/generateAdminInvoice";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Loader2, CalendarDays, FileText, CheckCircle2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

type FeeCalcLine = {
  feeTypeName: string;
  feeTypeCode: string;
  poolName: string;
  basis: string;
  grossAmount: number;
  percentage: number;
  calculatedFee: number;
  adminPercentage: number;
  adminFee: number;
  paymentMethod: string;
  invoiceByAdmin: boolean;
  // posting references
  feeTypeId: string;
  poolId: string;
  poolCashControlId: string;
  glAccountId: string;
  cashControlAccountId: string | null;
  creditControlAccountId: string | null;
};

type TxDetailLine = {
  txTypeName: string;
  txDate: string;
  txAmount: number;
  tierPct: number;
  adminFee: number;
  entityName: string;
};

const formatCurrency = (v: number) =>
  `R ${Number(v).toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const MonthEndRunDialog = ({ open, onOpenChange, tenantOverride }: { open: boolean; onOpenChange: (o: boolean) => void; tenantOverride?: { id: string; name: string } | null }) => {
  const { user } = useAuth();
  const { currentTenant } = useTenant();
  const activeTenant = tenantOverride || currentTenant;
  const queryClient = useQueryClient();
  const [runDate, setRunDate] = useState(formatLocalDate());
  const [calculated, setCalculated] = useState(false);
  const [feeLines, setFeeLines] = useState<FeeCalcLine[]>([]);
  const [txDetailLines, setTxDetailLines] = useState<TxDetailLine[]>([]);
  const [posted, setPosted] = useState(false);

  // ── Queries ──
  const { data: pools = [] } = useQuery({
    queryKey: ["eom_pools", activeTenant?.id],
    queryFn: async () => {
      if (!activeTenant) return [];
      const { data } = await (supabase as any).from("pools").select("id, name, cash_control_account_id").eq("tenant_id", activeTenant.id).eq("is_active", true).order("name");
      return data ?? [];
    },
    enabled: !!activeTenant && open,
  });

  const { data: poolFeeConfigs = [] } = useQuery({
    queryKey: ["eom_pool_fee_configs", activeTenant?.id],
    queryFn: async () => {
      if (!activeTenant) return [];
      const { data } = await (supabase as any).from("pool_fee_configurations")
        .select("*, transaction_fee_types(id, name, code, based_on, payment_method, gl_account_id, cash_control_account_id, credit_control_account_id)")
        .eq("tenant_id", activeTenant.id).eq("is_active", true);
      return data ?? [];
    },
    enabled: !!activeTenant && open,
  });

  const { data: feeRules = [] } = useQuery({
    queryKey: ["eom_fee_rules", activeTenant?.id],
    queryFn: async () => {
      if (!activeTenant) return [];
      const { data } = await (supabase as any).from("transaction_fee_rules")
        .select("*, transaction_fee_types(id, name, code, cash_control_account_id, gl_account_id), transaction_fee_tiers(*)")
        .eq("tenant_id", activeTenant.id).eq("is_active", true);
      return data ?? [];
    },
    enabled: !!activeTenant && open,
  });

  const { data: adminPool } = useQuery({
    queryKey: ["eom_admin_pool", activeTenant?.id],
    queryFn: async () => {
      if (!activeTenant) return null;
      const { data } = await (supabase as any).from("pools").select("id, name, cash_control_account_id")
        .eq("tenant_id", activeTenant.id).ilike("name", "%admin%").maybeSingle();
      return data;
    },
    enabled: !!activeTenant && open,
  });

  // ── Calculate Fees ──
  const calculateMutation = useMutation({
    mutationFn: async () => {
      if (!activeTenant) throw new Error("No tenant");

      const lines: FeeCalcLine[] = [];
      const monthStart = runDate.substring(0, 7) + "-01";

      // Pre-fetch pool units and prices (used by multiple sections)
      const { data: unitData } = await (supabase as any).rpc("get_pool_units", { p_tenant_id: activeTenant.id, p_up_to_date: runDate });
      const { data: priceData } = await (supabase as any).rpc("get_latest_pool_prices", { p_tenant_id: activeTenant.id });

      // 1) PERCENTAGE OF POOL VALUE fees — journal recoveries (pool → admin)
      // These generate journals regardless of payment_method, AND if payment_method is "bank"
      // they also appear as invoice items payable to the administrator.
      const pctConfigs = poolFeeConfigs.filter((c: any) => c.transaction_fee_types?.based_on === "pool_value_percentage" && (c.percentage > 0));
      
      for (const config of pctConfigs) {
        const ft = config.transaction_fee_types;
        const pool = pools.find((p: any) => p.id === config.pool_id);
        if (!pool || !ft) continue;

        const poolUnits = unitData?.find((u: any) => u.pool_id === config.pool_id)?.total_units || 0;
        const poolPrice = priceData?.find((p: any) => p.pool_id === config.pool_id)?.unit_price_sell || 0;
        const poolValue = poolUnits * poolPrice;
        const annualPct = config.percentage / 100;
        const monthlyFee = Math.round((poolValue * annualPct / 12) * 100) / 100;

        if (monthlyFee <= 0) continue;

        // Use the fee type's payment_method: "journal" = recovery, "bank" = admin fee payable
        lines.push({
          feeTypeName: ft.name,
          feeTypeCode: ft.code,
          poolName: pool.name,
          basis: `${config.percentage}% p.a. of pool value`,
          grossAmount: poolValue,
          percentage: config.percentage,
          calculatedFee: monthlyFee,
          adminPercentage: 0,
          adminFee: ft.payment_method === "bank" ? monthlyFee : 0,
          paymentMethod: ft.payment_method, // Keep original: "journal" or "bank"
          invoiceByAdmin: ft.payment_method === "bank",
          feeTypeId: ft.id,
          poolId: config.pool_id,
          poolCashControlId: pool.cash_control_account_id,
          glAccountId: ft.gl_account_id,
          cashControlAccountId: ft.cash_control_account_id,
          creditControlAccountId: ft.credit_control_account_id,
        });
      }

      // 2) FIXED AMOUNT PER POOL fees (vault fees)
      const fixedConfigs = poolFeeConfigs.filter((c: any) => c.transaction_fee_types?.based_on === "pool_fixed_amounts" && (c.fixed_amount > 0));
      
      for (const config of fixedConfigs) {
        const ft = config.transaction_fee_types;
        const pool = pools.find((p: any) => p.id === config.pool_id);
        if (!pool || !ft) continue;

        lines.push({
          feeTypeName: ft.name,
          feeTypeCode: ft.code,
          poolName: pool.name,
          basis: `Fixed R${config.fixed_amount}/month`,
          grossAmount: 0,
          percentage: 0,
          calculatedFee: Number(config.fixed_amount),
          adminPercentage: 0,
          adminFee: config.invoice_by_administrator ? Number(config.fixed_amount) : 0,
          paymentMethod: ft.payment_method,
          invoiceByAdmin: config.invoice_by_administrator || false,
          feeTypeId: ft.id,
          poolId: config.pool_id,
          poolCashControlId: pool.cash_control_account_id,
          glAccountId: ft.gl_account_id,
          cashControlAccountId: ft.cash_control_account_id,
          creditControlAccountId: ft.credit_control_account_id,
        });
      }

      // 3) TRANSACTIONAL FEES - admin share from transactions this month
      const { data: monthTxns } = await (supabase as any).from("transactions")
        .select("id, amount, fee_amount, transaction_type_id, transaction_date, notes, entity_account_id")
        .eq("tenant_id", activeTenant.id)
        .eq("status", "approved")
        .gte("transaction_date", monthStart)
        .lte("transaction_date", runDate);

      const txns = monthTxns ?? [];

      // Fetch fee rules directly inside the mutation to avoid closure timing issues
      const { data: freshRules } = await (supabase as any).from("transaction_fee_rules")
        .select("*, transaction_fee_types(id, name, code, cash_control_account_id, gl_account_id)")
        .eq("tenant_id", activeTenant.id)
        .eq("is_active", true);

      const allRules = freshRules ?? [];

      // Fetch tiers separately and group by fee_rule_id
      const ruleIds = allRules.map((r: any) => r.id);
      let tiersMap: Record<string, any[]> = {};
      if (ruleIds.length > 0) {
        const { data: allTiers } = await (supabase as any).from("transaction_fee_tiers")
          .select("*")
          .in("fee_rule_id", ruleIds);
        for (const tier of allTiers ?? []) {
          if (!tiersMap[tier.fee_rule_id]) tiersMap[tier.fee_rule_id] = [];
          tiersMap[tier.fee_rule_id].push(tier);
        }
      }

      for (const rule of allRules) {
        rule.transaction_fee_tiers = tiersMap[rule.id] || [];
      }

      const rulesWithAdmin = allRules.filter((r: any) =>
        r.admin_share_percentage > 0 ||
        (r.calculation_method === "sliding_scale" && r.transaction_fee_tiers.length > 0)
      );

      const { data: txTypes } = await (supabase as any).from("transaction_types").select("id, name").eq("tenant_id", activeTenant.id);
      const txTypeMap: Record<string, string> = {};
      for (const tt of txTypes ?? []) txTypeMap[tt.id] = tt.name;

      const entityAccountIds = [...new Set(txns.map((t: any) => t.entity_account_id).filter(Boolean))];
      let entityNameMap: Record<string, string> = {};
      if (entityAccountIds.length > 0) {
        const { data: eaData } = await (supabase as any).from("entity_accounts")
          .select("id, account_number, entities(name, last_name)")
          .in("id", entityAccountIds);
        for (const ea of eaData ?? []) {
          const ent = (ea as any).entities;
          entityNameMap[ea.id] = ent ? (ent.last_name ? `${ent.name} ${ent.last_name}` : ent.name) : ea.account_number || "Unknown";
        }
      }

      const details: TxDetailLine[] = [];

      for (const rule of rulesWithAdmin) {
        const ruleTxns = txns.filter((tx: any) => tx.transaction_type_id === rule.transaction_type_id);
        if (ruleTxns.length === 0) continue;

        const ft = rule.transaction_fee_types;
        const txTypeName = txTypeMap[rule.transaction_type_id] || "Unknown";

        if (rule.calculation_method === "sliding_scale" && rule.transaction_fee_tiers?.length > 0) {
          const tiers = [...rule.transaction_fee_tiers].sort((a: any, b: any) => a.min_amount - b.min_amount);
          let totalAdminFee = 0;
          let totalGross = 0;

          for (const tx of ruleTxns) {
            const txAmount = Number(tx.amount) || 0;
            totalGross += txAmount;
            const tier = tiers.find((t: any) =>
              txAmount >= t.min_amount && (t.max_amount === null || txAmount <= t.max_amount)
            );
            const tierPct = tier?.admin_percentage || 0;
            const txAdminFee = tierPct > 0 ? Math.round((txAmount * tierPct / 100) * 100) / 100 : 0;
            totalAdminFee += txAdminFee;

            details.push({
              txTypeName,
              txDate: tx.transaction_date,
              txAmount,
              tierPct,
              adminFee: txAdminFee,
              entityName: entityNameMap[tx.entity_account_id] || "—",
            });
          }

          if (totalAdminFee > 0) {
            const effectivePct = totalGross > 0 ? Math.round((totalAdminFee / totalGross) * 10000) / 100 : 0;
            lines.push({
              feeTypeName: `Admin Fee: ${txTypeName}`,
              feeTypeCode: ft?.code || "ADMIN",
              poolName: "—",
              basis: `Sliding scale on ${formatCurrency(totalGross)} (${ruleTxns.length} txns, eff. ${effectivePct}%)`,
              grossAmount: totalGross,
              percentage: effectivePct,
              calculatedFee: totalAdminFee,
              adminPercentage: effectivePct,
              adminFee: totalAdminFee,
              paymentMethod: "invoice",
              invoiceByAdmin: true,
              feeTypeId: ft?.id || "",
              poolId: "",
              poolCashControlId: "",
              glAccountId: ft?.gl_account_id || "",
              cashControlAccountId: ft?.cash_control_account_id || "",
              creditControlAccountId: null,
            });
          }
        } else if (rule.admin_share_percentage > 0) {
          const adminPct = Number(rule.admin_share_percentage);
          let totalGross = 0;
          let totalAdminFee = 0;

          for (const tx of ruleTxns) {
            const txAmount = Number(tx.amount) || 0;
            totalGross += txAmount;
            const txAdminFee = Math.round((txAmount * adminPct / 100) * 100) / 100;
            totalAdminFee += txAdminFee;

            details.push({
              txTypeName,
              txDate: tx.transaction_date,
              txAmount,
              tierPct: adminPct,
              adminFee: txAdminFee,
              entityName: entityNameMap[tx.entity_account_id] || "—",
            });
          }

          if (totalAdminFee > 0) {
            lines.push({
              feeTypeName: `Admin Fee: ${txTypeName}`,
              feeTypeCode: ft?.code || "ADMIN",
              poolName: "—",
              basis: `${adminPct}% of ${formatCurrency(totalGross)} (${ruleTxns.length} txns)`,
              grossAmount: totalGross,
              percentage: adminPct,
              calculatedFee: totalAdminFee,
              adminPercentage: adminPct,
              adminFee: totalAdminFee,
              paymentMethod: "invoice",
              invoiceByAdmin: true,
              feeTypeId: ft?.id || "",
              poolId: "",
              poolCashControlId: "",
              glAccountId: ft?.gl_account_id || "",
              cashControlAccountId: ft?.cash_control_account_id || "",
              creditControlAccountId: null,
            });
          }
        }
      }

      return { lines, details };
    },
    onSuccess: ({ lines, details }) => {
      setFeeLines(lines);
      setTxDetailLines(details);
      setCalculated(true);
      toast.success(`Calculated ${lines.length} fee line items`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // ── Post Journals ──
  const postMutation = useMutation({
    mutationFn: async () => {
      if (!activeTenant || !user || !adminPool) throw new Error("Missing context");

      const adminCashControlId = adminPool.cash_control_account_id;

      // ── Look up recovery GL accounts by code ──
      const { data: recoveryGls, error: glErr } = await (supabase as any).from("gl_accounts")
        .select("id, code")
        .eq("tenant_id", activeTenant.id)
        .in("code", ["1000", "2020", "4080"]);
      if (glErr) throw glErr;

      const gl1000Id = recoveryGls?.find((g: any) => g.code === "1000")?.id;
      const gl2020Id = recoveryGls?.find((g: any) => g.code === "2020")?.id;
      const gl4080Id = recoveryGls?.find((g: any) => g.code === "4080")?.id;
      if (!gl1000Id) throw new Error("Bank GL account (1000) not found");
      if (!gl2020Id || !gl4080Id) throw new Error("Recovery GL accounts (2020 Member Interest / 4080 Recoveries) not found");

      // ── 1) Post RECOVERY JOURNALS (pool → admin cash) ──
      // Only fee types configured with payment_method "journal" create recovery journals.
      // VAULT_FEES_EXP (bank) must NOT be included — vault recovery is handled by
      // the separate MONTHLY_VAULT_RECOVERY config which already has payment_method "journal".
      const recoveryLines = feeLines.filter(l =>
        l.poolId &&
        l.poolCashControlId &&
        l.calculatedFee > 0 &&
        l.paymentMethod === "journal"
      );

      for (const line of recoveryLines) {
        // Debit leg: Admin Cash control + GL 4080 (Recoveries from Pools — income)
        // GL 4080 is placed on the CFT debit side so that contra-posting (CFT Dr → GL Cr)
        // produces a GL Credit on the income account = positive income in IS.
        const { data: parent, error: e1 } = await (supabase as any).from("cashflow_transactions").insert({
          tenant_id: activeTenant.id,
          transaction_date: runDate,
          entry_type: "journal",
          is_bank: false,
          gl_account_id: gl4080Id,
          control_account_id: adminCashControlId,
          debit: line.calculatedFee,
          credit: 0,
          vat_amount: 0,
          amount_excl_vat: line.calculatedFee,
          description: `EOM: ${line.feeTypeName} — ${line.poolName}`,
          reference: `EOM-${runDate}`,
          notes: `Month-end run: ${line.basis}`,
          posted_by: user.id,
        }).select("id").single();
        if (e1) throw e1;

        // Credit leg: Pool Cash control + GL 2020 (Member Interest — liability, no IS impact)
        const { error: e2 } = await (supabase as any).from("cashflow_transactions").insert({
          tenant_id: activeTenant.id,
          transaction_date: runDate,
          entry_type: "journal",
          is_bank: false,
          parent_id: parent.id,
          gl_account_id: gl2020Id,
          control_account_id: line.poolCashControlId,
          debit: 0,
          credit: line.calculatedFee,
          vat_amount: 0,
          amount_excl_vat: line.calculatedFee,
          description: `EOM: ${line.feeTypeName} — ${line.poolName}`,
          reference: `EOM-${runDate}`,
          notes: `Month-end run: ${line.basis}`,
          posted_by: user.id,
        });
        if (e2) throw e2;
      }

      // ── 2) Post BANK entry (single payment to administrator) ──
      // The bank payment is one consolidated credit from Admin Cash for the full invoice total.
      // It includes monthly admin fees + transactional admin fees + vault fees.
      const bankLines = feeLines.filter(l => l.paymentMethod === "bank" && l.calculatedFee > 0);
      const invoiceLines = feeLines.filter(l => l.paymentMethod === "invoice" && l.adminFee > 0);

      // Aggregate into two GL buckets for the expense journals
      const adminFeesTotal = bankLines
        .filter(l => l.feeTypeCode !== "VAULT_FEES_EXP")
        .reduce((s, l) => s + l.calculatedFee, 0)
        + invoiceLines.reduce((s, l) => s + l.adminFee, 0); // transactional admin fees

      const vaultFeesTotal = bankLines
        .filter(l => l.feeTypeCode === "VAULT_FEES_EXP")
        .reduce((s, l) => s + l.calculatedFee, 0);

      const bankGrandTotal = adminFeesTotal + vaultFeesTotal;

      if (bankGrandTotal > 0) {
        const adminGlId = bankLines.find(l => l.feeTypeCode !== "VAULT_FEES_EXP")?.glAccountId || null;
        const vaultGlId = bankLines.find(l => l.feeTypeCode === "VAULT_FEES_EXP")?.glAccountId || null;

        // Single bank entry: Credit Admin Cash control for the total invoice amount
        const { error: eBankEntry } = await (supabase as any).from("cashflow_transactions").insert({
          tenant_id: activeTenant.id,
          transaction_date: runDate,
          entry_type: "bank",
          is_bank: true,
          gl_account_id: gl1000Id,
          control_account_id: adminCashControlId,
          debit: 0,
          credit: bankGrandTotal,
          vat_amount: 0,
          amount_excl_vat: bankGrandTotal,
          description: `EOM Bank Payment: Administrator Invoice`,
          reference: `EOM-BANK-${runDate}`,
          notes: `Month-end admin invoice payment`,
          posted_by: user.id,
        });
        if (eBankEntry) throw eBankEntry;

        // Standalone expense journal: Administration Fees (monthly + transactional)
        // Posted as CFT credit so that contra-posting (CFT Cr → GL Dr) produces
        // a GL Debit on the expense account = positive expense in IS.
        if (adminFeesTotal > 0 && adminGlId) {
          const { error: eAdminGl } = await (supabase as any).from("cashflow_transactions").insert({
            tenant_id: activeTenant.id,
            transaction_date: runDate,
            entry_type: "journal",
            is_bank: false,
            gl_account_id: adminGlId,
            control_account_id: null,
            debit: 0,
            credit: adminFeesTotal,
            vat_amount: 0,
            amount_excl_vat: adminFeesTotal,
            description: `EOM Expense: Administration Fees`,
            reference: `EOM-BANK-${runDate}`,
            notes: `Monthly administration fees`,
            posted_by: user.id,
          });
          if (eAdminGl) throw eAdminGl;
        }

        // Standalone expense journal: Vault Fees
        if (vaultFeesTotal > 0 && vaultGlId) {
          const { error: eVaultGl } = await (supabase as any).from("cashflow_transactions").insert({
            tenant_id: activeTenant.id,
            transaction_date: runDate,
            entry_type: "journal",
            is_bank: false,
            gl_account_id: vaultGlId,
            control_account_id: null,
            debit: 0,
            credit: vaultFeesTotal,
            vat_amount: 0,
            amount_excl_vat: vaultFeesTotal,
            description: `EOM Expense: Vault Fees`,
            reference: `EOM-BANK-${runDate}`,
            notes: `Monthly vault storage fees`,
            posted_by: user.id,
          });
          if (eVaultGl) throw eVaultGl;
        }
      }
    },
    onSuccess: () => {
      setPosted(true);
      queryClient.invalidateQueries({ queryKey: ["cft_journal_entries"] });
      queryClient.invalidateQueries({ queryKey: ["cft_bank_entries"] });
      queryClient.invalidateQueries({ queryKey: ["cft_control_balances"] });
      queryClient.invalidateQueries({ queryKey: ["report_is"] });
      queryClient.invalidateQueries({ queryKey: ["report_bs"] });
      toast.success("Month-end journals & bank entries posted successfully");

      // Auto-generate and open invoice
      generateAndOpenInvoice();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // ── Totals ──
  const journalLines = feeLines.filter(l => l.paymentMethod === "journal");
  const totalJournalFees = journalLines.reduce((s, l) => s + l.calculatedFee, 0);
  const totalAdminFeesBank = feeLines.filter(l => l.paymentMethod === "bank" && l.feeTypeCode !== "VAULT_FEES_EXP").reduce((s, l) => s + l.calculatedFee, 0);
  const totalVaultInvoice = feeLines.filter(l => l.paymentMethod === "bank" && l.feeTypeCode === "VAULT_FEES_EXP").reduce((s, l) => s + l.calculatedFee, 0);
  const totalTransactionalAdmin = feeLines.filter(l => l.paymentMethod === "invoice").reduce((s, l) => s + l.adminFee, 0);
  const grandInvoiceTotal = totalAdminFeesBank + totalVaultInvoice + totalTransactionalAdmin;

  const generateAndOpenInvoice = () => {
    const bankNonVault = feeLines.filter(l => l.paymentMethod === "bank" && l.feeTypeCode !== "VAULT_FEES_EXP");
    const bankVault = feeLines.filter(l => l.paymentMethod === "bank" && l.feeTypeCode === "VAULT_FEES_EXP");

    const invoiceData: AdminInvoiceData = {
      invoiceDate: new Date().toLocaleDateString("en-ZA"),
      runDate,
      tenantName: activeTenant?.name ?? "Tenant",
      legalEntityName: null,
      logoUrl: null,
      adminFeesLines: bankNonVault.map(l => ({
        feeTypeName: l.feeTypeName,
        poolName: l.poolName,
        basis: l.basis,
        poolValue: l.grossAmount,
        amount: l.calculatedFee,
      })),
      vaultFeesLines: bankVault.map(l => ({
        feeTypeName: l.feeTypeName,
        poolName: l.poolName,
        basis: l.basis,
        poolValue: 0,
        amount: l.calculatedFee,
      })),
      txDetailLines: txDetailLines.map(d => ({
        date: d.txDate,
        type: d.txTypeName,
        member: d.entityName,
        amount: d.txAmount,
        adminPct: d.tierPct,
        adminFee: d.adminFee,
      })),
      totalAdminFees: totalAdminFeesBank,
      totalVaultFees: totalVaultInvoice,
      totalTransactionalFees: totalTransactionalAdmin,
      grandTotal: grandInvoiceTotal,
    };

    // Fetch branding then open
    (async () => {
      try {
        const { data: config } = await (supabase as any)
          .from("tenant_configuration")
          .select("legal_entity_id, logo_url")
          .eq("tenant_id", activeTenant?.id)
          .maybeSingle();
        if (config?.logo_url) invoiceData.logoUrl = config.logo_url;
        if (config?.legal_entity_id) {
          const { data: entity } = await supabase.from("entities").select("name").eq("id", config.legal_entity_id).maybeSingle();
          if (entity?.name) invoiceData.legalEntityName = entity.name;
        }
      } catch { /* use defaults */ }

      const html = generateAdminInvoiceHtml(invoiceData);
      openInvoicePrintWindow(html);

      // Auto-save invoice to tenant_invoices for Head Office tracking
      try {
        const monthStart = runDate.substring(0, 7) + "-01";
        const periodEnd = runDate;
        
        // Fetch head office settings for invoice numbering
        const { data: hoSettings } = await (supabase as any)
          .from("head_office_settings")
          .select("id, invoice_prefix, invoice_next_number")
          .limit(1)
          .maybeSingle();

        let invoiceNumber = `EOM-${runDate}`;
        if (hoSettings) {
          const prefix = hoSettings.invoice_prefix || "HKFT";
          invoiceNumber = `${prefix}-${String(hoSettings.invoice_next_number || 1).padStart(5, "0")}`;
          // Increment next number
          await (supabase as any)
            .from("head_office_settings")
            .update({ invoice_next_number: (hoSettings.invoice_next_number || 1) + 1 })
            .eq("id", hoSettings.id);
        }

        await (supabase as any).from("tenant_invoices").insert({
          tenant_id: activeTenant!.id,
          invoice_number: invoiceNumber,
          invoice_date: new Date().toISOString().split("T")[0],
          due_date: new Date(Date.now() + 30 * 86400000).toISOString().split("T")[0],
          period_start: monthStart,
          period_end: periodEnd,
          monthly_admin_fee: invoiceData.totalAdminFees,
          vault_fee: invoiceData.totalVaultFees,
          transaction_fee_total: invoiceData.totalTransactionalFees,
          subtotal: invoiceData.grandTotal,
          vat_rate: 0,
          vat_amount: 0,
          total: invoiceData.grandTotal,
          status: "sent",
          invoice_html: html,
        });
      } catch (e) {
        console.error("Failed to save tenant invoice:", e);
      }
    })();
  };

  const handleClose = () => {
    setCalculated(false);
    setFeeLines([]);
    setTxDetailLines([]);
    setPosted(false);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="w-[99vw] max-w-[99vw] sm:w-[99vw] sm:max-w-[99vw] h-[95vh] max-h-[95vh] overflow-y-auto [&_table]:text-[11px] [&_th]:px-2 [&_th]:py-1.5 [&_td]:px-2 [&_td]:py-1.5">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarDays className="h-5 w-5" />
            End of Month Fee Run
          </DialogTitle>
          <DialogDescription>
            Calculate and post month-end fee journals. Select a run date (typically the last day of the month).
          </DialogDescription>
        </DialogHeader>

        {/* Date selector */}
        <div className="flex items-end gap-4">
          <div className="space-y-1.5">
            <Label>Run Date</Label>
            <Input type="date" className="w-48" value={runDate} onChange={e => { setRunDate(e.target.value); setCalculated(false); setPosted(false); }} />
          </div>
          <Button onClick={() => calculateMutation.mutate()} disabled={calculateMutation.isPending || posted}>
            {calculateMutation.isPending ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Calculating…</> : "Calculate Fees"}
          </Button>
        </div>

        {calculated && (
          <div className="space-y-4 mt-2">
            {/* ── SECTION 1: Pool Value % Recoveries (Journal) ── */}
            {feeLines.filter(l => l.paymentMethod === "journal").length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <Badge variant="outline" className="text-xs">Journal</Badge>
                    Pool Recoveries — Journals to Admin Pool
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Fee Type</TableHead>
                        <TableHead>Pool</TableHead>
                        <TableHead>Basis</TableHead>
                        <TableHead className="text-right">Pool Value</TableHead>
                        <TableHead className="text-right">Monthly Fee</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {feeLines.filter(l => l.paymentMethod === "journal").map((l, i) => (
                        <TableRow key={`j-${i}`}>
                          <TableCell className="text-sm font-medium">{l.feeTypeName}</TableCell>
                          <TableCell className="text-sm">{l.poolName}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">{l.basis}</TableCell>
                          <TableCell className="text-right text-sm">{l.grossAmount > 0 ? formatCurrency(l.grossAmount) : "—"}</TableCell>
                          <TableCell className="text-right text-sm font-semibold">{formatCurrency(l.calculatedFee)}</TableCell>
                        </TableRow>
                      ))}
                      <TableRow className="bg-muted/30 font-semibold">
                        <TableCell colSpan={4} className="text-right text-sm">Total Journal Entries</TableCell>
                        <TableCell className="text-right text-sm">{formatCurrency(totalJournalFees)}</TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}

            {/* ── SECTION 2: Administrator Fees (Bank / Invoice) ── */}
            {feeLines.filter(l => l.paymentMethod === "bank").length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <Badge variant="secondary" className="text-xs">Bank</Badge>
                    Fees Payable to Administrator
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Fee Type</TableHead>
                        <TableHead>Pool</TableHead>
                        <TableHead>Basis</TableHead>
                        <TableHead className="text-right">Pool Value</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {feeLines.filter(l => l.paymentMethod === "bank").map((l, i) => (
                        <TableRow key={`b-${i}`}>
                          <TableCell className="text-sm font-medium">{l.feeTypeName}</TableCell>
                          <TableCell className="text-sm">{l.poolName}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">{l.basis}</TableCell>
                          <TableCell className="text-right text-sm">{l.grossAmount > 0 ? formatCurrency(l.grossAmount) : "—"}</TableCell>
                          <TableCell className="text-right text-sm font-semibold">{formatCurrency(l.calculatedFee)}</TableCell>
                        </TableRow>
                      ))}
                      <TableRow className="bg-muted/30 font-semibold">
                        <TableCell colSpan={4} className="text-right text-sm">Subtotal Fees Payable to Administrator</TableCell>
                        <TableCell className="text-right text-sm">{formatCurrency(feeLines.filter(l => l.paymentMethod === "bank").reduce((s, l) => s + l.calculatedFee, 0))}</TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}

            {/* ── SECTION 3: Transactional Admin Fees ── */}
            {txDetailLines.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <Badge variant="destructive" className="text-xs">Transactional</Badge>
                    Administrator Transactional Fee Share
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs">Date</TableHead>
                        <TableHead className="text-xs">Type</TableHead>
                        <TableHead className="text-xs">Member</TableHead>
                        <TableHead className="text-right text-xs">Amount</TableHead>
                        <TableHead className="text-right text-xs">Admin %</TableHead>
                        <TableHead className="text-right text-xs">Admin Fee</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {txDetailLines.map((d, i) => (
                        <TableRow key={`td-${i}`}>
                          <TableCell className="text-xs">{d.txDate}</TableCell>
                          <TableCell className="text-xs">{d.txTypeName}</TableCell>
                          <TableCell className="text-xs">{d.entityName}</TableCell>
                          <TableCell className="text-right text-xs">{formatCurrency(d.txAmount)}</TableCell>
                          <TableCell className="text-right text-xs">{d.tierPct}%</TableCell>
                          <TableCell className="text-right text-xs font-medium">{formatCurrency(d.adminFee)}</TableCell>
                        </TableRow>
                      ))}
                      <TableRow className="bg-muted/30 font-semibold">
                        <TableCell colSpan={5} className="text-right text-sm">Total Transactional Admin Fees</TableCell>
                        <TableCell className="text-right text-sm">{formatCurrency(totalTransactionalAdmin)}</TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}

            {/* ── INVOICE SUMMARY ── */}
            <Card className="border-primary/30 bg-primary/5">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  Administrator Invoice Summary
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Monthly Admin Fees (% of Portfolio Values)</span>
                  <span className="font-medium">{formatCurrency(totalAdminFeesBank)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Vault Fees</span>
                  <span className="font-medium">{formatCurrency(totalVaultInvoice)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Transactional Admin Fees</span>
                  <span className="font-medium">{formatCurrency(totalTransactionalAdmin)}</span>
                </div>
                <Separator />
                <div className="flex justify-between text-base font-bold">
                  <span>Total Payable to Administrator</span>
                  <span className="text-primary">{formatCurrency(grandInvoiceTotal)}</span>
                </div>
              </CardContent>
            </Card>

            {/* Status messages */}
            {posted && (
              <div className="flex items-center gap-2 text-sm text-primary bg-primary/10 rounded-lg p-3">
                <CheckCircle2 className="h-4 w-4" />
                Journal & bank entries have been posted. The invoice amount of {formatCurrency(grandInvoiceTotal)} is payable to the administrator.
              </div>
            )}
          </div>
        )}

        <DialogFooter className="flex gap-2 sm:gap-0">
          <Button variant="outline" onClick={handleClose}>
            {posted ? "Close" : "Cancel"}
          </Button>
          {posted && (
            <Button variant="outline" onClick={generateAndOpenInvoice}>
              <FileText className="h-4 w-4 mr-2" />Print Invoice
            </Button>
          )}
          {calculated && !posted && feeLines.length > 0 && (
            <Button onClick={() => postMutation.mutate()} disabled={postMutation.isPending}>
              {postMutation.isPending ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Posting…</> : "Post Journals, Bank Entries & Generate Invoice"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
