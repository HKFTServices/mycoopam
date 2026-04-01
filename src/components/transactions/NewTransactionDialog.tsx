import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useTenant } from "@/contexts/TenantContext";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, ArrowRight, ArrowLeft, CheckCircle, User, ListChecks, TrendingUp, FileText, Search, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

import AccountSelectionStep from "./steps/AccountSelectionStep";
import TransactionTypeStep from "./steps/TransactionTypeStep";
import PoolSelectionStep from "./steps/PoolSelectionStep";
import DepositDetailsStep from "./steps/DepositDetailsStep";
import WithdrawalDetailsStep, { type WithdrawalPoolEntry } from "./steps/WithdrawalDetailsStep";
import SwitchDetailsStep from "./steps/SwitchDetailsStep";
import TransferDetailsStep from "./steps/TransferDetailsStep";
import StockDepositDetailsStep from "./steps/StockDepositDetailsStep";
import StockWithdrawalDetailsStep from "./steps/StockWithdrawalDetailsStep";
import DebitOrderStep from "./steps/DebitOrderStep";
import ReviewStep from "./steps/ReviewStep";
import type { StockLineItem } from "./steps/StockDepositDetailsStep";
import type { StockWithdrawalLineItem } from "./steps/StockWithdrawalDetailsStep";
import { formatLocalDate } from "@/lib/formatDate";
import { sendApprovalNotification } from "@/lib/sendApprovalNotification";

const ALL_TXN_CODES = [
  "DEPOSIT_FUNDS", "DEPOSIT_STOCK", "WITHDRAW_FUNDS", "WITHDRAW_STOCK",
  "SWITCH", "TRANSFER",
];
const MEMBER_TXN_CODES = ALL_TXN_CODES;
const DEPOSIT_ONLY_CODES = ["DEPOSIT_FUNDS", "DEPOSIT_STOCK"];
const DEPOSIT_CODES = ["DEPOSIT_FUNDS"];
const SWITCH_CODES = ["SWITCH"];
const STOCK_ONLY_CODES = ["DEPOSIT_STOCK", "WITHDRAW_STOCK"];
const TRANSFER_CODES = ["TRANSFER"];

type Step = "type" | "account" | "pool" | "details" | "debit_order" | "review";
const BASE_STEPS: Step[] = ["account", "type", "pool", "details", "review"];
const DEBIT_ORDER_STEPS: Step[] = ["account", "type", "pool", "details", "debit_order", "review"];

const STEP_META: Record<Step, { label: string; icon: typeof User }> = {
  type: { label: "Type", icon: ListChecks },
  account: { label: "Account", icon: User },
  pool: { label: "Pools", icon: TrendingUp },
  details: { label: "Details", icon: FileText },
  debit_order: { label: "Mandate", icon: FileText },
  review: { label: "Review", icon: Search },
};

interface PoolSplit {
  poolId: string;
  percentage: number;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultPoolId?: string;
  defaultAccountId?: string;
  depositOnly?: boolean;
  stockOnly?: boolean;
  defaultTxnCode?: string;
}

