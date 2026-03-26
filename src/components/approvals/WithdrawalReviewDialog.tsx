import { useState, useRef, useMemo } from "react";
import CftEntriesPreview from "@/components/approvals/cft-preview/CftEntriesPreview";
import { buildWithdrawalPreview } from "@/components/approvals/cft-preview/builders";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Loader2, FileText, X, Upload, TrendingDown, Banknote,
  CheckCircle, XCircle, Minus, Package,
} from "lucide-react";
import { format, parseISO } from "date-fns";

const fmt = (v: number) =>
  `R ${Number(v).toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

interface WithdrawalReviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  group: { primary: any; siblings: any[] } | null;
  tenantId: string;
  userId: string;
  onApprove: (group: { primary: any; siblings: any[] }) => void;
  onConfirmPayout: (group: { primary: any; siblings: any[] }, popFile: File | null) => void;
  onDecline: (ids: string[], reason: string) => void;
  isApproving?: boolean;
  isDeclining?: boolean;
}

const WithdrawalReviewDialog = ({
  open, onOpenChange, group, tenantId, userId,
  onApprove, onConfirmPayout, onDecline,
  isApproving, isDeclining,
}: WithdrawalReviewDialogProps) => {
  const [showDecline, setShowDecline] = useState(false);
  const [declineReason, setDeclineReason] = useState("");
  const [payoutConfirmed, setPayoutConfirmed] = useState(false);
  const [popFile, setPopFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const allTxns = group ? [group.primary, ...group.siblings] : [];
  const primaryTxn = group?.primary;

  let meta: any = {};
  try { meta = JSON.parse(primaryTxn?.notes || "{}"); } catch {}

  // Aggregate fee breakdowns from ALL pool transactions (each sibling stores its own fees)
  const feeBreakdown: { name: string; amount: number }[] = (() => {
    const merged: Record<string, number> = {};
    for (const txn of allTxns) {
      let txnMeta: any = {};
      try { txnMeta = JSON.parse(txn?.notes || "{}"); } catch {}
      for (const fee of (txnMeta.fee_breakdown || [])) {
        merged[fee.name] = (merged[fee.name] || 0) + Number(fee.amount);
      }
    }
    return Object.entries(merged).map(([name, amount]) => ({ name, amount }));
  })();
  const isStockWithdrawal = meta.transaction_kind === "stock_withdrawal";
  const stockLines: { description: string; quantity: number; sellPrice: number; lineValue: number }[] = meta.stock_lines || [];

  const isFirstApproved = primaryTxn?.status === "first_approved";
  const isPending = primaryTxn?.status === "pending";

  const totalAmount = allTxns.reduce((s: number, t: any) => s + Number(t.amount), 0);
  const totalNet = allTxns.reduce((s: number, t: any) => s + Number(t.net_amount), 0);
  const memberName = primaryTxn?.entity_accounts?.entities
    ? [primaryTxn.entity_accounts.entities.name, primaryTxn.entity_accounts.entities.last_name].filter(Boolean).join(" ")
    : "—";
  const accountNumber = primaryTxn?.entity_accounts?.account_number || "—";
  const txnTypeName = primaryTxn?.transaction_types?.name || "Withdrawal";
  const originalDate = primaryTxn?.transaction_date || primaryTxn?.created_at?.split("T")[0];
  const originalDateObj = originalDate ? parseISO(originalDate) : new Date();

  // Build CFT preview lines
  const withdrawalCftLines = useMemo(() => {
    if (!group) return [];
    const poolRedemptions = allTxns.map((t: any) => ({
      poolName: t.pools?.name || "Pool",
      amount: Number(t.amount),
    }));
    return buildWithdrawalCftLines({
      totalAmount,
      netPayout: totalNet,
      feeBreakdown,
      poolRedemptions,
      isStockWithdrawal,
    });
  }, [group?.primary?.id]);

  if (!group) return null;

  return (
    <Dialog open={open} onOpenChange={(v) => {
      if (!v) {
        setShowDecline(false);
        setDeclineReason("");
        setPayoutConfirmed(false);
        setPopFile(null);
      }
      onOpenChange(v);
    }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Review {isStockWithdrawal ? "Stock " : ""}Withdrawal — {memberName}</DialogTitle>
          <div className="flex items-center gap-2 mt-1">
            <Badge variant="secondary">{accountNumber}</Badge>
            <Badge variant="outline">{txnTypeName}</Badge>
            {isFirstApproved && !isStockWithdrawal && (
              <Badge variant="default" className="bg-amber-500 hover:bg-amber-600">Awaiting Payout</Badge>
            )}
            {isStockWithdrawal && (
              <Badge variant="outline" className="border-blue-400 text-blue-600">Stock Dispatch</Badge>
            )}
          </div>
        </DialogHeader>

        <div className="space-y-5">
          {/* Cash withdrawal awaiting payout banner */}
          {isFirstApproved && !isStockWithdrawal && (
            <div className="rounded-xl border-2 border-amber-500/40 bg-amber-500/5 p-3 flex items-center gap-2">
              <Banknote className="h-4 w-4 text-amber-600 shrink-0" />
              <p className="text-sm text-amber-700 dark:text-amber-400 font-medium">
                Transaction approved — awaiting payout confirmation and proof of payment.
              </p>
            </div>
          )}

          {/* Stock withdrawal info banner */}
          {isStockWithdrawal && isPending && (
            <div className="rounded-xl border-2 border-blue-500/40 bg-blue-500/5 p-3 flex items-center gap-2">
              <Package className="h-4 w-4 text-blue-600 shrink-0" />
              <p className="text-sm text-blue-700 dark:text-blue-400 font-medium">
                Approving will immediately post all ledger entries and reduce stock inventory.
              </p>
            </div>
          )}

          {/* Financial Summary */}
          <div className="rounded-xl border-2 border-border bg-muted/20 p-4 space-y-2">
            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <TrendingDown className="h-3 w-3" /> Financial Summary
            </p>
            <div className="flex justify-between text-sm font-semibold">
              <span>{isStockWithdrawal ? "Total Stock Value" : "Gross Withdrawal"}</span>
              <span>{fmt(isStockWithdrawal ? totalNet : totalAmount)}</span>
            </div>
            {feeBreakdown.map((fee, i) => (
              <div key={i} className="flex justify-between text-sm text-muted-foreground">
                <span className="flex items-center gap-1.5"><Minus className="h-3 w-3" /> {fee.name}</span>
                <span>- {fmt(fee.amount)}</span>
              </div>
            ))}
            <Separator />
            <div className="flex justify-between text-sm font-bold text-primary">
              <span>{isStockWithdrawal ? "Gross Pool Redemption" : "Net Payout to Member"}</span>
              <span>{fmt(isStockWithdrawal ? totalAmount : totalNet)}</span>
            </div>
          </div>

          {/* Stock line items */}
          {isStockWithdrawal && stockLines.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <Package className="h-3 w-3" /> Stock Items to Dispatch
              </p>
              {stockLines.map((line, i) => (
                <div key={i} className="rounded-lg border border-border p-3 flex items-center justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate">{line.description}</p>
                    <p className="text-xs text-muted-foreground">{line.quantity} × {fmt(line.sellPrice)}</p>
                  </div>
                  <span className="text-sm font-bold text-destructive shrink-0">{fmt(line.lineValue)}</span>
                </div>
              ))}
            </div>
          )}

          {/* Pool Redemption Details */}
          <div className="space-y-2">
            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <TrendingDown className="h-3 w-3" /> Pool Redemption
            </p>
            {allTxns.map((txn: any) => (
              <div key={txn.id} className="rounded-lg border border-border p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold">{txn.pools?.name || "Pool"}</span>
                  <span className="text-sm text-muted-foreground">{fmt(Number(txn.amount))}</span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded bg-muted/40 px-2 py-1.5 space-y-0.5">
                    <p className="text-muted-foreground">Unit Price (Sell)</p>
                    <p className="font-mono font-bold">{fmt(Number(txn.unit_price))}</p>
                  </div>
                  <div className="rounded bg-muted/40 px-2 py-1.5 space-y-0.5">
                    <p className="text-muted-foreground">Units Redeemed</p>
                    <p className="font-mono font-bold">{Number(txn.units).toFixed(4)}</p>
                  </div>
                </div>
                <p className="text-[10px] text-muted-foreground">
                  Transaction Date: {format(originalDateObj, "dd MMM yyyy")}
                </p>
              </div>
            ))}
          </div>

          {/* CFT Entries Preview */}
          <CftEntriesPreview lines={withdrawalCftLines} />

          {isFirstApproved && !isStockWithdrawal && (
            <>
              <div className="space-y-2">
                <Label className="flex items-center gap-1.5">
                  <FileText className="h-3.5 w-3.5 text-primary" />
                  Proof of Payment (Bank Transfer)
                </Label>
                <p className="text-[10px] text-muted-foreground">
                  Upload proof that payout has been sent to the member's bank account.
                </p>
                {popFile ? (
                  <div className="flex items-center gap-3 rounded-xl border-2 border-primary/30 bg-primary/5 p-3">
                    <FileText className="h-5 w-5 text-primary shrink-0" />
                    <span className="text-sm truncate flex-1 font-medium">{popFile.name}</span>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setPopFile(null)}>
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ) : (
                  <label className="cursor-pointer">
                    <input
                      ref={fileInputRef}
                      type="file"
                      className="hidden"
                      accept=".pdf,.jpg,.jpeg,.png"
                      onChange={(e) => { const f = e.target.files?.[0]; if (f) setPopFile(f); }}
                    />
                    <div className="flex items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border p-5 hover:bg-muted/30 hover:border-primary/30 transition-all">
                      <Upload className="h-5 w-5 text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">Click to upload POP</span>
                    </div>
                  </label>
                )}
              </div>

              <div className="flex items-center gap-2 py-1">
                <Checkbox
                  id="payout-confirmed"
                  checked={payoutConfirmed}
                  onCheckedChange={(v) => setPayoutConfirmed(!!v)}
                />
                <label htmlFor="payout-confirmed" className="text-xs text-muted-foreground cursor-pointer select-none">
                  I confirm the net payout of <strong>{fmt(totalNet)}</strong> has been transferred to the member's bank account.
                </label>
              </div>
            </>
          )}

          {/* Decline reason */}
          {showDecline && (
            <div className="space-y-2">
              <Label>Reason for declining</Label>
              <Textarea
                value={declineReason}
                onChange={(e) => setDeclineReason(e.target.value)}
                placeholder="Reason for declining this withdrawal..."
                rows={3}
              />
            </div>
          )}
        </div>

        <DialogFooter className="flex gap-2 sm:gap-2">
          {showDecline ? (
            <>
              <Button variant="outline" onClick={() => setShowDecline(false)}>Cancel</Button>
              <Button
                variant="destructive"
                onClick={() => {
                  onDecline(allTxns.map((t: any) => t.id), declineReason);
                  setShowDecline(false);
                }}
                disabled={isDeclining}
              >
                {isDeclining && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                <XCircle className="h-4 w-4 mr-1" /> Confirm Decline
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" size="sm" onClick={() => setShowDecline(true)} disabled={isApproving}>
                <XCircle className="h-4 w-4 mr-1" /> Decline
              </Button>

              {isPending && (
                <Button onClick={() => onApprove(group)} disabled={isApproving}>
                  {isApproving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CheckCircle className="h-4 w-4 mr-2" />}
                  {isStockWithdrawal ? "Approve & Post Ledger" : "Approve Withdrawal"}
                </Button>
              )}

              {isFirstApproved && !isStockWithdrawal && (
                <Button
                  onClick={() => onConfirmPayout(group, popFile)}
                  disabled={isApproving || !payoutConfirmed}
                >
                  {isApproving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Banknote className="h-4 w-4 mr-2" />}
                  Confirm Payout & Post Ledger
                </Button>
              )}
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default WithdrawalReviewDialog;
