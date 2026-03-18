// v2 - rebuilt
import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Package, Building2, ClipboardCheck, ShieldCheck, Loader2, AlertTriangle,
  Check, ShoppingCart, TrendingDown, SlidersHorizontal, FileText, Mail,
  Download, Truck, CheckCircle2, ChevronDown, ChevronUp, Receipt, PenTool,
} from "lucide-react";
import StockReceiptPanel from "@/components/stock/StockReceiptPanel";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Props {
  txn: any | null;
  onClose: () => void;
  onVaultConfirm: (txnId: string, vaultRef: string, vaultNotes: string) => void;
  onApprove: (txnId: string) => void;
  onDecline: (txnId: string, reason: string) => void;
  onUpdateStatus: (txnId: string, status: string) => void;
  approving: boolean;
  declining: boolean;
  updatingStatus: boolean;
}

const formatCcy = (v: number) =>
  `R ${Number(v).toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// ── Step definitions ──────────────────────────────────────────────────────────

const PURCHASE_STATUS_ORDER = [
  "pending", "order_sent", "invoice_received", "stock_received", "vault_confirmed", "receipt_signed", "approved",
];
const SALE_STATUS_ORDER = [
  "pending", "quote_sent", "quote_accepted", "invoice_sent", "stock_collected", "stock_delivered", "receipt_signed", "approved",
];

interface StepDef {
  id: string;
  label: string;
  description: string;
  icon: any;
  /** Status this step transitions TO when completed */
  advancesTo: string | null;
  type: "document_send" | "confirm" | "vault" | "receipt" | "final";
  docType?: string; // for document_send steps
}

const PURCHASE_STEPS: StepDef[] = [
  {
    id: "order",
    label: "Purchase Order",
    description: "Compose and email the purchase order to the supplier",
    icon: FileText,
    advancesTo: "order_sent",
    type: "document_send",
    docType: "purchase_order",
  },
  {
    id: "invoice_received",
    label: "Supplier Invoice",
    description: "Receive and process the supplier's invoice",
    icon: Receipt,
    advancesTo: "invoice_received",
    type: "confirm",
  },
  {
    id: "stock_received",
    label: "Stock Received",
    description: "Confirm physical receipt of all stock items",
    icon: Package,
    advancesTo: "stock_received",
    type: "confirm",
  },
  {
    id: "vault_confirmed",
    label: "Vault Deposit",
    description: "Confirm stock has been securely deposited in the vault",
    icon: ShieldCheck,
    advancesTo: "vault_confirmed",
    type: "vault",
  },
  {
    id: "receipt",
    label: "Stock Receipt",
    description: "Both parties sign the electronic stock receipt",
    icon: PenTool,
    advancesTo: "receipt_signed",
    type: "receipt",
  },
  {
    id: "approved",
    label: "Post Ledger",
    description: "Approve and post all financial ledger entries",
    icon: ClipboardCheck,
    advancesTo: "approved",
    type: "final",
  },
];

const SALE_STEPS: StepDef[] = [
  {
    id: "quote",
    label: "Sales Quote",
    description: "Compose and email the quote/sales order to the customer",
    icon: FileText,
    advancesTo: "quote_sent",
    type: "document_send",
    docType: "sales_order",
  },
  {
    id: "quote_accepted",
    label: "Quote Accepted",
    description: "Confirm the customer has accepted the quote",
    icon: CheckCircle2,
    advancesTo: "quote_accepted",
    type: "confirm",
  },
  {
    id: "invoice_sent",
    label: "Tax Invoice",
    description: "Email the tax invoice to the customer",
    icon: Receipt,
    advancesTo: "invoice_sent",
    type: "document_send",
    docType: "tax_invoice",
  },
  {
    id: "stock_collected",
    label: "Collect Stock",
    description: "Collect the stock items from the vault for delivery",
    icon: ShieldCheck,
    advancesTo: "stock_collected",
    type: "confirm",
  },
  {
    id: "stock_delivered",
    label: "Stock Delivered",
    description: "Confirm stock has been delivered to the customer",
    icon: Truck,
    advancesTo: "stock_delivered",
    type: "confirm",
  },
  {
    id: "receipt",
    label: "Stock Receipt",
    description: "Both parties sign the electronic stock receipt",
    icon: PenTool,
    advancesTo: "receipt_signed",
    type: "receipt",
  },
  {
    id: "approved",
    label: "Post Ledger",
    description: "Approve and post all financial ledger entries",
    icon: ClipboardCheck,
    advancesTo: "approved",
    type: "final",
  },
];

function getCurrentStepIndex(status: string, isPurchase: boolean): number {
  const order = isPurchase ? PURCHASE_STATUS_ORDER : SALE_STATUS_ORDER;
  const idx = order.indexOf(status);
  if (idx < 0) return 0;
  // status index maps directly to the NEXT step to complete
  // e.g. "pending"(0) -> step 0, "order_sent"(1) -> step 1, etc.
  // the last status "approved" has no more steps
  const steps = isPurchase ? PURCHASE_STEPS : SALE_STEPS;
  return Math.min(idx, steps.length - 1);
}

// ── Step Progress Bar ─────────────────────────────────────────────────────────
function StepProgress({ steps, currentIdx }: { steps: StepDef[]; currentIdx: number }) {
  return (
    <div className="flex items-center gap-0">
      {steps.map((step, idx) => {
        const done = idx < currentIdx;
        const active = idx === currentIdx;
        const Icon = step.icon;
        return (
          <div key={step.id} className="flex items-center flex-1 min-w-0">
            <div className="flex flex-col items-center gap-1 shrink-0">
              <div
                className={`w-7 h-7 rounded-full flex items-center justify-center border-2 transition-colors ${
                  done
                    ? "bg-green-500 border-green-500 text-white"
                    : active
                    ? "bg-primary border-primary text-primary-foreground"
                    : "bg-background border-muted-foreground/30 text-muted-foreground"
                }`}
              >
                {done ? <Check className="h-3.5 w-3.5" /> : <Icon className="h-3 w-3" />}
              </div>
              <span className={`text-[9px] font-medium leading-tight text-center max-w-[60px] ${
                active ? "text-primary" : done ? "text-green-600" : "text-muted-foreground"
              }`}>
                {step.label}
              </span>
            </div>
            {idx < steps.length - 1 && (
              <div className={`h-0.5 flex-1 mx-1 mb-4 ${done ? "bg-green-500" : "bg-muted"}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Main Dialog ───────────────────────────────────────────────────────────────
