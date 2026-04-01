import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import {
  CalendarIcon, ArrowRightLeft, TrendingUp, TrendingDown,
  AlertTriangle, Ban, Minus, CheckCircle,
} from "lucide-react";

interface FeeBreakdownItem {
  name: string;
  amount: number;
  vat: number;
  gl_account_id?: string | null;
}

interface Pool {
  id: string;
  name: string;
  description?: string;
}

interface SwitchDetailsStepProps {
  // From-pool (already selected in previous step)
  fromPoolId: string;
  fromPoolName: string;
  currentHolding: number;          // units held in from-pool
  currentUnitPrice: number;        // sell price for from-pool

  // To-pool selection
  toPools: Pool[];                  // eligible target pools (all except from-pool)
  toPoolId: string;
  onToPoolSelect: (id: string) => void;
  toPoolUnitPrice: number;          // buy price for to-pool

  // Amount / All-units toggle
  amount: string;
  onAmountChange: (val: string) => void;
  useAllUnits: boolean;
  onUseAllUnitsChange: (val: boolean) => void;

  // Fees
  feeBreakdown: FeeBreakdownItem[];
  totalVat: number;
  isVatRegistered: boolean;
  totalFee: number;

  // Computed
  grossRedemptionAmount: number;  // amount from pool to cover payout + fees
  netSwitchAmount: number;        // amount going into to-pool (gross - fees)
  fromUnitsRedeemed: number;      // total units redeemed from from-pool
  toUnitsAcquired: number;        // units purchased in to-pool

  notes: string;
  onNotesChange: (val: string) => void;
  formatCurrency: (v: number) => string;
  transactionDate: Date;
  onTransactionDateChange: (date: Date) => void;
  // Admin fee override
  isStaff?: boolean;
  adminFeeOverridePct?: number | null;
  onAdminFeeOverridePctChange?: (val: number | null) => void;
}

const POOL_COLORS = [
  { bg: "bg-emerald-500/10", border: "border-emerald-500/60", icon: "text-emerald-600 dark:text-emerald-400", ring: "ring-emerald-500/20" },
  { bg: "bg-sky-500/10", border: "border-sky-500/60", icon: "text-sky-600 dark:text-sky-400", ring: "ring-sky-500/20" },
  { bg: "bg-violet-500/10", border: "border-violet-500/60", icon: "text-violet-600 dark:text-violet-400", ring: "ring-violet-500/20" },
  { bg: "bg-amber-500/10", border: "border-amber-500/60", icon: "text-amber-600 dark:text-amber-400", ring: "ring-amber-500/20" },
  { bg: "bg-rose-500/10", border: "border-rose-500/60", icon: "text-rose-600 dark:text-rose-400", ring: "ring-rose-500/20" },
];

