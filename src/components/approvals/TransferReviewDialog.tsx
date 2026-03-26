import { useState, useMemo } from "react";
import CftEntriesPreview, { buildTransferCftLines } from "@/components/approvals/CftEntriesPreview";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import {
  Loader2, CheckCircle, XCircle, TrendingDown, ArrowRight,
  User, Minus, ShieldCheck,
} from "lucide-react";

const fmt = (v: number) =>
  `R ${Number(v).toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

interface TransferReviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  group: { primary: any; siblings: any[] } | null;
  tenantId: string;
  onApprove: (group: { primary: any; siblings: any[] }) => void;
  onDecline: (ids: string[], reason: string) => void;
  isApproving?: boolean;
  isDeclining?: boolean;
}

const TransferReviewDialog = ({
  open, onOpenChange, group, tenantId,
  onApprove, onDecline,
  isApproving, isDeclining,
}: TransferReviewDialogProps) => {
  const [showDecline, setShowDecline] = useState(false);
  const [declineReason, setDeclineReason] = useState("");

  const primaryTxn = group?.primary;

  let meta: any = {};
  try { meta = JSON.parse(primaryTxn?.notes || "{}"); } catch {}

  const feeBreakdown: { name: string; amount: number; vat?: number }[] = meta.fee_breakdown || [];
  const totalFee: number = meta.total_fee ?? Number(primaryTxn?.fee_amount ?? 0);
  const grossRedemption: number = meta.gross_redemption_amount ?? Number(primaryTxn?.amount ?? 0);
  const netTransferAmount: number = meta.net_transfer_amount ?? Number(primaryTxn?.net_amount ?? primaryTxn?.amount ?? 0);
  const unitPriceSell: number = meta.unit_price_sell ?? Number(primaryTxn?.unit_price ?? 0);
  const unitsRedeemed: number = unitPriceSell > 0 ? grossRedemption / unitPriceSell : Number(primaryTxn?.units ?? 0);
  const unitsReceived: number = unitPriceSell > 0 ? netTransferAmount / unitPriceSell : Number(primaryTxn?.units ?? 0);
  const poolName: string = primaryTxn?.pools?.name ?? "Pool";
  const recipientIdNumber: string = meta.recipient_id_number ?? "";

  const fromName = primaryTxn?.entity_accounts?.entities
    ? [primaryTxn.entity_accounts.entities.name, primaryTxn.entity_accounts.entities.last_name].filter(Boolean).join(" ")
    : "—";
  const fromAccountNumber = primaryTxn?.entity_accounts?.account_number || "—";
  const toAccountNumber: string = meta.to_account_number ?? "—";
  const toEntityName: string = meta.to_entity_name ?? "—";

  const userNotes: string = meta.user_notes || "";
  const txnDate = primaryTxn?.transaction_date || primaryTxn?.created_at?.split("T")[0] || "—";

  const allIds = group ? [group.primary.id, ...group.siblings.map((s: any) => s.id)] : [];

  // Build CFT preview lines
  const transferCftLines = useMemo(() => {
    if (!group) return [];
    return buildTransferCftLines({
      grossRedemption,
      netTransferAmount,
      poolName,
      feeBreakdown,
      joinShare: meta.receiver_join_share || null,
      commissionAmount: Number(meta.commission_amount || 0),
    });
  }, [group?.primary?.id]);

  if (!group) return null;

  return (
    <Dialog open={open} onOpenChange={(v) => {
      if (!v) { setShowDecline(false); setDeclineReason(""); }
      onOpenChange(v);
    }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Approve Transfer</DialogTitle>
          <div className="flex items-center gap-2 mt-1">
            <Badge variant="secondary">{fromAccountNumber}</Badge>
            <Badge variant="outline">Transfer</Badge>
          </div>
        </DialogHeader>

        <div className="space-y-4">
          {/* FROM account */}
          <div className="rounded-xl border-2 border-orange-500/30 bg-orange-500/5 p-4 space-y-2">
            <p className="text-xs font-bold uppercase tracking-wider text-orange-600 dark:text-orange-400 flex items-center gap-1.5">
              <TrendingDown className="h-3.5 w-3.5" /> Sender — {poolName}
            </p>
            <div className="flex items-center gap-2">
              <User className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-semibold">{fromName}</span>
              <Badge variant="outline" className="font-mono text-[10px]">{fromAccountNumber}</Badge>
            </div>
            <Separator />
            {feeBreakdown.length > 0 && feeBreakdown.map((fee, i) => (
              <div key={i} className="flex justify-between text-sm text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <Minus className="h-3 w-3" /> {fee.name}
                </span>
                <span className="text-destructive font-mono">+ {fmt(fee.amount)}</span>
              </div>
            ))}
            <div className="flex justify-between text-sm font-bold text-orange-600 dark:text-orange-400">
              <span>Gross Redeemed (UP Sell {fmt(unitPriceSell)})</span>
              <span className="font-mono">{fmt(grossRedemption)}</span>
            </div>
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Units Redeemed</span>
              <span className="font-mono">{unitsRedeemed.toFixed(4)}</span>
            </div>
          </div>

          {/* Arrow */}
          <div className="flex justify-center">
            <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
              <ArrowRight className="h-4 w-4 text-primary" />
            </div>
          </div>

          {/* TO account */}
          <div className="rounded-xl border-2 border-emerald-500/30 bg-emerald-500/5 p-4 space-y-2">
            <p className="text-xs font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
              <ArrowRight className="h-3.5 w-3.5" /> Recipient — {poolName}
            </p>
            <div className="flex items-center gap-2">
              <User className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-semibold">{toEntityName}</span>
              <Badge variant="outline" className="font-mono text-[10px]">{toAccountNumber}</Badge>
            </div>
            {recipientIdNumber && (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" />
                ID verified by sender: <span className="font-mono">{recipientIdNumber}</span>
              </div>
            )}
            <Separator />
            <div className="flex justify-between text-sm font-bold text-emerald-600 dark:text-emerald-400">
              <span>Net Units Credited</span>
              <span className="font-mono">{unitsReceived.toFixed(4)}</span>
            </div>
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Net Value (at UP Sell)</span>
              <span className="font-mono">{fmt(netTransferAmount)}</span>
            </div>
          </div>

          {/* Summary */}
          <div className="rounded-xl border-2 border-border bg-muted/20 p-3 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Transaction Date</span>
              <span className="font-mono">{txnDate}</span>
            </div>
            {totalFee > 0 && (
              <div className="flex justify-between text-sm text-muted-foreground">
                <span>Total Fees</span>
                <span className="text-destructive font-mono">+ {fmt(totalFee)}</span>
              </div>
            )}
            <Separator />
            <div className="flex justify-between text-sm font-bold text-primary">
              <span>Net Transfer Amount</span>
              <span className="font-mono">{fmt(netTransferAmount)}</span>
            </div>
          </div>

          {userNotes && (
            <div className="rounded-lg bg-muted/30 border border-border px-3 py-2">
              <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider mb-1">Sender's Note</p>
              <p className="text-sm">{userNotes}</p>
            </div>
          )}
          {/* CFT Entries Preview */}
          <CftEntriesPreview lines={transferCftLines} />
        </div>

        {/* Decline input */}
        {showDecline && (
          <div className="space-y-2 mt-2">
            <p className="text-sm font-medium text-destructive">Reason for decline (optional)</p>
            <Textarea
              value={declineReason}
              onChange={(e) => setDeclineReason(e.target.value)}
              placeholder="Enter reason..."
              rows={2}
            />
          </div>
        )}

        <DialogFooter className="flex-col sm:flex-row gap-2 pt-2">
          {!showDecline ? (
            <>
              <Button variant="outline" size="sm" onClick={() => setShowDecline(true)} disabled={isDeclining}>
                <XCircle className="h-4 w-4 mr-1.5" />
                Decline
              </Button>
              <Button size="sm" onClick={() => onApprove(group)} disabled={isApproving}>
                {isApproving ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <CheckCircle className="h-4 w-4 mr-1.5" />}
                Approve Transfer
              </Button>
            </>
          ) : (
            <>
              <Button variant="ghost" size="sm" onClick={() => setShowDecline(false)}>Back</Button>
              <Button variant="destructive" size="sm" onClick={() => onDecline(allIds, declineReason)} disabled={isDeclining}>
                {isDeclining ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <XCircle className="h-4 w-4 mr-1.5" />}
                Confirm Decline
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default TransferReviewDialog;
