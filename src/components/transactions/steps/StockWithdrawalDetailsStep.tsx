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
  CalendarIcon, Package, Truck, Building2, Minus, TrendingDown,
  AlertTriangle, Ban, Info, ShieldCheck,
} from "lucide-react";
import type { CourierOption } from "./StockDepositDetailsStep";

export interface StockWithdrawalLineItem {
  itemId: string;
  description: string;
  item_code: string;
  sellPrice: number;
  quantity: number;
  lineValue: number;
}

export interface StockWithdrawalItem {
  id: string;
  description: string;
  item_code: string;
  sell_price: number;
  current_stock: number;
}

interface FeeBreakdownItem {
  name: string;
  amount: number;
  vat: number;
}

interface StockWithdrawalDetailsStepProps {
  items: StockWithdrawalItem[];
  stockLines: StockWithdrawalLineItem[];
  onStockLinesChange: (lines: StockWithdrawalLineItem[]) => void;
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
  feeBreakdown: FeeBreakdownItem[];
  totalAdminFee: number;
  totalVat: number;
  isVatRegistered: boolean;
  formatCurrency: (v: number) => string;
  currentUnitPriceSell: number;
  poolName: string;
  currentHolding: number;
  // Admin fee override
  isStaff?: boolean;
  adminFeeOverridePct?: number | null;
  onAdminFeeOverridePctChange?: (val: number | null) => void;
}

