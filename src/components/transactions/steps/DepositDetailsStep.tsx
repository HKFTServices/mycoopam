import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Upload, FileText, X, AlertTriangle, Award, CreditCard, TrendingUp, Minus, Wallet, Ban, CalendarIcon } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

const PAYMENT_METHODS = [
  { value: "eft", label: "EFT (Bank Transfer)", icon: "🏦" },
  { value: "cash_deposit", label: "Cash Deposit", icon: "💵" },
  { value: "debit_order", label: "Debit Order", icon: "🔁" },
];

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

interface SplitSummary {
  poolId: string;
  poolName: string;
  percentage: number;
  grossAmount: number;
  netAmount: number;
  unitPrice: number;
  units: number;
}

interface DepositDetailsStepProps {
  amount: string;
  onAmountChange: (val: string) => void;
  paymentMethod: string;
  onPaymentMethodChange: (val: string) => void;
  notes: string;
  onNotesChange: (val: string) => void;
  popFile: File | null;
  onPopFileChange: (file: File | null) => void;
  joinShareInfo: JoinShareInfo;
  feeBreakdown: FeeBreakdownItem[];
  totalVat: number;
  isVatRegistered: boolean;
  commissionAmount: number;
  commissionVat: number;
  commissionPct: number;
  commissionReferrerName: string;
  depositNetAvailable: number;
  splitSummaries: SplitSummary[];
  amountNum: number;
  formatCurrency: (v: number) => string;
  isDeposit: boolean;
  // non-deposit fields
  netAmount?: number;
  currentUnitPrice?: number;
  unitsToTransact?: number;
  currentHolding?: number;
  isWithdrawal?: boolean;
  totalFee?: number;
  transactionDate: Date;
  onTransactionDateChange: (date: Date) => void;
  // Loan repayment
  loanRepaymentAmount?: number;
  onLoanRepaymentAmountChange?: (val: string) => void;
  hasOutstandingLoan?: boolean;
  outstandingLoanBalance?: number;
  loanInstalment?: number;
  loanRepaymentOnly?: boolean;
}

