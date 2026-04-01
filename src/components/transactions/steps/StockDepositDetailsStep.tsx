import { useState } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import {
  CalendarIcon, Package, Truck, Building2, Minus, TrendingUp,
  Award, CreditCard, Wallet, AlertTriangle, Ban, Info, ShieldCheck, ShieldOff,
} from "lucide-react";

export type CourierOption = "insured" | "uninsured" | "collect";

export interface StockItem {
  id: string;
  description: string;
  item_code: string;
  buy_price_incl_vat: number;
}

export interface StockLineItem {
  itemId: string;
  description: string;
  item_code: string;
  costPrice: number;
  quantity: number;
  lineValue: number;
}

interface JoinShareInfo {
  needed: boolean;
  shareCost: number;
  membershipFee: number;
  membershipFeeVat: number;
  shareClassName: string;
}

interface FeeBreakdownItem {
  name: string;
  amount: number;
  vat: number;
}

interface StockDepositDetailsStepProps {
  items: StockItem[];
  stockLines: StockLineItem[];
  onStockLinesChange: (lines: StockLineItem[]) => void;
  courierOption: CourierOption;
  onCourierOptionChange: (v: CourierOption) => void;
  courierFeeInsured: number;
  courierFeeInsuredVat: number;
  courierFeeUninsured: number;
  courierFeeUninsuredVat: number;
  notes: string;
  onNotesChange: (v: string) => void;
  transactionDate: Date;
  onTransactionDateChange: (d: Date) => void;
  joinShareInfo: JoinShareInfo;
  feeBreakdown: FeeBreakdownItem[];
  totalAdminFee: number;
  totalVat: number;
  isVatRegistered: boolean;
  formatCurrency: (v: number) => string;
  currentUnitPriceBuy: number;
  poolName: string;
  // Admin fee override
  isStaff?: boolean;
  adminFeeOverridePct?: number | null;
  onAdminFeeOverridePctChange?: (val: number | null) => void;
}

