import { useState, useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import CftEntriesPreview from "@/components/approvals/cft-preview/CftEntriesPreview";
import { buildDepositPreview } from "@/components/approvals/cft-preview/builders";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Loader2, CheckCircle, XCircle, CalendarIcon, AlertTriangle, TrendingUp,
  FileText, Eye, Banknote, Package, Truck, Building2, ChevronRight, ChevronLeft,
  ClipboardCheck, BoxSelect, Save, PenTool,
} from "lucide-react";
import StockReceiptPanel from "@/components/stock/StockReceiptPanel";
import { Checkbox } from "@/components/ui/checkbox";
import { format, parseISO } from "date-fns";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface TransactionGroup {
  primary: any;
  siblings: any[];
}

interface TransactionReviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  group: TransactionGroup | null;
  tenantId: string;
  onApprove: (group: TransactionGroup, overrides?: DateOverride[], stockMeta?: StockApprovalMeta) => void;
  onDecline: (ids: string[], reason: string) => void;
  isApproving?: boolean;
  isDeclining?: boolean;
}

export interface DateOverride {
  txnId: string;
  newDate: string;
  newUnitPrice: number;
  newUnits: number;
  newNetAmount: number;
  changeNote: string;
}

export interface StockApprovalMeta {
  courierFeeActual: number;
  courierNotes: string;
  stockReceivedNotes: string;
}

