import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Loader2, CheckCircle, XCircle, TrendingDown, TrendingUp,
  ArrowRightLeft, Minus, CalendarIcon, AlertTriangle,
} from "lucide-react";
import { format, parseISO } from "date-fns";
import { cn } from "@/lib/utils";

const fmt = (v: number) =>
  `R ${Number(v).toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export interface SwitchDateOverride {
  newDate: string;           // yyyy-MM-dd
  fromUnitPrice: number;
  toUnitPrice: number;
  fromUnitsRedeemed: number;
  toUnitsAcquired: number;
  changeNote: string;
}

interface SwitchReviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  group: { primary: any; siblings: any[] } | null;
  tenantId: string;
  onApprove: (group: { primary: any; siblings: any[] }, overrides?: SwitchDateOverride) => void;
  onDecline: (ids: string[], reason: string) => void;
  isApproving?: boolean;
  isDeclining?: boolean;
}

const SwitchReviewDialog = ({
  open, onOpenChange, group, tenantId,
  onApprove, onDecline, isApproving, isDeclining,
}: SwitchReviewDialogProps) => {
  const [showDecline, setShowDecline] = useState(false);
  const [declineReason, setDeclineReason] = useState("");
  const [overrideDate, setOverrideDate] = useState<Date | null>(null);
  const [changeNote, setChangeNote] = useState("");

  useEffect(() => {
    if (open) {
      setOverrideDate(null);
      setChangeNote("");
      setShowDecline(false);
      setDeclineReason("");
    }
  }, [open]);

  const allTxns = group ? [group.primary, ...group.siblings] : [];
  const primaryTxn = group?.primary;

  // Parse metadata — keys match what NewTransactionDialog stores
  let meta: any = {};
  try { meta = JSON.parse(primaryTxn?.notes || "{}"); } catch {}

  const feeBreakdown: { name: string; amount: number; vat?: number }[] = meta.fee_breakdown || [];
  const totalFee: number = meta.total_fee ?? feeBreakdown.reduce((s, f) => s + f.amount, 0);
  const grossRedemption: number = meta.gross_redemption_amount ?? 0;
  const netSwitchAmount: number = meta.net_switch_amount ?? (grossRedemption - totalFee);
  const fromPoolId: string = meta.from_pool_id ?? primaryTxn?.pool_id ?? "";
  const toPoolId: string = meta.to_pool_id ?? "";
  const originalFromUnitPrice: number = meta.from_unit_price ?? Number(primaryTxn?.unit_price ?? 0);
  const originalToUnitPrice: number = meta.to_unit_price ?? 0;

  // Original date
  const originalDate = primaryTxn?.transaction_date || primaryTxn?.created_at?.split("T")[0];
  const originalDateObj = originalDate ? parseISO(originalDate) : new Date();

  const overrideDateStr = overrideDate ? format(overrideDate, "yyyy-MM-dd") : null;
  const dateChanged = !!overrideDate;
  const effectiveDate = overrideDate || originalDateObj;

  // Fetch prices for BOTH pools when date is overridden
  // From-pool uses UP Sell (redeeming), to-pool uses UP Buy (buying)
  const { data: overridePrices, isLoading: pricesLoading } = useQuery({
    queryKey: ["switch_override_prices", tenantId, overrideDateStr, fromPoolId, toPoolId],
    queryFn: async () => {
      if (!overrideDateStr) return null;
      const result: Record<string, { sell: number; buy: number }> = {};

      for (const poolId of [fromPoolId, toPoolId].filter(Boolean)) {
        // Try exact date
        const { data: exact } = await (supabase as any)
          .from("daily_pool_prices")
          .select("pool_id, unit_price_buy, unit_price_sell")
          .eq("tenant_id", tenantId)
          .eq("pool_id", poolId)
          .eq("totals_date", overrideDateStr)
          .limit(1);

        if (exact?.[0] && (exact[0].unit_price_buy > 0 || exact[0].unit_price_sell > 0)) {
          result[poolId] = {
            buy: Number(exact[0].unit_price_buy),
            sell: Number(exact[0].unit_price_sell) || Number(exact[0].unit_price_buy),
          };
        } else {
          // Fallback: latest on or before override date
          const { data: latest } = await (supabase as any)
            .from("daily_pool_prices")
            .select("pool_id, unit_price_buy, unit_price_sell, totals_date")
            .eq("tenant_id", tenantId)
            .eq("pool_id", poolId)
            .lte("totals_date", overrideDateStr)
            .order("totals_date", { ascending: false })
            .limit(1);
          if (latest?.[0]) {
            result[poolId] = {
              buy: Number(latest[0].unit_price_buy),
              sell: Number(latest[0].unit_price_sell) || Number(latest[0].unit_price_buy),
            };
          }
        }
      }
      return result;
    },
    enabled: open && !!overrideDateStr && !!(fromPoolId || toPoolId),
  });

  // From-pool uses UP Sell (redeeming); to-pool uses UP Buy (buying)
  const effectiveFromUnitPrice: number = dateChanged && overridePrices?.[fromPoolId]
    ? overridePrices[fromPoolId].sell
    : originalFromUnitPrice;
  const effectiveToUnitPrice: number = dateChanged && overridePrices?.[toPoolId]
    ? overridePrices[toPoolId].buy
    : originalToUnitPrice;

  // Missing price flags
  const fromPriceMissing = dateChanged && overridePrices !== null && overridePrices !== undefined && !overridePrices?.[fromPoolId];
  const toPriceMissing = dateChanged && overridePrices !== null && overridePrices !== undefined && !overridePrices?.[toPoolId];
  const anyPriceMissing = fromPriceMissing || toPriceMissing;

  // Compute units — from uses UP Sell, to uses UP Buy
  const fromUnitsRedeemed: number = effectiveFromUnitPrice > 0 ? grossRedemption / effectiveFromUnitPrice : 0;
  const toUnitsAcquired: number = effectiveToUnitPrice > 0 ? netSwitchAmount / effectiveToUnitPrice : 0;

  // Fetch pool names
  const fromPoolName = primaryTxn?.pools?.name ?? "Source Pool";
  const { data: toPool } = useQuery({
    queryKey: ["pool_name_for_switch", toPoolId],
    queryFn: async () => {
      if (!toPoolId) return null;
      const { data } = await (supabase as any)
        .from("pools")
        .select("id, name")
        .eq("id", toPoolId)
        .single();
      return data;
    },
    enabled: open && !!toPoolId,
  });
  const toPoolName = toPool?.name ?? "Target Pool";

  const memberName = primaryTxn?.entity_accounts?.entities
    ? [primaryTxn.entity_accounts.entities.name, primaryTxn.entity_accounts.entities.last_name].filter(Boolean).join(" ")
    : "—";
  const accountNumber = primaryTxn?.entity_accounts?.account_number || "—";
  const txnTypeName = primaryTxn?.transaction_types?.name || "Switch";

  const handleApprove = () => {
    if (!group) return;
    if (dateChanged && overrideDateStr && !anyPriceMissing) {
      const override: SwitchDateOverride = {
        newDate: overrideDateStr,
        fromUnitPrice: effectiveFromUnitPrice,
        toUnitPrice: effectiveToUnitPrice,
        fromUnitsRedeemed,
        toUnitsAcquired,
        changeNote: changeNote || `Transaction date changed to ${format(effectiveDate, "dd MMM yyyy")} by approver`,
      };
      onApprove(group, override);
    } else {
      onApprove(group, undefined);
    }
  };

  if (!group) return null;

  return (
    <Dialog open={open} onOpenChange={(v) => {
      if (!v) { setShowDecline(false); setDeclineReason(""); }
      onOpenChange(v);
    }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Review Switch — {memberName}</DialogTitle>
          <div className="flex items-center gap-2 mt-1">
            <Badge variant="secondary">{accountNumber}</Badge>
            <Badge variant="outline">{txnTypeName}</Badge>
          </div>
        </DialogHeader>

        <div className="space-y-5">
          {/* Transaction Date Override */}
          <div className="rounded-xl border-2 border-border p-4 space-y-3">
            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <CalendarIcon className="h-3 w-3" /> Transaction Date
              {dateChanged && (
                <Badge variant="default" className="text-[9px] h-4 ml-1">Changed</Badge>
              )}
            </p>
            <p className="text-[11px] text-muted-foreground">
              Changing the date will recalculate Unit Prices (UP) and Units for <strong>both pools</strong>.
            </p>
            <div className="flex items-center gap-3">
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className={cn(
                      "h-9 justify-start text-left font-normal",
                      dateChanged && "border-primary text-primary"
                    )}
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
              {!dateChanged && (
                <span className="text-xs text-muted-foreground">(original — click to override)</span>
              )}
              {dateChanged && (
                <Button variant="ghost" size="sm" className="text-xs text-muted-foreground"
                  onClick={() => setOverrideDate(null)}>
                  Reset to original
                </Button>
              )}
              {pricesLoading && dateChanged && (
                <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
              )}
            </div>

            {/* Missing price warning */}
            {dateChanged && !pricesLoading && anyPriceMissing && (
              <div className="rounded-lg bg-destructive/10 border border-destructive/30 px-3 py-2 text-xs text-destructive flex items-start gap-2">
                <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                <span>
                  No price found for {[fromPriceMissing && fromPoolName, toPriceMissing && toPoolName].filter(Boolean).join(" and ")} on {format(effectiveDate, "dd MMM yyyy")}. Select a different date.
                </span>
              </div>
            )}
          </div>

          {/* FROM Pool Block */}
          <div className="rounded-xl border-2 border-orange-500/30 bg-orange-500/5 p-4 space-y-3">
            <p className="text-xs font-bold uppercase tracking-wider text-orange-600 dark:text-orange-400 flex items-center gap-1.5">
              <TrendingDown className="h-3.5 w-3.5" /> Redeem From — {fromPoolName}
            </p>

            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Switch Amount</span>
              <span className="font-semibold">{fmt(netSwitchAmount)}</span>
            </div>

            {feeBreakdown.length > 0 && (
              <div className="space-y-1.5">
                {feeBreakdown.map((fee, i) => (
                  <div key={i} className="flex justify-between text-sm text-muted-foreground">
                    <span className="flex items-center gap-1.5">
                      <Minus className="h-3 w-3" /> {fee.name}
                      {(fee.vat ?? 0) > 0 && (
                        <span className="text-[9px] text-warning ml-1">(incl. VAT)</span>
                      )}
                    </span>
                    <span className="text-destructive">+ {fmt(fee.amount)}</span>
                  </div>
                ))}
              </div>
            )}

            <Separator />

            <div className="flex justify-between text-sm font-bold text-orange-600 dark:text-orange-400">
              <span>Gross Redeemed from Pool</span>
              <span>{fmt(grossRedemption)}</span>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-lg bg-orange-500/10 px-3 py-2 space-y-0.5">
                <p className="text-[10px] text-muted-foreground">Unit Price (UP Sell)</p>
                <p className={cn("font-mono font-bold text-sm", dateChanged && !fromPriceMissing && "text-primary")}>
                  {fromPriceMissing ? <span className="text-destructive">⚠ No price</span> : (effectiveFromUnitPrice > 0 ? fmt(effectiveFromUnitPrice) : "—")}
                </p>
              </div>
              <div className="rounded-lg bg-orange-500/10 px-3 py-2 space-y-0.5">
                <p className="text-[10px] text-muted-foreground">Units Redeemed</p>
                <p className={cn("font-mono font-bold text-sm text-orange-600 dark:text-orange-400", dateChanged && !fromPriceMissing && "text-primary")}>
                  {fromPriceMissing ? "—" : (fromUnitsRedeemed > 0 ? fromUnitsRedeemed.toFixed(4) : "—")}
                </p>
              </div>
            </div>
          </div>

          {/* Arrow */}
          <div className="flex justify-center">
            <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center">
              <ArrowRightLeft className="h-4 w-4 text-primary" />
            </div>
          </div>

          {/* TO Pool Block */}
          <div className="rounded-xl border-2 border-emerald-500/30 bg-emerald-500/5 p-4 space-y-3">
            <p className="text-xs font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
              <TrendingUp className="h-3.5 w-3.5" /> Invest Into — {toPoolName}
            </p>

            <div className="flex justify-between text-sm font-bold text-emerald-600 dark:text-emerald-400">
              <span>Net Amount</span>
              <span>{fmt(netSwitchAmount)}</span>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-lg bg-emerald-500/10 px-3 py-2 space-y-0.5">
                <p className="text-[10px] text-muted-foreground">Unit Price (UP Buy)</p>
                <p className={cn("font-mono font-bold text-sm", dateChanged && !toPriceMissing && "text-primary")}>
                  {toPriceMissing ? <span className="text-destructive">⚠ No price</span> : (effectiveToUnitPrice > 0 ? fmt(effectiveToUnitPrice) : "—")}
                </p>
              </div>
              <div className="rounded-lg bg-emerald-500/10 px-3 py-2 space-y-0.5">
                <p className="text-[10px] text-muted-foreground">Units Acquired</p>
                <p className={cn("font-mono font-bold text-sm text-emerald-600 dark:text-emerald-400", dateChanged && !toPriceMissing && "text-primary")}>
                  {toPriceMissing ? "—" : (toUnitsAcquired > 0 ? toUnitsAcquired.toFixed(4) : "—")}
                </p>
              </div>
            </div>
          </div>

          {/* Switch Summary */}
          <div className="rounded-xl border-2 border-border bg-muted/20 p-4 space-y-2">
            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <ArrowRightLeft className="h-3 w-3" /> Switch Summary
            </p>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Switch Amount</span>
              <span className="font-semibold">{fmt(netSwitchAmount)}</span>
            </div>
            {totalFee > 0 && (
              <div className="flex justify-between text-sm text-muted-foreground">
                <span>Total Fees</span>
                <span className="text-destructive">+ {fmt(totalFee)}</span>
              </div>
            )}
            <div className="flex justify-between text-sm text-muted-foreground">
              <span>Gross Redeemed ({fromPoolName})</span>
              <span>{fmt(grossRedemption)}</span>
            </div>
            <Separator />
            <div className="flex justify-between text-sm font-bold text-primary">
              <span>Net to {toPoolName}</span>
              <span>{fmt(netSwitchAmount)}</span>
            </div>
          </div>

          {/* Audit note — required when date changed */}
          {dateChanged && (
            <div className="rounded-xl border-2 border-border bg-muted/30 p-3 space-y-2">
              <div className="flex items-center gap-2 text-sm font-medium text-warning">
                <AlertTriangle className="h-4 w-4" />
                Date Change — Audit Note Required
              </div>
              <p className="text-[11px] text-muted-foreground">
                The transaction date has been changed from <strong>{format(originalDateObj, "dd MMM yyyy")}</strong> to <strong>{format(effectiveDate, "dd MMM yyyy")}</strong>.
                Both pool UPs and units will be recalculated. Please record the reason.
              </p>
              <Textarea
                value={changeNote}
                onChange={(e) => setChangeNote(e.target.value)}
                placeholder="Reason for date change (e.g. 'Corrected to match transaction date')..."
                rows={2}
                className="text-sm"
              />
            </div>
          )}

          {/* Decline reason */}
          {showDecline && (
            <div className="space-y-2">
              <Label>Reason for declining</Label>
              <Textarea
                value={declineReason}
                onChange={(e) => setDeclineReason(e.target.value)}
                placeholder="Reason for declining this switch..."
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
                disabled={isDeclining || !declineReason.trim()}
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
              <Button
                onClick={handleApprove}
                disabled={isApproving || (dateChanged && anyPriceMissing) || (dateChanged && !changeNote.trim())}
              >
                {isApproving
                  ? <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  : <CheckCircle className="h-4 w-4 mr-2" />
                }
                Approve Switch
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default SwitchReviewDialog;