const DepositDetailsStep = ({
  amount, onAmountChange, paymentMethod, onPaymentMethodChange,
  notes, onNotesChange, popFile, onPopFileChange,
  joinShareInfo, feeBreakdown, totalVat = 0, isVatRegistered = false,
  commissionAmount, commissionVat = 0, commissionPct, commissionReferrerName,
  depositNetAvailable, splitSummaries, amountNum, formatCurrency, isDeposit,
  netAmount = 0, currentUnitPrice = 0, unitsToTransact = 0, currentHolding = 0, isWithdrawal = false, totalFee = 0,
  transactionDate, onTransactionDateChange,
  loanRepaymentAmount = 0, onLoanRepaymentAmountChange, hasOutstandingLoan = false,
  outstandingLoanBalance = 0, loanInstalment = 0, loanRepaymentOnly = false,
}: DepositDetailsStepProps) => {
  const [displayAmount, setDisplayAmount] = useState(amount || "");
  const [isFocused, setIsFocused] = useState(false);

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

  const handleBlur = () => {
    setIsFocused(false);
    setDisplayAmount(formatDisplay(amount));
  };

  const handleFocus = () => {
    setIsFocused(true);
    // Show raw value for editing
    setDisplayAmount(amount || "");
  };
  const totalMembershipDeductions = joinShareInfo.needed ? joinShareInfo.shareCost + joinShareInfo.membershipFee : 0;
  const minimumDeposit = totalMembershipDeductions + 1;

  return (
    <div className="space-y-3">
      {/* Join Share Notice */}
      {joinShareInfo.needed && (
        <div className="rounded-xl border-2 border-amber-500/40 bg-amber-500/5 p-4 space-y-2 animate-fade-in">
          <div className="flex items-center gap-2">
            <Award className="h-5 w-5 text-amber-600 dark:text-amber-400" />
            <p className="font-bold text-sm text-amber-700 dark:text-amber-400">First Deposit — Membership Required</p>
          </div>
          <p className="text-xs text-muted-foreground">
            This is the member's first deposit. The following will be deducted before any pool allocation:
          </p>
          <div className="grid grid-cols-2 gap-1 text-sm mt-2">
            <span className="text-muted-foreground flex items-center gap-1.5">
              <CreditCard className="h-3.5 w-3.5" />
              Join Share ({joinShareInfo.shareClassName})
            </span>
            <span className="font-semibold text-right">{formatCurrency(joinShareInfo.shareCost)}</span>
            <span className="text-muted-foreground flex items-center gap-1.5">
              <Wallet className="h-3.5 w-3.5" />
              Membership Fee
            </span>
            <span className="font-semibold text-right">{formatCurrency(joinShareInfo.membershipFee)}</span>
          </div>
          {amountNum > 0 && amountNum < minimumDeposit && (
            <div className="flex items-center gap-2 mt-2 text-destructive text-xs">
              <Ban className="h-3.5 w-3.5" />
              Minimum deposit: {formatCurrency(minimumDeposit)}
            </div>
          )}
        </div>
      )}

      {/* Transaction Date */}
      <div className="space-y-2">
        <Label className="flex items-center gap-1.5">
          <CalendarIcon className="h-3.5 w-3.5 text-primary" />
          Transaction Date
        </Label>
        <p className="text-[10px] text-muted-foreground">
          Unit prices will be based on this date. Default is today.
        </p>
        <Popover modal={false}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              className={cn(
                "w-full justify-start text-left font-normal h-10",
                !transactionDate && "text-muted-foreground"
              )}
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
              initialFocus
              className={cn("p-3 pointer-events-auto")}
            />
          </PopoverContent>
        </Popover>
      </div>

      {/* Amount */}
      <div className="space-y-1.5">
        <Label className="flex items-center gap-1.5">
          <Wallet className="h-3.5 w-3.5 text-primary" />
          Gross Deposit Amount (R)
        </Label>
        <Input
          type="text"
          inputMode="decimal"
          placeholder={loanRepaymentOnly && loanRepaymentAmount > 0 ? formatCurrency(loanRepaymentAmount) : "0.00"}
          value={displayAmount}
          onChange={handleAmountChange}
          onFocus={handleFocus}
          onBlur={handleBlur}
          className="text-base font-bold h-10"
        />
        {!isFocused && !amount && (
          <p className="text-[10px] text-muted-foreground">Use <span className="font-semibold">.</span> as the decimal separator (e.g. 1 500.50)</p>
        )}
        {isWithdrawal && currentHolding > 0 && (
          <p className="text-xs text-muted-foreground">
            Available: {currentHolding.toFixed(4)} units ({formatCurrency(currentHolding * currentUnitPrice)})
          </p>
        )}
      </div>

      {/* Loan Repayment Amount */}
      {hasOutstandingLoan && isDeposit && (
        <div className="rounded-xl border-2 border-amber-500/30 bg-amber-500/5 p-4 space-y-2 animate-fade-in">
          <div className="flex items-center gap-2">
            <Wallet className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            <Label className="text-sm font-semibold text-amber-700 dark:text-amber-400">
              {loanRepaymentOnly ? "Loan Repayment Amount (R)" : "Loan Instalment Deduction (R)"}
            </Label>
          </div>
          <p className="text-[10px] text-muted-foreground">
            Outstanding: {formatCurrency(outstandingLoanBalance)} · Default instalment: {formatCurrency(loanInstalment)}
          </p>
          <Input
            type="text"
            inputMode="decimal"
            placeholder={formatCurrency(loanInstalment)}
            value={loanRepaymentAmount > 0 ? formatCurrency(loanRepaymentAmount) : ""}
            onChange={(e) => onLoanRepaymentAmountChange?.(e.target.value.replace(/[^\d.]/g, ""))}
            className="text-lg font-bold h-10"
          />
          {loanRepaymentAmount > outstandingLoanBalance && outstandingLoanBalance > 0 && (
            <div className="flex items-center gap-2 text-destructive text-xs">
              <AlertTriangle className="h-3.5 w-3.5" />
              Repayment exceeds outstanding balance
            </div>
          )}
        </div>
      )}
      <div className="space-y-2">
        <Label>Payment Method</Label>
        <div className="grid grid-cols-3 gap-2">
          {PAYMENT_METHODS.map((m) => {
            const isSelected = paymentMethod === m.value;
            return (
              <button
                key={m.value}
                onClick={() => onPaymentMethodChange(m.value)}
                className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 text-center transition-all duration-200 ${
                  isSelected
                    ? "border-primary bg-primary/5 shadow-sm"
                    : "border-border hover:border-primary/30 opacity-60 hover:opacity-100"
                }`}
              >
                <span className="text-xl">{m.icon}</span>
                <span className="text-[10px] font-medium leading-tight">{m.label}</span>
              </button>
            );
          })}
        </div>
        {paymentMethod === "cash_deposit" && (
          <div className="flex items-center gap-2 text-xs text-amber-600 dark:text-amber-400 bg-amber-500/10 rounded-lg px-3 py-2">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            Cash Deposit Fee will be applied
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
          placeholder="Reference or notes..."
          className="resize-none"
        />
      </div>

      {/* POP Upload */}
      {isDeposit && (
        <div className="space-y-2">
          <Label className="flex items-center gap-1.5">
            <FileText className="h-3.5 w-3.5 text-primary" />
            Proof of Payment
          </Label>
          <p className="text-[10px] text-muted-foreground">Upload now or provide later during approval.</p>
          {popFile ? (
            <div className="flex items-center gap-3 rounded-xl border-2 border-primary/30 bg-primary/5 p-3">
              <FileText className="h-5 w-5 text-primary shrink-0" />
              <span className="text-sm truncate flex-1 font-medium">{popFile.name}</span>
              <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => onPopFileChange(null)}>
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          ) : (
            <label className="cursor-pointer">
              <input
                type="file"
                className="hidden"
                accept=".pdf,.jpg,.jpeg,.png"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) onPopFileChange(f); }}
              />
              <div className="flex items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border p-5 hover:bg-muted/30 hover:border-primary/30 transition-all">
                <Upload className="h-5 w-5 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Click to upload POP</span>
              </div>
            </label>
          )}
        </div>
      )}

      {/* Live Breakdown */}
      {amountNum > 0 && (
        <div className="rounded-xl border-2 border-border bg-muted/20 p-4 space-y-2.5 animate-fade-in">
          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Live Breakdown</p>

          <div className="flex justify-between text-sm font-semibold">
            <span>Gross Deposit</span>
            <span>{formatCurrency(amountNum)}</span>
          </div>

          {/* Loan Repayment deduction */}
          {hasOutstandingLoan && loanRepaymentAmount > 0 && (
            <div className="flex justify-between text-sm text-amber-700 dark:text-amber-400">
              <span className="flex items-center gap-1.5"><Minus className="h-3 w-3" /> Loan Repayment</span>
              <span>- {formatCurrency(loanRepaymentAmount)}</span>
            </div>
          )}

          {/* Membership deductions */}
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
                <div className="flex justify-between text-[11px] text-amber-600 dark:text-amber-400 italic">
                  <span>↳ VAT included in membership fee</span>
                  <span>{formatCurrency(joinShareInfo.membershipFeeVat)}</span>
                </div>
              )}
            </>
          )}

          {isDeposit && (splitSummaries.length > 0 || loanRepaymentOnly) ? (
            <>
              {feeBreakdown.map((b, i) => (
                <div key={i} className="flex justify-between text-sm text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    <Minus className="h-3 w-3" /> {b.name}
                    {b.vat > 0 && <span className="text-[9px] text-amber-600">(incl. VAT)</span>}
                  </span>
                  <span>- {formatCurrency(b.amount)}</span>
                </div>
              ))}
              {isVatRegistered && totalVat > 0 && (
                <div className="flex justify-between text-[11px] text-amber-600 dark:text-amber-400 italic">
                  <span>↳ Total VAT included in fees</span>
                  <span>{formatCurrency(totalVat)}</span>
                </div>
              )}
              {commissionAmount > 0 && (
                <>
                  <div className="flex justify-between text-sm text-muted-foreground">
                    <span className="flex items-center gap-1.5">
                      <Minus className="h-3 w-3" /> Commission ({commissionPct}%)
                      {isVatRegistered && <span className="text-[9px] text-amber-600">(incl. VAT)</span>}
                      {commissionReferrerName && <span className="text-[10px]">— {commissionReferrerName}</span>}
                    </span>
                    <span>- {formatCurrency(commissionAmount)}</span>
                  </div>
                  {isVatRegistered && commissionVat > 0 && (
                    <div className="flex justify-between text-[11px] text-amber-600 dark:text-amber-400 italic">
                      <span>↳ VAT included in commission</span>
                      <span>{formatCurrency(commissionVat)}</span>
                    </div>
                  )}
                </>
              )}

              <Separator />

              {loanRepaymentOnly ? (
                <div className="flex justify-between text-sm font-bold text-amber-700 dark:text-amber-400">
                  <span>Total Applied to Loan</span>
                  <span>{formatCurrency(loanRepaymentAmount)}</span>
                </div>
              ) : (
                <>
                  <div className="flex justify-between text-sm font-bold text-primary">
                    <span>Net Available for Pools</span>
                    <span>{formatCurrency(depositNetAvailable)}</span>
                  </div>

                  <Separator />

                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                    <TrendingUp className="h-3 w-3" /> Pool Allocation
                  </p>

                  {splitSummaries.map((s) => (
                    <div key={s.poolId} className="rounded-lg bg-background/50 border border-border p-2.5 space-y-1">
                      <div className="flex justify-between text-sm font-semibold">
                        <span>{s.poolName}</span>
                        <span>{s.percentage}%</span>
                      </div>
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>{formatCurrency(s.netAmount)}</span>
                        <span className="font-mono font-bold text-primary">{s.units.toFixed(4)} units</span>
                      </div>
                    </div>
                  ))}
                </>
              )}
            </>
          ) : (
            <>
              {(totalFee || 0) > 0 && (
                <div className="flex justify-between text-sm text-muted-foreground">
                  <span>Fees</span>
                  <span>- {formatCurrency(totalFee || 0)}</span>
                </div>
              )}
              <Separator />
              <div className="flex justify-between text-sm font-bold">
                <span>Net Amount</span>
                <span>{formatCurrency(netAmount)}</span>
              </div>
              {currentUnitPrice > 0 && (
                <div className="flex justify-between text-sm text-muted-foreground">
                  <span>Units @ {formatCurrency(currentUnitPrice)}</span>
                  <span className="font-mono font-bold">{Math.abs(unitsToTransact).toFixed(4)}</span>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default DepositDetailsStep;
