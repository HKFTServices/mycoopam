import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { FileText, CheckCircle, Clock, Award, CreditCard, Wallet, TrendingUp, TrendingDown, ArrowRightLeft, Minus, CalendarIcon } from "lucide-react";
import { format } from "date-fns";

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

export interface WithdrawalPoolSummaryReview {
  poolId: string;
  poolName: string;
  netPayout: number;
  grossAmount: number;
  totalFee: number;
  feeBreakdown: { name: string; amount: number; vat: number }[];
  unitPrice: number;
  units: number;
}

interface ReviewStepProps {
  accountLabel: string;
  txnTypeName: string;
  paymentMethod: string;
  amountNum: number;
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
  isDeposit: boolean;
  isWithdrawal: boolean;
  isSwitch?: boolean;
  isTransfer?: boolean;
  popFile: File | null;
  formatCurrency: (v: number) => string;
  // non-deposit/switch
  poolName?: string;
  netAmount?: number;
  currentUnitPrice?: number;
  unitsToTransact?: number;
  totalFee?: number;
  transactionDate: Date;
  // switch-specific
  switchFromPoolName?: string;
  switchToPoolName?: string;
  switchGrossRedemption?: number;
  switchNetAmount?: number;
  switchFromUnits?: number;
  switchToUnits?: number;
  switchFromUnitPrice?: number;
  switchToUnitPrice?: number;
  // transfer-specific
  transferFromPool?: string;
  transferRecipientAccountNumber?: string;
  transferNetAmount?: number;
  transferGrossRedemption?: number;
  transferFeeUnitsRedeemed?: number;
  transferUnitPriceSell?: number;
  transferFeeBreakdown?: FeeBreakdownItem[];
  transferTotalFee?: number;
  // withdrawal multi-pool
  withdrawalSummaries?: WithdrawalPoolSummaryReview[];
  loanRepaymentAmount?: number;
}