const StockDepositDetailsStep = ({
  items,
  stockLines,
  onStockLinesChange,
  courierOption,
  onCourierOptionChange,
  courierFeeInsured,
  courierFeeInsuredVat,
  courierFeeUninsured,
  courierFeeUninsuredVat,
  notes,
  onNotesChange,
  transactionDate,
  onTransactionDateChange,
  joinShareInfo,
  feeBreakdown,
  totalAdminFee,
  totalVat,
  isVatRegistered,
  formatCurrency,
  currentUnitPriceBuy,
  poolName,
  isStaff = false,
  adminFeeOverridePct,
  onAdminFeeOverridePctChange,
}: StockDepositDetailsStepProps) => {

  const handleQuantityChange = (itemId: string, qty: number) => {
    const item = items.find((i) => i.id === itemId);
    if (!item) return;
    const existing = stockLines.find((l) => l.itemId === itemId);
    if (qty <= 0) {
      onStockLinesChange(stockLines.filter((l) => l.itemId !== itemId));
      return;
    }
    const lineValue = qty * item.buy_price_incl_vat;
    if (existing) {
      onStockLinesChange(stockLines.map((l) =>
        l.itemId === itemId ? { ...l, quantity: qty, costPrice: item.buy_price_incl_vat, lineValue } : l
      ));
    } else {
      onStockLinesChange([...stockLines, {
        itemId: item.id,
        description: item.description,
        item_code: item.item_code,
        costPrice: item.buy_price_incl_vat,
        quantity: qty,
        lineValue,
      }]);
    }
  };

  const getQty = (itemId: string) => stockLines.find((l) => l.itemId === itemId)?.quantity ?? 0;

  const totalStockValue = stockLines.reduce((sum, l) => sum + l.lineValue, 0);

  const activeCourierFee = courierOption === "insured"
    ? courierFeeInsured
    : courierOption === "uninsured"
    ? courierFeeUninsured
    : 0;
  const activeCourierFeeVat = courierOption === "insured"
    ? courierFeeInsuredVat
    : courierOption === "uninsured"
    ? courierFeeUninsuredVat
    : 0;

  const totalFees = totalAdminFee + activeCourierFee;
  const membershipDeductions = joinShareInfo.needed ? joinShareInfo.shareCost + joinShareInfo.membershipFee : 0;
  const netForPool = Math.max(0, totalStockValue - membershipDeductions - totalFees);
  const unitsAcquired = currentUnitPriceBuy > 0 ? netForPool / currentUnitPriceBuy : 0;
  const hasItems = stockLines.length > 0;

  const deliveryOptions: { key: CourierOption; label: string; sub: string; icon: any; fee?: number; feeVat?: number; color?: string }[] = [
    {
      key: "insured",
      label: "Courier — Insured",
      sub: "Tracked & insured delivery",
      icon: ShieldCheck,
      fee: courierFeeInsured,
      feeVat: courierFeeInsuredVat,
    },
    {
      key: "uninsured",
      label: "Courier — Uninsured",
      sub: "Standard courier delivery",
      icon: Truck,
      fee: courierFeeUninsured,
      feeVat: courierFeeUninsuredVat,
    },
    {
      key: "collect",
      label: "Collect at Office",
      sub: "Pick up at our offices",
      icon: Building2,
      color: "text-green-600",
    },
  ];

  return (
    <div className="space-y-4">
      {/* Pool info */}
      <div className="flex items-center gap-2 rounded-lg bg-primary/5 border border-primary/20 px-3 py-2.5">
        <TrendingUp className="h-4 w-4 text-primary shrink-0" />
        <div>
          <p className="text-[10px] text-muted-foreground">Depositing into</p>
          <p className="text-sm font-semibold">{poolName}</p>
        </div>
      </div>

      {/* Join share notice */}
      {joinShareInfo.needed && (
        <div className="rounded-xl border-2 border-amber-500/40 bg-amber-500/5 p-4 space-y-2 animate-fade-in">
          <div className="flex items-center gap-2">
            <Award className="h-5 w-5 text-amber-600 dark:text-amber-400" />
            <p className="font-bold text-sm text-amber-700 dark:text-amber-400">First Deposit — Membership Required</p>
          </div>
          <p className="text-xs text-muted-foreground">The following will be deducted from the stock value:</p>
          <div className="grid grid-cols-2 gap-1 text-sm mt-1">
            <span className="text-muted-foreground flex items-center gap-1.5">
              <CreditCard className="h-3.5 w-3.5" /> Join Share ({joinShareInfo.shareClassName})
            </span>
            <span className="font-semibold text-right">{formatCurrency(joinShareInfo.shareCost)}</span>
            <span className="text-muted-foreground flex items-center gap-1.5">
              <Wallet className="h-3.5 w-3.5" /> Membership Fee
            </span>
            <span className="font-semibold text-right">{formatCurrency(joinShareInfo.membershipFee)}</span>
          </div>
        </div>
      )}

      {/* Transaction Date */}
      <div className="space-y-2">
        <Label className="flex items-center gap-1.5">
          <CalendarIcon className="h-3.5 w-3.5 text-primary" />
          Transaction Date
        </Label>
        <p className="text-[10px] text-muted-foreground">Unit prices will be based on this date.</p>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" className={cn("w-full justify-start text-left font-normal h-10", !transactionDate && "text-muted-foreground")}>
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

      {/* Stock items */}
      <div className="space-y-3">
        <Label className="flex items-center gap-1.5">
          <Package className="h-3.5 w-3.5 text-primary" />
          Select Items &amp; Quantities
        </Label>

        {items.length === 0 ? (
          <div className="flex items-center gap-2 rounded-lg bg-muted/40 border border-border px-3 py-4 text-muted-foreground text-sm">
            <Info className="h-4 w-4 shrink-0" />
            No stock items available for this pool.
          </div>
        ) : (
          <div className="space-y-2">
            {items.map((item) => {
              const qty = getQty(item.id);
              const lineValue = qty * item.buy_price_incl_vat;
              return (
                <div
                  key={item.id}
                  className={`rounded-xl border-2 p-3 transition-all ${qty > 0 ? "border-primary/50 bg-primary/5" : "border-border bg-muted/10"}`}
                >
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold truncate">{item.description}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[10px] text-muted-foreground font-mono bg-muted px-1.5 py-0.5 rounded">{item.item_code}</span>
                        <span className="text-[11px] text-muted-foreground">
                          Cost: <span className="font-semibold text-foreground">{formatCurrency(item.buy_price_incl_vat)}</span> ea
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => handleQuantityChange(item.id, Math.max(0, qty - 1))}
                        disabled={qty === 0}
                      >
                        <Minus className="h-3.5 w-3.5" />
                      </Button>
                      <Input
                        type="number"
                        min={0}
                        value={qty || ""}
                        placeholder="0"
                        onChange={(e) => handleQuantityChange(item.id, Math.max(0, parseInt(e.target.value) || 0))}
                        className="w-16 text-center h-8 font-bold text-sm"
                      />
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => handleQuantityChange(item.id, qty + 1)}
                      >
                        <span className="text-lg leading-none">+</span>
                      </Button>
                    </div>
                  </div>
                  {qty > 0 && (
                    <div className="mt-2 flex justify-between text-xs text-muted-foreground border-t border-border pt-2">
                      <span>{qty} × {formatCurrency(item.buy_price_incl_vat)}</span>
                      <span className="font-bold text-primary">{formatCurrency(lineValue)}</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Delivery method — 3 options */}
      <div className="space-y-2">
        <Label className="flex items-center gap-1.5">
          <Truck className="h-3.5 w-3.5 text-primary" />
          Delivery Method
        </Label>
        <div className="grid grid-cols-3 gap-2">
          {deliveryOptions.map((opt) => {
            const Icon = opt.icon;
            const isSelected = courierOption === opt.key;
            return (
              <button
                key={opt.key}
                onClick={() => onCourierOptionChange(opt.key)}
                className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 text-center transition-all ${
                  isSelected
                    ? "border-primary bg-primary/5 shadow-sm"
                    : "border-border hover:border-primary/30 opacity-70 hover:opacity-100"
                }`}
              >
                <Icon className={`h-5 w-5 ${isSelected ? "text-primary" : opt.color || "text-muted-foreground"}`} />
                <div>
                  <p className="text-[11px] font-semibold leading-tight">{opt.label}</p>
                  <p className="text-[9px] text-muted-foreground mt-0.5">{opt.sub}</p>
                  {opt.key === "collect" ? (
                    <p className="text-[10px] font-bold text-green-600 mt-1">No courier fee</p>
                  ) : opt.fee != null && opt.fee > 0 ? (
                    <p className="text-[10px] font-bold text-primary mt-1">
                      {formatCurrency(opt.fee)}{opt.feeVat && opt.feeVat > 0 ? " incl. VAT" : ""}
                    </p>
                  ) : (
                    <p className="text-[10px] font-bold text-muted-foreground mt-1">No charge</p>
                  )}
                </div>
              </button>
            );
          })}
        </div>
        {courierOption !== "collect" && (
          <div className="flex items-center gap-2 text-xs text-amber-600 dark:text-amber-400 bg-amber-500/10 rounded-lg px-3 py-2">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            {courierOption === "insured"
              ? `Insured courier fee of ${formatCurrency(courierFeeInsured)} is indicative and may be finalised at dispatch.`
              : `Uninsured courier fee of ${formatCurrency(courierFeeUninsured)} is indicative and may be finalised at dispatch.`}
          </div>
        )}
      </div>

      {/* Admin fee override moved into breakdown box below */}

      {/* Notes */}
      <div className="space-y-2">
        <Label>Notes (optional)</Label>
        <Textarea
          value={notes}
          onChange={(e) => onNotesChange(e.target.value)}
          rows={2}
          placeholder="Reference or notes..."
          className="resize-none"
        />
      </div>

      {/* Live breakdown */}
      {hasItems && totalStockValue > 0 && (
        <div className="rounded-xl border-2 border-border bg-muted/20 p-4 space-y-2.5 animate-fade-in">
          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <TrendingUp className="h-3 w-3" /> Stock Deposit Breakdown
          </p>

          <div className="flex justify-between text-sm font-semibold">
            <span>Total Stock Value</span>
            <span>{formatCurrency(totalStockValue)}</span>
          </div>

          {stockLines.map((l) => (
            <div key={l.itemId} className="flex justify-between text-xs text-muted-foreground">
              <span>{l.quantity} × {l.description}</span>
              <span>{formatCurrency(l.lineValue)}</span>
            </div>
          ))}

          <Separator />

          {joinShareInfo.needed && (
            <>
              <div className="flex justify-between text-sm text-amber-700 dark:text-amber-400">
                <span className="flex items-center gap-1.5"><Minus className="h-3 w-3" /> Join Share</span>
                <span>- {formatCurrency(joinShareInfo.shareCost)}</span>
              </div>
              <div className="flex justify-between text-sm text-amber-700 dark:text-amber-400">
                <span className="flex items-center gap-1.5"><Minus className="h-3 w-3" /> Membership Fee</span>
                <span>- {formatCurrency(joinShareInfo.membershipFee)}</span>
              </div>
              {joinShareInfo.membershipFeeVat > 0 && (
                <div className="flex justify-between text-[11px] text-amber-600 italic">
                  <span>↳ VAT included in membership fee</span>
                  <span>{formatCurrency(joinShareInfo.membershipFeeVat)}</span>
                </div>
              )}
            </>
          )}

          {/* Admin Fee Override — inline in breakdown */}
          {isStaff && onAdminFeeOverridePctChange && (
            <div className="flex items-center gap-2 py-1">
              <Label className="text-xs font-bold flex items-center gap-1 whitespace-nowrap">
                <AlertTriangle className="h-3 w-3 text-primary" />
                Admin Fee %
              </Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                max="100"
                placeholder="Default"
                value={adminFeeOverridePct != null ? String(adminFeeOverridePct) : ""}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === "" || v === null) {
                    onAdminFeeOverridePctChange(null);
                  } else {
                    const n = parseFloat(v);
                    if (!isNaN(n) && n >= 0 && n <= 100) onAdminFeeOverridePctChange(n);
                  }
                }}
                className="w-20 h-7 text-xs font-bold"
              />
              <span className="text-[10px] text-muted-foreground">%</span>
              {adminFeeOverridePct != null && (
                <button
                  type="button"
                  onClick={() => onAdminFeeOverridePctChange(null)}
                  className="text-[10px] text-primary underline"
                >
                  Reset
                </button>
              )}
            </div>
          )}

          {feeBreakdown.map((b, i) => (
            <div key={i} className="flex justify-between text-sm text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <Minus className="h-3 w-3" /> {b.name}
                {b.vat > 0 && <span className="text-[9px] text-amber-600">(incl. VAT)</span>}
              </span>
              <span>- {formatCurrency(b.amount)}</span>
            </div>
          ))}

          {courierOption !== "collect" && activeCourierFee > 0 && (
            <div className="flex justify-between text-sm text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <Minus className="h-3 w-3" />
                {courierOption === "insured" ? <ShieldCheck className="h-3 w-3" /> : <Truck className="h-3 w-3" />}
                {courierOption === "insured" ? "Courier (Insured)" : "Courier (Uninsured)"}
                {activeCourierFeeVat > 0 && <span className="text-[9px] text-amber-600">(incl. VAT)</span>}
              </span>
              <span>- {formatCurrency(activeCourierFee)}</span>
            </div>
          )}
          {isVatRegistered && activeCourierFeeVat > 0 && courierOption !== "collect" && (
            <div className="flex justify-between text-[11px] text-amber-600 italic">
              <span>↳ VAT included in courier fee</span>
              <span>{formatCurrency(activeCourierFeeVat)}</span>
            </div>
          )}

          {isVatRegistered && totalVat > 0 && (
            <div className="flex justify-between text-[11px] text-amber-600 italic">
              <span>↳ Total VAT included in fees</span>
              <span>{formatCurrency(totalVat)}</span>
            </div>
          )}

          <Separator />

          <div className="flex justify-between text-sm font-bold text-primary">
            <span>Net Value for Pool</span>
            <span>{formatCurrency(netForPool)}</span>
          </div>

          {currentUnitPriceBuy > 0 && netForPool > 0 && (
            <div className="flex justify-between text-sm text-muted-foreground">
              <span>Units @ {formatCurrency(currentUnitPriceBuy)}</span>
              <span className="font-mono font-bold text-primary">{unitsAcquired.toFixed(5)}</span>
            </div>
          )}

          {netForPool <= 0 && (
            <div className="flex items-center gap-2 text-xs text-destructive">
              <Ban className="h-3.5 w-3.5" />
              Fees exceed stock value — please add more items.
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default StockDepositDetailsStep;