const AdminStockReviewDialog = ({
  txn, onClose, onVaultConfirm, onApprove, onDecline,
  onUpdateStatus, approving, declining, updatingStatus,
}: Props) => {
  const [vaultRef, setVaultRef] = useState(txn?.vault_reference ?? "");
  const [vaultNotes, setVaultNotes] = useState(txn?.vault_notes ?? "");
  const [stepConfirmed, setStepConfirmed] = useState(false);
  const [declineReason, setDeclineReason] = useState("");
  const [showDecline, setShowDecline] = useState(false);
  const [showLines, setShowLines] = useState(true);
  const [sendingDoc, setSendingDoc] = useState(false);
  const [docEmailSent, setDocEmailSent] = useState(false);

  // Reset all local state when the transaction changes
  useEffect(() => {
    setVaultRef(txn?.vault_reference ?? "");
    setVaultNotes(txn?.vault_notes ?? "");
    setStepConfirmed(false);
    setDeclineReason("");
    setShowDecline(false);
    setDocEmailSent(false);
  }, [txn?.id]);

  const { data: linesData = [], isLoading } = useQuery({
    queryKey: ["admin_stock_lines", txn?.id],
    queryFn: async () => {
      if (!txn?.id) return [];
      const { data, error } = await (supabase as any)
        .from("admin_stock_transaction_lines")
        .select("*, items(description, item_code), pools(name)")
        .eq("admin_stock_transaction_id", txn.id)
        .order("pool_id");
      if (error) throw error;
      return (data ?? []) as any[];
    },
    enabled: !!txn?.id,
  });

  if (!txn) return null;

  const isPurchase = txn.transaction_type_code === "STOCK_PURCHASES";
  const isSale = txn.transaction_type_code === "STOCK_SALES";
  const isAdjustment = txn.transaction_type_code === "STOCK_ADJUSTMENTS";
  const steps = isPurchase ? PURCHASE_STEPS : isSale ? SALE_STEPS : [];
  const currentStepIdx = isAdjustment ? 0 : getCurrentStepIndex(txn.status, isPurchase);
  const currentStep = steps[currentStepIdx] ?? null;
  const isAllDone = txn.status === "approved";

  console.log("[AdminStockReview] txn.status:", txn.status, "| type_code:", txn.transaction_type_code, "| isPurchase:", isPurchase, "| isAdjustment:", isAdjustment, "| currentStepIdx:", currentStepIdx, "| currentStep:", currentStep?.type, "| isAllDone:", isAllDone);

  const typeLabels: Record<string, { label: string; icon: any; color: string }> = {
    STOCK_PURCHASES: { label: "Stock Purchase", icon: ShoppingCart, color: "text-green-600" },
    STOCK_SALES: { label: "Stock Sale", icon: TrendingDown, color: "text-blue-600" },
    STOCK_ADJUSTMENTS: { label: "Stock Adjustment", icon: SlidersHorizontal, color: "text-amber-600" },
  };
  const cfg = typeLabels[txn.transaction_type_code] ?? typeLabels.STOCK_PURCHASES;
  const Icon = cfg.icon;

  // ── Document send action ──────────────────────────────────────────────────
  const handleDownloadDoc = async (docType: string) => {
    setSendingDoc(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-stock-document", {
        body: { txn_id: txn.id, document_type: docType, send_email: false },
      });
      if (error || !data?.html) throw new Error(error?.message ?? "Failed to generate document");
      const win = window.open("", "_blank");
      if (win) { win.document.write(data.html); win.document.close(); }
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSendingDoc(false);
    }
  };

  const handleEmailDoc = async (docType: string, advancesTo: string) => {
    setSendingDoc(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-stock-document", {
        body: { txn_id: txn.id, document_type: docType, send_email: true },
      });
      if (error) throw new Error(error?.message ?? "Failed to send email");
      toast.success(`Document emailed successfully`);
      // Mark email as sent but DON'T auto-advance — let admin continue on this step
      setDocEmailSent(true);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSendingDoc(false);
    }
  };

  // ── Group lines by pool ───────────────────────────────────────────────────
  const byPool = (linesData as any[]).reduce<Record<string, any[]>>((acc, l) => {
    if (!acc[l.pool_id]) acc[l.pool_id] = [];
    acc[l.pool_id].push(l);
    return acc;
  }, {});

  // ── Current step UI ───────────────────────────────────────────────────────
  const renderStepPanel = () => {
    if (!currentStep) return null;

    if (isAllDone) {
      return (
        <div className="flex items-center gap-2 text-sm text-green-700 bg-green-500/10 rounded-lg px-3 py-3">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span className="font-medium">All steps complete — transaction approved.</span>
        </div>
      );
    }

    // Document send step
    if (currentStep.type === "document_send" && currentStep.docType) {
      const actionLabel = isPurchase
        ? "Email Purchase Order to Supplier"
        : currentStep.docType === "tax_invoice"
        ? "Email Tax Invoice to Customer"
        : "Email Quote to Customer";
      return (
        <div className="space-y-3">
          <div className="text-sm font-medium text-foreground">{currentStep.description}</div>
          {docEmailSent && (
            <div className="flex items-center gap-2 text-sm text-green-700 bg-green-500/10 rounded-lg px-3 py-2">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              <span>Document emailed successfully. You can resend or continue to the next step.</span>
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              disabled={sendingDoc}
              onClick={() => handleDownloadDoc(currentStep.docType!)}
            >
              {sendingDoc ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
              Download / Preview
            </Button>
            <Button
              size="sm"
              variant={docEmailSent ? "outline" : "default"}
              className="gap-1.5"
              disabled={sendingDoc || updatingStatus}
              onClick={() => handleEmailDoc(currentStep.docType!, currentStep.advancesTo!)}
            >
              {sendingDoc ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Mail className="h-3.5 w-3.5" />}
              {docEmailSent ? "Resend" : actionLabel}
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            {docEmailSent ? "Document emailed — you can resend or continue to the next step." : "Email the document, or continue without emailing to advance."}
          </p>
          <div className="pt-1 border-t border-border">
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5 w-full"
              disabled={updatingStatus}
              onClick={() => {
                onUpdateStatus(txn.id, currentStep.advancesTo!);
                setDocEmailSent(false);
                setStepConfirmed(false);
              }}
            >
              {updatingStatus ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
              {docEmailSent ? "Continue to Next Step" : "Continue without Email"}
            </Button>
          </div>
        </div>
      );
    }

    // Vault step
    if (currentStep.type === "vault") {
      const canConfirm = stepConfirmed;
      return (
        <div className="space-y-3">
          <div className="text-sm font-medium">{currentStep.description}</div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Vault / Location Reference</Label>
              <Input
                value={vaultRef}
                onChange={(e) => setVaultRef(e.target.value)}
                placeholder="Vault A, Safe 3..."
                className="h-8 text-xs"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Notes</Label>
              <Input
                value={vaultNotes}
                onChange={(e) => setVaultNotes(e.target.value)}
                placeholder="Additional notes..."
                className="h-8 text-xs"
              />
            </div>
          </div>
          <div className="flex items-start gap-2 rounded-lg border-2 border-green-500/30 bg-green-500/5 p-3">
            <Checkbox
              id="vault_confirm"
              checked={stepConfirmed}
              onCheckedChange={(v) => setStepConfirmed(!!v)}
              className="mt-0.5"
            />
            <label htmlFor="vault_confirm" className="text-xs font-medium cursor-pointer">
              I confirm all stock items have been physically verified and securely deposited in the vault.
            </label>
          </div>
          <Button
            variant="outline"
            className="border-green-500/50 text-green-700 hover:bg-green-500/10"
            disabled={!canConfirm || updatingStatus}
            onClick={() => { onVaultConfirm(txn.id, vaultRef, vaultNotes); setStepConfirmed(false); }}
          >
            {updatingStatus ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <ShieldCheck className="h-4 w-4 mr-1.5" />}
            Confirm Vault Deposit
          </Button>
        </div>
      );
    }

    // Final approval step
    if (currentStep.type === "final") {
      return (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-xs text-amber-600 bg-amber-500/10 rounded-lg px-3 py-2">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            {isAdjustment
              ? "Approving will post stock control entries for quantity adjustments."
              : "Approving will post all ledger entries: Bank, Cash Control, Stock Control, and VAT."}
          </div>
          <Button
            onClick={() => onApprove(txn.id)}
            disabled={approving}
            className="gap-1.5"
          >
            {approving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            {isAdjustment ? "Approve Adjustment" : "Approve & Post Ledger"}
          </Button>
        </div>
      );
    }

    // Confirm checkbox step
    const confirmLabels: Record<string, string> = {
      invoice_received: "I confirm the supplier's invoice has been received and verified against the purchase order.",
      stock_received: "I confirm all stock items have been physically counted and received in full.",
      quote_accepted: "I confirm the customer has accepted the quote and confirmed the order.",
      stock_collected: "I confirm all stock items have been collected from the vault for delivery.",
      stock_delivered: "I confirm all stock items have been delivered to the customer.",
    };
    const confirmLabel = confirmLabels[currentStep.advancesTo ?? ""] ?? "I confirm this step is complete.";
    return (
      <div className="space-y-3">
        <div className="text-sm font-medium">{currentStep.description}</div>
        <div className="flex items-center gap-2 py-1">
          <Checkbox
            id={`step_confirm_${currentStep.id}`}
            checked={stepConfirmed}
            onCheckedChange={(v) => setStepConfirmed(!!v)}
          />
          <label htmlFor={`step_confirm_${currentStep.id}`} className="text-xs text-muted-foreground cursor-pointer select-none">
            {confirmLabel}
          </label>
        </div>
        <Button
          disabled={!stepConfirmed || updatingStatus}
          onClick={() => { onUpdateStatus(txn.id, currentStep.advancesTo!); setStepConfirmed(false); }}
          className="gap-1.5"
        >
          {updatingStatus ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          Confirm &amp; Advance
        </Button>
      </div>
    );
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <Dialog open={!!txn} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Icon className={`h-5 w-5 ${cfg.color}`} />
            {cfg.label}
            {txn.reference && (
              <span className="text-sm font-normal text-muted-foreground font-mono">— {txn.reference}</span>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Header info */}
          <div className="rounded-lg bg-muted/40 border border-border px-3 py-2.5 text-xs">
            <div className="grid grid-cols-3 gap-2">
              <div>
                <p className="text-muted-foreground">Date</p>
                <p className="font-semibold">
                  {txn.transaction_date ? format(new Date(txn.transaction_date), "dd MMM yyyy") : "—"}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">Reference</p>
                <p className="font-semibold font-mono">{txn.reference || "—"}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Status</p>
                <Badge variant="secondary" className="text-[10px] mt-0.5">
                  {txn.status.replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase())}
                </Badge>
              </div>
            </div>
            {txn.counterparty_entity && (
              <div className="border-t border-border pt-2 mt-2">
                <p className="text-muted-foreground">{isPurchase ? "Supplier" : "Customer"}</p>
                <p className="font-semibold">
                  {[txn.counterparty_entity.name, txn.counterparty_entity.last_name].filter(Boolean).join(" ")}
                </p>
              </div>
            )}
          </div>

          {/* Step progress (purchases and sales only) */}
          {!isAdjustment && (
            <>
              <StepProgress steps={steps} currentIdx={isAllDone ? steps.length : currentStepIdx} />
              <Separator />
            </>
          )}

          {/* Current step action panel */}
          {!isAdjustment && steps.length > 0 && (
            <div className="rounded-lg border border-border bg-muted/20 px-4 py-3 space-y-3">
              {!isAllDone && currentStep && (
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <currentStep.icon className="h-3 w-3" />
                  Step {currentStepIdx + 1} of {steps.length} — {currentStep.label}
                </p>
              )}
              {renderStepPanel()}
            </div>
          )}

          {/* Adjustment: simple confirm + approve */}
          {isAdjustment && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs text-amber-600 bg-amber-500/10 rounded-lg px-3 py-2">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                Approving will post stock control entries for quantity adjustments.
              </div>
            </div>
          )}

          {/* Line items (collapsible) */}
          <div className="border border-border rounded-lg overflow-hidden">
            <button
              className="w-full flex items-center justify-between px-3 py-2 text-xs font-semibold bg-muted/30 hover:bg-muted/50 transition-colors"
              onClick={() => setShowLines((v) => !v)}
            >
              <span className="flex items-center gap-1.5 text-muted-foreground uppercase tracking-wider">
                <Package className="h-3 w-3" />Line Items ({linesData.length})
              </span>
              {showLines ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            </button>
            {showLines && (
              <div className="px-3 py-2 space-y-3">
                {isLoading ? (
                  <div className="flex items-center justify-center py-4">
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  </div>
                ) : (
                  Object.entries(byPool).map(([poolId, poolLines]) => {
                    const poolName = (poolLines as any[])[0].pools?.name ?? "—";
                    const poolTotal = (poolLines as any[]).reduce((s, l) => s + Number(l.line_total_incl_vat), 0);
                    return (
                      <div key={poolId} className="space-y-1.5">
                        <div className="flex items-center gap-1.5 text-[11px] font-bold text-muted-foreground">
                          <Building2 className="h-3 w-3" />{poolName}
                        </div>
                        {(poolLines as any[]).map((l: any) => (
                          <div key={l.id} className="flex justify-between items-start text-sm pl-4">
                            <div>
                              <p className="font-medium text-xs">{l.items?.description}</p>
                              <p className="text-[10px] text-muted-foreground font-mono">{l.items?.item_code}</p>
                            </div>
                            <div className="text-right text-xs shrink-0 ml-3">
                              {isAdjustment ? (
                                <div className="flex items-center gap-1">
                                  <Badge variant={l.adjustment_type === "write_on" ? "default" : "destructive"} className="text-[9px] px-1.5">
                                    {l.adjustment_type === "write_on" ? "+Write-on" : "−Write-off"}
                                  </Badge>
                                  <span className="font-mono font-semibold">{Number(l.quantity)} units</span>
                                </div>
                              ) : (
                                <>
                                  <p className="font-mono font-semibold">
                                    {Number(l.quantity)} × {formatCcy(Number(l.unit_price_incl_vat))}
                                  </p>
                                  <p className="text-muted-foreground">= {formatCcy(Number(l.line_total_incl_vat))}</p>
                                </>
                              )}
                            </div>
                          </div>
                        ))}
                        {!isAdjustment && (
                          <div className="flex justify-between text-xs font-semibold border-t pl-4 pt-1">
                            <span>{poolName} subtotal</span>
                            <span>{formatCcy(poolTotal)}</span>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
                {/* Totals */}
                {!isAdjustment && (
                  <div className="border-t pt-2 space-y-1">
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>Subtotal (excl. VAT)</span>
                      <span>{formatCcy(Number(txn.total_excl_vat))}</span>
                    </div>
                    {Number(txn.total_vat) > 0 && (
                      <div className="flex justify-between text-xs text-amber-600">
                        <span>VAT</span>
                        <span>{formatCcy(Number(txn.total_vat))}</span>
                      </div>
                    )}
                    <div className="flex justify-between text-sm font-bold text-primary">
                      <span>Total Invoice</span>
                      <span>{formatCcy(Number(txn.total_invoice_amount))}</span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {txn.notes && (
            <div className="text-xs text-muted-foreground bg-muted/30 rounded-lg px-3 py-2">
              <span className="font-semibold">Notes: </span>{txn.notes}
            </div>
          )}

          {/* Decline form */}
          {showDecline && (
            <div className="space-y-2">
              <Label className="text-xs">Reason for declining</Label>
              <Textarea
                value={declineReason}
                onChange={(e) => setDeclineReason(e.target.value)}
                rows={2}
                placeholder="Reason..."
                className="resize-none text-sm"
              />
            </div>
          )}
        </div>

        <DialogFooter className="flex gap-2 flex-wrap pt-2">
          <Button variant="outline" onClick={onClose} className="mr-auto">Close</Button>

          {/* Adjustment approve button in footer */}
          {isAdjustment && !showDecline && (
            <Button onClick={() => onApprove(txn.id)} disabled={approving}>
              {approving && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}
              <Check className="h-4 w-4 mr-1.5" />
              Approve Adjustment
            </Button>
          )}

          {!showDecline && txn.status !== "approved" && (
            <Button
              variant="outline"
              className="text-destructive border-destructive/30 hover:bg-destructive/10"
              onClick={() => setShowDecline(true)}
              disabled={approving || updatingStatus}
            >
              Decline
            </Button>
          )}

          {showDecline && (
            <>
              <Button variant="outline" onClick={() => setShowDecline(false)}>Cancel</Button>
              <Button
                variant="destructive"
                onClick={() => onDecline(txn.id, declineReason)}
                disabled={declining}
              >
                {declining && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}
                Confirm Decline
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default AdminStockReviewDialog;