const ReviewStep = ({
  accountLabel, txnTypeName, paymentMethod, amountNum,
  joinShareInfo, feeBreakdown, totalVat = 0, isVatRegistered = false,
  commissionAmount, commissionVat = 0, commissionPct, commissionReferrerName,
  depositNetAvailable, splitSummaries, isDeposit, isWithdrawal, isSwitch = false, isTransfer = false,
  popFile, formatCurrency,
  poolName, netAmount = 0, currentUnitPrice = 0, unitsToTransact = 0, totalFee = 0,
  transactionDate,
  switchFromPoolName, switchToPoolName, switchGrossRedemption = 0, switchNetAmount = 0,
  switchFromUnits = 0, switchToUnits = 0, switchFromUnitPrice = 0, switchToUnitPrice = 0,
  transferFromPool, transferRecipientAccountNumber, transferNetAmount = 0,
  transferGrossRedemption = 0, transferFeeUnitsRedeemed = 0, transferUnitPriceSell = 0,
  transferFeeBreakdown = [], transferTotalFee = 0,
  withdrawalSummaries = [],
  loanRepaymentAmount = 0,
}: ReviewStepProps) => {

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="rounded-xl bg-primary/5 border-2 border-primary/20 p-4 flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-primary flex items-center justify-center shrink-0">
          <CheckCircle className="h-5 w-5 text-primary-foreground" />
        </div>
        <div>
          <p className="font-bold text-sm">Review Your Transaction</p>
          <p className="text-xs text-muted-foreground">Please confirm everything looks correct</p>
        </div>
      </div>

      {/* ── TRANSFER: dedicated layout ── */}
      {isTransfer ? (
        <div className="rounded-xl border-2 border-primary/30 bg-primary/5 p-4 space-y-3">
          {/* Prominent FROM → TO */}
          <div className="flex items-center gap-3">
            <div className="flex-1 rounded-lg bg-background border border-border p-3 text-center">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">From</p>
              <p className="text-sm font-semibold truncate">{accountLabel}</p>
            </div>
            <ArrowRightLeft className="h-6 w-6 text-primary shrink-0" />
            <div className="flex-1 rounded-lg bg-primary text-primary-foreground p-3 text-center">
              <p className="text-[10px] uppercase tracking-wider mb-1 opacity-70">To Member</p>
              <p className="text-base font-mono font-bold">{transferRecipientAccountNumber || "—"}</p>
            </div>
          </div>

          <Separator />

          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Pool</span>
              <span className="font-medium">{transferFromPool || poolName}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Transaction</span>
              <Badge variant="outline" className="font-semibold">{txnTypeName}</Badge>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground flex items-center gap-1">
                <CalendarIcon className="h-3 w-3" /> Date
              </span>
              <span className="font-medium">{format(transactionDate, "dd MMM yyyy")}</span>
            </div>
          </div>

          <Separator />

          {/* Sender redeems gross; receiver gets net */}
          {transferFeeBreakdown.length > 0 && transferFeeBreakdown.map((fee, i) => (
            <div key={i} className="flex justify-between text-sm text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <Minus className="h-3 w-3" /> {fee.name}
              </span>
              <span className="text-destructive font-mono">+ {formatCurrency(fee.amount)}</span>
            </div>
          ))}
          <div className="flex justify-between text-sm font-bold text-orange-600 dark:text-orange-400">
            <span>Gross Redeemed from Sender</span>
            <span className="font-mono">{formatCurrency(transferGrossRedemption || (transferNetAmount + transferTotalFee))}</span>
          </div>
          {transferUnitPriceSell > 0 && (
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Gross Units @ UP Sell {formatCurrency(transferUnitPriceSell)}</span>
              <span className="font-mono">
                {((transferGrossRedemption || (transferNetAmount + transferTotalFee)) / transferUnitPriceSell).toFixed(4)} units
              </span>
            </div>
          )}

          <Separator />

          <div className="flex justify-between text-sm font-bold text-primary">
            <span>Net Units Credited to Recipient</span>
            <span className="text-lg font-mono">
              {transferUnitPriceSell > 0 ? (transferNetAmount / transferUnitPriceSell).toFixed(4) : "—"} units
            </span>
          </div>
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Net Value to Recipient</span>
            <span className="font-mono">{formatCurrency(transferNetAmount)}</span>
          </div>
        </div>
      ) : (
        /* ── NON-TRANSFER: standard summary card ── */
        <div className="rounded-xl border-2 border-border p-4 space-y-3">
          {/* Basic Info */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Account</span>
              <span className="font-semibold text-right max-w-[60%] truncate">{accountLabel}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Transaction</span>
              <Badge variant="outline" className="font-semibold">{txnTypeName}</Badge>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Payment</span>
              <span className="font-medium capitalize">{paymentMethod.replace(/_/g, " ")}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground flex items-center gap-1">
                <CalendarIcon className="h-3 w-3" /> Date
              </span>
              <span className="font-medium">{format(transactionDate, "dd MMM yyyy")}</span>
            </div>
          </div>

          <Separator />

          {/* ── SWITCH breakdown ── */}
          {isSwitch ? (
            <div className="space-y-3">
              {/* FROM pool */}
              <div className="rounded-lg bg-orange-500/5 border border-orange-500/20 p-3 space-y-2">
                <p className="text-[10px] font-bold uppercase tracking-wider text-orange-600 dark:text-orange-400 flex items-center gap-1">
                  <TrendingDown className="h-3 w-3" /> Redeem From — {switchFromPoolName}
                </p>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Switch Amount</span>
                  <span className="font-semibold">{formatCurrency(switchNetAmount)}</span>
                </div>
                {feeBreakdown.map((b, i) => (
                  <div key={i} className="flex justify-between text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Minus className="h-3 w-3" /> {b.name}
                      {b.vat > 0 && <span className="text-[9px] text-warning ml-1">(incl. VAT)</span>}
                    </span>
                    <span className="text-destructive">+ {formatCurrency(b.amount)}</span>
                  </div>
                ))}
                {isVatRegistered && totalVat > 0 && (
                  <div className="flex justify-between text-[11px] text-warning/80 italic">
                    <span>↳ Total VAT included in fees</span>
                    <span>{formatCurrency(totalVat)}</span>
                  </div>
                )}
                <Separator className="my-1" />
                <div className="flex justify-between text-sm font-bold text-orange-600 dark:text-orange-400">
                  <span>Gross Redeemed</span>
                  <span>{formatCurrency(switchGrossRedemption)}</span>
                </div>
                {switchFromUnitPrice > 0 && (
                  <div className="flex justify-between text-xs bg-orange-500/5 rounded p-2">
                    <span className="text-muted-foreground">Units @ {formatCurrency(switchFromUnitPrice)} / unit</span>
                    <span className="font-mono font-bold text-orange-600 dark:text-orange-400">
                      {switchFromUnits.toFixed(4)} units
                    </span>
                  </div>
                )}
              </div>

              <div className="flex justify-center">
                <ArrowRightLeft className="h-4 w-4 text-primary" />
              </div>

              {/* TO pool */}
              <div className="rounded-lg bg-emerald-500/5 border border-emerald-500/20 p-3 space-y-2">
                <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                  <TrendingUp className="h-3 w-3" /> Invest Into — {switchToPoolName}
                </p>
                <div className="flex justify-between text-sm font-bold text-emerald-600 dark:text-emerald-400">
                  <span>Net Amount</span>
                  <span>{formatCurrency(switchNetAmount)}</span>
                </div>
                {switchToUnitPrice > 0 && (
                  <div className="flex justify-between text-xs bg-emerald-500/5 rounded p-2">
                    <span className="text-muted-foreground">Units @ {formatCurrency(switchToUnitPrice)} / unit</span>
                    <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">
                      {switchToUnits.toFixed(4)} units
                    </span>
                  </div>
                )}
              </div>
            </div>
          ) : isWithdrawal && withdrawalSummaries.length > 0 ? (
            /* ── WITHDRAWAL multi-pool breakdown ── */
            <div className="space-y-3">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <TrendingDown className="h-3 w-3" /> Pool Redemptions
              </p>
              {withdrawalSummaries.map((s) => (
                <div key={s.poolId} className="rounded-lg border border-border bg-background/50 p-3 space-y-1.5">
                  <p className="font-semibold text-sm">{s.poolName}</p>
                  {s.feeBreakdown.map((fee, i) => (
                    <div key={i} className="flex justify-between text-xs text-muted-foreground">
                      <span className="flex items-center gap-1"><Minus className="h-3 w-3" />{fee.name}</span>
                      <span className="text-destructive">+ {formatCurrency(fee.amount)}</span>
                    </div>
                  ))}
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Gross Redeemed</span>
                    <span className="font-mono">{formatCurrency(s.grossAmount)}</span>
                  </div>
                  {s.unitPrice > 0 && (
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>Units @ {formatCurrency(s.unitPrice)}/u</span>
                      <span className="font-mono">{s.units.toFixed(4)}</span>
                    </div>
                  )}
                  <Separator className="my-1" />
                  <div className="flex justify-between text-sm font-bold text-primary">
                    <span>Net Payout</span>
                    <span>{formatCurrency(s.netPayout)}</span>
                  </div>
                </div>
              ))}
              {withdrawalSummaries.length > 1 && (
                <div className="rounded-xl border-2 border-primary/30 bg-primary/5 px-4 py-3 flex items-center justify-between">
                  <span className="text-sm font-bold">Total Net Payout</span>
                  <span className="text-lg font-bold text-primary">
                    {formatCurrency(withdrawalSummaries.reduce((s, r) => s + r.netPayout, 0))}
                  </span>
                </div>
              )}
            </div>
          ) : (
            /* ── DEPOSIT breakdown ── */
            <div className="space-y-2">
              <div className="flex justify-between text-sm font-bold">
                <span>Gross Amount</span>
                <span className="text-lg">{formatCurrency(amountNum)}</span>
              </div>

              {joinShareInfo.needed && (
                <div className="rounded-lg bg-warning/5 border border-warning/20 p-2.5 space-y-1.5">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-warning flex items-center gap-1">
                    <Award className="h-3 w-3" /> Membership Deductions
                  </p>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground flex items-center gap-1">
                      <CreditCard className="h-3 w-3" /> Join Share
                    </span>
                    <span className="text-warning">- {formatCurrency(joinShareInfo.shareCost)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground flex items-center gap-1">
                      <Wallet className="h-3 w-3" /> Membership Fee
                    </span>
                    <span className="text-warning">- {formatCurrency(joinShareInfo.membershipFee)}</span>
                  </div>
                  {joinShareInfo.membershipFeeVat > 0 && (
                    <div className="flex justify-between text-[11px] text-warning/80 italic">
                      <span>↳ VAT included in membership fee</span>
                      <span>{formatCurrency(joinShareInfo.membershipFeeVat)}</span>
                    </div>
                  )}
                </div>
              )}

              {isDeposit && splitSummaries.length > 0 ? (
                <>
                  {feeBreakdown.map((b, i) => (
                    <div key={i} className="flex justify-between text-sm text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Minus className="h-3 w-3" /> {b.name}
                        {b.vat > 0 && <span className="text-[9px] text-warning">(incl. VAT)</span>}
                      </span>
                      <span className="text-destructive">- {formatCurrency(b.amount)}</span>
                    </div>
                  ))}
                  {isVatRegistered && totalVat > 0 && (
                    <div className="flex justify-between text-[11px] text-warning/80 italic">
                      <span>↳ Total VAT included in fees</span>
                      <span>{formatCurrency(totalVat)}</span>
                    </div>
                  )}
                  {commissionAmount > 0 && (
                    <>
                      <div className="flex justify-between text-sm text-muted-foreground">
                        <span>
                          Commission ({commissionPct}%){isVatRegistered ? " (incl. VAT)" : ""}
                          {commissionReferrerName ? ` — ${commissionReferrerName}` : ""}
                        </span>
                        <span className="text-destructive">- {formatCurrency(commissionAmount)}</span>
                      </div>
                      {isVatRegistered && commissionVat > 0 && (
                        <div className="flex justify-between text-[11px] text-warning/80 italic">
                          <span>↳ VAT included in commission</span>
                          <span>{formatCurrency(commissionVat)}</span>
                        </div>
                      )}
                    </>
                  )}

                  <Separator />

                  <div className="flex justify-between text-sm font-bold text-primary">
                    <span>Net for Investment</span>
                    <span className="text-lg">{formatCurrency(depositNetAvailable)}</span>
                  </div>

                  <Separator />

                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                    <TrendingUp className="h-3 w-3" /> Pool Allocation
                  </p>

                  <div className="grid gap-2">
                    {splitSummaries.map((s) => (
                      <div key={s.poolId} className="rounded-lg border border-border bg-background/50 p-3">
                        <div className="flex justify-between items-center mb-1.5">
                          <span className="font-bold text-sm">{s.poolName}</span>
                          <Badge className="text-[10px]">{s.percentage}%</Badge>
                        </div>
                        <div className="grid grid-cols-3 gap-2 text-center">
                          <div>
                            <p className="text-[10px] text-muted-foreground">Amount</p>
                            <p className="text-xs font-semibold">{formatCurrency(s.netAmount)}</p>
                          </div>
                          <div>
                            <p className="text-[10px] text-muted-foreground">Unit Price</p>
                            <p className="text-xs font-semibold">{formatCurrency(s.unitPrice)}</p>
                          </div>
                          <div>
                            <p className="text-[10px] text-muted-foreground">Units</p>
                            <p className="text-xs font-bold text-primary">{s.units.toFixed(4)}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Pool</span>
                    <span className="font-medium">{poolName}</span>
                  </div>
                  {(totalFee || 0) > 0 && (
                    <div className="flex justify-between text-sm text-destructive">
                      <span>Fees</span>
                      <span>- {formatCurrency(totalFee)}</span>
                    </div>
                  )}
                  <Separator />
                  <div className="flex justify-between text-sm font-bold">
                    <span>Net Amount</span>
                    <span>{formatCurrency(netAmount)}</span>
                  </div>
                  {currentUnitPrice > 0 && (
                    <>
                      <div className="flex justify-between text-sm text-muted-foreground">
                        <span>Unit Price</span>
                        <span>{formatCurrency(currentUnitPrice)}</span>
                      </div>
                      <div className="flex justify-between text-sm font-bold text-primary">
                        <span>Units {isWithdrawal ? "Redeemed" : "Purchased"}</span>
                        <span className="text-lg">{Math.abs(unitsToTransact).toFixed(4)}</span>
                      </div>
                    </>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      )}

      {/* POP Status */}
      {isDeposit && (
        <div className={`flex items-center gap-3 rounded-xl p-3 border-2 ${
          popFile ? "border-primary/30 bg-primary/5" : "border-border bg-muted/20"
        }`}>
          <FileText className={`h-5 w-5 ${popFile ? "text-primary" : "text-muted-foreground"}`} />
          {popFile ? (
            <span className="text-sm font-medium text-primary">POP: {popFile.name}</span>
          ) : (
            <span className="text-sm text-muted-foreground">No POP attached — you can upload later</span>
          )}
        </div>
      )}

      {/* Pending Notice */}
      <div className="flex items-center gap-3 rounded-xl bg-sky-500/5 border-2 border-sky-500/20 p-3">
        <Clock className="h-5 w-5 text-sky-600 dark:text-sky-400 shrink-0" />
        <p className="text-xs text-sky-700 dark:text-sky-400">
          {isSwitch
            ? "This switch will be submitted for approval. Units will be redeemed and reinvested once approved."
            : isTransfer
            ? "This transfer will be submitted for approval. Units will change ownership once approved."
            : `This transaction will be submitted for approval. Units will be ${isWithdrawal ? "redeemed" : "allocated"} once final approval is granted.`}
        </p>
      </div>
    </div>
  );
};

export default ReviewStep;