const SwitchDetailsStep = ({
  fromPoolId, fromPoolName, currentHolding, currentUnitPrice,
  toPools, toPoolId, onToPoolSelect, toPoolUnitPrice,
  amount, onAmountChange, useAllUnits, onUseAllUnitsChange,
  feeBreakdown, totalVat, isVatRegistered, totalFee,
  grossRedemptionAmount, netSwitchAmount, fromUnitsRedeemed, toUnitsAcquired,
  notes, onNotesChange, formatCurrency, transactionDate, onTransactionDateChange,
  isStaff = false, adminFeeOverridePct, onAdminFeeOverridePctChange,
}: SwitchDetailsStepProps) => {
  const [displayAmount, setDisplayAmount] = useState(amount || "");

  const formatDisplay = (raw: string) => {
    if (!raw) return "";
    const num = parseFloat(raw);
    if (isNaN(num)) return raw;
    const [int, dec] = num.toFixed(2).split(".");
    return int.replace(/\B(?=(\d{3})+(?!\d))/g, " ") + "." + dec;
  };

  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setDisplayAmount(val);
    onAmountChange(val.replace(/\s/g, ""));
  };

  const handleBlur = () => setDisplayAmount(formatDisplay(amount));
  const handleFocus = () => setDisplayAmount(amount || "");

  const maxSwitchValue = currentHolding * currentUnitPrice;
  const isOverHolding = grossRedemptionAmount > maxSwitchValue && maxSwitchValue > 0;
  const isInsufficientHolding = currentHolding <= 0;
  const amountNum = parseFloat(amount) || 0;

  return (
    <div className="space-y-4">
      {/* From pool summary */}
      <div className="rounded-xl bg-orange-500/5 border-2 border-orange-500/30 p-3 flex items-center gap-3">
        <div className="h-9 w-9 rounded-lg bg-orange-500/10 flex items-center justify-center shrink-0">
          <TrendingDown className="h-4 w-4 text-orange-600 dark:text-orange-400" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Switching From</p>
          <p className="text-sm font-bold truncate">{fromPoolName}</p>
          {currentHolding > 0 && (
            <p className="text-[11px] text-muted-foreground">
              {currentHolding.toFixed(5)} units ≈ {formatCurrency(maxSwitchValue)}
            </p>
          )}
        </div>
      </div>

      {isInsufficientHolding && (
        <div className="rounded-xl border-2 border-destructive/40 bg-destructive/5 p-4 flex items-center gap-2">
          <Ban className="h-4 w-4 text-destructive shrink-0" />
          <p className="text-sm text-destructive font-medium">No units held in {fromPoolName}. Switch not possible.</p>
        </div>
      )}

      {/* Transaction Date */}
      <div className="space-y-2">
        <Label className="flex items-center gap-1.5">
          <CalendarIcon className="h-3.5 w-3.5 text-primary" />
          Transaction Date
        </Label>
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              className={cn("w-full justify-start text-left font-normal h-10", !transactionDate && "text-muted-foreground")}
            >
              <CalendarIcon className="mr-2 h-4 w-4" />
              {transactionDate ? format(transactionDate, "PPP") : <span>Pick a date</span>}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              selected={transactionDate}
              onSelect={(d) => d && onTransactionDateChange(d)}
              disabled={(d) => d > new Date()}
              initialFocus
              className={cn("p-3 pointer-events-auto")}
            />
          </PopoverContent>
        </Popover>
      </div>

      {/* All units toggle */}
      <div className="flex items-center justify-between rounded-xl border-2 border-border p-3">
        <div>
          <p className="text-sm font-medium">Switch All Units</p>
          <p className="text-[11px] text-muted-foreground">
            Redeem all holdings — fees deducted first, remainder switches to new pool
          </p>
        </div>
        <Switch checked={useAllUnits} onCheckedChange={onUseAllUnitsChange} disabled={isInsufficientHolding} />
      </div>

      {/* Amount input — hidden when "all units" is active */}
      {!useAllUnits && (
        <div className="space-y-2">
          <Label className="flex items-center gap-1.5">
            <ArrowRightLeft className="h-3.5 w-3.5 text-primary" />
            Switch Amount (R) — amount to receive in new pool
          </Label>
          <Input
            type="text"
            inputMode="decimal"
            placeholder="0.00"
            value={displayAmount}
            onChange={handleAmountChange}
            onFocus={handleFocus}
            onBlur={handleBlur}
            className="text-lg font-bold h-12"
            disabled={isInsufficientHolding}
          />
          {maxSwitchValue > 0 && (
            <p className="text-xs text-muted-foreground">
              Available: <span className="font-semibold">{formatCurrency(maxSwitchValue)}</span>
            </p>
          )}
          {isOverHolding && (
            <div className="flex items-center gap-2 text-xs text-destructive">
              <AlertTriangle className="h-3.5 w-3.5" />
              Gross redemption ({formatCurrency(grossRedemptionAmount)}) exceeds available balance of {formatCurrency(maxSwitchValue)}
            </div>
          )}
        </div>
      )}

      {/* Live breakdown */}
      {(useAllUnits || amountNum > 0) && !isInsufficientHolding && (
        <div className="rounded-xl border-2 border-border bg-muted/20 p-4 space-y-2.5 animate-fade-in">
          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <ArrowRightLeft className="h-3 w-3" /> Switch Breakdown
          </p>

          <div className="flex justify-between text-sm font-semibold">
            <span>{useAllUnits ? "All Holdings" : "Switch Amount"}</span>
            <span>{useAllUnits ? formatCurrency(maxSwitchValue) : formatCurrency(amountNum)}</span>
          </div>

          {feeBreakdown.map((b, i) => (
            <div key={i} className="flex justify-between text-sm text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <Minus className="h-3 w-3" /> {b.name}
                {b.vat > 0 && <span className="text-[9px] text-warning">(incl. VAT)</span>}
              </span>
              <span>+ {formatCurrency(b.amount)}</span>
            </div>
          ))}

          {isVatRegistered && totalVat > 0 && (
            <div className="flex justify-between text-[11px] text-warning italic">
              <span>↳ Total VAT included in fees</span>
              <span>{formatCurrency(totalVat)}</span>
            </div>
          )}

          <Separator />

          <div className="flex justify-between text-sm font-bold text-orange-600 dark:text-orange-400">
            <span>Gross Redeemed from {fromPoolName}</span>
            <span>{formatCurrency(grossRedemptionAmount)}</span>
          </div>
          {currentUnitPrice > 0 && (
            <div className="flex justify-between text-sm text-muted-foreground">
              <span>Units redeemed @ {formatCurrency(currentUnitPrice, "R", 5)} <span className="text-[10px] font-semibold text-orange-600 dark:text-orange-400">(UP Sell)</span></span>
              <span className="font-mono font-bold">{fromUnitsRedeemed.toFixed(5)}</span>
            </div>
          )}

          <Separator />

          <div className="flex justify-between text-sm font-bold text-emerald-600 dark:text-emerald-400">
            <span>Net Switching to New Pool</span>
            <span>{formatCurrency(netSwitchAmount)}</span>
          </div>
          {toPoolUnitPrice > 0 && toPoolId && (
            <div className="flex justify-between text-sm text-muted-foreground">
              <span>Units acquired @ {formatCurrency(toPoolUnitPrice, "R", 5)} <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">(UP Buy)</span></span>
              <span className="font-mono font-bold">{toUnitsAcquired.toFixed(5)}</span>
            </div>
          )}

          {isOverHolding && !useAllUnits && (
            <div className="flex items-center gap-2 text-xs text-destructive mt-1">
              <Ban className="h-3.5 w-3.5" />
              Gross redemption exceeds available balance — reduce amount or use "Switch All Units"
            </div>
          )}
        </div>
      )}

      {/* To-pool selection */}
      <div className="space-y-2">
        <Label className="flex items-center gap-2">
          <TrendingUp className="h-3.5 w-3.5 text-primary" />
          Switch To Pool
        </Label>
        <div className="grid gap-2.5">
          {toPools.map((p, idx) => {
            const colors = POOL_COLORS[idx % POOL_COLORS.length];
            const isSelected = toPoolId === p.id;
            return (
              <button
                key={p.id}
                onClick={() => onToPoolSelect(p.id)}
                className={`flex items-center gap-4 p-4 rounded-xl border-2 text-left transition-all duration-200 ${
                  isSelected
                    ? `${colors.bg} ${colors.border} shadow-md ring-2 ${colors.ring} scale-[1.01]`
                    : "border-border hover:border-primary/30 hover:bg-muted/20"
                }`}
              >
                <div className={`h-10 w-10 rounded-lg flex items-center justify-center shrink-0 ${isSelected ? colors.bg : "bg-muted"}`}>
                  <TrendingUp className={`h-5 w-5 ${isSelected ? colors.icon : "text-muted-foreground"}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm">{p.name}</p>
                  {p.description && (
                    <p className="text-xs text-muted-foreground truncate">{p.description}</p>
                  )}
                </div>
                <div className="flex flex-col items-end gap-1">
                  <Badge variant="outline" className="text-[10px] shrink-0 font-mono">
                    {formatCurrency(toPoolUnitPrice > 0 && isSelected ? toPoolUnitPrice : 0, "R", 5)}/u
                  </Badge>
                  {isSelected && <CheckCircle className="h-4 w-4 text-primary" />}
                </div>
              </button>
            );
          })}
          {toPools.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">No other pools available to switch to.</p>
          )}
        </div>
      </div>

      {/* Admin Fee Override — staff only */}
      {isStaff && onAdminFeeOverridePctChange && (
        <div className="rounded-xl border-2 border-primary/30 bg-primary/5 p-3 space-y-1.5">
          <Label className="flex items-center gap-1.5 text-xs font-bold">
            <AlertTriangle className="h-3.5 w-3.5 text-primary" />
            Admin Fee Override (Staff Only)
          </Label>
          <div className="flex items-center gap-2">
            <Input type="number" step="0.01" min="0" max="100" placeholder="Default %"
              value={adminFeeOverridePct != null ? String(adminFeeOverridePct) : ""}
              onChange={(e) => { const v = e.target.value; if (v === "" || v === null) { onAdminFeeOverridePctChange(null); } else { const n = parseFloat(v); if (!isNaN(n) && n >= 0 && n <= 100) onAdminFeeOverridePctChange(n); } }}
              className="w-28 h-8 text-sm font-bold" />
            <span className="text-xs text-muted-foreground">%</span>
            {adminFeeOverridePct != null && (<button type="button" onClick={() => onAdminFeeOverridePctChange(null)} className="text-xs text-primary underline">Reset to default</button>)}
          </div>
          <p className="text-[10px] text-muted-foreground">Leave blank to use the standard fee schedule. Enter 0 for no admin fee.</p>
        </div>
      )}

      {/* Notes */}
      <div className="space-y-2">
        <Label>Notes (optional)</Label>
        <Textarea
          value={notes}
          onChange={(e) => onNotesChange(e.target.value)}
          rows={2}
          placeholder="Reason for switch..."
          className="resize-none"
        />
      </div>
    </div>
  );
};

export default SwitchDetailsStep;