const fmt = (v: number) =>
  `R ${Number(v).toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtUP = (v: number) =>
  `R ${Number(v).toLocaleString("en-ZA", { minimumFractionDigits: 5, maximumFractionDigits: 5 })}`;

// Step definitions for stock deposit workflow
type StepId = "review" | "courier" | "stock_received" | "receipt" | "approve";

interface Step {
  id: StepId;
  label: string;
  icon: React.ReactNode;
}

const TransactionReviewDialog = ({
  open, onOpenChange, group, tenantId,
  onApprove, onDecline, isApproving, isDeclining,
}: TransactionReviewDialogProps) => {
  const queryClient = useQueryClient();
  const [declineReason, setDeclineReason] = useState("");
  const [showDecline, setShowDecline] = useState(false);
  const [overrideDate, setOverrideDate] = useState<Date | null>(null);
  const [changeNote, setChangeNote] = useState("");
  const [fundsConfirmed, setFundsConfirmed] = useState(false);
  const [cryptoFinalAmount, setCryptoFinalAmount] = useState<string>("");

  // Stock deposit multi-step state
  const [currentStep, setCurrentStep] = useState<StepId>("review");
  const [courierFeeActual, setCourierFeeActual] = useState<string>("");
  const [courierNotes, setCourierNotes] = useState("");
  const [stockReceivedConfirmed, setStockReceivedConfirmed] = useState(false);
  const [stockReceivedNotes, setStockReceivedNotes] = useState("");
  const [savingCourier, setSavingCourier] = useState(false);
  const [adminSignature, setAdminSignature] = useState<string | null>(null);
  const [memberSignature, setMemberSignature] = useState<string | null>(null);

  // Reset when dialog opens
  useEffect(() => {
    if (open) {
      setOverrideDate(null);
      setChangeNote("");
      setDeclineReason("");
      setShowDecline(false);
      setFundsConfirmed(false);
      setCryptoFinalAmount("");
      setCurrentStep("review");
      setCourierFeeActual("");
      setCourierNotes("");
      setStockReceivedConfirmed(false);
      setStockReceivedNotes("");
      setAdminSignature(null);
      setMemberSignature(null);
    }
  }, [open]);

  const allTxns = group ? [group.primary, ...group.siblings] : [];
  const primaryTxn = group?.primary;

  // Parse metadata from primary notes
  let meta: any = {};
  try { meta = JSON.parse(primaryTxn?.notes || "{}"); } catch {}
  const feeBreakdown: { name: string; amount: number }[] = meta.fee_breakdown || [];
  const stockLines: { description: string; item_code: string; quantity: number; costPrice: number; lineValue: number }[] = meta.stock_lines || [];
  const courier: { fee?: number } | null = meta.courier || null;
  const isStockDeposit = meta.transaction_kind === "stock_deposit";
  const isDebitOrderDeposit = primaryTxn?.payment_method === "debit_order";
  const isCryptoDeposit = primaryTxn?.payment_method === "crypto";
  const useCourier = isStockDeposit && courier && (courier.fee ?? 0) > 0;

  // Initialize courierFeeActual from meta when group loads; restore saved courier step if applicable
  useEffect(() => {
    if (open && group?.primary) {
      let m: any = {};
      try { m = JSON.parse(group.primary.notes || "{}"); } catch {}
      const courierArranged = m.courier_arranged;
      const stockVerified = m.stock_value_verified;
      if (courierArranged) {
        // Courier was already arranged — restore values and jump to stock_received
        setCourierFeeActual(String(courierArranged.fee_actual ?? 0));
        setCourierNotes(courierArranged.notes ?? "");
        setCurrentStep("stock_received");
      } else if (stockVerified && useCourier) {
        // Stock value was verified and next step was courier — restore to courier step
        if (m.courier?.fee !== undefined) {
          setCourierFeeActual(String(m.courier.fee));
        }
        setCurrentStep("courier");
      } else if (m.courier?.fee !== undefined) {
        setCourierFeeActual(String(m.courier.fee));
      }
    }
  }, [open, group?.primary?.id]);

  // Build steps for stock deposit
  const stockSteps: Step[] = [
    { id: "review", label: "Review", icon: <FileText className="h-3.5 w-3.5" /> },
    ...(useCourier ? [{ id: "courier" as StepId, label: "Courier Arranged", icon: <Truck className="h-3.5 w-3.5" /> }] : []),
    { id: "stock_received", label: "Stock Received", icon: <BoxSelect className="h-3.5 w-3.5" /> },
    { id: "receipt", label: "Stock Receipt", icon: <PenTool className="h-3.5 w-3.5" /> },
    { id: "approve", label: "Final Approval", icon: <CheckCircle className="h-3.5 w-3.5" /> },
  ];

  const currentStepIndex = stockSteps.findIndex((s) => s.id === currentStep);
  const isLastStep = currentStepIndex === stockSteps.length - 1;
  const isFirstStep = currentStepIndex === 0;

  // Unique pool IDs across all txns in the group
  const poolIds = [...new Set(allTxns.map((t: any) => t.pool_id).filter(Boolean))];

  const overrideDateStr = overrideDate ? format(overrideDate, "yyyy-MM-dd") : null;

  // Fetch daily prices for ALL pools for the single override date
  const { data: overridePrices = {} } = useQuery({
    queryKey: ["override_prices", tenantId, overrideDateStr, poolIds.join(",")],
    queryFn: async () => {
      if (!overrideDateStr || !poolIds.length) return {};
      const result: Record<string, number> = {};
      for (const poolId of poolIds) {
        const { data: exact } = await (supabase as any)
          .from("daily_pool_prices")
          .select("pool_id, unit_price_buy")
          .eq("tenant_id", tenantId)
          .eq("pool_id", poolId)
          .eq("totals_date", overrideDateStr)
          .limit(1);
        if (exact?.[0]?.unit_price_buy > 0) {
          result[poolId] = Number(exact[0].unit_price_buy);
        } else {
          const { data: latest } = await (supabase as any)
            .from("daily_pool_prices")
            .select("pool_id, unit_price_buy, totals_date")
            .eq("tenant_id", tenantId)
            .eq("pool_id", poolId)
            .lte("totals_date", overrideDateStr)
            .order("totals_date", { ascending: false })
            .limit(1);
          if (latest?.[0]?.unit_price_buy > 0) {
            result[poolId] = Number(latest[0].unit_price_buy);
          }
        }
      }
      return result;
    },
    enabled: open && !!overrideDateStr && poolIds.length > 0,
  });

  // Fetch POP signed URL
  const { data: popUrl } = useQuery({
    queryKey: ["pop_url", primaryTxn?.pop_file_path],
    queryFn: async () => {
      if (!primaryTxn?.pop_file_path) return null;
      const { data } = await supabase.storage
        .from("pop-documents")
        .createSignedUrl(primaryTxn.pop_file_path, 600);
      return data?.signedUrl ?? null;
    },
    enabled: open && !!primaryTxn?.pop_file_path,
  });

  const handleApprove = () => {
    if (!group) return;

    const actualCourierFee = isStockDeposit ? (parseFloat(courierFeeActual) || 0) : 0;
    const estimatedCourierFee = isStockDeposit ? (courier?.fee ?? 0) : 0;
    const courierFeeDelta = actualCourierFee - estimatedCourierFee;
    const storedTotalNet = allTxns.reduce((s: number, t: any) => s + Number(t.net_amount), 0);

    let overrides: DateOverride[] | undefined;

    const needsOverride = (overrideDate && overrideDateStr) || (isStockDeposit && courierFeeDelta !== 0);

    if (needsOverride) {
      if (overrideDate && overrideDateStr) {
        for (const txn of allTxns) {
          if (txn.pool_id && overridePrices[txn.pool_id] === undefined) {
            toast.error(`No price found for pool "${txn.pools?.name || txn.pool_id}" on ${format(overrideDate, "dd MMM yyyy")}. Please choose another date.`);
            return;
          }
        }
      }

      overrides = allTxns
        .filter((txn: any) => txn.pool_id)
        .map((txn: any) => {
          const newUnitPrice = (overrideDate && overrideDateStr)
            ? overridePrices[txn.pool_id]!
            : Number(txn.unit_price);
          const storedNet = Number(txn.net_amount);
          const txnShare = storedTotalNet > 0 ? storedNet / storedTotalNet : 1 / allTxns.length;
          const adjustedNet = Math.max(0, storedNet - courierFeeDelta * txnShare);
          const newUnits = newUnitPrice > 0 ? adjustedNet / newUnitPrice : 0;
          const note = overrideDate
            ? `Transaction date changed to ${format(overrideDate, "dd MMM yyyy")} by approver${courierFeeDelta !== 0 ? `; courier fee adjusted by R${courierFeeDelta.toFixed(2)}` : ""}`
            : `Courier fee adjusted from R${estimatedCourierFee.toFixed(2)} to R${actualCourierFee.toFixed(2)} by approver`;
          return {
            txnId: txn.id,
            newDate: overrideDateStr || format(originalDateObj, "yyyy-MM-dd"),
            newUnitPrice,
            newUnits,
            newNetAmount: adjustedNet,
            changeNote: changeNote || note,
          };
        });
    }

    const stockMeta: StockApprovalMeta | undefined = isStockDeposit ? {
      courierFeeActual: actualCourierFee,
      courierNotes,
      stockReceivedNotes,
    } : undefined;

    onApprove(group, overrides, stockMeta);
  };

  const handleNext = async () => {
    if (currentStepIndex < stockSteps.length - 1) {
      // When leaving the Review step, persist stock_value_verified in the transaction notes
      if (currentStep === "review" && primaryTxn) {
        try {
          let existingMeta: any = {};
          try { existingMeta = JSON.parse(primaryTxn.notes || "{}"); } catch {}
          const updatedMeta = {
            ...existingMeta,
            stock_value_verified: true,
            stock_value_verified_at: new Date().toISOString(),
          };
          await (supabase as any)
            .from("transactions")
            .update({ notes: JSON.stringify(updatedMeta), status: "stock_value_verified" })
            .eq("id", primaryTxn.id);
        } catch {
          // Non-blocking — proceed to next step regardless
        }
      }
      setCurrentStep(stockSteps[currentStepIndex + 1].id);
    }
  };

  const handleBack = () => {
    if (currentStepIndex > 0) {
      setCurrentStep(stockSteps[currentStepIndex - 1].id);
    }
  };

  const handleSaveCourierAndClose = async () => {
    if (!primaryTxn) return;
    setSavingCourier(true);
    try {
      let existingMeta: any = {};
      try { existingMeta = JSON.parse(primaryTxn.notes || "{}"); } catch {}
      const updatedMeta = {
        ...existingMeta,
        courier_arranged: {
          fee_actual: parseFloat(courierFeeActual) || 0,
          notes: courierNotes,
          arranged_at: new Date().toISOString(),
        },
      };
      const { error } = await (supabase as any)
        .from("transactions")
        .update({ notes: JSON.stringify(updatedMeta), status: "courier_arranged" })
        .eq("id", primaryTxn.id);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ["pending_transaction_approvals"] });
      toast.success("Courier details saved. Reopen to confirm stock receipt.");
      onOpenChange(false);
    } catch (err: any) {
      toast.error("Failed to save courier details: " + err.message);
    } finally {
      setSavingCourier(false);
    }
  };

  // Validation per step
  const canProceedFromReview = fundsConfirmed && (!overrideDate || (changeNote.trim() && Object.keys(overridePrices).length > 0 && poolIds.every(pid => overridePrices[pid] !== undefined)));
  const canProceedFromCourier = courierFeeActual.trim() !== "" && !isNaN(parseFloat(courierFeeActual));
  const canProceedFromReceipt = !!adminSignature && !!memberSignature;
  const canApprove = stockReceivedConfirmed;

  // Resolve loan pool name for CFT preview
  const loanMeta = useMemo(() => {
    try { return JSON.parse(group?.primary?.notes || "{}").loan_repayment || null; } catch { return null; }
  }, [group?.primary?.id]);
  const loanPoolId = loanMeta?.loan_pool_ids?.[0] || null;
  const { data: loanPoolData } = useQuery({
    queryKey: ["loan_pool_name", loanPoolId, !!loanMeta],
    queryFn: async () => {
      // If explicit pool ID, fetch its name
      if (loanPoolId) {
        const { data } = await (supabase as any).from("pools").select("name").eq("id", loanPoolId).maybeSingle();
        return data;
      }
      // No explicit pool — legacy loans use "Member Account" pool
      if (loanMeta) {
        const { data } = await (supabase as any).from("pools").select("name")
          .eq("tenant_id", group?.primary?.tenant_id || "")
          .eq("is_active", true)
          .ilike("name", "%member account%")
          .limit(1);
        return data?.[0] || { name: "Member Account" };
      }
      return null;
    },
    enabled: !!loanMeta,
  });

  // Build CFT preview lines (must be before early return)
  const depositPreview = useMemo(() => {
    if (!group) return { glLines: [], controlLines: [], unitLines: [] };
    const txns = [group.primary, ...group.siblings];
    const tAmount = txns.reduce((s: number, t: any) => s + Number(t.amount), 0);
    const poolAllocations = txns.filter((t: any) => t.pool_id).map((t: any) => ({
      poolName: t.pools?.name || "Pool",
      amount: Number(t.net_amount),
      unitPrice: Number(t.unit_price || 0),
      units: Number(t.units || 0),
    }));
    let m: any = {};
    try { m = JSON.parse(group.primary?.notes || "{}"); } catch {}
    const loanRepay = m.loan_repayment
      ? { amount: Number(m.loan_repayment.amount), poolName: loanPoolData?.name || "Admin" }
      : null;
    return buildDepositPreview({
      grossAmount: tAmount,
      poolAllocations,
      feeBreakdown: m.fee_breakdown || [],
      joinShare: m.join_share || null,
      loanRepayment: loanRepay,
      isStockDeposit: m.transaction_kind === "stock_deposit",
      isVatRegistered: m.is_vat_registered ?? false,
      vatRate: Number(m.vat_rate || 0),
    });
  }, [group?.primary?.id, loanPoolData?.name]);

  if (!group) return null;

  const totalAmount = allTxns.reduce((s: number, t: any) => s + Number(t.amount), 0);
  const totalNet = allTxns.reduce((s: number, t: any) => s + Number(t.net_amount), 0);
  const memberName = primaryTxn?.entity_accounts?.entities
    ? [primaryTxn.entity_accounts.entities.name, primaryTxn.entity_accounts.entities.last_name].filter(Boolean).join(" ")
    : "—";
  const accountNumber = primaryTxn?.entity_accounts?.account_number || "—";
  const txnTypeName = primaryTxn?.transaction_types?.name || "Transaction";
  const originalDate = primaryTxn?.transaction_date || primaryTxn?.created_at?.split("T")[0];
  const originalDateObj = originalDate ? parseISO(originalDate) : new Date();

  const dateChanged = !!overrideDate;
  const effectiveDate = overrideDate || originalDateObj;

  const missingPrices = dateChanged
    ? poolIds.filter((pid) => overridePrices[pid] === undefined)
    : [];

  // ─── Render Step Content ───
  const renderStepContent = () => {
    if (!isStockDeposit) {
      return renderOriginalContent();
    }

    switch (currentStep) {
      case "review": return renderReviewStep();
      case "courier": return renderCourierStep();
      case "stock_received": return renderStockReceivedStep();
      case "receipt": return renderReceiptStep();
      case "approve": return renderFinalApproveStep();
      default: return renderReviewStep();
    }
  };

  const renderOriginalContent = () => (
    <>
      {renderFinancialSummary()}
      {renderDateOverride()}
      {renderPoolAllocations()}
      {renderDateChangeNote()}
      {renderPOP()}
      {/* CFT Entries Preview */}
      <CftEntriesPreview preview={depositPreview} />
      {/* Funds Confirmation — not needed for debit order deposits */}
      {isDebitOrderDeposit ? (
        <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 flex items-center gap-2">
          <Banknote className="h-4 w-4 text-primary shrink-0" />
          <p className="text-xs text-muted-foreground">
            This is a <strong>debit order</strong> deposit. No bank confirmation is required — approve the application and load the debit order mandate.
          </p>
        </div>
      ) : (
        <div className="flex items-center gap-2 py-1">
          <Checkbox id="funds-confirmed" checked={fundsConfirmed} onCheckedChange={(v) => setFundsConfirmed(!!v)} />
          <label htmlFor="funds-confirmed" className="text-xs text-muted-foreground cursor-pointer select-none">
            I confirm the funds have been received and verified in the bank account.
          </label>
        </div>
      )}
    </>
  );

  const renderReviewStep = () => (
    <>
      {renderFinancialSummary()}
      {renderDateOverride()}
      {renderPoolAllocations()}
      {renderDateChangeNote()}
      {renderPOP()}
      {/* Stock-specific: confirm stock value */}
      <div className="flex items-center gap-2 py-1">
        <Checkbox id="funds-confirmed" checked={fundsConfirmed} onCheckedChange={(v) => setFundsConfirmed(!!v)} />
        <label htmlFor="funds-confirmed" className="text-xs text-muted-foreground cursor-pointer select-none">
          I confirm the stock items and their valuations have been reviewed and are correct.
        </label>
      </div>
    </>
  );

  const renderCourierStep = () => (
    <div className="space-y-4">
      <div className="rounded-xl border-2 border-border bg-muted/20 p-4 space-y-3">
        <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
          <Truck className="h-3 w-3" /> Courier Arrangement
        </p>
        <p className="text-[11px] text-muted-foreground">
          Record the actual courier fee charged and any notes about the courier arrangement. The original quoted fee was <strong>{fmt(courier?.fee ?? 0)}</strong>.
        </p>

        <div className="space-y-1.5">
          <Label className="text-xs">Actual Courier Fee (R)</Label>
          <Input
            type="number"
            min="0"
            step="0.01"
            value={courierFeeActual}
            onChange={(e) => setCourierFeeActual(e.target.value)}
            placeholder={`e.g. ${courier?.fee ?? 0}`}
            className="font-mono"
          />
          {parseFloat(courierFeeActual) !== (courier?.fee ?? 0) && courierFeeActual !== "" && (
            <p className="text-[11px] text-warning flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" />
              Fee differs from original quote of {fmt(courier?.fee ?? 0)}.
            </p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">Courier Notes (optional)</Label>
          <Textarea
            value={courierNotes}
            onChange={(e) => setCourierNotes(e.target.value)}
            placeholder="e.g. Courier arranged with XYZ Logistics, tracking number ABC123, expected delivery 20 Feb..."
            rows={3}
            className="text-sm"
          />
        </div>
      </div>

      {/* Live recalculation breakdown */}
      {(() => {
        const actualFee = parseFloat(courierFeeActual) || 0;
        const estimatedFee = courier?.fee ?? 0;
        const feeDelta = actualFee - estimatedFee;
        const grossStockValue = allTxns.reduce((s: number, t: any) => s + Number(t.amount), 0);
        const storedNet = allTxns.reduce((s: number, t: any) => s + Number(t.net_amount), 0);
        const adjustedNet = Math.max(0, storedNet - feeDelta);
        const feeChanged = feeDelta !== 0 && courierFeeActual !== "";
        return (
          <div className={`rounded-xl border-2 p-4 space-y-2 ${feeChanged ? "border-primary/40 bg-primary/5" : "border-border bg-muted/10"}`}>
            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <TrendingUp className="h-3 w-3" /> Live Deposit Breakdown
            </p>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Gross Stock Value</span>
              <span className="font-semibold">{fmt(grossStockValue)}</span>
            </div>
            {feeBreakdown.map((fee, i) => (
              <div key={i} className="flex justify-between text-sm text-muted-foreground">
                <span>Less {fee.name}</span>
                <span>- {fmt(fee.amount)}</span>
              </div>
            ))}
            <div className="flex justify-between text-sm text-muted-foreground">
              <span className="flex items-center gap-1.5"><Truck className="h-3.5 w-3.5" /> Courier Fee (actual)</span>
              <span className={feeChanged ? "text-primary font-semibold" : ""}>- {fmt(actualFee)}</span>
            </div>
            <Separator />
            <div className="flex justify-between text-sm font-bold text-primary">
              <span>Net for Pools</span>
              <span>{fmt(adjustedNet)}</span>
            </div>
            {allTxns.map((txn: any) => {
              const unitPrice = Number(txn.unit_price);
              const txnStoredNet = Number(txn.net_amount);
              const txnAdjustedNet = Math.max(0, txnStoredNet - feeDelta);
              const units = unitPrice > 0 ? txnAdjustedNet / unitPrice : 0;
              return (
                <div key={txn.id} className="flex justify-between text-xs text-muted-foreground pl-2">
                  <span>{txn.pools?.name || "Pool"} @ {fmtUP(unitPrice)}/unit</span>
                  <span className="font-mono font-semibold">{units.toFixed(5)} units</span>
                </div>
              );
            })}
            {feeChanged && (
              <p className="text-[10px] text-primary flex items-center gap-1 pt-1">
                <AlertTriangle className="h-3 w-3 shrink-0" />
                Net adjusted by {feeDelta > 0 ? "−" : "+"}{fmt(Math.abs(feeDelta))} due to courier fee change from {fmt(estimatedFee)}.
              </p>
            )}
          </div>
        );
      })()}
    </div>
  );

  const renderStockReceivedStep = () => (
    <div className="space-y-4">
      {/* Stock items recap */}
      <div className="rounded-xl border-2 border-border bg-muted/20 p-4 space-y-2">
        <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
          <Package className="h-3 w-3" /> Stock Items to Receive
        </p>
        {stockLines.map((line, i) => (
          <div key={i} className="flex justify-between text-sm">
            <span className="flex items-center gap-2">
              <span className="font-mono bg-muted px-1.5 py-0.5 rounded text-xs">{line.item_code}</span>
              {line.description}
            </span>
            <span className="font-semibold">× {line.quantity}</span>
          </div>
        ))}
        <Separator />
        <div className="flex justify-between text-sm text-muted-foreground">
          <span>{useCourier ? "Via Courier" : "Member Delivery"}</span>
          {useCourier && (
            <span>Actual fee: {fmt(parseFloat(courierFeeActual) || 0)}</span>
          )}
        </div>
      </div>

      {/* Notes */}
      <div className="space-y-1.5">
        <Label className="text-xs">Stock Receipt Notes (optional)</Label>
        <Textarea
          value={stockReceivedNotes}
          onChange={(e) => setStockReceivedNotes(e.target.value)}
          placeholder="e.g. Stock received in good condition, verified quantities match, stored in vault..."
          rows={3}
          className="text-sm"
        />
      </div>

      {/* Confirmation */}
      <div
        className={`rounded-xl border-2 p-4 flex items-start gap-3 cursor-pointer transition-colors ${
          stockReceivedConfirmed ? "border-primary bg-primary/5" : "border-border bg-muted/20"
        }`}
        onClick={() => setStockReceivedConfirmed((v) => !v)}
      >
        <Checkbox
          id="stock-received"
          checked={stockReceivedConfirmed}
          onCheckedChange={(v) => setStockReceivedConfirmed(!!v)}
          className="mt-0.5"
        />
        <div className="space-y-0.5">
          <label htmlFor="stock-received" className="text-sm font-semibold flex items-center gap-1.5 cursor-pointer">
            <ClipboardCheck className="h-4 w-4 text-primary" />
            Confirm Stock Physically Received
          </label>
          <p className="text-[11px] text-muted-foreground">
            I confirm that all stock items listed above have been physically received, verified, and securely stored. This is required before final approval.
          </p>
        </div>
      </div>
    </div>
  );

  const renderReceiptStep = () => (
    <StockReceiptPanel
      receiptType="deposit"
      transactionDate={primaryTxn?.transaction_date || primaryTxn?.created_at?.split("T")[0] || ""}
      reference={primaryTxn?.reference}
      memberName={memberName}
      accountNumber={accountNumber}
      stockLines={stockLines.map((line) => ({
        description: line.description,
        itemCode: line.item_code,
        quantity: line.quantity,
        unitPrice: line.costPrice,
        lineTotal: line.lineValue,
      }))}
      notes={stockReceivedNotes || undefined}
      adminSignature={adminSignature}
      memberSignature={memberSignature}
      onAdminSignatureChange={setAdminSignature}
      onMemberSignatureChange={setMemberSignature}
      adminLabel="Authorised Representative (Admin)"
      memberLabel="Member"
    />
  );

  const renderFinalApproveStep = () => (
    <div className="space-y-4">
      {/* Full summary recap */}
      <div className="rounded-xl border-2 border-primary/30 bg-primary/5 p-4 space-y-2">
        <p className="text-xs font-bold uppercase tracking-wider text-primary flex items-center gap-1.5">
          <CheckCircle className="h-3 w-3" /> Approval Summary
        </p>
        <div className="space-y-1.5 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Member</span>
            <span className="font-semibold">{memberName}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Membership No.</span>
            <span className="font-mono">{accountNumber}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Gross Amount</span>
            <span className="font-semibold">{fmt(totalAmount)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Net for Pools</span>
            <span className="font-bold text-primary">
              {fmt(Math.max(0, totalNet - ((parseFloat(courierFeeActual) || 0) - (courier?.fee ?? 0))))}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Transaction Date</span>
            <span className={cn("font-mono", dateChanged && "text-primary font-bold")}>
              {format(effectiveDate, "dd MMM yyyy")}
              {dateChanged && " ⟵ overridden"}
            </span>
          </div>
        </div>
        <Separator />
        {/* Stock items */}
        <p className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5 pt-1">
          <Package className="h-3 w-3" /> Stock Items
        </p>
        {stockLines.map((line, i) => (
          <div key={i} className="flex justify-between text-xs text-muted-foreground pl-2">
            <span>{line.quantity} × {line.description}</span>
            <span>{fmt(line.lineValue)}</span>
          </div>
        ))}
        {isStockDeposit && (
          <>
            <Separator />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                {useCourier ? <Truck className="h-3 w-3" /> : <Building2 className="h-3 w-3" />}
                {useCourier ? `Courier Fee (actual)` : "Member Delivery — No Fee"}
              </span>
              <span>{useCourier ? `- ${fmt(parseFloat(courierFeeActual) || 0)}` : "—"}</span>
            </div>
          </>
        )}
      </div>

      {/* Pool allocations recap */}
      {(() => {
        const actualFee = parseFloat(courierFeeActual) || 0;
        const estimatedFee = courier?.fee ?? 0;
        const feeDelta = actualFee - estimatedFee;
        const storedTotalNet = allTxns.reduce((s: number, t: any) => s + Number(t.net_amount), 0);
        const adjustedTotalNet = Math.max(0, storedTotalNet - feeDelta);
        const feeChanged = isStockDeposit && feeDelta !== 0;
        return (
          <>
            {feeChanged && (
              <div className="rounded-lg border border-primary/40 bg-primary/5 p-3 space-y-1.5">
                <p className="text-xs font-bold text-primary flex items-center gap-1.5">
                  <TrendingUp className="h-3 w-3" /> Adjusted Net for Pools
                </p>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Original net</span>
                  <span className="font-mono">{fmt(storedTotalNet)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Courier fee adjustment</span>
                  <span className="font-mono text-destructive">- {fmt(Math.abs(feeDelta))}</span>
                </div>
                <Separator />
                <div className="flex justify-between text-sm font-bold text-primary">
                  <span>Adjusted net</span>
                  <span>{fmt(adjustedTotalNet)}</span>
                </div>
              </div>
            )}
            <div className="space-y-2">
              <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <TrendingUp className="h-3 w-3" /> Pool Allocations
              </p>
              {allTxns.map((txn: any) => {
                const poolName = txn.pools?.name || "Pool";
                const overriddenUnitPrice = dateChanged ? overridePrices[txn.pool_id] : undefined;
                const effectiveUnitPrice = overriddenUnitPrice ?? Number(txn.unit_price);
                const storedNet = Number(txn.net_amount);
                // Distribute the feeDelta proportionally if multiple txns, or fully if single
                const txnShare = storedTotalNet > 0 ? storedNet / storedTotalNet : 1 / allTxns.length;
                const adjustedNet = Math.max(0, storedNet - feeDelta * txnShare);
                const effectiveUnits = effectiveUnitPrice > 0 ? adjustedNet / effectiveUnitPrice : Number(txn.units);
                return (
                  <div key={txn.id} className="rounded-lg border border-border p-3 flex items-center justify-between gap-4">
                    <span className="text-sm font-semibold">{poolName}</span>
                    <div className="flex gap-4 text-xs text-right">
                      <div>
                        <p className="text-muted-foreground">Net</p>
                        <p className={cn("font-mono font-bold", feeChanged ? "text-primary" : "")}>{fmt(adjustedNet)}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">UP</p>
                        <p className={cn("font-mono font-bold", dateChanged ? "text-primary" : "")}>{fmtUP(effectiveUnitPrice)}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Units</p>
                        <p className={cn("font-mono font-bold", dateChanged || feeChanged ? "text-primary" : "")}>{effectiveUnits.toFixed(5)}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        );
      })()}

      {/* Checklist */}
      <div className="rounded-lg border border-border p-3 space-y-1.5 bg-muted/10">
        <p className="text-xs font-semibold text-muted-foreground mb-2">Pre-approval Checklist</p>
        {[
          { label: "Stock value verified", done: true },
          ...(useCourier ? [{ label: "Courier arranged & fee confirmed", done: !!courierFeeActual }] : []),
          { label: "Stock physically received", done: stockReceivedConfirmed },
        ].map((item, i) => (
          <div key={i} className="flex items-center gap-2 text-xs">
            <CheckCircle className={cn("h-3.5 w-3.5", item.done ? "text-primary" : "text-muted-foreground/40")} />
            <span className={item.done ? "text-foreground" : "text-muted-foreground"}>{item.label}</span>
          </div>
        ))}
      </div>
    </div>
  );

  // ─── Shared sub-renders ───
  const renderFinancialSummary = () => (
    <div className="rounded-xl border-2 border-border bg-muted/20 p-4 space-y-2">
      <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Financial Summary</p>
      <div className="flex justify-between text-sm font-semibold">
        <span>Gross Amount</span>
        <span>{fmt(totalAmount)}</span>
      </div>

      {isStockDeposit && stockLines.length > 0 && (
        <>
          <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground pt-1">
            <Package className="h-3 w-3" /> Stock Items
          </div>
          {stockLines.map((line, i) => (
            <div key={i} className="flex justify-between text-xs text-muted-foreground pl-2">
              <span>{line.quantity} × {line.description} <span className="font-mono bg-muted px-1 rounded text-[10px]">{line.item_code}</span></span>
              <span>{fmt(line.lineValue)}</span>
            </div>
          ))}
          <Separator />
        </>
      )}

      {feeBreakdown.map((fee, i) => (
        <div key={i} className="flex justify-between text-sm text-muted-foreground">
          <span>Less {fee.name}</span>
          <span>- {fmt(fee.amount)}</span>
        </div>
      ))}

      {isStockDeposit && (
        <div className="flex justify-between text-sm text-muted-foreground">
          <span className="flex items-center gap-1.5">
            {useCourier ? <Truck className="h-3.5 w-3.5" /> : <Building2 className="h-3.5 w-3.5" />}
            {useCourier ? "Courier Delivery" : "Collect at Office"}
          </span>
          <span>{useCourier ? `- ${fmt(courier!.fee!)}` : "No fee"}</span>
        </div>
      )}

      <Separator />
      <div className="flex justify-between text-sm font-bold text-primary">
        <span>Net Available for Pools</span>
        <span>{fmt(totalNet)}</span>
      </div>
    </div>
  );

  const renderDateOverride = () => (
    <div className="rounded-xl border-2 border-border p-4 space-y-3">
      <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
        <CalendarIcon className="h-3 w-3" /> Transaction Date
        {dateChanged && <Badge variant="default" className="text-[9px] h-4 ml-1">Changed</Badge>}
      </p>
      <p className="text-[11px] text-muted-foreground">
        The chosen date applies to <strong>all pool allocations</strong>. Unit prices (UP) are resolved per pool from that date's price schedule.
      </p>
      <div className="flex items-center gap-3">
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className={cn("h-9 justify-start text-left font-normal", dateChanged && "border-primary text-primary")}
            >
              <CalendarIcon className="mr-2 h-4 w-4" />
              {format(effectiveDate, "dd MMM yyyy")}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              selected={effectiveDate}
              onSelect={(d) => {
                if (!d) return;
                const sel = format(d, "yyyy-MM-dd");
                const orig = format(originalDateObj, "yyyy-MM-dd");
                setOverrideDate(sel === orig ? null : d);
              }}
              disabled={(d) => d > new Date()}
              initialFocus
              className="p-3 pointer-events-auto"
            />
          </PopoverContent>
        </Popover>
        {!dateChanged && <span className="text-xs text-muted-foreground">(original — click to override)</span>}
        {dateChanged && (
          <Button variant="ghost" size="sm" className="text-xs text-muted-foreground" onClick={() => setOverrideDate(null)}>
            Reset to original
          </Button>
        )}
      </div>
      {missingPrices.length > 0 && (
        <div className="rounded-lg bg-destructive/10 border border-destructive/30 px-3 py-2 text-xs text-destructive flex items-start gap-2">
          <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          <span>No price found for {missingPrices.length} pool(s) on {format(effectiveDate, "dd MMM yyyy")}. Select a different date.</span>
        </div>
      )}
    </div>
  );

  const renderPoolAllocations = () => (
    <div className="space-y-3">
      <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
        <TrendingUp className="h-3 w-3" /> Pool Allocations
      </p>
      {allTxns.map((txn: any) => {
        const poolName = txn.pools?.name || "Pool";
        const overriddenUnitPrice = dateChanged ? overridePrices[txn.pool_id] : undefined;
        const effectiveUnitPrice = overriddenUnitPrice ?? Number(txn.unit_price);
        const effectiveUnits = effectiveUnitPrice > 0 ? Number(txn.net_amount) / effectiveUnitPrice : Number(txn.units);
        const hasMissingPrice = dateChanged && txn.pool_id && overridePrices[txn.pool_id] === undefined;
        return (
          <div key={txn.id} className="rounded-lg border border-border p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold">{poolName}</span>
              <span className="text-sm text-muted-foreground">{fmt(Number(txn.net_amount))}</span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="rounded bg-muted/40 px-2 py-1.5 space-y-0.5">
                <p className="text-muted-foreground">Unit Price (UP)</p>
                <p className={cn("font-mono font-bold", dateChanged && !hasMissingPrice ? "text-primary" : hasMissingPrice ? "text-destructive" : "")}>
                  {hasMissingPrice ? (
                    <span className="inline-flex items-center gap-1.5 text-destructive">
                      <AlertTriangle className="h-3.5 w-3.5" />
                      No price
                    </span>
                  ) : fmtUP(effectiveUnitPrice)}
                </p>
              </div>
              <div className="rounded bg-muted/40 px-2 py-1.5 space-y-0.5">
                <p className="text-muted-foreground">Units</p>
                <p className={cn("font-mono font-bold", dateChanged && !hasMissingPrice ? "text-primary" : "")}>
                  {hasMissingPrice ? "—" : effectiveUnits.toFixed(5)}
                </p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );

  const renderDateChangeNote = () => dateChanged ? (
    <div className="rounded-xl border-2 border-border bg-muted/30 p-3 space-y-2">
      <div className="flex items-center gap-2 text-sm font-medium text-warning">
        <AlertTriangle className="h-4 w-4" />
        Date Change — Audit Note Required
      </div>
      <p className="text-[11px] text-muted-foreground">
        The transaction date has been changed from <strong>{format(originalDateObj, "dd MMM yyyy")}</strong> to <strong>{format(effectiveDate, "dd MMM yyyy")}</strong>. All pool UPs and units will be recalculated.
      </p>
      <Textarea
        value={changeNote}
        onChange={(e) => setChangeNote(e.target.value)}
        placeholder="Reason for date change..."
        rows={2}
        className="text-sm"
      />
    </div>
  ) : null;

  const renderPOP = () => primaryTxn?.pop_file_name ? (
    <div className="space-y-1.5">
      <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
        <FileText className="h-3 w-3" /> Proof of Payment
      </p>
      <div className="flex items-center gap-3 rounded-lg border border-border p-2.5">
        <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
        <span className="text-sm flex-1 truncate">{primaryTxn.pop_file_name}</span>
        {popUrl && (
          <Button size="sm" variant="ghost" onClick={() => window.open(popUrl, "_blank")}>
            <Eye className="h-3.5 w-3.5 mr-1" />View
          </Button>
        )}
      </div>
    </div>
  ) : null;

  // ─── Footer Buttons ───
  const renderFooter = () => {
    if (showDecline) {
      return (
        <>
          <Button variant="outline" onClick={() => setShowDecline(false)}>Cancel</Button>
          <Button
            variant="destructive"
            disabled={isDeclining || !declineReason.trim()}
            onClick={() => {
              onDecline(allTxns.map((t: any) => t.id), declineReason);
              setShowDecline(false);
              setDeclineReason("");
            }}
          >
            {isDeclining && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
            Confirm Decline
          </Button>
        </>
      );
    }

    if (!isStockDeposit) {
      // Original single-page footer
      const debitOrderOrFundsOk = isDebitOrderDeposit || fundsConfirmed;
      return (
        <>
          <Button variant="destructive" onClick={() => setShowDecline(true)}>
            <XCircle className="h-3.5 w-3.5 mr-1.5" />Decline
          </Button>
          <Button
            onClick={handleApprove}
            disabled={
              isApproving || !debitOrderOrFundsOk ||
              (dateChanged && !changeNote.trim()) ||
              (dateChanged && missingPrices.length > 0)
            }
          >
            {isApproving && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
            <CheckCircle className="h-3.5 w-3.5 mr-1.5" />
            {isDebitOrderDeposit ? "Approve & Load Debit Order" : dateChanged ? "Approve with Date Change" : "Approve"}
          </Button>
        </>
      );
    }

    // Multi-step footer for stock deposits
    return (
      <div className="flex items-center justify-between w-full">
        <Button variant="destructive" size="sm" onClick={() => setShowDecline(true)}>
          <XCircle className="h-3.5 w-3.5 mr-1.5" />Decline
        </Button>
        <div className="flex gap-2">
          {!isFirstStep && (
            <Button variant="outline" onClick={handleBack}>
              <ChevronLeft className="h-3.5 w-3.5 mr-1" />Back
            </Button>
          )}
          {/* Save & Close on the courier step */}
          {currentStep === "courier" && (
            <Button
              variant="secondary"
              onClick={handleSaveCourierAndClose}
              disabled={savingCourier || !canProceedFromCourier}
            >
              {savingCourier
                ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                : <Save className="h-3.5 w-3.5 mr-1.5" />
              }
              Save &amp; Close
            </Button>
          )}
          {!isLastStep ? (
            <Button
              onClick={handleNext}
              disabled={
                (currentStep === "review" && !canProceedFromReview) ||
                (currentStep === "courier" && !canProceedFromCourier) ||
                (currentStep === "receipt" && !canProceedFromReceipt)
              }
            >
              Next<ChevronRight className="h-3.5 w-3.5 ml-1" />
            </Button>
          ) : (
            <Button
              onClick={handleApprove}
              disabled={isApproving || !canApprove}
            >
              {isApproving && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
              <CheckCircle className="h-3.5 w-3.5 mr-1.5" />
              Approve Stock Deposit
            </Button>
          )}
        </div>
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Review Transaction — {memberName}</DialogTitle>
          <div className="flex items-center gap-2 mt-1">
            <Badge variant="secondary">{accountNumber}</Badge>
            <Badge variant="outline">{txnTypeName}</Badge>
          </div>
        </DialogHeader>

        {/* Step indicator for stock deposits */}
        {isStockDeposit && (
          <div className="flex items-center gap-0 border border-border rounded-lg overflow-hidden">
            {stockSteps.map((step, i) => {
              const isActive = step.id === currentStep;
              const isDone = i < currentStepIndex;
              return (
                <div
                  key={step.id}
                  className={cn(
                    "flex-1 flex items-center justify-center gap-1.5 py-2 px-2 text-xs font-medium transition-colors border-r border-border last:border-r-0",
                    isActive ? "bg-primary text-primary-foreground" :
                    isDone ? "bg-primary/15 text-primary" :
                    "bg-muted/30 text-muted-foreground"
                  )}
                >
                  {isDone ? <CheckCircle className="h-3 w-3 shrink-0" /> : step.icon}
                  <span className="hidden sm:inline truncate">{step.label}</span>
                  <span className="sm:hidden">{i + 1}</span>
                </div>
              );
            })}
          </div>
        )}

        <div className="space-y-5">
          {renderStepContent()}

          {/* Decline reason input */}
          {showDecline && (
            <div className="space-y-2">
              <Label>Reason for declining</Label>
              <Textarea
                value={declineReason}
                onChange={(e) => setDeclineReason(e.target.value)}
                placeholder="Reason for declining this transaction..."
                rows={3}
              />
            </div>
          )}
        </div>

        <DialogFooter className="flex gap-2 sm:gap-2">
          {renderFooter()}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default TransactionReviewDialog;
