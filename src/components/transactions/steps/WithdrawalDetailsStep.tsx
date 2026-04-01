import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { CalendarIcon, TrendingDown, AlertTriangle, Ban, Wallet, Info } from "lucide-react";

export interface WithdrawalPoolEntry {
  poolId: string;
  poolName: string;
  holdingUnits: number;
  holdingValue: number;
  unitPrice: number;
  /** Amount in Rand the user typed (if inputMode = "amount") */
  amountInput: string;
  /** Units the user typed (if inputMode = "units") */
  unitsInput: string;
  inputMode: "amount" | "units";
  useAllUnits: boolean;
}

export interface WithdrawalPoolSummary {
  poolId: string;
  poolName: string;
  netPayout: number;
  grossAmount: number;
  totalFee: number;
  feeBreakdown: { name: string; amount: number; vat: number }[];
  unitPrice: number;
  units: number;
  holdingUnits: number;
  holdingValue: number;
  isOverHolding: boolean;
}

interface WithdrawalDetailsStepProps {
  poolEntries: WithdrawalPoolEntry[];
  onPoolEntryChange: (poolId: string, changes: Partial<WithdrawalPoolEntry>) => void;
  withdrawalSummaries: WithdrawalPoolSummary[];
  notes: string;
  onNotesChange: (val: string) => void;
  isVatRegistered: boolean;
  formatCurrency: (v: number) => string;
  transactionDate: Date;
  onTransactionDateChange: (date: Date) => void;
  isStaff?: boolean;
  adminFeeOverridePct?: number | null;
  onAdminFeeOverridePctChange?: (val: number | null) => void;
}