const NewTransactionDialog = ({
  open,
  onOpenChange,
  defaultPoolId,
  defaultAccountId,
  depositOnly,
  stockOnly,
  defaultTxnCode,
}: Props) => {
  const { user } = useAuth();
  const { currentTenant } = useTenant();
  const queryClient = useQueryClient();

  const [step, setStep] = useState<Step>("type");
  const [selectedAccountId, setSelectedAccountId] = useState("");
  const [selectedTxnTypeId, setSelectedTxnTypeId] = useState("");
  const [selectedPoolId, setSelectedPoolId] = useState("");
  const [poolSplits, setPoolSplits] = useState<PoolSplit[]>([]);
  const [amount, setAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("eft");
  const [notes, setNotes] = useState("");
  const [popFile, setPopFile] = useState<File | null>(null);
  const [transactionDate, setTransactionDate] = useState<Date>(new Date());
  // Switch-specific state
  const [switchToPoolId, setSwitchToPoolId] = useState("");
  const [switchUseAllUnits, setSwitchUseAllUnits] = useState(false);
  // Transfer-specific state
  const [transferUseAllUnits, setTransferUseAllUnits] = useState(false);
  const [transferRecipientAccountNumber, setTransferRecipientAccountNumber] = useState("");
  const [transferRecipientAccountId, setTransferRecipientAccountId] = useState("");
  const [transferRecipientIdNumber, setTransferRecipientIdNumber] = useState("");
  // Stock-specific state
  const [stockDepositLines, setStockDepositLines] = useState<StockLineItem[]>([]);
  const [stockWithdrawalLines, setStockWithdrawalLines] = useState<StockWithdrawalLineItem[]>([]);
  const [stockCourierOption, setStockCourierOption] = useState<"insured" | "uninsured" | "collect">("collect");
  const [transferRecipientEntityName, setTransferRecipientEntityName] = useState("");
  // Withdrawal-specific: selected pool IDs + per-pool input state
  const [withdrawalPoolIds, setWithdrawalPoolIds] = useState<string[]>([]);
  const [withdrawalPoolInputs, setWithdrawalPoolInputs] = useState<Record<string, { amountInput: string; unitsInput: string; inputMode: "amount" | "units"; useAllUnits: boolean }>>({});
  // Loan repayment state
  const [loanRepaymentOnly, setLoanRepaymentOnly] = useState(false);
  const [loanRepaymentAmount, setLoanRepaymentAmount] = useState("");
  const [noPoolAllocation, setNoPoolAllocation] = useState(false);
  // Admin fee override — staff can override the admin fee percentage (null = use default from rules)
  const [adminFeeOverridePct, setAdminFeeOverridePct] = useState<number | null>(null);
  // Debit order state
  const [doBankName, setDoBankName] = useState("");
  const [doBranchCode, setDoBranchCode] = useState("");
  const [doAccountName, setDoAccountName] = useState("");
  const [doBankAccountNumber, setDoBankAccountNumber] = useState("");
  const [doBankAccountType, setDoBankAccountType] = useState("savings");
  const [doFrequency, setDoFrequency] = useState("monthly");
  const [doStartDate, setDoStartDate] = useState(() => {
    const now = new Date();
    const next = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    return formatLocalDate(next);
  });
  const [doNotes, setDoNotes] = useState("");
  const [doSignatureData, setDoSignatureData] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setStep(defaultAccountId ? "type" : "account");
      setSelectedAccountId(defaultAccountId || "");
      setSelectedTxnTypeId("");
      setSelectedPoolId(defaultPoolId || "");
      setPoolSplits([]);
      setAmount("");
      setPaymentMethod("eft");
      setNotes("");
      setPopFile(null);
      setTransactionDate(new Date());
      setSwitchToPoolId("");
      setSwitchUseAllUnits(false);
      setTransferUseAllUnits(false);
      setTransferRecipientAccountNumber("");
      setTransferRecipientAccountId("");
      setTransferRecipientIdNumber("");
      setTransferRecipientEntityName("");
      setStockDepositLines([]);
      setStockWithdrawalLines([]);
      setStockCourierOption("collect");
      setWithdrawalPoolIds([]);
      setWithdrawalPoolInputs({});
      setLoanRepaymentOnly(false);
      setLoanRepaymentAmount("__reset__");
      setNoPoolAllocation(false);
      setAdminFeeOverridePct(null);
      // Reset debit order state
      setDoBankName("");
      setDoBranchCode("");
      setDoAccountName("");
      setDoBankAccountNumber("");
      setDoBankAccountType("savings");
      setDoFrequency("monthly");
      setDoStartDate(() => {
        const now = new Date();
        const next = new Date(now.getFullYear(), now.getMonth() + 1, 1);
        return formatLocalDate(next);
      });
      setDoNotes("");
      setDoSignatureData(null);
    }
  }, [open, defaultPoolId, defaultAccountId]);


  // Staff check
  const { data: isStaff = false } = useQuery({
    queryKey: ["is_staff_for_txn", user?.id, currentTenant?.id],
    queryFn: async () => {
      if (!user) return false;
      const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", user.id);
      if (!roles) return false;
      return roles.some((r) => ["super_admin", "tenant_admin", "manager", "clerk"].includes(r.role));
    },
    enabled: !!user && open,
  });

  // Accounts
  const { data: allAccounts = [], isLoading: accountsLoading } = useQuery({
    queryKey: ["accounts_for_txn", user?.id, currentTenant?.id, isStaff],
    queryFn: async () => {
      if (!user || !currentTenant) return [];
      if (isStaff) {
        const { data } = await (supabase as any)
          .from("entity_accounts")
          .select("id, account_number, entity_id, entity_account_type_id, status, entity_account_types!inner(name, account_type), entities!inner(name, last_name)")
          .eq("tenant_id", currentTenant.id)
          .in("status", ["active", "approved", "pending_activation"])
          .eq("entity_account_types.account_type", 1)
          .order("entities(name)");
        return data ?? [];
      } else {
        const { data: rels } = await (supabase as any)
          .from("user_entity_relationships")
          .select("entity_id")
          .eq("user_id", user.id)
          .eq("tenant_id", currentTenant.id)
          .eq("is_active", true);
        if (!rels?.length) return [];
        const { data } = await (supabase as any)
          .from("entity_accounts")
          .select("id, account_number, entity_id, entity_account_type_id, status, entity_account_types!inner(name, account_type), entities!inner(name, last_name)")
          .in("entity_id", rels.map((r: any) => r.entity_id))
          .eq("tenant_id", currentTenant.id)
          .in("status", ["active", "approved", "pending_activation"])
          .eq("entity_account_types.account_type", 1);
        return data ?? [];
      }
    },
    enabled: !!user && !!currentTenant && open,
  });

  // Holdings check — derived from allHoldings (computed after the live RPC query below)
  // We use a separate derived value once allHoldings is loaded instead of a duplicate query
  // (defined here as a placeholder; actual value computed after allHoldings is available)

  // Check if account has existing join share
  const { data: hasJoinShare = false } = useQuery({
    queryKey: ["join_share_check", selectedAccountId, currentTenant?.id],
    queryFn: async () => {
      if (!selectedAccountId || !currentTenant) return false;
      const { count } = await (supabase as any)
        .from("member_shares")
        .select("id", { count: "exact", head: true })
        .eq("entity_account_id", selectedAccountId)
        .eq("tenant_id", currentTenant.id)
        .eq("is_deleted", false);
      return (count ?? 0) > 0;
    },
    enabled: !!selectedAccountId && !!currentTenant && open,
  });

  // Outstanding loan check for the selected account
  const { data: outstandingLoanInfo } = useQuery({
    queryKey: ["outstanding_loan_for_txn", selectedAccountId, currentTenant?.id],
    queryFn: async () => {
      if (!selectedAccountId || !currentTenant) return null;

      // 1) Check modern loan_applications first
      const { data: loans } = await (supabase as any)
        .from("loan_applications")
        .select("id, monthly_instalment, total_loan, amount_approved, pool_id")
        .eq("entity_account_id", selectedAccountId)
        .eq("tenant_id", currentTenant.id)
        .eq("status", "disbursed")
        .order("created_at", { ascending: false });

      if (loans?.length) {
        // Calculate outstanding from cashflow_transactions
        const { data: cftRows } = await (supabase as any)
          .from("cashflow_transactions")
          .select("debit, credit")
          .eq("entity_account_id", selectedAccountId)
          .eq("tenant_id", currentTenant.id)
          .eq("is_active", true)
          .in("entry_type", ["loan_capital", "loan_fee", "loan_loading", "loan_repayment"]);

        const outstanding = (cftRows || []).reduce((sum: number, r: any) =>
          sum + Number(r.debit) - Number(r.credit), 0);

        if (outstanding > 0) {
          const totalInstalment = loans.reduce((sum: number, l: any) =>
            sum + (Number(l.monthly_instalment) || 0), 0);
          return {
            loanIds: loans.map((l: any) => l.id),
            loanPoolIds: loans.map((l: any) => l.pool_id).filter(Boolean),
            outstanding,
            instalment: totalInstalment,
          };
        }
      }

      // 2) Fallback: check legacy loan data via RPC
      const { data: legacyLoans } = await (supabase as any)
        .rpc("get_loan_outstanding", { p_tenant_id: currentTenant.id });

      if (legacyLoans?.length) {
        // Match by entity_account_id → entity_id
        const { data: acct } = await (supabase as any)
          .from("entity_accounts")
          .select("entity_id")
          .eq("id", selectedAccountId)
          .single();

        if (acct?.entity_id) {
          const match = legacyLoans.find((l: any) => l.entity_id === acct.entity_id && Number(l.outstanding) > 0);
          if (match) {
            return {
              loanIds: [],
              loanPoolIds: [],
              outstanding: Number(match.outstanding),
              instalment: Math.round(Number(match.outstanding) / 12 * 100) / 100, // estimate monthly
            };
          }
        }
      }

      return null;
    },
    enabled: !!selectedAccountId && !!currentTenant && open,
  });

  // Set default loan repayment amount when loan info loads or dialog reopens
  useEffect(() => {
    if (open && outstandingLoanInfo?.instalment && (loanRepaymentAmount === "__reset__" || !loanRepaymentAmount)) {
      setLoanRepaymentAmount(String(outstandingLoanInfo.instalment));
    }
    if (!open && loanRepaymentAmount === "__reset__") {
      setLoanRepaymentAmount("");
    }
  }, [outstandingLoanInfo?.instalment, open, loanRepaymentAmount]);

  // Check if the RECEIVER of a transfer is a first-time member (no join share yet)
  const { data: receiverJoinShareData } = useQuery({
    queryKey: ["receiver_join_share_check", transferRecipientAccountId, currentTenant?.id],
    queryFn: async () => {
      if (!transferRecipientAccountId || !currentTenant) return null;
      // Check existing join share
      const { count } = await (supabase as any)
        .from("member_shares")
        .select("id", { count: "exact", head: true })
        .eq("entity_account_id", transferRecipientAccountId)
        .eq("tenant_id", currentTenant.id)
        .eq("is_deleted", false);
      const hasShare = (count ?? 0) > 0;
      if (hasShare) return { needed: false };

      // Fetch the account type to get membership fee
      const { data: acct } = await (supabase as any)
        .from("entity_accounts")
        .select("entity_account_type_id, entity_id, entity_account_types(account_type)")
        .eq("id", transferRecipientAccountId)
        .single();

      const { data: tenantConfig } = await (supabase as any)
        .from("tenant_configuration")
        .select("full_membership_fee, associated_membership_fee")
        .eq("tenant_id", currentTenant.id)
        .maybeSingle();

      const receiverAccountType = Number(acct?.entity_account_types?.account_type ?? 0);
      const membershipFee = receiverAccountType === 1
        ? Number(tenantConfig?.full_membership_fee ?? 0)
        : receiverAccountType === 4
          ? Number(tenantConfig?.associated_membership_fee ?? 0)
          : 0;

      // Commission for receiver entity
      let commissionPctReceiver = 0;
      let commissionReferrerNameReceiver = "";
      if (acct?.entity_id) {
        const { data: entity } = await (supabase as any)
          .from("entities")
          .select("agent_commission_percentage, agent_house_agent_id")
          .eq("id", acct.entity_id)
          .single();
        if (entity?.agent_house_agent_id && Number(entity.agent_commission_percentage) > 0) {
          commissionPctReceiver = Number(entity.agent_commission_percentage);
          const { data: agentEntity } = await (supabase as any)
            .from("entities").select("name").eq("id", entity.agent_house_agent_id).single();
          commissionReferrerNameReceiver = agentEntity?.name || "";
        } else {
          const { data: uer } = await (supabase as any)
            .from("user_entity_relationships")
            .select("user_id").eq("entity_id", acct.entity_id).limit(1);
          const uid = uer?.[0]?.user_id;
          if (uid) {
            const { data: app } = await (supabase as any)
              .from("membership_applications")
              .select("commission_percentage, referrer_id, has_referrer")
              .eq("user_id", uid).eq("tenant_id", currentTenant.id).eq("has_referrer", true)
              .order("created_at", { ascending: false }).limit(1);
            const ma = app?.[0];
            if (ma?.referrer_id && Number(ma.commission_percentage) > 0) {
              commissionPctReceiver = Number(ma.commission_percentage);
              const { data: ref } = await (supabase as any)
                .from("referrers").select("referrer_number, entity_id")
                .eq("id", ma.referrer_id).single();
              if (ref) {
                const { data: refEnt } = await (supabase as any)
                  .from("entities").select("name, last_name").eq("id", ref.entity_id).single();
                commissionReferrerNameReceiver = refEnt
                  ? `${refEnt.name}${refEnt.last_name ? ' ' + refEnt.last_name : ''} (${ref.referrer_number})`
                  : ref.referrer_number;
              }
            }
          }
        }
      }

      return {
        needed: true,
        entityId: acct?.entity_id || null,
        membershipFee,
        commissionPct: commissionPctReceiver,
        commissionReferrerName: commissionReferrerNameReceiver,
      };
    },
    enabled: !!transferRecipientAccountId && !!currentTenant && open,
  });

  // Get join share class & membership fee for the account type
  const selectedAccount = allAccounts.find((a: any) => a.id === selectedAccountId);
  const selectedAccountLabel = selectedAccount
    ? `${[selectedAccount.entities?.name, selectedAccount.entities?.last_name].filter(Boolean).join(" ")} — ${selectedAccount.account_number || "Pending"}`
    : "";

  // Fetch join share cost + membership fee from tenant_configuration (not share_classes).
  // share_classes are optional additional share instruments — the join share is a fixed
  // membership requirement defined in tenant_configuration.
  const { data: membershipConfig } = useQuery({
    queryKey: ["membership_config", currentTenant?.id, selectedAccount?.entity_account_types?.account_type],
    queryFn: async () => {
      if (!currentTenant || !selectedAccount?.entity_account_types?.account_type) return null;
      const { data } = await (supabase as any)
        .from("tenant_configuration")
        .select("full_membership_share_amount, associated_membership_share_amount, full_membership_fee, associated_membership_fee, share_gl_account_id")
        .eq("tenant_id", currentTenant.id)
        .maybeSingle();
      if (!data) return null;

      const accountType = Number(selectedAccount.entity_account_types.account_type);
      const shareCost = accountType === 1
        ? Number(data.full_membership_share_amount ?? 0)
        : accountType === 4
          ? Number(data.associated_membership_share_amount ?? 0)
          : 0;
      const membershipFee = accountType === 1
        ? Number(data.full_membership_fee ?? 0)
        : accountType === 4
          ? Number(data.associated_membership_fee ?? 0)
          : 0;

      return {
        shareCost,
        membershipFee,
        shareGlAccountId: data.share_gl_account_id || null,
      };
    },
    enabled: !!currentTenant && !!selectedAccount?.entity_account_types?.account_type && open,
  });

  const membershipFeeAmount = membershipConfig?.membershipFee ?? 0;
  const joinShareCost = membershipConfig?.shareCost ?? 0;
  const joinShareGlAccountId = membershipConfig?.shareGlAccountId ?? null;

  // joinShareInfo is computed after vatRate is available (see below)

  // Pools — filtered by transaction rules for the selected transaction type
  const { data: allPools = [] } = useQuery({
    queryKey: ["pools_for_txn", currentTenant?.id],
    queryFn: async () => {
      if (!currentTenant) return [];
      const { data } = await (supabase as any)
        .from("pools")
        .select("id, name, open_unit_price, fixed_unit_price, description")
        .eq("tenant_id", currentTenant.id)
        .eq("is_active", true)
        .eq("is_deleted", false)
        .order("name");
      return data ?? [];
    },
    enabled: !!currentTenant && open,
  });

  // Pool transaction rules
  const { data: poolTxnRules = [] } = useQuery({
    queryKey: ["pool_txn_rules", currentTenant?.id],
    queryFn: async () => {
      if (!currentTenant) return [];
      const { data } = await (supabase as any)
        .from("pool_transaction_rules")
        .select("pool_id, transaction_type_code, is_allowed")
        .eq("tenant_id", currentTenant.id);
      return data ?? [];
    },
    enabled: !!currentTenant && open,
  });

  // Pool filtering moved below after isDeposit is derived

  // Transaction types — load all upfront; filter for display based on account holdings
  const { data: txnTypes = [] } = useQuery({
    queryKey: ["txn_types_for_member", currentTenant?.id],
    queryFn: async () => {
      if (!currentTenant) return [];
      const { data } = await (supabase as any)
        .from("transaction_types")
        .select("id, name, code")
        .eq("tenant_id", currentTenant.id)
        .eq("is_active", true)
        .in("code", ALL_TXN_CODES);
      return data ?? [];
    },
    enabled: !!currentTenant && open,
  });

  // Filter txn types based on account holdings — computed after allHoldings (defined below)
  // Placeholder reference; actual filtering happens after allHoldings is available (see filteredTxnTypes below)


  // Fee rules
  const { data: feeRules = [] } = useQuery({
    queryKey: ["fee_rules_for_calc", currentTenant?.id],
    queryFn: async () => {
      if (!currentTenant) return [];
      const { data } = await (supabase as any)
        .from("transaction_fee_rules")
        .select("*, transaction_fee_tiers(*), transaction_fee_types!inner(code, name, gl_account_id)")
        .eq("tenant_id", currentTenant.id)
        .eq("is_active", true);
      return data ?? [];
    },
    enabled: !!currentTenant && open,
  });

  // Derived type flags (needed for stock queries below)
  const selectedTxnTypeEarly = txnTypes.find((t: any) => t.id === selectedTxnTypeId);
  const isStockDeposit = selectedTxnTypeEarly?.code === "DEPOSIT_STOCK";
  const isStockWithdrawal = selectedTxnTypeEarly?.code === "WITHDRAW_STOCK";
  const isStockTxn = isStockDeposit || isStockWithdrawal;

  // Stock items for the selected pool (stock deposit / withdrawal)
  const txnDateStrEarly = transactionDate ? format(transactionDate, "yyyy-MM-dd") : "";
  const { data: rawStockItems = [] } = useQuery({
    queryKey: ["stock_items_for_pool", selectedPoolId, currentTenant?.id, txnDateStrEarly],
    queryFn: async () => {
      if (!selectedPoolId || !currentTenant) return [];
      // Fetch items
      const { data: items } = await (supabase as any)
        .from("items")
        .select("id, description, item_code, pool_id")
        .eq("tenant_id", currentTenant.id)
        .eq("pool_id", selectedPoolId)
        .eq("is_stock_item", true)
        .eq("is_active", true)
        .eq("is_deleted", false);
      if (!items?.length) return [];

      // Fetch latest daily_stock_prices for these items on the transaction date (or nearest)
      const itemIds = items.map((i: any) => i.id);
      const { data: prices } = await (supabase as any)
        .from("daily_stock_prices")
        .select("item_id, cost_incl_vat, buy_price_incl_vat, price_date")
        .in("item_id", itemIds)
        .eq("tenant_id", currentTenant.id)
        .lte("price_date", txnDateStrEarly || new Date().toISOString().slice(0, 10))
        .order("price_date", { ascending: false });

      // Build price map: latest price per item
      const priceMap: Record<string, any> = {};
      for (const p of prices ?? []) {
        if (!priceMap[p.item_id]) priceMap[p.item_id] = p;
      }

      // Fetch stock quantities from stock_transactions (net debit - credit per item)
      const { data: stockQtyRows } = await (supabase as any).rpc("get_stock_quantities", { p_tenant_id: currentTenant.id });
      const qtyMap: Record<string, number> = {};
      for (const row of stockQtyRows ?? []) {
        qtyMap[row.item_id] = Number(row.total_quantity);
      }

      return items.map((item: any) => {
        const price = priceMap[item.id];
        return {
          id: item.id,
          description: item.description,
          item_code: item.item_code,
          buy_price_incl_vat: price ? Number(price.buy_price_incl_vat) : 0,
          sell_price: price ? Number(price.cost_incl_vat) : 0,
          current_stock: qtyMap[item.id] ?? 0,
        };
      });
    },
    enabled: !!selectedPoolId && !!currentTenant && isStockTxn && open,
  });

  // Courier fee — find insured and uninsured rules by code, preferring the one matching the current txn type
  // Supports code patterns: COURIER_FEES_INS, COUR_FEES_INS etc. (insured)
  //                         COUR_FEES_UNINS, COURIER_FEES_UNINS etc. (uninsured)
  const isCourierInsuredCode = (code: string) => {
    const c = code.toUpperCase();
    return (c.includes("COUR") && c.includes("INS") && !c.includes("UNINS"));
  };
  const isCourierUninsuredCode = (code: string) => {
    const c = code.toUpperCase();
    return (c.includes("COUR") && c.includes("UNINS"));
  };
  const courierInsuredRule = feeRules.find((r: any) =>
    isCourierInsuredCode(r.transaction_fee_types?.code ?? "") && r.transaction_type_id === selectedTxnTypeId
  ) ?? feeRules.find((r: any) =>
    isCourierInsuredCode(r.transaction_fee_types?.code ?? "")
  );
  const courierUninsuredRule = feeRules.find((r: any) =>
    isCourierUninsuredCode(r.transaction_fee_types?.code ?? "") && r.transaction_type_id === selectedTxnTypeId
  ) ?? feeRules.find((r: any) =>
    isCourierUninsuredCode(r.transaction_fee_types?.code ?? "")
  );
  const courierInsuredBase = courierInsuredRule ? Number(courierInsuredRule.fixed_amount ?? 0) : 0;
  const courierUninsuredBase = courierUninsuredRule ? Number(courierUninsuredRule.fixed_amount ?? 0) : 0;
  // Amounts incl VAT computed below after vatRate/isVatRegistered are declared

  // Commission — based on the selected entity account's entity referrer
  const { data: entityCommission } = useQuery({
    queryKey: ["entity_commission", selectedAccount?.entity_id, currentTenant?.id],
    queryFn: async () => {
      if (!selectedAccount?.entity_id || !currentTenant) return null;

      // First check entity-level agent fields
      const { data: entity } = await (supabase as any)
        .from("entities")
        .select("agent_commission_percentage, agent_house_agent_id")
        .eq("id", selectedAccount.entity_id)
        .single();
      if (entity?.agent_house_agent_id && Number(entity.agent_commission_percentage) > 0) {
        const { data: agentEntity } = await (supabase as any)
          .from("entities")
          .select("name")
          .eq("id", entity.agent_house_agent_id)
          .single();
        return {
          commission_percentage: Number(entity.agent_commission_percentage),
          referrer_name: agentEntity?.name || "",
        };
      }

      // Fallback: check membership_applications via user_entity_relationships
      const { data: uer } = await (supabase as any)
        .from("user_entity_relationships")
        .select("user_id")
        .eq("entity_id", selectedAccount.entity_id)
        .limit(1);
      const userId = uer?.[0]?.user_id;
      if (!userId) return null;

      const { data: app } = await (supabase as any)
        .from("membership_applications")
        .select("commission_percentage, referrer_id, has_referrer")
        .eq("user_id", userId)
        .eq("tenant_id", currentTenant.id)
        .eq("has_referrer", true)
        .order("created_at", { ascending: false })
        .limit(1);
      const ma = app?.[0];
      if (!ma || !ma.referrer_id || Number(ma.commission_percentage) <= 0) return null;

      // Get referrer details from referrers table
      const { data: referrer } = await (supabase as any)
        .from("referrers")
        .select("referrer_number, entity_id, referral_house_entity_id")
        .eq("id", ma.referrer_id)
        .single();
      if (!referrer) return { commission_percentage: Number(ma.commission_percentage), referrer_name: "" };

      const { data: refEntity } = await (supabase as any)
        .from("entities")
        .select("name, last_name")
        .eq("id", referrer.entity_id)
        .single();
      const refName = refEntity ? `${refEntity.name}${refEntity.last_name ? ' ' + refEntity.last_name : ''} (${referrer.referrer_number})` : referrer.referrer_number;

      return {
        commission_percentage: Number(ma.commission_percentage),
        referrer_name: refName,
      };
    },
    enabled: !!selectedAccount?.entity_id && !!currentTenant && open,
  });

  const commissionPct = entityCommission?.commission_percentage ?? 0;
  const commissionReferrerName = entityCommission?.referrer_name ?? "";

  // Tenant VAT configuration — vatRate always fetched (membership fees always include VAT)
  const { data: tenantVatInfo } = useQuery({
    queryKey: ["tenant_vat_config", currentTenant?.id],
    staleTime: 0,
    queryFn: async () => {
      if (!currentTenant) return null;
      const { data: config } = await (supabase as any)
        .from("tenant_configuration")
        .select("is_vat_registered")
        .eq("tenant_id", currentTenant.id)
        .single();
      // Fetch the standard (non-zero) VAT rate — e.g. "Standard" 15%
      // If tenant is not VAT registered, isVatRegistered=false and VAT amount will be 0
      const { data: vatType } = await (supabase as any)
        .from("tax_types")
        .select("percentage")
        .eq("tenant_id", currentTenant.id)
        .eq("is_active", true)
        .gt("percentage", 0)
        .order("percentage", { ascending: false })
        .limit(1);
      const vatRate = vatType?.[0] ? Number(vatType[0].percentage) : 15;
      return {
        isVatRegistered: config?.is_vat_registered ?? false,
        vatRate,
      };
    },
    enabled: !!currentTenant && open,
  });

  const isVatRegistered = tenantVatInfo?.isVatRegistered ?? false;
  const vatRate = tenantVatInfo?.vatRate ?? 15;

  // Courier fees incl VAT
  const courierInsuredVat = isVatRegistered && courierInsuredBase > 0 ? courierInsuredBase * (vatRate / 100) : 0;
  const courierFeeInsured = courierInsuredBase + courierInsuredVat;
  const courierUninsuredVat = isVatRegistered && courierUninsuredBase > 0 ? courierUninsuredBase * (vatRate / 100) : 0;
  const courierFeeUninsured = courierUninsuredBase + courierUninsuredVat;
  // Active courier fee for calculations
  const activeCourierFee = stockCourierOption === "insured" ? courierFeeInsured : stockCourierOption === "uninsured" ? courierFeeUninsured : 0;

  // joinShareInfo — membership fees only carry VAT if the tenant is VAT registered
  const joinShareInfo = useMemo(() => {
    // A first-time deposit needs membership deductions if:
    // 1. No existing join share record exists (hasJoinShare = false), AND
    // 2. Either a join share cost or membership fee is configured in tenant_configuration
    const needsShareDeduction = !hasJoinShare && joinShareCost > 0;
    const needsMembershipFee = !hasJoinShare && membershipFeeAmount > 0;
    const needed = needsShareDeduction || needsMembershipFee;
    const rawMembershipFee = needsMembershipFee ? membershipFeeAmount : 0;
    // Only calculate VAT on membership fee if the tenant is VAT registered
    const membershipFeeVat = rawMembershipFee > 0 && isVatRegistered && vatRate > 0
      ? Math.round((rawMembershipFee / (1 + vatRate / 100)) * (vatRate / 100) * 100) / 100
      : 0;
    return {
      needed,
      shareCost: needsShareDeduction ? joinShareCost : 0,
      membershipFee: rawMembershipFee,
      membershipFeeVat,
      shareClassName: "Join Share",
    };
  }, [hasJoinShare, joinShareCost, membershipFeeAmount, isVatRegistered, vatRate]);

  // All pool holdings for the selected account — computed live directly from unit_transactions
  // Filtered strictly by entity_account_id AND tenant_id on the server side for full isolation
  const { data: allHoldings = [], isLoading: holdingsLoading } = useQuery({
    queryKey: ["all_holdings_for_txn_live", selectedAccountId, currentTenant?.id],
    queryFn: async () => {
      if (!selectedAccountId || !currentTenant) return [];
      const { data, error } = await (supabase as any)
        .from("unit_transactions")
        .select("pool_id, debit, credit")
        .eq("entity_account_id", selectedAccountId)
        .eq("tenant_id", currentTenant.id)
        .eq("is_active", true);
      if (error || !data) return [];
      // Aggregate net units per pool from raw debit/credit rows
      const poolMap: Record<string, number> = {};
      for (const row of data as { pool_id: string; debit: number; credit: number }[]) {
        poolMap[row.pool_id] = (poolMap[row.pool_id] ?? 0) + Number(row.debit) - Number(row.credit);
      }
      // Only return pools where net units > 0
      return Object.entries(poolMap)
        .filter(([, units]) => units > 0)
        .map(([pool_id, units]) => ({ pool_id, units }));
    },
    enabled: !!selectedAccountId && !!currentTenant && open,
  });

  // Derived: does this account have any positive holdings? (replaces the old member_pool_holdings count query)
  const accountHasHoldings = allHoldings.length > 0;

  // Filter txn types based on account holdings (now that allHoldings is available)
  const filteredTxnTypesBase = depositOnly
    ? txnTypes.filter((t: any) => DEPOSIT_ONLY_CODES.includes(t.code))
    : stockOnly
      ? txnTypes.filter((t: any) => STOCK_ONLY_CODES.includes(t.code))
      : selectedAccountId && !accountHasHoldings
        ? txnTypes.filter((t: any) => DEPOSIT_ONLY_CODES.includes(t.code))
        : txnTypes;

  // Admin dashboard: remove "Send Funds" (TRANSFER) option from the transaction type chooser.
  const filteredTxnTypes = isStaff
    ? filteredTxnTypesBase.filter((t: any) => t.code !== "TRANSFER")
    : filteredTxnTypesBase;

  // Preselect a transaction type by code (when provided by caller, e.g., dashboard quick-actions)
  useEffect(() => {
    if (!open) return;
    if (!defaultTxnCode) return;
    if (selectedTxnTypeId) return;
    const match = filteredTxnTypes.find((t: any) => t.code === defaultTxnCode);
    if (match?.id) {
      setSelectedTxnTypeId(match.id);
      if (step === "type") setStep("pool");
    }
  }, [open, defaultTxnCode, filteredTxnTypes, txnTypes, selectedTxnTypeId, step]);

  const selectedTxnType = txnTypes.find((t: any) => t.id === selectedTxnTypeId);
  const isDeposit = selectedTxnType?.code === "DEPOSIT_FUNDS";
  const isWithdrawal = selectedTxnType?.code === "WITHDRAW_FUNDS";
  const isSwitch = SWITCH_CODES.includes(selectedTxnType?.code || "");
  const isTransfer = TRANSFER_CODES.includes(selectedTxnType?.code || "");

  // Keep a "primary" selected pool for deposits (used for unit price/unit estimates)
  useEffect(() => {
    if (!open) return;
    if (!isDeposit) return;
    if (poolSplits.length > 0) {
      const firstPoolId = poolSplits[0].poolId;
      if (!selectedPoolId) {
        setSelectedPoolId(firstPoolId);
      } else if (!poolSplits.some((s) => s.poolId === selectedPoolId)) {
        setSelectedPoolId(firstPoolId);
      }
    } else if (selectedPoolId) {
      setSelectedPoolId("");
    }
  }, [open, isDeposit, poolSplits, selectedPoolId]);

  // Holdings for the currently selected pool (used for switch/transfer calcs)
  const holdings = allHoldings.filter((h: any) => h.pool_id === selectedPoolId);
  const amountNum = parseFloat(amount) || 0;
  // For multi-pool withdrawal, selectedPoolId refers to "primary" pool (first selected).
  // currentHolding is used for switch/transfer single-pool calcs.
  const currentHolding = holdings.length > 0 ? Number(holdings[0].units) : 0;

  // Filter pools based on transaction rules for selected type
  const pools = useMemo(() => {
    if (!selectedTxnTypeId || !allPools.length) return [];
    const selectedCode = txnTypes.find((t: any) => t.id === selectedTxnTypeId)?.code || "";
    const isDepositCode = DEPOSIT_CODES.includes(selectedCode);
    const isWithdrawalCode = selectedCode === "WITHDRAW_FUNDS" || selectedCode === "WITHDRAW_STOCK";
    const isTransferCode = TRANSFER_CODES.includes(selectedCode);

    // Map txn type code (uppercase) to pool rule code (lowercase)
    const ruleCode = selectedCode.toLowerCase();

    // Filter to pools where a rule exists and is_allowed = true for this txn type
    const rulesForType = poolTxnRules.filter((r: any) => r.transaction_type_code === ruleCode && r.is_allowed);
    const allowedPoolIds = new Set(rulesForType.map((r: any) => r.pool_id));

    // If no rules configured for this type at all, fall back to showing all pools for deposits/withdrawals only
    const anyRulesForType = poolTxnRules.some((r: any) => r.transaction_type_code === ruleCode);
    let filtered: any[];
    if (!anyRulesForType) {
      filtered = (isDepositCode || isWithdrawalCode || DEPOSIT_ONLY_CODES.includes(selectedCode)) ? allPools : [];
    } else {
      filtered = allPools.filter((p: any) => allowedPoolIds.has(p.id));
    }

    // For transfers & withdrawals: restrict to pools where account has units
    if ((isTransferCode || isWithdrawalCode) && !holdingsLoading) {
      const poolsWithUnits = new Set(allHoldings.map((h: any) => h.pool_id));
      filtered = filtered.filter((p: any) => poolsWithUnits.has(p.id));
    }
    return filtered;
  }, [allPools, poolTxnRules, selectedTxnTypeId, txnTypes, allHoldings, holdingsLoading]);

  // For switch: to-pools are all pools except the from-pool (apply allow_to rules if set)
  const switchToPools = useMemo(() => {
    if (!isSwitch || !selectedPoolId) return [];
    // For switch destination pools, check if they have 'switch' rule allowed
    const switchRules = poolTxnRules.filter((r: any) => r.transaction_type_code === "switch" && r.is_allowed);
    let eligible = allPools.filter((p: any) => p.id !== selectedPoolId);
    if (switchRules.length > 0) {
      const allowedIds = new Set(switchRules.map((r: any) => r.pool_id));
      eligible = eligible.filter((p: any) => allowedIds.has(p.id));
    }
    return eligible;
  }, [allPools, poolTxnRules, isSwitch, selectedPoolId]);

  // Fetch daily pool prices for the selected transaction date
  const txnDateStr = format(transactionDate, "yyyy-MM-dd");
  const { data: dailyPoolPrices = [] } = useQuery({
    queryKey: ["daily_pool_prices_for_txn", currentTenant?.id, txnDateStr],
    queryFn: async () => {
      if (!currentTenant) return [];
      const { data } = await (supabase as any)
        .from("daily_pool_prices")
        .select("pool_id, unit_price_buy, unit_price_sell")
        .eq("tenant_id", currentTenant.id)
        .eq("totals_date", txnDateStr);
      return data ?? [];
    },
    enabled: !!currentTenant && open,
  });

  // Fetch the latest available daily pool prices as fallback per pool (skips zero-price dates)
  const { data: latestPoolPrices = [] } = useQuery({
    queryKey: ["latest_pool_prices_fallback", currentTenant?.id],
    queryFn: async () => {
      if (!currentTenant) return [];
      // Use the RPC that returns the latest NON-ZERO price per pool
      const { data } = await (supabase as any).rpc("get_latest_pool_prices", { p_tenant_id: currentTenant.id });
      return data ?? [];
    },
    enabled: !!currentTenant && open,
  });

  // Determine if prices are stale (no prices for the transaction date, using fallback)
  const pricesStale = useMemo(() => {
    if (!selectedPoolId && poolSplits.length === 0) return false;
    const relevantPoolIds = poolSplits.length > 0
      ? poolSplits.map(s => s.poolId)
      : selectedPoolId ? [selectedPoolId] : [];
    for (const pid of relevantPoolIds) {
      const exactPrice = dailyPoolPrices.find((dp: any) => dp.pool_id === pid);
      if (!exactPrice || Number(exactPrice.unit_price_buy) <= 0) {
        // No price for the transaction date — check if fallback exists
        const fallback = latestPoolPrices.find((dp: any) => dp.pool_id === pid);
        if (fallback && Number(fallback.unit_price_buy) > 0) return true; // using stale fallback
        if (!fallback || Number(fallback.unit_price_buy) <= 0) return true; // no price at all
      }
    }
    return false;
  }, [dailyPoolPrices, latestPoolPrices, selectedPoolId, poolSplits]);

  // Helper to get BUY unit price for a pool (used for deposits / switch-in)
  // NEVER falls back to open_unit_price (R1) — uses latest available non-zero price
  const getUnitPrice = (poolId: string) => {
    const dailyPrice = dailyPoolPrices.find((dp: any) => dp.pool_id === poolId);
    if (dailyPrice && Number(dailyPrice.unit_price_buy) > 0) return Number(dailyPrice.unit_price_buy);
    const latestPrice = latestPoolPrices.find((dp: any) => dp.pool_id === poolId);
    if (latestPrice && Number(latestPrice.unit_price_buy) > 0) return Number(latestPrice.unit_price_buy);
    return 0;
  };

  // Helper to get SELL unit price for a pool (used for withdrawals / switch-out)
  const getUnitPriceSell = (poolId: string) => {
    const dailyPrice = dailyPoolPrices.find((dp: any) => dp.pool_id === poolId);
    if (dailyPrice && Number(dailyPrice.unit_price_sell) > 0) return Number(dailyPrice.unit_price_sell);
    const latestPrice = latestPoolPrices.find((dp: any) => dp.pool_id === poolId);
    if (latestPrice && Number(latestPrice.unit_price_sell) > 0) return Number(latestPrice.unit_price_sell);
    // Fall back to buy price if sell not available
    return getUnitPrice(poolId);
  };

  const selectedPool = pools.find((p: any) => p.id === selectedPoolId);
  // Deposits use UP Buy; withdrawals/switch-out use UP Sell
  const currentUnitPriceBuy = selectedPool ? getUnitPrice(selectedPool.id) : 0;
  const currentUnitPriceSell = selectedPool ? getUnitPriceSell(selectedPool.id) : 0;
  const currentUnitPrice = (isWithdrawal || isSwitch) ? currentUnitPriceSell : currentUnitPriceBuy;
  const totalSplitPct = poolSplits.reduce((sum, s) => sum + s.percentage, 0);

  // Fee calculation helper — pure function, no closure dependency on component state
  const calculateFees = (
    txnTypeId: string,
    txnAmount: number,
    method: string,
    rules: any[],
    vatRegistered: boolean,
    vat: number,
  ) => {
    if (!txnTypeId || txnAmount <= 0) return { totalFee: 0, totalVat: 0, breakdown: [] as { name: string; amount: number; vat: number; gl_account_id?: string | null }[] };
    const applicableRules = rules.filter((r: any) => {
      if (r.transaction_type_id !== txnTypeId) return false;
      if (r.transaction_fee_types?.code?.toUpperCase().includes("CASH_DEPOSIT") && method !== "cash_deposit") return false;
      return true;
    });
    let totalFee = 0;
    let totalVatAmt = 0;
    const breakdown: { name: string; amount: number; vat: number; gl_account_id?: string | null }[] = [];
    for (const rule of applicableRules) {
      let fee = 0;
      let appliedPct: number | null = null;
      if (rule.calculation_method === "percentage") {
        appliedPct = Number(rule.percentage);
        fee = txnAmount * (appliedPct / 100);
      } else if (rule.calculation_method === "fixed_amount") {
        fee = Number(rule.fixed_amount);
      } else if (rule.calculation_method === "sliding_scale") {
        const tiers = (rule.transaction_fee_tiers || []).sort((a: any, b: any) => Number(a.min_amount) - Number(b.min_amount));
        for (const tier of tiers) {
          if (txnAmount >= Number(tier.min_amount) && txnAmount <= (tier.max_amount ? Number(tier.max_amount) : Infinity)) {
            appliedPct = Number(tier.percentage);
            fee = txnAmount * (appliedPct / 100);
            break;
          }
        }
      }
      const feeVat = vatRegistered ? fee * (vat / 100) : 0;
      const feeInclVat = fee + feeVat;
      totalFee += feeInclVat;
      totalVatAmt += feeVat;
      const feeName = rule.transaction_fee_types?.name || rule.transaction_fee_types?.code || rule.fee_type_id;
      const feeGlAccountId = rule.transaction_fee_types?.gl_account_id || null;
      breakdown.push({
        name: appliedPct != null ? `${feeName} (${appliedPct}%)` : feeName,
        amount: feeInclVat,
        vat: feeVat,
        gl_account_id: feeGlAccountId,
      });
    }
    return { totalFee, totalVat: totalVatAmt, breakdown };
  };

  // For deposits, fees are calculated on the amount AFTER loan repayment and membership deductions
  const membershipDeductions = joinShareInfo.needed ? joinShareInfo.shareCost + joinShareInfo.membershipFee : 0;
  const loanRepaymentNum = parseFloat(loanRepaymentAmount) || 0;
  const effectiveLoanRepayment = (outstandingLoanInfo && isDeposit)
    ? (loanRepaymentOnly ? Math.min(amountNum, outstandingLoanInfo.outstanding) : loanRepaymentNum)
    : 0;
  const amountAfterMembership = Math.max(0, amountNum - effectiveLoanRepayment - membershipDeductions);

  // Detect "membership only" deposit: entire amount consumed by join share + membership fee
  const isMembershipOnlyDeposit = isDeposit && joinShareInfo.needed && amountNum > 0 && amountAfterMembership <= 0;

  // Suppress admin fees when deposit is fully consumed by membership deductions or no pool allocation chosen
  const depositFees = useMemo(
    () => (isDeposit && !isMembershipOnlyDeposit && !noPoolAllocation)
      ? calculateFees(selectedTxnTypeId, amountAfterMembership, paymentMethod, feeRules, isVatRegistered, vatRate)
      : { totalFee: 0, totalVat: 0, breakdown: [] as { name: string; amount: number; vat: number; gl_account_id?: string | null }[] },
    [isDeposit, isMembershipOnlyDeposit, noPoolAllocation, selectedTxnTypeId, amountAfterMembership, paymentMethod, feeRules, isVatRegistered, vatRate]
  );

  const feeCalculation = useMemo(
    () => calculateFees(selectedTxnTypeId, amountNum, paymentMethod, feeRules, isVatRegistered, vatRate),
    [selectedTxnTypeId, amountNum, paymentMethod, feeRules, isVatRegistered, vatRate]
  );

  const commissionBase = isDeposit && commissionPct > 0 && !isMembershipOnlyDeposit && !noPoolAllocation ? amountAfterMembership * (commissionPct / 100) : 0;
  const commissionVat = isVatRegistered && commissionBase > 0 ? commissionBase * (vatRate / 100) : 0;
  const commissionAmount = commissionBase + commissionVat;
  const depositTotalDeductions = effectiveLoanRepayment + membershipDeductions + depositFees.totalFee + commissionAmount;
  const depositNetAvailable = amountNum - depositTotalDeductions;

  const splitSummaries = useMemo(() => {
    if (!isDeposit || poolSplits.length === 0 || depositNetAvailable <= 0) return [];
    return poolSplits.map((split) => {
      const pool = pools.find((p: any) => p.id === split.poolId);
      const netForPool = depositNetAvailable * (split.percentage / 100);
      const grossForPool = amountNum * (split.percentage / 100);
      const unitPrice = getUnitPrice(split.poolId);
      const units = unitPrice > 0 ? netForPool / unitPrice : 0;
      return { poolId: split.poolId, poolName: pool?.name || "—", percentage: split.percentage, grossAmount: grossForPool, netAmount: netForPool, unitPrice, units };
    });
  }, [isDeposit, poolSplits, amountNum, depositNetAvailable, pools, dailyPoolPrices]);

  // Build per-pool WithdrawalPoolEntry objects (for the Details step)
  const withdrawalPoolEntries: WithdrawalPoolEntry[] = useMemo(() => {
    if (!isWithdrawal) return [];
    return withdrawalPoolIds.map((poolId) => {
      const pool = allPools.find((p: any) => p.id === poolId);
      const holding = allHoldings.find((h: any) => h.pool_id === poolId);
      const holdingUnits = holding ? Number(holding.units) : 0;
      const unitPrice = getUnitPriceSell(poolId);
      const holdingValue = holdingUnits * unitPrice;
      const inputs = withdrawalPoolInputs[poolId] ?? { amountInput: "", unitsInput: "", inputMode: "amount" as const, useAllUnits: false };
      return {
        poolId,
        poolName: pool?.name || "—",
        holdingUnits,
        holdingValue,
        unitPrice,
        ...inputs,
      };
    });
  }, [isWithdrawal, withdrawalPoolIds, allPools, allHoldings, withdrawalPoolInputs, dailyPoolPrices, latestPoolPrices]);

  // Compute summaries (net payout, gross, fees, units) from per-pool entries
  const withdrawalSplitSummaries = useMemo(() => {
    if (!isWithdrawal || withdrawalPoolEntries.length === 0) return [];
    return withdrawalPoolEntries.map((entry) => {
      let netPayout = 0;
      let grossUnits = 0;
      if (entry.useAllUnits) {
        // Redeem all units at the sell price
        const grossFromUnits = entry.holdingUnits * entry.unitPrice;
        const feeCalc = calculateFees(selectedTxnTypeId, grossFromUnits, paymentMethod, feeRules, isVatRegistered, vatRate);
        netPayout = Math.max(0, grossFromUnits - feeCalc.totalFee);
        grossUnits = entry.holdingUnits;
        const grossAmt = grossFromUnits;
        const holdingValue = entry.holdingValue;
        return {
          poolId: entry.poolId,
          poolName: entry.poolName,
          netPayout,
          grossAmount: grossAmt,
          totalFee: feeCalc.totalFee,
          feeBreakdown: feeCalc.breakdown,
          unitPrice: entry.unitPrice,
          units: grossUnits,
          holdingUnits: entry.holdingUnits,
          holdingValue,
          isOverHolding: false,
        };
      } else if (entry.inputMode === "units") {
        const unitsNum = parseFloat(entry.unitsInput) || 0;
        const grossAmt = unitsNum * entry.unitPrice;
        const feeCalc = calculateFees(selectedTxnTypeId, grossAmt, paymentMethod, feeRules, isVatRegistered, vatRate);
        netPayout = Math.max(0, grossAmt - feeCalc.totalFee);
        grossUnits = unitsNum;
        const holdingValue = entry.holdingValue;
        return {
          poolId: entry.poolId,
          poolName: entry.poolName,
          netPayout,
          grossAmount: grossAmt,
          totalFee: feeCalc.totalFee,
          feeBreakdown: feeCalc.breakdown,
          unitPrice: entry.unitPrice,
          units: grossUnits,
          holdingUnits: entry.holdingUnits,
          holdingValue,
          isOverHolding: grossAmt > holdingValue && holdingValue > 0,
        };
      } else {
        // Amount mode: user enters net payout, we add fees on top
        const amtNum = parseFloat(entry.amountInput) || 0;
        const feeCalc = calculateFees(selectedTxnTypeId, amtNum, paymentMethod, feeRules, isVatRegistered, vatRate);
        const grossAmt = amtNum + feeCalc.totalFee;
        netPayout = amtNum;
        grossUnits = entry.unitPrice > 0 ? grossAmt / entry.unitPrice : 0;
        const holdingValue = entry.holdingValue;
        return {
          poolId: entry.poolId,
          poolName: entry.poolName,
          netPayout,
          grossAmount: grossAmt,
          totalFee: feeCalc.totalFee,
          feeBreakdown: feeCalc.breakdown,
          unitPrice: entry.unitPrice,
          units: grossUnits,
          holdingUnits: entry.holdingUnits,
          holdingValue,
          isOverHolding: grossAmt > holdingValue && holdingValue > 0,
        };
      }
    });
  }, [isWithdrawal, withdrawalPoolEntries, selectedTxnTypeId, paymentMethod, feeRules, isVatRegistered, vatRate]);

  const anyWithdrawalSplitOverHolding = withdrawalSplitSummaries.some((s) => s.isOverHolding);


  // Fees are covered by redeeming ADDITIONAL units on top of the payout units.
  // grossAmount = amount + fees (total units redeemed from pool)
  // netPayoutAmount = amount (what member actually receives)
  const withdrawalGrossAmount = amountNum + feeCalculation.totalFee;
  const netAmount = isWithdrawal ? amountNum : amountNum - (isMembershipOnlyDeposit || noPoolAllocation ? 0 : feeCalculation.totalFee);
  const withdrawalTotalUnits = currentUnitPrice > 0 ? withdrawalGrossAmount / currentUnitPrice : 0;
  const unitsToTransact = isWithdrawal
    ? withdrawalTotalUnits
    : currentUnitPrice > 0 ? netAmount / currentUnitPrice : 0;

  // ─── Switch calculations ───
  // Switch: redeem from selectedPoolId (UP Sell), invest into switchToPoolId (UP Buy)
  const switchToPool = allPools.find((p: any) => p.id === switchToPoolId);
  const switchToUnitPrice = switchToPool ? getUnitPrice(switchToPool.id) : 0; // UP Buy for to-pool
  const allUnitsValue = currentHolding * currentUnitPrice; // uses UP Sell
  const switchFeeBaseAmount = switchUseAllUnits ? allUnitsValue : amountNum;
  const switchFeeCalc = useMemo(
    () => isSwitch ? calculateFees(selectedTxnTypeId, switchFeeBaseAmount, "switch", feeRules, isVatRegistered, vatRate) : { totalFee: 0, totalVat: 0, breakdown: [] as { name: string; amount: number; vat: number; gl_account_id?: string | null }[] },
    [isSwitch, selectedTxnTypeId, switchFeeBaseAmount, feeRules, isVatRegistered, vatRate]
  );
  const switchGrossRedemption = isSwitch
    ? (switchUseAllUnits ? allUnitsValue : amountNum + switchFeeCalc.totalFee)
    : 0;
  const switchNetAmount = isSwitch
    ? (switchUseAllUnits ? Math.max(0, allUnitsValue - switchFeeCalc.totalFee) : amountNum)
    : 0;
  // From-pool uses UP Sell; to-pool uses UP Buy
  const switchFromUnitsRedeemed = currentUnitPrice > 0 ? switchGrossRedemption / currentUnitPrice : 0;
  const switchToUnitsAcquired = switchToUnitPrice > 0 ? switchNetAmount / switchToUnitPrice : 0;

  // ─── Transfer calculations (UP Sell for redemption) ───
  const transferAllUnitsValue = currentHolding * currentUnitPriceSell;
  const transferFeeBaseAmount = transferUseAllUnits ? transferAllUnitsValue : amountNum;
  const transferFeeCalc = useMemo(
    () => isTransfer ? calculateFees(selectedTxnTypeId, transferFeeBaseAmount, "transfer", feeRules, isVatRegistered, vatRate) : { totalFee: 0, totalVat: 0, breakdown: [] as { name: string; amount: number; vat: number; gl_account_id?: string | null }[] },
    [isTransfer, selectedTxnTypeId, transferFeeBaseAmount, feeRules, isVatRegistered, vatRate]
  );
  // Transfer model (same as Switch):
  // - Sender redeems GROSS units = net amount to transfer + fees (all at UP Sell)
  // - Receiver gets NET units only (gross minus fee)
  const transferNetAmountBeforeReceiverDeductions = isTransfer
    ? (transferUseAllUnits ? Math.max(0, transferAllUnitsValue - transferFeeCalc.totalFee) : amountNum)
    : 0;
  const transferGrossRedemption = isTransfer ? transferNetAmountBeforeReceiverDeductions + transferFeeCalc.totalFee : 0;
  // Units that change ownership = net / UP Sell
  const transferFeeUnitsRedeemed = currentUnitPriceSell > 0 ? transferFeeCalc.totalFee / currentUnitPriceSell : 0;

  // ─── Receiver-side deductions (join share, membership fee, commission) ───
  // These are deducted from the net amount credited to the receiver's pool.
  const receiverNeedsJoinShare = receiverJoinShareData?.needed ?? false;
  const receiverJoinShareCost = receiverNeedsJoinShare ? joinShareCost : 0;
  const receiverMembershipFeeRaw = receiverNeedsJoinShare ? (receiverJoinShareData?.membershipFee ?? 0) : 0;
  const receiverMembershipFeeVat = receiverMembershipFeeRaw > 0 && vatRate > 0
    ? Math.round((receiverMembershipFeeRaw / (1 + vatRate / 100)) * (vatRate / 100) * 100) / 100
    : 0;
  const receiverMembershipFee = receiverMembershipFeeRaw; // stored incl VAT
  const receiverCommissionPct = receiverJoinShareData?.commissionPct ?? 0;
  const receiverCommissionReferrerName = receiverJoinShareData?.commissionReferrerName ?? "";
  const receiverCommissionBase = receiverCommissionPct > 0
    ? transferNetAmountBeforeReceiverDeductions * (receiverCommissionPct / 100)
    : 0;
  const receiverCommissionVat = isVatRegistered && receiverCommissionBase > 0
    ? Math.round(receiverCommissionBase * (vatRate / 100) * 100) / 100
    : 0;
  const receiverCommissionAmount = receiverCommissionBase + receiverCommissionVat;
  const receiverTotalDeductions = receiverJoinShareCost + receiverMembershipFee + receiverCommissionAmount;
  // Net amount actually allocated into the receiver's pool after all deductions
  const transferNetAmount = Math.max(0, transferNetAmountBeforeReceiverDeductions - receiverTotalDeductions);

  // ─── Stock Deposit calculations ───
  const stockDepositItems = rawStockItems.map((i: any) => ({
    id: i.id,
    description: i.description,
    item_code: i.item_code,
    buy_price_incl_vat: i.buy_price_incl_vat,
  }));
  const stockDepositTotalValue = stockDepositLines.reduce((s, l) => s + l.lineValue, 0);
  const effectiveCourierFeeDeposit = activeCourierFee;
  const stockDepositFees = useMemo(
    () => isStockDeposit
      ? calculateFees(selectedTxnTypeId, stockDepositTotalValue, "stock_deposit", feeRules.filter((r: any) => !r.transaction_fee_types?.code?.toUpperCase().includes("COUR")), isVatRegistered, vatRate)
      : { totalFee: 0, totalVat: 0, breakdown: [] as { name: string; amount: number; vat: number; gl_account_id?: string | null }[] },
    [isStockDeposit, selectedTxnTypeId, stockDepositTotalValue, feeRules, isVatRegistered, vatRate]
  );
  const stockDepositMembershipDeductions = joinShareInfo.needed ? joinShareInfo.shareCost + joinShareInfo.membershipFee : 0;
  const stockDepositNetForPool = Math.max(0, stockDepositTotalValue - stockDepositMembershipDeductions - stockDepositFees.totalFee - effectiveCourierFeeDeposit);
  const stockDepositUnitsAcquired = currentUnitPriceBuy > 0 ? stockDepositNetForPool / currentUnitPriceBuy : 0;

  // ─── Stock Withdrawal calculations ───
  const stockWithdrawalItems = rawStockItems.map((i: any) => ({
    id: i.id,
    description: i.description,
    item_code: i.item_code,
    sell_price: i.sell_price,
    current_stock: i.current_stock,
  }));
  const stockWithdrawalTotalValue = stockWithdrawalLines.reduce((s, l) => s + l.lineValue, 0);
  const effectiveCourierFeeWithdrawal = activeCourierFee;
  const stockWithdrawalFees = useMemo(
    () => isStockWithdrawal
      ? calculateFees(selectedTxnTypeId, stockWithdrawalTotalValue, "stock_withdrawal", feeRules.filter((r: any) => !r.transaction_fee_types?.code?.toUpperCase().includes("COUR")), isVatRegistered, vatRate)
      : { totalFee: 0, totalVat: 0, breakdown: [] as { name: string; amount: number; vat: number; gl_account_id?: string | null }[] },
    [isStockWithdrawal, selectedTxnTypeId, stockWithdrawalTotalValue, feeRules, isVatRegistered, vatRate]
  );
  const stockWithdrawalGrossRedemption = stockWithdrawalTotalValue + stockWithdrawalFees.totalFee + effectiveCourierFeeWithdrawal;
  const stockWithdrawalGrossUnits = currentUnitPriceSell > 0 ? stockWithdrawalGrossRedemption / currentUnitPriceSell : 0;
  const maxPoolValue = currentHolding * currentUnitPriceSell;
  const stockWithdrawalOverHolding = stockWithdrawalGrossRedemption > maxPoolValue && maxPoolValue > 0;

  // Pool split helpers

  const togglePoolSplit = (poolId: string) => {
    setPoolSplits((prev) => {
      const exists = prev.find((s) => s.poolId === poolId);
      if (exists) return prev.filter((s) => s.poolId !== poolId);
      const newSplits = [...prev, { poolId, percentage: 0 }];
      const even = Math.floor(100 / newSplits.length);
      const remainder = 100 - even * newSplits.length;
      return newSplits.map((s, i) => ({ ...s, percentage: even + (i === 0 ? remainder : 0) }));
    });
  };

  const updateSplitPct = (poolId: string, pct: number) => {
    setPoolSplits((prev) => prev.map((s) => (s.poolId === poolId ? { ...s, percentage: Math.max(0, Math.min(100, pct)) } : s)));
  };

  // Submit
  const submitMutation = useMutation({
    mutationFn: async () => {
      if (!user || !currentTenant) throw new Error("Missing context");

      let popFilePath: string | null = null;
      let popFileName: string | null = null;
      if (popFile) {
        const ext = popFile.name.split(".").pop() || "pdf";
        const storagePath = `${user.id}/${Date.now()}.${ext}`;
        const { error: uploadErr } = await supabase.storage.from("pop-documents").upload(storagePath, popFile);
        if (uploadErr) throw new Error("Failed to upload POP: " + uploadErr.message);
        popFilePath = storagePath;
        popFileName = popFile.name;
      }

      // fee_breakdown stores amount (incl VAT), vat component, and gl_account_id per line for CFT posting
      const feeBreakdown: { name: string; amount: number; vat: number; gl_account_id?: string | null }[] = [
        ...depositFees.breakdown.map(b => ({
          name: b.name,
          amount: b.amount,
          vat: b.vat,
          gl_account_id: b.gl_account_id ?? null,
        })),
      ];
      if (joinShareInfo.needed) {
        feeBreakdown.unshift({ name: `Join Share (${joinShareInfo.shareClassName})`, amount: joinShareInfo.shareCost, vat: 0 });
        feeBreakdown.splice(1, 0, { name: "Membership Fee", amount: joinShareInfo.membershipFee, vat: joinShareInfo.membershipFeeVat });
      }
      if (commissionAmount > 0) {
        feeBreakdown.push({ name: `Commission (${commissionPct}%)${commissionReferrerName ? ` — ${commissionReferrerName}` : ""}`, amount: commissionAmount, vat: commissionVat });
      }
      const totalVatAmount = depositFees.totalVat + (joinShareInfo.needed ? joinShareInfo.membershipFeeVat : 0) + commissionVat;
      const metaJson = JSON.stringify({
        fee_breakdown: feeBreakdown,
        join_share: joinShareInfo.needed ? { share_gl_account_id: joinShareGlAccountId, cost: joinShareInfo.shareCost, membership_fee: joinShareInfo.membershipFee, membership_fee_vat: joinShareInfo.membershipFeeVat } : null,
        loan_repayment: effectiveLoanRepayment > 0 ? {
          amount: effectiveLoanRepayment,
          loan_ids: outstandingLoanInfo?.loanIds || [],
          loan_pool_ids: outstandingLoanInfo?.loanPoolIds || [],
          outstanding_at_time: outstandingLoanInfo?.outstanding || 0,
        } : null,
        vat_rate: vatRate,
        is_vat_registered: isVatRegistered,
        total_vat: totalVatAmount,
        user_notes: notes || "",
      });

      if (isDeposit && (poolSplits.length > 0 || loanRepaymentOnly || isMembershipOnlyDeposit || noPoolAllocation)) {
        if (loanRepaymentOnly || isMembershipOnlyDeposit || noPoolAllocation) {
          // Loan repayment only — single transaction row, no pool
          const { error } = await (supabase as any).from("transactions").insert({
            tenant_id: currentTenant.id,
            entity_account_id: selectedAccountId,
            pool_id: null,
            transaction_type_id: selectedTxnTypeId,
            user_id: user.id,
            amount: amountNum,
            fee_amount: depositTotalDeductions,
            net_amount: 0,
            unit_price: 0,
            units: 0,
            payment_method: paymentMethod,
            status: "pending",
            transaction_date: txnDateStr,
            notes: metaJson,
            pop_file_path: popFilePath,
            pop_file_name: popFileName,
          });
          if (error) throw error;
        } else {
          const totalFeeAndDeductions = depositTotalDeductions;
          for (let i = 0; i < splitSummaries.length; i++) {
            const split = splitSummaries[i];
            const isFirst = i === 0;
            const { error } = await (supabase as any).from("transactions").insert({
              tenant_id: currentTenant.id,
              entity_account_id: selectedAccountId,
              pool_id: split.poolId,
              transaction_type_id: selectedTxnTypeId,
              user_id: user.id,
              amount: isFirst ? amountNum : 0,
              fee_amount: isFirst ? totalFeeAndDeductions : 0,
              net_amount: split.netAmount,
              unit_price: split.unitPrice,
              units: Math.abs(split.units),
              payment_method: paymentMethod,
              status: "pending",
              transaction_date: txnDateStr,
              notes: isFirst ? metaJson : `${split.percentage}% to ${split.poolName}`,
              pop_file_path: isFirst ? popFilePath : null,
              pop_file_name: isFirst ? popFileName : null,
            });
            if (error) throw error;
          }
        }
      } else if (isSwitch) {
        // Switch: store full metadata for approval posting
        const switchMeta = JSON.stringify({
          fee_breakdown: switchFeeCalc.breakdown.map(b => ({
            name: b.name,
            amount: b.amount,
            vat: b.vat,
            gl_account_id: b.gl_account_id ?? null,
          })),
          from_pool_id: selectedPoolId,
          to_pool_id: switchToPoolId,
          from_unit_price: currentUnitPrice,
          to_unit_price: switchToUnitPrice,
          gross_redemption_amount: switchGrossRedemption,
          net_switch_amount: switchNetAmount,
          total_fee: switchFeeCalc.totalFee,
          use_all_units: switchUseAllUnits,
          vat_rate: vatRate,
          is_vat_registered: isVatRegistered,
          user_notes: notes || "",
        });
        const { error } = await (supabase as any).from("transactions").insert({
          tenant_id: currentTenant.id,
          entity_account_id: selectedAccountId,
          pool_id: selectedPoolId,          // from-pool
          transaction_type_id: selectedTxnTypeId,
          user_id: user.id,
          amount: switchGrossRedemption,    // gross redeemed from from-pool
          fee_amount: switchFeeCalc.totalFee,
          net_amount: switchNetAmount,      // net invested into to-pool
          unit_price: currentUnitPrice,     // from-pool unit price
          units: switchFromUnitsRedeemed,   // total units redeemed
          payment_method: "switch",
          status: "pending",
          transaction_date: txnDateStr,
          notes: switchMeta,
        });
        if (error) throw error;
      } else if (isTransfer) {
        // Transfer: save full metadata including receiver-side deductions (join share, commission)
        const receiverFeeBreakdown: { name: string; amount: number; vat: number; gl_account_id?: string | null }[] = [];
        if (receiverNeedsJoinShare && receiverJoinShareCost > 0) {
          receiverFeeBreakdown.push({ name: "Join Share", amount: receiverJoinShareCost, vat: 0 });
        }
        if (receiverNeedsJoinShare && receiverMembershipFee > 0) {
          receiverFeeBreakdown.push({ name: "Membership Fee", amount: receiverMembershipFee, vat: receiverMembershipFeeVat });
        }
        if (receiverCommissionAmount > 0) {
          receiverFeeBreakdown.push({
            name: `Commission (${receiverCommissionPct}%)${receiverCommissionReferrerName ? ` — ${receiverCommissionReferrerName}` : ""}`,
            amount: receiverCommissionAmount,
            vat: receiverCommissionVat,
          });
        }

        const transferMeta = JSON.stringify({
          fee_breakdown: transferFeeCalc.breakdown.map(b => ({
            name: b.name,
            amount: b.amount,
            vat: b.vat,
            gl_account_id: b.gl_account_id ?? null,
          })),
          to_account_number: transferRecipientAccountNumber,
          to_entity_name: transferRecipientEntityName,
          to_account_id: transferRecipientAccountId,
          recipient_id_number: transferRecipientIdNumber,
          unit_price_sell: currentUnitPriceSell,
          unit_price_buy: currentUnitPriceBuy,
          gross_redemption_amount: transferGrossRedemption,
          net_transfer_amount: transferNetAmount,          // net INTO receiver's pool (after all receiver deductions)
          net_before_receiver_deductions: transferNetAmountBeforeReceiverDeductions,
          total_fee: transferFeeCalc.totalFee,
          use_all_units: transferUseAllUnits,
          vat_rate: vatRate,
          is_vat_registered: isVatRegistered,
          user_notes: notes || "",
          // Receiver-side deductions
          receiver_join_share: receiverNeedsJoinShare ? {
            share_gl_account_id: joinShareGlAccountId,
            cost: receiverJoinShareCost,
            membership_fee: receiverMembershipFee,
            membership_fee_vat: receiverMembershipFeeVat,
          } : null,
          receiver_commission: receiverCommissionAmount > 0 ? {
            amount: receiverCommissionAmount,
            vat: receiverCommissionVat,
            pct: receiverCommissionPct,
            referrer_name: receiverCommissionReferrerName,
          } : null,
          receiver_fee_breakdown: receiverFeeBreakdown,
        });

        const { error } = await (supabase as any).from("transactions").insert({
          tenant_id: currentTenant.id,
          entity_account_id: selectedAccountId,
          pool_id: selectedPoolId,
          transaction_type_id: selectedTxnTypeId,
          user_id: user.id,
          amount: transferGrossRedemption,       // gross redeemed from sender (net + fees)
          fee_amount: transferFeeCalc.totalFee,
          net_amount: transferNetAmount,           // net credited to receiver's pool
          unit_price: currentUnitPriceSell,
          units: currentUnitPriceSell > 0 ? transferGrossRedemption / currentUnitPriceSell : 0,
          transfer_to_account_id: transferRecipientAccountId || null,
          payment_method: "transfer",
          status: "pending",
          transaction_date: txnDateStr,
          notes: transferMeta,
        });
        if (error) throw error;
      } else if (isStockDeposit) {
        const stockDepositMeta = JSON.stringify({
          transaction_kind: "stock_deposit",
          stock_lines: stockDepositLines,
          fee_breakdown: stockDepositFees.breakdown,
          join_share: joinShareInfo.needed ? { share_gl_account_id: joinShareGlAccountId, cost: joinShareInfo.shareCost, membership_fee: joinShareInfo.membershipFee } : null,
          courier: stockCourierOption !== "collect" ? {
            option: stockCourierOption,
            fee: activeCourierFee,
            gl_account_id: (stockCourierOption === "insured" ? courierInsuredRule : courierUninsuredRule)?.transaction_fee_types?.gl_account_id ?? null,
          } : null,
          total_stock_value: stockDepositTotalValue,
          net_for_pool: stockDepositNetForPool,
          unit_price_buy: currentUnitPriceBuy,
          units_acquired: stockDepositUnitsAcquired,
          vat_rate: vatRate,
          is_vat_registered: isVatRegistered,
          user_notes: notes || "",
        });
        const { error } = await (supabase as any).from("transactions").insert({
          tenant_id: currentTenant.id,
          entity_account_id: selectedAccountId,
          pool_id: selectedPoolId,
          transaction_type_id: selectedTxnTypeId,
          user_id: user.id,
          amount: stockDepositTotalValue,
          fee_amount: stockDepositFees.totalFee + effectiveCourierFeeDeposit + stockDepositMembershipDeductions,
          net_amount: stockDepositNetForPool,
          unit_price: currentUnitPriceBuy,
          units: stockDepositUnitsAcquired,
          payment_method: "stock",
          status: "pending",
          transaction_date: txnDateStr,
          notes: stockDepositMeta,
        });
        if (error) throw error;
      } else if (isStockWithdrawal) {
        const stockWithdrawalMeta = JSON.stringify({
          transaction_kind: "stock_withdrawal",
          stock_lines: stockWithdrawalLines,
          fee_breakdown: stockWithdrawalFees.breakdown,
          courier: stockCourierOption !== "collect" ? {
            option: stockCourierOption,
            fee: activeCourierFee,
            gl_account_id: (stockCourierOption === "insured" ? courierInsuredRule : courierUninsuredRule)?.transaction_fee_types?.gl_account_id ?? null,
          } : null,
          total_stock_value: stockWithdrawalTotalValue,
          gross_pool_redemption: stockWithdrawalGrossRedemption,
          unit_price_sell: currentUnitPriceSell,
          units_redeemed: stockWithdrawalGrossUnits,
          vat_rate: vatRate,
          is_vat_registered: isVatRegistered,
          user_notes: notes || "",
        });
        const { error } = await (supabase as any).from("transactions").insert({
          tenant_id: currentTenant.id,
          entity_account_id: selectedAccountId,
          pool_id: selectedPoolId,
          transaction_type_id: selectedTxnTypeId,
          user_id: user.id,
          amount: stockWithdrawalGrossRedemption,
          fee_amount: stockWithdrawalFees.totalFee + effectiveCourierFeeWithdrawal,
          net_amount: stockWithdrawalTotalValue,
          unit_price: currentUnitPriceSell,
          units: stockWithdrawalGrossUnits,
          payment_method: "stock",
          status: "pending",
          transaction_date: txnDateStr,
          notes: stockWithdrawalMeta,
        });
        if (error) throw error;
      } else if (isWithdrawal && withdrawalSplitSummaries.length > 0) {
        // Multi-pool withdrawal: one transaction row per pool
        for (let i = 0; i < withdrawalSplitSummaries.length; i++) {
          const s = withdrawalSplitSummaries[i];
          const isFirst = i === 0;
          const splitMeta = JSON.stringify({
            fee_breakdown: s.feeBreakdown.map(b => ({ name: b.name, amount: b.amount, vat: b.vat, gl_account_id: b.gl_account_id ?? null })),
            vat_rate: vatRate,
            is_vat_registered: isVatRegistered,
            total_pools: withdrawalSplitSummaries.length,
            user_notes: isFirst ? (notes || "") : "",
          });
          const { error } = await (supabase as any).from("transactions").insert({
            tenant_id: currentTenant.id,
            entity_account_id: selectedAccountId,
            pool_id: s.poolId,
            transaction_type_id: selectedTxnTypeId,
            user_id: user.id,
            amount: s.grossAmount,
            fee_amount: s.totalFee,
            net_amount: s.netPayout,
            unit_price: s.unitPrice,
            units: Math.abs(s.units),
            payment_method: paymentMethod,
            status: "pending",
            transaction_date: txnDateStr,
            notes: splitMeta,
            pop_file_path: isFirst ? popFilePath : null,
            pop_file_name: isFirst ? popFileName : null,
          });
          if (error) throw error;
        }
      } else {
        // Non-withdrawal single-pool fallback
        const { error } = await (supabase as any).from("transactions").insert({
          tenant_id: currentTenant.id,
          entity_account_id: selectedAccountId,
          pool_id: selectedPoolId,
          transaction_type_id: selectedTxnTypeId,
          user_id: user.id,
          amount: amountNum,
          fee_amount: feeCalculation.totalFee,
          net_amount: netAmount,
          unit_price: currentUnitPrice,
          units: Math.abs(unitsToTransact),
          payment_method: paymentMethod,
          status: "pending",
          transaction_date: txnDateStr,
          notes: notes || null,
          pop_file_path: popFilePath,
          pop_file_name: popFileName,
        });
        if (error) throw error;
      }

      // ── Create debit order if payment method is debit_order ──
      if (isDeposit && paymentMethod === "debit_order" && doSignatureData && selectedAccount) {
        // Build pool allocations from the deposit pool splits
        const doPoolAllocations = splitSummaries.map(s => ({
          pool_id: s.poolId,
          pool_name: s.poolName,
          percentage: s.percentage,
          amount: s.netAmount,
        }));

        const doPayload = {
          tenant_id: currentTenant.id,
          entity_id: selectedAccount.entity_id,
          entity_account_id: selectedAccountId,
          monthly_amount: amountNum,
          debit_day: 1,
          frequency: doFrequency,
          start_date: doStartDate,
          pool_allocations: doPoolAllocations,
          bank_name: doBankName,
          branch_code: doBranchCode,
          account_name: doAccountName,
          account_number: doBankAccountNumber,
          account_type: doBankAccountType,
          signature_data: doSignatureData,
          signed_at: new Date().toISOString(),
          notes: JSON.stringify({
            loan_instalment: effectiveLoanRepayment,
            admin_fees: depositFees.totalFee,
            fee_breakdown: depositFees.breakdown,
            net_to_pools: depositNetAvailable,
            user_notes: doNotes,
          }),
          status: "pending",
          created_by: user.id,
        };

        const { error: doError } = await (supabase as any)
          .from("debit_orders")
          .insert(doPayload);
        if (doError) throw doError;
      }

    },
    onSuccess: () => {
      const msg = isDeposit && paymentMethod === "debit_order"
        ? "Transaction & debit order submitted for approval"
        : "Transaction submitted for approval";
      toast.success(msg);
      queryClient.invalidateQueries({ queryKey: ["member_transactions"] });
      queryClient.invalidateQueries({ queryKey: ["pending_approvals_count"] });
      queryClient.invalidateQueries({ queryKey: ["debit_orders"] });
      queryClient.invalidateQueries({ queryKey: ["debit_orders_list"] });
      queryClient.invalidateQueries({ queryKey: ["pending_debit_orders"] });

      // Fire-and-forget: notify approver(s) of the new pending transaction
      if (currentTenant?.id) {
        const entityName = selectedAccount
          ? [selectedAccount.entities?.name, selectedAccount.entities?.last_name].filter(Boolean).join(" ")
          : "";
        sendApprovalNotification({
          tenantId: currentTenant.id,
          transactionType: selectedTxnType?.name || "",
          memberName: entityName,
          accountNumber: selectedAccount?.account_number || "",
          amount: amountNum,
          transactionDate: txnDateStr,
        });
      }

      onOpenChange(false);
    },
    onError: (err: any) => toast.error(err.message || "Failed to submit"),
  });

  // Validation — note step order is now: type → account → pool → details → review
  // Allow deposit of exactly the membership amount (no minimum "extra" required)
  const minimumDeposit = joinShareInfo.needed ? membershipDeductions : 1;
  const selectedPoolHolding = allHoldings.find((h: any) => h.pool_id === selectedPoolId);
  const selectedPoolHasUnits = selectedPoolHolding ? Number(selectedPoolHolding.units) > 0 : false;
  const canProceedFromType = !!selectedTxnTypeId;
  const canProceedFromAccount = !!selectedAccountId;
  // For transfer/withdrawal: pool must be selected; withdrawal uses multi-pool (no pct needed)
  const canProceedToDetails = isWithdrawal
    ? withdrawalPoolIds.length > 0
    : isDeposit
    ? (loanRepaymentOnly && !!outstandingLoanInfo) || isMembershipOnlyDeposit || noPoolAllocation || (poolSplits.length > 0 && totalSplitPct === 100)
    : isTransfer
      ? !!selectedPoolId && selectedPoolHasUnits
      : !!selectedPoolId;
  // For withdrawals: gross (payout + fees) must be ≤ available holding value for each split
  const maxWithdrawalValue = currentHolding * currentUnitPrice;
  // For switch: gross redemption ≤ holding value, and a to-pool must be selected
  const switchValid = isSwitch && switchToPoolId
    ? (switchUseAllUnits ? currentHolding > 0 : (amountNum > 0 && switchGrossRedemption <= maxWithdrawalValue && currentHolding > 0))
    : false;
  const transferValid = isTransfer && !!transferRecipientAccountId
    ? (transferUseAllUnits ? currentHolding > 0 : (amountNum > 0 && currentHolding > 0))
    : false;
  const withdrawalMultiValid = isWithdrawal
    && withdrawalPoolIds.length > 0
    && withdrawalSplitSummaries.length > 0
    && withdrawalSplitSummaries.some((s) => s.grossAmount > 0 || s.units > 0)
    && !anyWithdrawalSplitOverHolding;
  const stockDepositValid = isStockDeposit && stockDepositLines.length > 0 && stockDepositNetForPool > 0;
  const stockWithdrawalValid = isStockWithdrawal && stockWithdrawalLines.length > 0 && !stockWithdrawalOverHolding && currentHolding > 0;
  const canProceedToReview = isSwitch
    ? switchValid
    : isTransfer
    ? transferValid
    : isWithdrawal
    ? withdrawalMultiValid
    : isStockDeposit
    ? stockDepositValid
    : isStockWithdrawal
    ? stockWithdrawalValid
    : (amountNum >= minimumDeposit && !!selectedAccountId);

  // Dynamic steps based on whether debit order payment method is selected for a deposit
  const isDebitOrderDeposit = isDeposit && paymentMethod === "debit_order";
  const STEPS = isDebitOrderDeposit ? DEBIT_ORDER_STEPS : BASE_STEPS;

  const canProceedFromDebitOrder = !!(doBankName && doBankAccountNumber && doAccountName && doSignatureData);

  const canProceed = () => {
    switch (step) {
      case "account": return canProceedFromAccount;
      case "type": return canProceedFromType;
      case "pool": return canProceedToDetails;
      case "details": return canProceedToReview;
      case "debit_order": return canProceedFromDebitOrder;
      default: return false;
    }
  };

  const nextStep = () => { const idx = STEPS.indexOf(step); if (idx < STEPS.length - 1) setStep(STEPS[idx + 1]); };
  const prevStep = () => { const idx = STEPS.indexOf(step); if (idx > 0) setStep(STEPS[idx - 1]); };

  const formatCurrency = (v: number) =>
    `R ${v.toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const handleAccountSelect = (id: string) => {
    setSelectedAccountId(id);
    setSelectedTxnTypeId("");
    setSelectedPoolId("");
    setPoolSplits([]);
    setStep("type");
  };

  const handleTxnTypeSelect = (id: string) => {
    setSelectedTxnTypeId(id);
    setSelectedPoolId("");
    setPoolSplits([]);
    setStep("pool");
  };

  // Auto-advance: single-account case for members
  useEffect(() => {
    if (!open) return;
    if (isStaff) return;
    if (step !== "account") return;
    if (selectedAccountId) return;
    if (accountsLoading) return;
    if (allAccounts.length === 1) {
      handleAccountSelect(allAccounts[0].id);
    }
  }, [open, isStaff, step, selectedAccountId, accountsLoading, allAccounts]);

  // Auto-advance: single transaction type
  useEffect(() => {
    if (!open) return;
    if (step !== "type") return;
    if (selectedTxnTypeId) return;
    if (filteredTxnTypes.length === 1) {
      handleTxnTypeSelect(filteredTxnTypes[0].id);
    }
  }, [open, step, selectedTxnTypeId, filteredTxnTypes]);

  // Auto-advance: single pool case
  useEffect(() => {
    if (!open) return;
    if (step !== "pool") return;
    if (!pools?.length) return;
    if (pools.length !== 1) return;
    const onlyPoolId = pools[0].id as string;

    if (isWithdrawal) {
      if (withdrawalPoolIds.length === 0) setWithdrawalPoolIds([onlyPoolId]);
      setSelectedPoolId(onlyPoolId);
      setStep("details");
      return;
    }

    if (isDeposit) {
      // If membership-only deposit, auto-advance (no pool needed)
      if (isMembershipOnlyDeposit) {
        setNoPoolAllocation(true);
        setStep("details");
        return;
      }
      if (!loanRepaymentOnly && !noPoolAllocation && poolSplits.length === 0) {
        setPoolSplits([{ poolId: onlyPoolId, percentage: 100 }]);
      }
      setSelectedPoolId(onlyPoolId);
      setStep("details");
      return;
    }

    // switch/transfer/stock transactions
    if (!selectedPoolId) setSelectedPoolId(onlyPoolId);
    setStep("details");
  }, [
    open,
    step,
    pools,
    isWithdrawal,
    isDeposit,
    isMembershipOnlyDeposit,
    noPoolAllocation,
    loanRepaymentOnly,
    poolSplits,
    selectedPoolId,
    withdrawalPoolIds,
  ]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="inset-3 w-auto rounded-2xl border sm:h-auto sm:max-w-3xl sm:max-h-[90vh] !p-0 !gap-0 overflow-hidden">
        <div className="flex flex-col h-full min-h-0 sm:h-auto sm:max-h-[90vh] min-w-0">
          <DialogHeader className="px-4 pt-4 pb-3 sm:px-6 sm:pt-6 sm:pb-4 border-b border-border shrink-0">
            <DialogTitle className="text-lg">New Transaction</DialogTitle>

            {/* Visual Step Indicator */}
            <div className="mt-3 sm:mt-4 -mx-4 px-4 sm:mx-0 sm:px-0 overflow-x-auto pb-2 flex items-center gap-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {STEPS.map((s, i) => {
                const meta = STEP_META[s];
                const Icon = meta.icon;
                const isCurrent = step === s;
                const isPast = STEPS.indexOf(s) < STEPS.indexOf(step);
                return (
                  <div key={s} className="flex items-center gap-2 shrink-0 snap-start">
                    <div
                      className={`flex items-center gap-2 px-2.5 py-1.5 sm:px-3 sm:py-2 rounded-lg transition-all text-[11px] font-medium whitespace-nowrap ${
                        isCurrent
                          ? "bg-primary text-primary-foreground shadow-sm"
                          : isPast
                            ? "bg-primary/10 text-primary"
                            : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {isPast ? (
                        <CheckCircle className="h-3 w-3 sm:h-3.5 sm:w-3.5 shrink-0" />
                      ) : (
                        <Icon className="h-3 w-3 sm:h-3.5 sm:w-3.5 shrink-0" />
                      )}
                      <span>{meta.label}</span>
                    </div>
                    {i < STEPS.length - 1 ? <div className={`h-px w-4 sm:w-6 ${isPast ? "bg-primary/30" : "bg-border"}`} /> : null}
                  </div>
                );
              })}
            </div>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto overflow-x-hidden px-4 py-4 sm:px-6 sm:py-5 min-h-0 min-w-0">
          {step === "account" && (
            <AccountSelectionStep
              accounts={allAccounts}
              loading={accountsLoading}
              selectedAccountId={selectedAccountId}
              onSelect={handleAccountSelect}
            />
          )}

          {step === "type" && (
            <TransactionTypeStep
              txnTypes={filteredTxnTypes}
              selectedTxnTypeId={selectedTxnTypeId}
              onSelect={handleTxnTypeSelect}
              accountHasHoldings={accountHasHoldings}
              accountLabel={selectedAccountLabel}
            />
          )}

          {step === "pool" && (
            <PoolSelectionStep
              pools={pools}
              isDeposit={isDeposit}
              isWithdrawal={isWithdrawal}
              isSwitch={isSwitch}
              isTransfer={isTransfer}
              poolSplits={poolSplits}
              selectedPoolId={selectedPoolId}
              totalSplitPct={totalSplitPct}
              onTogglePool={togglePoolSplit}
              onUpdateSplitPct={updateSplitPct}
              onSelectPool={setSelectedPoolId}
              formatCurrency={formatCurrency}
              getUnitPrice={getUnitPriceSell}
              accountHoldings={allHoldings}
              selectedWithdrawalPoolIds={withdrawalPoolIds}
              onToggleWithdrawalPool={(poolId) =>
                setWithdrawalPoolIds((prev) =>
                  prev.includes(poolId) ? prev.filter((id) => id !== poolId) : [...prev, poolId]
                )
              }
              outstandingLoanInfo={isDeposit ? outstandingLoanInfo : undefined}
              loanRepaymentOnly={loanRepaymentOnly}
              onLoanRepaymentOnlyChange={(val) => {
                setLoanRepaymentOnly(val);
                setNoPoolAllocation(false);
                if (val) {
                  setPoolSplits([]);
                  const repayment = parseFloat(loanRepaymentAmount) || 0;
                  if (repayment > 0) {
                    setAmount(String(repayment));
                  }
                  if (outstandingLoanInfo) setStep("details");
                }
              }}
              noPoolAllocation={noPoolAllocation}
              isMembershipOnlyDeposit={isMembershipOnlyDeposit}
              onNoPoolAllocationChange={(val) => {
                setNoPoolAllocation(val);
                if (val) {
                  setPoolSplits([]);
                  setLoanRepaymentOnly(false);
                }
              }}
            />
          )}

          {step === "details" && isSwitch && (
            <SwitchDetailsStep
              fromPoolId={selectedPoolId}
              fromPoolName={selectedPool?.name || ""}
              currentHolding={currentHolding}
              currentUnitPrice={currentUnitPrice}
              toPools={switchToPools}
              toPoolId={switchToPoolId}
              onToPoolSelect={setSwitchToPoolId}
              toPoolUnitPrice={switchToUnitPrice}
              amount={amount}
              onAmountChange={setAmount}
              useAllUnits={switchUseAllUnits}
              onUseAllUnitsChange={setSwitchUseAllUnits}
              feeBreakdown={switchFeeCalc.breakdown}
              totalVat={switchFeeCalc.totalVat}
              isVatRegistered={isVatRegistered}
              totalFee={switchFeeCalc.totalFee}
              grossRedemptionAmount={switchGrossRedemption}
              netSwitchAmount={switchNetAmount}
              fromUnitsRedeemed={switchFromUnitsRedeemed}
              toUnitsAcquired={switchToUnitsAcquired}
              notes={notes}
              onNotesChange={setNotes}
              formatCurrency={formatCurrency}
              transactionDate={transactionDate}
              onTransactionDateChange={setTransactionDate}
            />
          )}

          {step === "details" && isWithdrawal && !isSwitch && (
            <WithdrawalDetailsStep
              poolEntries={withdrawalPoolEntries}
              onPoolEntryChange={(poolId, changes) =>
                setWithdrawalPoolInputs((prev) => ({
                  ...prev,
                  [poolId]: { amountInput: "", unitsInput: "", inputMode: "amount" as const, useAllUnits: false, ...prev[poolId], ...changes },
                }))
              }
              withdrawalSummaries={withdrawalSplitSummaries}
              notes={notes}
              onNotesChange={setNotes}
              isVatRegistered={isVatRegistered}
              formatCurrency={formatCurrency}
              transactionDate={transactionDate}
              onTransactionDateChange={setTransactionDate}
            />
          )}


          {step === "details" && isTransfer && (
            <TransferDetailsStep
              tenantId={currentTenant?.id || ""}
              fromAccountId={selectedAccountId}
              poolId={selectedPoolId}
              poolName={selectedPool?.name || ""}
              currentHolding={currentHolding}
              unitPriceSell={currentUnitPriceSell}
              unitPriceBuy={currentUnitPriceBuy}
              feeBreakdown={transferFeeCalc.breakdown}
              totalFee={transferFeeCalc.totalFee}
              amount={amount}
              useAllUnits={transferUseAllUnits}
              notes={notes}
              recipientAccountNumber={transferRecipientAccountNumber}
              recipientAccountId={transferRecipientAccountId}
              recipientIdNumber={transferRecipientIdNumber}
              onAmountChange={setAmount}
              onUseAllUnitsChange={setTransferUseAllUnits}
              onNotesChange={setNotes}
              onRecipientChange={(accountNumber, accountId, entityName) => {
                setTransferRecipientAccountNumber(accountNumber);
                setTransferRecipientAccountId(accountId);
                setTransferRecipientEntityName(entityName);
              }}
              onRecipientIdNumberChange={setTransferRecipientIdNumber}
              formatCurrency={formatCurrency}
            />
          )}

          {step === "details" && isStockDeposit && (
            <StockDepositDetailsStep
              items={stockDepositItems}
              stockLines={stockDepositLines}
              onStockLinesChange={setStockDepositLines}
              courierOption={stockCourierOption}
              onCourierOptionChange={setStockCourierOption}
              courierFeeInsured={courierFeeInsured}
              courierFeeInsuredVat={courierInsuredVat}
              courierFeeUninsured={courierFeeUninsured}
              courierFeeUninsuredVat={courierUninsuredVat}
              notes={notes}
              onNotesChange={setNotes}
              transactionDate={transactionDate}
              onTransactionDateChange={setTransactionDate}
              joinShareInfo={joinShareInfo}
              feeBreakdown={stockDepositFees.breakdown}
              totalAdminFee={stockDepositFees.totalFee}
              totalVat={stockDepositFees.totalVat}
              isVatRegistered={isVatRegistered}
              formatCurrency={formatCurrency}
              currentUnitPriceBuy={currentUnitPriceBuy}
              poolName={selectedPool?.name || ""}
            />
          )}

          {step === "details" && isStockWithdrawal && (
            <StockWithdrawalDetailsStep
              items={stockWithdrawalItems}
              stockLines={stockWithdrawalLines}
              onStockLinesChange={setStockWithdrawalLines}
              courierOption={stockCourierOption}
              onCourierOptionChange={setStockCourierOption}
              courierFeeInsured={courierFeeInsured}
              courierFeeInsuredVat={courierInsuredVat}
              courierFeeUninsured={courierFeeUninsured}
              courierFeeUninsuredVat={courierUninsuredVat}
              notes={notes}
              onNotesChange={setNotes}
              transactionDate={transactionDate}
              onTransactionDateChange={setTransactionDate}
              feeBreakdown={stockWithdrawalFees.breakdown}
              totalAdminFee={stockWithdrawalFees.totalFee}
              totalVat={stockWithdrawalFees.totalVat}
              isVatRegistered={isVatRegistered}
              formatCurrency={formatCurrency}
              currentUnitPriceSell={currentUnitPriceSell}
              poolName={selectedPool?.name || ""}
              currentHolding={currentHolding}
            />
          )}

          {step === "details" && !isWithdrawal && !isSwitch && !isTransfer && !isStockDeposit && !isStockWithdrawal && (
            <DepositDetailsStep
              amount={amount}
              onAmountChange={setAmount}
              paymentMethod={paymentMethod}
              onPaymentMethodChange={setPaymentMethod}
              notes={notes}
              onNotesChange={setNotes}
              popFile={popFile}
              onPopFileChange={setPopFile}
              joinShareInfo={joinShareInfo}
              feeBreakdown={depositFees.breakdown}
              totalVat={depositFees.totalVat}
              isVatRegistered={isVatRegistered}
              commissionAmount={commissionAmount}
              commissionVat={commissionVat}
              commissionPct={commissionPct}
              commissionReferrerName={commissionReferrerName}
              depositNetAvailable={depositNetAvailable}
              splitSummaries={splitSummaries}
              amountNum={amountNum}
              formatCurrency={formatCurrency}
              isDeposit={isDeposit}
              netAmount={netAmount}
              currentUnitPrice={currentUnitPrice}
              unitsToTransact={unitsToTransact}
              currentHolding={currentHolding}
              isWithdrawal={false}
              totalFee={(isMembershipOnlyDeposit || noPoolAllocation) ? 0 : feeCalculation.totalFee}
              transactionDate={transactionDate}
              onTransactionDateChange={setTransactionDate}
              loanRepaymentAmount={effectiveLoanRepayment}
              onLoanRepaymentAmountChange={setLoanRepaymentAmount}
              hasOutstandingLoan={!!outstandingLoanInfo}
              outstandingLoanBalance={outstandingLoanInfo?.outstanding || 0}
              loanInstalment={outstandingLoanInfo?.instalment || 0}
              loanRepaymentOnly={loanRepaymentOnly}
            />
          )}

          {step === "debit_order" && isDebitOrderDeposit && selectedAccount && (
            <DebitOrderStep
              entityId={selectedAccount.entity_id}
              bankName={doBankName}
              onBankNameChange={setDoBankName}
              branchCode={doBranchCode}
              onBranchCodeChange={setDoBranchCode}
              accountName={doAccountName}
              onAccountNameChange={setDoAccountName}
              bankAccountNumber={doBankAccountNumber}
              onBankAccountNumberChange={setDoBankAccountNumber}
              bankAccountType={doBankAccountType}
              onBankAccountTypeChange={setDoBankAccountType}
              frequency={doFrequency}
              onFrequencyChange={setDoFrequency}
              startDate={doStartDate}
              onStartDateChange={setDoStartDate}
              debitOrderNotes={doNotes}
              onDebitOrderNotesChange={setDoNotes}
              signatureData={doSignatureData}
              onSignatureDataChange={setDoSignatureData}
              grossAmount={amountNum}
              formatCurrency={formatCurrency}
            />
          )}

          {step === "review" && (
            <>
            {pricesStale && (
              <div className="flex items-start gap-2 rounded-md border border-yellow-500/50 bg-yellow-50 dark:bg-yellow-900/20 p-3 mb-3 text-sm">
                <AlertTriangle className="h-4 w-4 text-yellow-600 dark:text-yellow-400 mt-0.5 shrink-0" />
                <div>
                  <p className="font-medium text-yellow-800 dark:text-yellow-300">Pool prices not updated for {format(transactionDate, "dd MMM yyyy")}</p>
                  <p className="text-yellow-700 dark:text-yellow-400 text-xs mt-0.5">
                    Using the most recent available prices. Update pool prices before approving to ensure accurate unit pricing.
                  </p>
                </div>
              </div>
            )}
            <ReviewStep
              accountLabel={selectedAccountLabel}
              txnTypeName={selectedTxnType?.name || ""}
              paymentMethod={isSwitch ? "switch" : isTransfer ? "transfer" : isStockDeposit ? "stock" : isStockWithdrawal ? "stock" : paymentMethod}
              amountNum={
                isSwitch ? switchGrossRedemption
                : isTransfer ? transferNetAmount
                : isStockDeposit ? stockDepositTotalValue
                : isStockWithdrawal ? stockWithdrawalTotalValue
                : amountNum
              }
              joinShareInfo={joinShareInfo}
              feeBreakdown={isSwitch ? switchFeeCalc.breakdown : isStockDeposit ? stockDepositFees.breakdown : isStockWithdrawal ? stockWithdrawalFees.breakdown : depositFees.breakdown}
              totalVat={isSwitch ? switchFeeCalc.totalVat : isStockDeposit ? stockDepositFees.totalVat : isStockWithdrawal ? stockWithdrawalFees.totalVat : depositFees.totalVat}
              isVatRegistered={isVatRegistered}
              commissionAmount={commissionAmount}
              commissionVat={commissionVat}
              commissionPct={commissionPct}
              commissionReferrerName={commissionReferrerName}
              depositNetAvailable={isStockDeposit ? stockDepositNetForPool : isStockWithdrawal ? stockWithdrawalTotalValue : depositNetAvailable}
              splitSummaries={splitSummaries}
              isDeposit={isDeposit || isStockDeposit}
              isWithdrawal={!!isWithdrawal || isStockWithdrawal}
              isSwitch={isSwitch}
              isTransfer={isTransfer}
              popFile={popFile}
              formatCurrency={formatCurrency}
              poolName={selectedPool?.name}
              netAmount={isStockDeposit ? stockDepositNetForPool : isStockWithdrawal ? stockWithdrawalTotalValue : netAmount}
              currentUnitPrice={isStockDeposit ? currentUnitPriceBuy : isStockWithdrawal ? currentUnitPriceSell : currentUnitPrice}
              unitsToTransact={isStockDeposit ? stockDepositUnitsAcquired : isStockWithdrawal ? stockWithdrawalGrossUnits : unitsToTransact}
              totalFee={isSwitch ? switchFeeCalc.totalFee : isStockDeposit ? (stockDepositFees.totalFee + effectiveCourierFeeDeposit) : isStockWithdrawal ? (stockWithdrawalFees.totalFee + effectiveCourierFeeWithdrawal) : (isMembershipOnlyDeposit || noPoolAllocation) ? 0 : feeCalculation.totalFee}
              transactionDate={transactionDate}
              switchFromPoolName={selectedPool?.name}
              switchToPoolName={switchToPool?.name}
              switchGrossRedemption={switchGrossRedemption}
              switchNetAmount={switchNetAmount}
              switchFromUnits={switchFromUnitsRedeemed}
              switchToUnits={switchToUnitsAcquired}
              switchFromUnitPrice={currentUnitPrice}
              switchToUnitPrice={switchToUnitPrice}
              transferFromPool={selectedPool?.name}
              transferRecipientAccountNumber={transferRecipientAccountNumber}
              transferNetAmount={transferNetAmount}
              transferGrossRedemption={transferGrossRedemption}
              transferFeeUnitsRedeemed={transferFeeUnitsRedeemed}
              transferUnitPriceSell={currentUnitPriceSell}
              transferFeeBreakdown={transferFeeCalc.breakdown}
              transferTotalFee={transferFeeCalc.totalFee}
              withdrawalSummaries={withdrawalSplitSummaries}
              loanRepaymentAmount={effectiveLoanRepayment}
            />
            </>
          )}
          </div>

          <DialogFooter className="px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] sm:px-6 sm:py-4 border-t border-border bg-background shrink-0 flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
            {step !== "account" ? (
              <Button variant="outline" onClick={prevStep} disabled={submitMutation.isPending} className="gap-1.5 w-full sm:w-auto">
                <ArrowLeft className="h-4 w-4" />
                Back
              </Button>
            ) : (
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitMutation.isPending} className="w-full sm:w-auto">
                Cancel
              </Button>
            )}

            {step !== "review" ? (
              <Button onClick={nextStep} disabled={!canProceed()} className="gap-1.5 w-full sm:w-auto">
                Continue
                <ArrowRight className="h-4 w-4" />
              </Button>
            ) : (
              <Button onClick={() => submitMutation.mutate()} disabled={submitMutation.isPending} className="gap-1.5 w-full sm:w-auto">
                {submitMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle className="h-4 w-4" />
                )}
                {isDebitOrderDeposit ? "Submit Transaction & Debit Order" : "Submit Transaction"}
              </Button>
            )}
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default NewTransactionDialog;