const StockWithdrawalDetailsStep = ({
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
  feeBreakdown,
  totalAdminFee,
  totalVat,
  isVatRegistered,
  formatCurrency,
  currentUnitPriceSell,
  poolName,
  currentHolding,
}: StockWithdrawalDetailsStepProps) => {

  const handleQuantityChange = (itemId: string, qty: number) => {
    const item = items.find((i) => i.id === itemId);
    if (!item) return;
    const clamped = Math.min(Math.max(0, qty), item.current_stock > 0 ? item.current_stock : 9999);
    const existing = stockLines.find((l) => l.itemId === itemId);
    if (clamped <= 0) {
      onStockLinesChange(stockLines.filter((l) => l.itemId !== itemId));
      return;
    }
    const lineValue = clamped * item.sell_price;
    if (existing) {
      onStockLinesChange(stockLines.map((l) =>
        l.itemId === itemId ? { ...l, quantity: clamped, sellPrice: item.sell_price, lineValue } : l
      ));
    } else {
      onStockLinesChange([...stockLines, {
        itemId: item.id,
        description: item.description,
        item_code: item.item_code,
        sellPrice: item.sell_price,
        quantity: clamped,
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
  const grossPoolRedemption = totalStockValue + totalFees;
  const grossUnitsRedeemed = currentUnitPriceSell > 0 ? grossPoolRedemption / currentUnitPriceSell : 0;
  const maxPoolValue = currentHolding * currentUnitPriceSell;
  const isOverHolding = grossPoolRedemption > maxPoolValue && maxPoolValue > 0;
  const hasItems = stockLines.length > 0;

  const deliveryOptions: { key: CourierOption; label: string; sub: string; icon: any; fee?: number; feeVat?: number }[] = [
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
    },
  ];

  return (
    <div className="space-y-4">
      {/* Pool info banner */}
      <div className="flex items-center gap-2 rounded-lg bg-destructive/5 border border-destructive/20 px-3 py-2.5">
        <TrendingDown className="h-4 w-4 text-destructive shrink-0" />
        <div>
          <p className="text-[10px] text-muted-foreground">Withdrawing stock from</p>
          <p className="text-sm font-semibold">{poolName}</p>
        </div>
        {currentHolding > 0 && currentUnitPriceSell > 0 && (
          <div className="ml-auto text-right">
            <p className="text-[10px] text-muted-foreground">Available</p>
            <p className="text-xs font-bold">{currentHolding.toFixed(4)} units ≈ {formatCurrency(maxPoolValue)}</p>
          </div>
        )}
      </div>

      {currentHolding <= 0 && (
        <div className="rounded-xl border-2 border-destructive/40 bg-destructive/5 p-4 flex items-center gap-2">
          <Ban className="h-4 w-4 text-destructive shrink-0" />
          <p className="text-sm text-destructive font-medium">No units held in {poolName}. Stock withdrawal not possible.</p>
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
            <Button variant="outline" className={cn("w-full justify-start text-left font-normal h-10", !transactionDate && "text-muted-foreground")}
              disabled={currentHolding <= 0}
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

      {/* Stock items */}
      <div className="space-y-3">
        <Label className="flex items-center gap-1.5">
          <Package className="h-3.5 w-3.5 text-primary" />
          Select Items &amp; Quantities to Withdraw
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
              const lineValue = qty * item.sell_price;
              const noStock = item.current_stock <= 0;
              return (
                <div
                  key={item.id}
                  className={`rounded-xl border-2 p-3 transition-all ${
                    noStock
                      ? "border-border/40 bg-muted/5 opacity-50"
                      : qty > 0
                      ? "border-destructive/40 bg-destructive/5"
                      : "border-border bg-muted/10"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold truncate">{item.description}</p>
                      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        <span className="text-[10px] text-muted-foreground font-mono bg-muted px-1.5 py-0.5 rounded">{item.item_code}</span>
                        <span className="text-[11px] text-muted-foreground">
                          Value: <span className="font-semibold text-foreground">{formatCurrency(item.sell_price)}</span> ea
                        </span>
                        {item.current_stock > 0 ? (
                          <span className="text-[10px] text-muted-foreground">
                            In stock: <span className="font-semibold text-foreground">{item.current_stock}</span>
                          </span>
                        ) : (
                          <span className="text-[10px] text-destructive font-semibold">Out of stock</span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => handleQuantityChange(item.id, Math.max(0, qty - 1))}
                        disabled={qty === 0 || noStock}
                      >
                        <Minus className="h-3.5 w-3.5" />
                      </Button>
                      <Input
                        type="number"
                        min={0}
                        max={item.current_stock > 0 ? item.current_stock : undefined}
                        value={qty || ""}
                        placeholder="0"
                        onChange={(e) => handleQuantityChange(item.id, parseInt(e.target.value) || 0)}
                        className="w-16 text-center h-8 font-bold text-sm"
                        disabled={noStock}
                      />
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => handleQuantityChange(item.id, qty + 1)}
                        disabled={noStock || (item.current_stock > 0 && qty >= item.current_stock)}
                      >
                        <span className="text-lg leading-none">+</span>
                      </Button>
                    </div>
                  </div>
                  {qty > 0 && (
                    <div className="mt-2 flex justify-between text-xs text-muted-foreground border-t border-border pt-2">
                      <span>{qty} × {formatCurrency(item.sell_price)}</span>
                      <span className="font-bold text-destructive">{formatCurrency(lineValue)}</span>
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
                <Icon className={`h-5 w-5 ${isSelected ? "text-primary" : "text-muted-foreground"}`} />
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

      {/* Live breakdown */}
      {hasItems && totalStockValue > 0 && (
        <div className="rounded-xl border-2 border-border bg-muted/20 p-4 space-y-2.5 animate-fade-in">
          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <TrendingDown className="h-3 w-3" /> Stock Withdrawal Breakdown
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

          {feeBreakdown.map((b, i) => (
            <div key={i} className="flex justify-between text-sm text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <Minus className="h-3 w-3" /> {b.name}
                {b.vat > 0 && <span className="text-[9px] text-amber-600">(incl. VAT)</span>}
              </span>
              <span>+ {formatCurrency(b.amount)}</span>
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
              <span>+ {formatCurrency(activeCourierFee)}</span>
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

          <div className="flex justify-between text-sm font-bold text-destructive">
            <span>Gross Pool Redemption</span>
            <span>{formatCurrency(grossPoolRedemption)}</span>
          </div>

          {currentUnitPriceSell > 0 && (
            <div className="flex justify-between text-sm text-muted-foreground">
              <span>Units @ {formatCurrency(currentUnitPriceSell)} (Sell)</span>
              <span className="font-mono font-bold">{grossUnitsRedeemed.toFixed(4)}</span>
            </div>
          )}

          {isOverHolding && (
            <div className="flex items-center gap-2 text-xs text-destructive mt-1">
              <Ban className="h-3.5 w-3.5" />
              Redemption ({formatCurrency(grossPoolRedemption)}) exceeds available balance of {formatCurrency(maxPoolValue)}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default StockWithdrawalDetailsStep;