const WithdrawalDetailsStep = ({
  poolEntries,
  onPoolEntryChange,
  withdrawalSummaries,
  notes,
  onNotesChange,
  isVatRegistered,
  formatCurrency,
  transactionDate,
  onTransactionDateChange,
  isStaff = false,
  adminFeeOverridePct,
  onAdminFeeOverridePctChange,
}: WithdrawalDetailsStepProps) => {
  const anyOverHolding = withdrawalSummaries.some((s) => s.isOverHolding);
  const totalNetPayout = withdrawalSummaries.reduce((sum, s) => sum + s.netPayout, 0);
  const totalGross = withdrawalSummaries.reduce((sum, s) => sum + s.grossAmount, 0);

  return (
    <div className="space-y-5">
      {/* Transaction Date */}
      <div className="space-y-2">
        <Label className="flex items-center gap-1.5">
          <CalendarIcon className="h-3.5 w-3.5 text-primary" />
          Transaction Date
        </Label>
        <p className="text-[10px] text-muted-foreground">
          Unit prices will be based on this date. Default is today.
        </p>
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
              onSelect={(date) => date && onTransactionDateChange(date)}
              disabled={(d) => d > new Date()}
              initialFocus
              className={cn("p-3 pointer-events-auto")}
            />
          </PopoverContent>
        </Popover>
      </div>

      {/* Per-pool entries */}
      <div className="space-y-4">
        <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
          <TrendingDown className="h-3 w-3" /> Withdrawal per Pool
        </p>

        {poolEntries.map((entry, idx) => {
          const summary = withdrawalSummaries.find((s) => s.poolId === entry.poolId);
          const colors = [
            "border-emerald-500/40 bg-emerald-500/5",
            "border-sky-500/40 bg-sky-500/5",
            "border-violet-500/40 bg-violet-500/5",
            "border-amber-500/40 bg-amber-500/5",
            "border-rose-500/40 bg-rose-500/5",
          ][idx % 5];
          const isOver = summary?.isOverHolding ?? false;

          return (
            <div
              key={entry.poolId}
              className={`rounded-xl border-2 p-4 space-y-3 ${isOver ? "border-destructive/40 bg-destructive/5" : colors}`}
            >
              {/* Header */}
              <div className="flex items-center justify-between">
                <span className="font-semibold text-sm">{entry.poolName}</span>
                <Badge variant="outline" className="text-[10px] font-mono">
                  {entry.holdingUnits.toFixed(4)} units ≈ {formatCurrency(entry.holdingValue)}
                </Badge>
              </div>

              {/* Use all units toggle */}
              <div className="flex items-center justify-between">
                <Label className="text-xs text-muted-foreground cursor-pointer" htmlFor={`all-${entry.poolId}`}>
                  Redeem all units
                </Label>
                <Switch
                  id={`all-${entry.poolId}`}
                  checked={entry.useAllUnits}
                  onCheckedChange={(checked) =>
                    onPoolEntryChange(entry.poolId, {
                      useAllUnits: checked,
                      amountInput: checked ? entry.holdingValue.toFixed(2) : "",
                      unitsInput: checked ? entry.holdingUnits.toFixed(4) : "",
                    })
                  }
                />
              </div>

              {!entry.useAllUnits && (
                <>
                  {/* Input mode toggle */}
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => onPoolEntryChange(entry.poolId, { inputMode: "amount", unitsInput: "" })}
                      className={`flex-1 rounded-lg border py-1.5 text-xs font-medium transition-colors ${
                        entry.inputMode === "amount"
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-muted text-muted-foreground border-border hover:border-primary/40"
                      }`}
                    >
                      Amount (R)
                    </button>
                    <button
                      type="button"
                      onClick={() => onPoolEntryChange(entry.poolId, { inputMode: "units", amountInput: "" })}
                      className={`flex-1 rounded-lg border py-1.5 text-xs font-medium transition-colors ${
                        entry.inputMode === "units"
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-muted text-muted-foreground border-border hover:border-primary/40"
                      }`}
                    >
                      Units
                    </button>
                  </div>

                  {entry.inputMode === "amount" ? (
                    <div className="space-y-1">
                      <Label className="text-xs flex items-center gap-1">
                        <Wallet className="h-3 w-3 text-primary" /> Net Payout Amount (R)
                      </Label>
                      <Input
                        type="number"
                        inputMode="decimal"
                        placeholder="0.00"
                        value={entry.amountInput}
                        onChange={(e) => onPoolEntryChange(entry.poolId, { amountInput: e.target.value })}
                        className="h-10 font-bold"
                      />
                    </div>
                  ) : (
                    <div className="space-y-1">
                      <Label className="text-xs">Units to Redeem</Label>
                      <Input
                        type="number"
                        inputMode="decimal"
                        placeholder="0.0000"
                        value={entry.unitsInput}
                        onChange={(e) => onPoolEntryChange(entry.poolId, { unitsInput: e.target.value })}
                        className="h-10 font-bold font-mono"
                      />
                      {entry.unitPrice > 0 && parseFloat(entry.unitsInput) > 0 && (
                        <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                          <Info className="h-3 w-3" />
                          ≈ {formatCurrency(parseFloat(entry.unitsInput) * entry.unitPrice)} gross at {formatCurrency(entry.unitPrice)}/unit
                        </p>
                      )}
                    </div>
                  )}
                </>
              )}

              {/* Live breakdown */}
              {summary && (summary.netPayout > 0 || summary.units > 0) && (
                <div className="rounded-lg bg-background/60 border border-border p-3 space-y-1.5 animate-fade-in">
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    <span>Net Payout</span>
                    <span className="font-semibold text-foreground text-right">{formatCurrency(summary.netPayout)}</span>
                    {summary.totalFee > 0 && (
                      <>
                        <span>+ Fees</span>
                        <span className="text-right">{formatCurrency(summary.totalFee)}</span>
                      </>
                    )}
                    <span>Gross Redeemed</span>
                    <span className="font-bold text-primary text-right">{formatCurrency(summary.grossAmount)}</span>
                    <span>Available</span>
                    <span className="text-right">{formatCurrency(summary.holdingValue)}</span>
                    <span>Units @ {formatCurrency(summary.unitPrice)}</span>
                    <span className="font-mono text-right">{summary.units.toFixed(4)}</span>
                  </div>
                  {isOver && (
                    <div className="flex items-center gap-1.5 text-xs text-destructive mt-1">
                      <AlertTriangle className="h-3.5 w-3.5" />
                      Exceeds available balance — reduce amount
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Totals */}
      {withdrawalSummaries.length > 0 && totalGross > 0 && (
        <div className="space-y-2 animate-fade-in">
          <Separator />
          {withdrawalSummaries.length > 1 && (
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>Total Gross Redeemed</span>
              <span className="font-semibold">{formatCurrency(totalGross)}</span>
            </div>
          )}
          {anyOverHolding ? (
            <div className="rounded-lg bg-destructive/10 border border-destructive/30 px-4 py-3 text-sm font-semibold text-destructive flex items-center gap-2">
              <Ban className="h-4 w-4" /> One or more pools have insufficient holdings.
            </div>
          ) : (
            <div className="rounded-xl border-2 border-primary/30 bg-primary/5 px-4 py-3 flex items-center justify-between">
              <span className="text-sm font-bold">Total Net Payout</span>
              <span className="text-lg font-bold text-primary">{formatCurrency(totalNetPayout)}</span>
            </div>
          )}
        </div>
      )}

      {/* Notes */}
      <div className="space-y-2">
        <Label>Notes (optional)</Label>
        <Textarea
          value={notes}
          onChange={(e) => onNotesChange(e.target.value)}
          rows={2}
          placeholder="Reason for withdrawal or reference..."
          className="resize-none"
        />
      </div>
    </div>
  );
};

export default WithdrawalDetailsStep;
