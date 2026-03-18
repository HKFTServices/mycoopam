import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useTenant } from "@/contexts/TenantContext";
import { formatCurrency } from "@/lib/formatCurrency";
import { formatLocalDate } from "@/lib/formatDate";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import SignaturePad from "@/components/ui/signature-pad";
import { Loader2, FileText, CreditCard, AlertCircle } from "lucide-react";
import { toast } from "sonner";

interface DebitOrderSignUpDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entityId: string;
  entityName: string;
  entityAccountId: string;
  accountNumber?: string;
}

interface PoolAllocation {
  poolId: string;
  poolName: string;
  percentage: number;
  amount: number;
}

type Step = "details" | "preview";

const DebitOrderSignUpDialog = ({
  open, onOpenChange, entityId, entityName, entityAccountId, accountNumber,
}: DebitOrderSignUpDialogProps) => {
  const { user } = useAuth();
  const { currentTenant } = useTenant();
  const queryClient = useQueryClient();

  const [step, setStep] = useState<Step>("details");
  const [monthlyAmount, setMonthlyAmount] = useState("");
  const debitDay = "1";
  const [frequency, setFrequency] = useState("monthly");
  // Default to 1st of upcoming month
  const getFirstOfNextMonth = () => {
    const now = new Date();
    const next = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    return formatLocalDate(next);
  };
  const [startDate, setStartDate] = useState(getFirstOfNextMonth());
  const [allocations, setAllocations] = useState<PoolAllocation[]>([]);
  const [manualLoanInstalment, setManualLoanInstalment] = useState("");
  const [notes, setNotes] = useState("");

  // Bank details
  const [bankName, setBankName] = useState("");
  const [branchCode, setBranchCode] = useState("");
  const [accountName, setAccountName] = useState("");
  const [bankAccountNumber, setBankAccountNumber] = useState("");
  const [bankAccountType, setBankAccountType] = useState("savings");

  // Signature
  const [signatureData, setSignatureData] = useState<string | null>(null);

  // Fetch tenant config
  const { data: tenantConfig } = useQuery({
    queryKey: ["tenant_configuration", currentTenant?.id],
    queryFn: async () => {
      if (!currentTenant) return null;
      const { data } = await (supabase as any)
        .from("tenant_configuration")
        .select("currency_symbol, legal_entity_id, is_vat_registered, vat_percentage")
        .eq("tenant_id", currentTenant.id)
        .maybeSingle();
      return data;
    },
    enabled: !!currentTenant && open,
  });

  // Fetch tenant legal entity for the mandate header
  const { data: tenantEntity } = useQuery({
    queryKey: ["tenant_legal_entity", tenantConfig?.legal_entity_id],
    queryFn: async () => {
      if (!tenantConfig?.legal_entity_id) return null;
      const { data } = await supabase
        .from("entities")
        .select("name, registration_number, contact_number, email_address")
        .eq("id", tenantConfig.legal_entity_id)
        .maybeSingle();
      return data;
    },
    enabled: !!tenantConfig?.legal_entity_id && open,
  });

  // Fetch tenant address
  const { data: tenantAddress } = useQuery({
    queryKey: ["tenant_legal_entity_address", tenantConfig?.legal_entity_id],
    queryFn: async () => {
      if (!tenantConfig?.legal_entity_id) return null;
      const { data } = await (supabase as any)
        .from("addresses")
        .select("street_address, suburb, city, province, postal_code")
        .eq("entity_id", tenantConfig.legal_entity_id)
        .eq("is_primary", true)
        .maybeSingle();
      return data;
    },
    enabled: !!tenantConfig?.legal_entity_id && open,
  });

  const sym = tenantConfig?.currency_symbol ?? "R";
  const isVatRegistered = tenantConfig?.is_vat_registered ?? false;
  const vatRate = Number(tenantConfig?.vat_percentage ?? 15);

  // Fetch pools — exclude admin pool
  const { data: allPools = [] } = useQuery({
    queryKey: ["pools_for_debit_order", currentTenant?.id],
    queryFn: async () => {
      if (!currentTenant) return [];
      const { data } = await (supabase as any)
        .from("pools")
        .select("id, name, is_active")
        .eq("tenant_id", currentTenant.id)
        .eq("is_active", true)
        .order("name");
      return data ?? [];
    },
    enabled: !!currentTenant && open,
  });

  // Filter out admin pool from member-selectable pools
  const pools = useMemo(() => {
    return allPools.filter((p: any) => !p.name.toLowerCase().includes("admin"));
  }, [allPools]);

  // Fetch entity details (member info for the form)
  const { data: entityDetails } = useQuery({
    queryKey: ["entity_details_debit", entityId],
    queryFn: async () => {
      const { data } = await supabase
        .from("entities")
        .select("name, last_name, identity_number, contact_number, email_address")
        .eq("id", entityId)
        .maybeSingle();
      return data;
    },
    enabled: !!entityId && open,
  });

  // Fetch entity address
  const { data: entityAddress } = useQuery({
    queryKey: ["entity_address_debit", entityId],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("addresses")
        .select("street_address, suburb, city, province, postal_code")
        .eq("entity_id", entityId)
        .eq("is_primary", true)
        .maybeSingle();
      return data;
    },
    enabled: !!entityId && open,
  });

  // Pre-fill bank details from entity_bank_details
  const { data: existingBank } = useQuery({
    queryKey: ["entity_bank_debit", entityId],
    queryFn: async () => {
      if (!currentTenant) return null;
      const { data } = await (supabase as any)
        .from("entity_bank_details")
        .select("account_holder, account_number, bank_id, bank_account_type_id, banks(name, branch_code), bank_account_types(name)")
        .eq("entity_id", entityId)
        .eq("tenant_id", currentTenant.id)
        .eq("is_active", true)
        .eq("is_deleted", false)
        .limit(1)
        .maybeSingle();
      return data;
    },
    enabled: !!entityId && !!currentTenant && open,
  });

  // Outstanding loan info for the selected account
  const { data: outstandingLoanInfo } = useQuery({
    queryKey: ["outstanding_loan_debit_order", entityAccountId, currentTenant?.id],
    queryFn: async () => {
      if (!entityAccountId || !currentTenant) return null;
      const { data: loans } = await (supabase as any)
        .from("loan_applications")
        .select("id, monthly_instalment, total_loan, amount_approved, pool_id")
        .eq("entity_account_id", entityAccountId)
        .eq("tenant_id", currentTenant.id)
        .eq("status", "disbursed")
        .order("created_at", { ascending: false });
      if (!loans?.length) return null;

      const { data: cftRows } = await (supabase as any)
        .from("cashflow_transactions")
        .select("debit, credit")
        .eq("entity_account_id", entityAccountId)
        .eq("tenant_id", currentTenant.id)
        .eq("is_active", true)
        .in("entry_type", ["loan_capital", "loan_fee", "loan_loading", "loan_repayment"]);

      const outstanding = (cftRows || []).reduce((sum: number, r: any) =>
        sum + Number(r.debit) - Number(r.credit), 0);

      if (outstanding <= 0) return null;

      const totalInstalment = loans.reduce((sum: number, l: any) =>
        sum + (Number(l.monthly_instalment) || 0), 0);

      return { outstanding, instalment: totalInstalment };
    },
    enabled: !!entityAccountId && !!currentTenant && open,
  });

  // Fee rules for deposit transaction type
  const { data: depositFeeRules = [] } = useQuery({
    queryKey: ["debit_order_fee_rules", currentTenant?.id],
    queryFn: async () => {
      if (!currentTenant) return [];
      // Find the "Deposit Funds" transaction type
      const { data: txnTypes } = await (supabase as any)
        .from("transaction_types")
        .select("id")
        .eq("tenant_id", currentTenant.id)
        .eq("code", "DEPOSIT_FUNDS")
        .limit(1);
      if (!txnTypes?.length) return [];
      const depositTypeId = txnTypes[0].id;
      const { data } = await (supabase as any)
        .from("transaction_fee_rules")
        .select("*, transaction_fee_tiers(*), transaction_fee_types!inner(code, name, gl_account_id)")
        .eq("tenant_id", currentTenant.id)
        .eq("is_active", true)
        .eq("transaction_type_id", depositTypeId);
      return data ?? [];
    },
    enabled: !!currentTenant && open,
  });

  // Auto-fill bank details when data loads
  useEffect(() => {
    if (existingBank) {
      setBankName(existingBank.banks?.name ?? "");
      setBranchCode(existingBank.banks?.branch_code ?? "");
      setAccountName(existingBank.account_holder ?? "");
      setBankAccountNumber(existingBank.account_number ?? "");
      setBankAccountType(existingBank.bank_account_types?.name?.toLowerCase() ?? "savings");
    }
  }, [existingBank]);

  // Initialize allocations when pools load
  useEffect(() => {
    if (pools.length > 0 && allocations.length === 0) {
      const equalPct = pools.length > 0 ? Math.floor(100 / pools.length) : 100;
      setAllocations(pools.map((p: any, i: number) => ({
        poolId: p.id,
        poolName: p.name,
        percentage: i === 0 ? 100 - (equalPct * (pools.length - 1)) : equalPct,
        amount: 0,
      })));
    }
  }, [pools]);

  // ── Fee calculation (same logic as NewTransactionDialog) ──
  const calculateFees = (amount: number) => {
    if (amount <= 0) return { totalFee: 0, totalVat: 0, breakdown: [] as { name: string; amount: number; vat: number }[] };
    const breakdown: { name: string; amount: number; vat: number }[] = [];
    let totalFee = 0;
    let totalVatAmt = 0;
    for (const rule of depositFeeRules) {
      let fee = 0;
      let appliedPct: number | null = null;
      if (rule.calculation_method === "percentage") {
        appliedPct = Number(rule.percentage);
        fee = amount * (appliedPct / 100);
      } else if (rule.calculation_method === "fixed_amount") {
        fee = Number(rule.fixed_amount);
      } else if (rule.calculation_method === "sliding_scale") {
        const tiers = (rule.transaction_fee_tiers || []).sort((a: any, b: any) => Number(a.min_amount) - Number(b.min_amount));
        for (const tier of tiers) {
          if (amount >= Number(tier.min_amount) && amount <= (tier.max_amount ? Number(tier.max_amount) : Infinity)) {
            appliedPct = Number(tier.percentage);
            fee = amount * (appliedPct / 100);
            break;
          }
        }
      }
      // Only apply debit order fees (exclude cash_deposit specific fees)
      if (rule.transaction_fee_types?.code?.toUpperCase().includes("CASH_DEPOSIT")) continue;
      const feeVat = isVatRegistered ? fee * (vatRate / 100) : 0;
      const feeInclVat = fee + feeVat;
      totalFee += feeInclVat;
      totalVatAmt += feeVat;
      const feeName = rule.transaction_fee_types?.name || rule.transaction_fee_types?.code || "Fee";
      breakdown.push({
        name: appliedPct != null ? `${feeName} (${appliedPct}%)` : feeName,
        amount: feeInclVat,
        vat: feeVat,
      });
    }
    return { totalFee, totalVat: totalVatAmt, breakdown };
  };

  // ── Waterfall calculation ──
  const totalAmount = parseFloat(monthlyAmount) || 0;
  const suggestedInstalment = outstandingLoanInfo?.instalment ?? 0;
  const loanInstalment = manualLoanInstalment !== "" ? (parseFloat(manualLoanInstalment) || 0) : suggestedInstalment;
  const afterLoan = Math.max(0, totalAmount - loanInstalment);
  const feeCalc = calculateFees(afterLoan);
  const afterFees = Math.max(0, afterLoan - feeCalc.totalFee);
  const totalPct = allocations.reduce((s, a) => s + a.percentage, 0);

  const updateAllocationPct = (idx: number, pct: number) => {
    setAllocations(prev => prev.map((a, i) => i === idx ? { ...a, percentage: pct } : a));
  };

  const computedAllocations = allocations.map(a => ({
    ...a,
    amount: (afterFees * a.percentage) / 100,
  }));

  const canProceed = totalAmount > 0 && totalPct === 100 && bankName && bankAccountNumber && accountName && afterFees > 0;

  // Submit mutation
  const submitMutation = useMutation({
    mutationFn: async () => {
      if (!currentTenant || !user) throw new Error("Not authenticated");
      if (!signatureData) throw new Error("Please sign the mandate form");

      const { error } = await (supabase as any)
        .from("debit_orders")
        .insert({
          tenant_id: currentTenant.id,
          entity_id: entityId,
          entity_account_id: entityAccountId,
          monthly_amount: totalAmount,
          debit_day: parseInt(debitDay),
          frequency,
          start_date: startDate,
          pool_allocations: computedAllocations.filter(a => a.percentage > 0).map(a => ({
            pool_id: a.poolId,
            pool_name: a.poolName,
            percentage: a.percentage,
            amount: a.amount,
          })),
          bank_name: bankName,
          branch_code: branchCode,
          account_name: accountName,
          account_number: bankAccountNumber,
          account_type: bankAccountType,
          signature_data: signatureData,
          signed_at: new Date().toISOString(),
          status: "pending",
          created_by: user.id,
          notes: JSON.stringify({
            loan_instalment: loanInstalment,
            admin_fees: feeCalc.totalFee,
            fee_breakdown: feeCalc.breakdown,
            net_to_pools: afterFees,
            user_notes: notes,
          }),
        });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Debit order mandate submitted for approval");
      queryClient.invalidateQueries({ queryKey: ["debit_orders"] });
      resetForm();
      onOpenChange(false);
    },
    onError: (err: any) => toast.error(err.message || "Failed to submit debit order"),
  });

  const resetForm = () => {
    setStep("details");
    setMonthlyAmount("");
    setFrequency("monthly");
    setStartDate(getFirstOfNextMonth());
    setAllocations([]);
    setManualLoanInstalment("");
    setSignatureData(null);
    setNotes("");
    setBankName("");
    setBranchCode("");
    setAccountName("");
    setBankAccountNumber("");
    setBankAccountType("savings");
  };

  const memberFullName = [entityDetails?.name, entityDetails?.last_name].filter(Boolean).join(" ") || entityName;
  const memberAddress = entityAddress
    ? [entityAddress.street_address, entityAddress.suburb, entityAddress.city, entityAddress.province, entityAddress.postal_code].filter(Boolean).join(", ")
    : "";
  const tenantFullName = tenantEntity?.name ?? currentTenant?.name ?? "";

  const today = new Date();
  const dayOfMonth = today.getDate();
  const monthNames = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  const currentMonth = monthNames[today.getMonth()];
  const currentYear = today.getFullYear();

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) resetForm(); onOpenChange(v); }}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5" />
            Debit Order Sign Up
          </DialogTitle>
          <DialogDescription>
            Set up a recurring debit order for {entityName}
          </DialogDescription>
        </DialogHeader>

        {step === "details" && (
          <div className="space-y-6">
            {/* Amount & Frequency */}
            <div>
              <h3 className="font-semibold text-sm mb-3">Debit Order Details</h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="col-span-2 sm:col-span-1">
                  <Label>Gross Monthly Amount ({sym})</Label>
                  <Input type="number" min="0" step="0.01" value={monthlyAmount} onChange={(e) => setMonthlyAmount(e.target.value)} placeholder="0.00" />
                </div>
                <div>
                  <Label>Debit Day</Label>
                  <Input value="1st" disabled className="bg-muted" />
                </div>
                <div>
                  <Label>Frequency</Label>
                  <Select value={frequency} onValueChange={setFrequency}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="monthly">Monthly</SelectItem>
                      <SelectItem value="quarterly">Quarterly</SelectItem>
                      <SelectItem value="annually">Annually</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Start Date (1st of month)</Label>
                  <Input type="month" value={startDate.substring(0, 7)} onChange={(e) => setStartDate(e.target.value + "-01")} min={getFirstOfNextMonth().substring(0, 7)} />
                </div>
              </div>
            </div>

            <Separator />

            {/* ── Deduction Waterfall ── */}
            {totalAmount > 0 && (
              <div className="rounded-md border p-4 space-y-3 bg-muted/30">
                <h3 className="font-semibold text-sm">Deduction Breakdown</h3>
                <div className="space-y-1.5 text-sm">
                  <div className="flex justify-between">
                    <span>Gross Debit Order Amount</span>
                    <span className="font-mono font-semibold">{formatCurrency(totalAmount, sym)}</span>
                  </div>

                  {/* Loan Instalment */}
                  <div className="space-y-1.5">
                    <div className="flex items-end gap-2">
                      <div className="flex-1">
                        <Label className="text-xs">Loan Instalment ({sym})</Label>
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          placeholder={suggestedInstalment > 0 ? String(suggestedInstalment.toFixed(2)) : "0.00"}
                          value={manualLoanInstalment}
                          onChange={(e) => setManualLoanInstalment(e.target.value)}
                          className="h-8 text-sm"
                        />
                      </div>
                      {suggestedInstalment > 0 && manualLoanInstalment !== "" && (
                        <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => setManualLoanInstalment("")}>
                          Reset
                        </Button>
                      )}
                    </div>
                    {suggestedInstalment > 0 && (
                      <p className="text-xs text-muted-foreground">
                        Suggested instalment from active loan(s): {formatCurrency(suggestedInstalment, sym)}
                      </p>
                    )}
                  </div>
                  {loanInstalment > 0 && (
                    <div className="flex justify-between text-destructive">
                      <span className="flex items-center gap-1.5">
                        <AlertCircle className="h-3.5 w-3.5" />
                        Less: Loan Instalment
                      </span>
                      <span className="font-mono">- {formatCurrency(loanInstalment, sym)}</span>
                    </div>
                  )}
                  {loanInstalment > 0 && (
                    <div className="flex justify-between border-t pt-1">
                      <span className="text-muted-foreground">After loan repayment</span>
                      <span className="font-mono">{formatCurrency(afterLoan, sym)}</span>
                    </div>
                  )}

                  {/* Admin Fees */}
                  {feeCalc.breakdown.length > 0 && (
                    <>
                      {feeCalc.breakdown.map((f, i) => (
                        <div key={i} className="flex justify-between text-muted-foreground">
                          <span>Less: {f.name}{f.vat > 0 ? ` (incl VAT ${formatCurrency(f.vat, sym)})` : ""}</span>
                          <span className="font-mono">- {formatCurrency(f.amount, sym)}</span>
                        </div>
                      ))}
                    </>
                  )}

                  <Separator />

                  <div className="flex justify-between font-semibold text-base">
                    <span>Net Amount to Pools</span>
                    <span className="font-mono text-primary">{formatCurrency(afterFees, sym)}</span>
                  </div>

                  {afterFees <= 0 && totalAmount > 0 && (
                    <p className="text-xs text-destructive flex items-center gap-1">
                      <AlertCircle className="h-3 w-3" />
                      The gross amount is insufficient to cover deductions. Please increase the amount.
                    </p>
                  )}
                </div>
              </div>
            )}

            <Separator />

            {/* Pool Allocations */}
            <div>
              <h3 className="font-semibold text-sm mb-2">Pool Allocation</h3>
              <p className="text-xs text-muted-foreground mb-3">
                Allocate how the net {formatCurrency(afterFees, sym)} will be split across pools (must total 100%)
              </p>
              {totalPct !== 100 && totalAmount > 0 && (
                <p className="text-xs text-destructive mb-2">Total allocation is {totalPct}% — must be exactly 100%</p>
              )}
              <div className="space-y-2">
                {computedAllocations.map((a, i) => (
                  <div key={a.poolId} className="flex items-center gap-3">
                    <span className="text-sm w-36 truncate">{a.poolName}</span>
                    <Input
                      type="number" min="0" max="100"
                      className="w-20"
                      value={a.percentage}
                      onChange={(e) => updateAllocationPct(i, Math.max(0, Math.min(100, parseInt(e.target.value) || 0)))}
                    />
                    <span className="text-xs text-muted-foreground">%</span>
                    <span className="text-sm font-mono ml-auto">{formatCurrency(a.amount, sym)}</span>
                  </div>
                ))}
              </div>
            </div>

            <Separator />

            {/* Bank Details */}
            <div>
              <h3 className="font-semibold text-sm mb-3">Bank Details</h3>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Bank Name</Label>
                  <Input value={bankName} onChange={(e) => setBankName(e.target.value)} placeholder="e.g. FNB" />
                </div>
                <div>
                  <Label>Branch Code</Label>
                  <Input value={branchCode} onChange={(e) => setBranchCode(e.target.value)} placeholder="e.g. 250655" />
                </div>
                <div>
                  <Label>Account Holder Name</Label>
                  <Input value={accountName} onChange={(e) => setAccountName(e.target.value)} placeholder="Name on bank account" />
                </div>
                <div>
                  <Label>Account Number</Label>
                  <Input value={bankAccountNumber} onChange={(e) => setBankAccountNumber(e.target.value)} placeholder="Bank account number" />
                </div>
                <div>
                  <Label>Account Type</Label>
                  <Select value={bankAccountType} onValueChange={setBankAccountType}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="savings">Savings</SelectItem>
                      <SelectItem value="current">Current / Cheque</SelectItem>
                      <SelectItem value="transmission">Transmission</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            <Separator />

            {/* Notes */}
            <div>
              <Label>Additional Notes (optional)</Label>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Any special instructions..." rows={2} />
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button
                disabled={!canProceed}
                onClick={() => setStep("preview")}
              >
                <FileText className="h-4 w-4 mr-1.5" />
                Preview & Sign Mandate
              </Button>
            </div>
          </div>
        )}

        {step === "preview" && (
          <div className="space-y-4">
            {/* HTML Mandate Preview */}
            <div className="border rounded-md bg-white p-6 text-black text-sm space-y-4 max-h-[50vh] overflow-y-auto print:max-h-none">
              <div className="text-center font-bold text-base underline mb-4">
                BANK DEBIT ORDER INSTRUCTION TO {tenantFullName.toUpperCase()}
              </div>

              <table className="w-full border-collapse border border-gray-400 text-xs">
                <tbody>
                  <tr>
                    <td className="border border-gray-400 p-1.5 font-semibold w-24">Name (Debtor)</td>
                    <td className="border border-gray-400 p-1.5">{memberFullName}</td>
                    <td className="border border-gray-400 p-1.5 font-semibold w-24">Member No</td>
                    <td className="border border-gray-400 p-1.5">{accountNumber || "—"}</td>
                  </tr>
                  <tr>
                    <td className="border border-gray-400 p-1.5 font-semibold">Address</td>
                    <td className="border border-gray-400 p-1.5">{memberAddress || "—"}</td>
                    <td className="border border-gray-400 p-1.5 font-semibold">Signatory</td>
                    <td className="border border-gray-400 p-1.5">{memberFullName}</td>
                  </tr>
                  <tr>
                    <td className="border border-gray-400 p-1.5 font-semibold">Contact</td>
                    <td className="border border-gray-400 p-1.5">{entityDetails?.contact_number || "—"}</td>
                    <td className="border border-gray-400 p-1.5 font-semibold">Email</td>
                    <td className="border border-gray-400 p-1.5">{entityDetails?.email_address || "—"}</td>
                  </tr>
                </tbody>
              </table>

              <p className="mt-3">Dear Sirs/Madams</p>
              <p className="font-semibold">The details of my bank account are as follows:</p>

              <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs mt-2">
                <div className="flex justify-between border-b border-dotted border-gray-300 py-1">
                  <span className="font-semibold">BANK:</span>
                  <span>{bankName}</span>
                </div>
                <div className="flex justify-between border-b border-dotted border-gray-300 py-1">
                  <span className="font-semibold">ACCOUNT HOLDER:</span>
                  <span>{accountName}</span>
                </div>
                <div className="flex justify-between border-b border-dotted border-gray-300 py-1">
                  <span className="font-semibold">BRANCH CODE:</span>
                  <span>{branchCode}</span>
                </div>
                <div className="flex justify-between border-b border-dotted border-gray-300 py-1">
                  <span className="font-semibold">ACCOUNT NO:</span>
                  <span>{bankAccountNumber}</span>
                </div>
                <div className="flex justify-between border-b border-dotted border-gray-300 py-1">
                  <span className="font-semibold">ACCOUNT TYPE:</span>
                  <span className="capitalize">{bankAccountType}</span>
                </div>
              </div>

              <p className="mt-4 text-xs leading-relaxed">
                I/we hereby request and authorize you to draw against my/our account with the abovementioned bank
                (or any other bank or branch to which I/we may transfer my/our account) the following:
              </p>

              <p className="text-xs mt-2">
                <strong>{frequency.charAt(0).toUpperCase() + frequency.slice(1)} amount of {formatCurrency(totalAmount, sym)}</strong>{" "}
                starting on {debitDay}/{startDate.split("-")[1]}/{startDate.split("-")[0]}{" "}
                (as {frequency} contributions to my member's share in {tenantFullName}.)
              </p>

              {/* Deduction waterfall on mandate */}
              <div className="mt-3">
                <p className="text-xs font-semibold mb-1">Allocation Schedule:</p>
                <table className="w-full border-collapse border border-gray-400 text-xs">
                  <thead>
                    <tr className="bg-gray-100">
                      <th className="border border-gray-400 p-1 text-left">Description</th>
                      <th className="border border-gray-400 p-1 text-right w-28">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className="border border-gray-400 p-1 font-semibold">Gross Debit Order</td>
                      <td className="border border-gray-400 p-1 text-right font-mono">{formatCurrency(totalAmount, sym)}</td>
                    </tr>
                    {loanInstalment > 0 && (
                      <tr>
                        <td className="border border-gray-400 p-1">Less: Loan Instalment</td>
                        <td className="border border-gray-400 p-1 text-right font-mono">({formatCurrency(loanInstalment, sym)})</td>
                      </tr>
                    )}
                    {feeCalc.breakdown.map((f, i) => (
                      <tr key={i}>
                        <td className="border border-gray-400 p-1">Less: {f.name}</td>
                        <td className="border border-gray-400 p-1 text-right font-mono">({formatCurrency(f.amount, sym)})</td>
                      </tr>
                    ))}
                    <tr className="bg-gray-50">
                      <td className="border border-gray-400 p-1 font-semibold">Net to Investment Pools</td>
                      <td className="border border-gray-400 p-1 text-right font-mono font-semibold">{formatCurrency(afterFees, sym)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Pool allocation table */}
              <div className="mt-3">
                <p className="text-xs font-semibold mb-1">Pool Allocation:</p>
                <table className="w-full border-collapse border border-gray-400 text-xs">
                  <thead>
                    <tr className="bg-gray-100">
                      <th className="border border-gray-400 p-1 text-left">Pool</th>
                      <th className="border border-gray-400 p-1 text-right w-16">%</th>
                      <th className="border border-gray-400 p-1 text-right w-28">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {computedAllocations.filter(a => a.percentage > 0).map(a => (
                      <tr key={a.poolId}>
                        <td className="border border-gray-400 p-1">{a.poolName}</td>
                        <td className="border border-gray-400 p-1 text-right">{a.percentage}%</td>
                        <td className="border border-gray-400 p-1 text-right font-mono">{formatCurrency(a.amount, sym)}</td>
                      </tr>
                    ))}
                    <tr className="font-bold bg-gray-50">
                      <td className="border border-gray-400 p-1">Total</td>
                      <td className="border border-gray-400 p-1 text-right">{totalPct}%</td>
                      <td className="border border-gray-400 p-1 text-right font-mono">{formatCurrency(afterFees, sym)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <p className="text-xs leading-relaxed mt-3">
                All such withdrawals from my/our account by you shall be treated as though they had been signed by me/us
                personally. I/we the undersigned, "instruct" and authorize your agent Virtual Card Services, to draw against
                my/our account. I/we also understand that details of each withdrawal will be printed on my/our statement. I/we
                agree to pay any banking charges relating to this debit order instruction.
              </p>

              <p className="text-xs leading-relaxed mt-2">
                This authority may be cancelled by means of giving you fifteen days notice in writing, sent by email or registered
                post, but I/we understand that I/we shall not be entitled to any refund of amounts, which you have withdrawn
                whilst this authority was in force if such amounts were legally owing to you.
              </p>

              <p className="text-xs leading-relaxed mt-2 font-semibold">Assignment:</p>
              <p className="text-xs leading-relaxed">
                I/We acknowledge that the party hereby authorized to effect the drawing(s) against my/our account may not
                cede or assign any of its rights and that I/we may not delegate any of my/our obligations in terms of this
                contract/authority to any third party without prior written consent of the authorized party.
              </p>

              <p className="text-xs mt-4">
                Signed on this <strong>{dayOfMonth}</strong> day of <strong>{currentMonth}</strong> 20<strong>{String(currentYear).slice(2)}</strong>
              </p>
            </div>

            {/* Signature */}
            <div className="border rounded-md p-4">
              <SignaturePad
                value={signatureData ?? undefined}
                onChange={setSignatureData}
                label="SIGNATURE AS USED FOR SIGNING CHEQUES"
                width={600}
                height={150}
              />
            </div>

            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep("details")}>Back to Details</Button>
              <Button
                disabled={!signatureData || submitMutation.isPending}
                onClick={() => submitMutation.mutate()}
              >
                {submitMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}
                Submit Debit Order for Approval
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default DebitOrderSignUpDialog;
