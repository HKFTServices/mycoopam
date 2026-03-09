import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { AlertCircle, CheckCircle, Percent, TrendingUp, Banknote } from "lucide-react";

interface PoolSplit {
  poolId: string;
  percentage: number;
}

interface AccountHolding {
  pool_id: string;
  units: number;
}

interface OutstandingLoanInfo {
  loanIds: string[];
  outstanding: number;
  instalment: number;
}

interface PoolSelectionStepProps {
  pools: any[];
  isDeposit: boolean;
  isWithdrawal?: boolean;
  isSwitch?: boolean;
  isTransfer?: boolean;
  poolSplits: PoolSplit[];
  selectedPoolId: string;
  totalSplitPct: number;
  onTogglePool: (poolId: string) => void;
  onUpdateSplitPct: (poolId: string, pct: number) => void;
  onSelectPool: (poolId: string) => void;
  formatCurrency: (v: number) => string;
  getUnitPrice?: (poolId: string) => number;
  accountHoldings?: AccountHolding[];
  // For withdrawal: simple multi-select (no percentages)
  selectedWithdrawalPoolIds?: string[];
  onToggleWithdrawalPool?: (poolId: string) => void;
  // Loan repayment
  outstandingLoanInfo?: OutstandingLoanInfo | null;
  loanRepaymentOnly?: boolean;
  onLoanRepaymentOnlyChange?: (val: boolean) => void;
}

const POOL_COLORS = [
  { bg: "bg-emerald-500/10", border: "border-emerald-500/40", icon: "text-emerald-600 dark:text-emerald-400", ring: "ring-emerald-500/20" },
  { bg: "bg-sky-500/10", border: "border-sky-500/40", icon: "text-sky-600 dark:text-sky-400", ring: "ring-sky-500/20" },
  { bg: "bg-violet-500/10", border: "border-violet-500/40", icon: "text-violet-600 dark:text-violet-400", ring: "ring-violet-500/20" },
  { bg: "bg-amber-500/10", border: "border-amber-500/40", icon: "text-amber-600 dark:text-amber-400", ring: "ring-amber-500/20" },
  { bg: "bg-rose-500/10", border: "border-rose-500/40", icon: "text-rose-600 dark:text-rose-400", ring: "ring-rose-500/20" },
];

const PoolSelectionStep = ({
  pools, isDeposit, isWithdrawal = false, isSwitch = false, isTransfer = false, poolSplits, selectedPoolId, totalSplitPct,
  onTogglePool, onUpdateSplitPct, onSelectPool, formatCurrency, getUnitPrice, accountHoldings = [],
  selectedWithdrawalPoolIds = [], onToggleWithdrawalPool,
}: PoolSelectionStepProps) => {

  // ── Withdrawal: simple multi-select (no percentages) ─────────────────────
  if (isWithdrawal) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-primary" />
          <Label className="text-sm font-medium">Select pools to withdraw from</Label>
        </div>
        <p className="text-xs text-muted-foreground -mt-2">
          Select one or more pools. You will specify the amount or units per pool on the next step.
        </p>
        <div className="grid gap-3">
          {pools.map((p: any, idx: number) => {
            const isSelected = selectedWithdrawalPoolIds.includes(p.id);
            const colors = POOL_COLORS[idx % POOL_COLORS.length];
            const holding = accountHoldings.find((h) => h.pool_id === p.id);
            const poolUnits = holding ? Number(holding.units) : 0;
            const unitPrice = getUnitPrice ? getUnitPrice(p.id) : Number(p.open_unit_price);
            const availableValue = poolUnits * unitPrice;
            const isDisabled = poolUnits <= 0;

            return (
              <div
                key={p.id}
                className={`rounded-xl border-2 p-4 transition-all duration-200 ${
                  isDisabled
                    ? "border-border opacity-40 cursor-not-allowed bg-muted/20"
                    : isSelected
                      ? `${colors.bg} ${colors.border} shadow-sm ring-2 ${colors.ring}`
                      : "border-border hover:border-primary/30 hover:bg-muted/20 cursor-pointer"
                }`}
                onClick={() => !isDisabled && onToggleWithdrawalPool?.(p.id)}
              >
                <div className="flex items-center gap-3">
                  <Checkbox
                    checked={isSelected}
                    disabled={isDisabled}
                    onCheckedChange={() => !isDisabled && onToggleWithdrawalPool?.(p.id)}
                    className="h-5 w-5"
                  />
                  <div className={`h-10 w-10 rounded-lg flex items-center justify-center shrink-0 ${isSelected ? colors.bg : "bg-muted"}`}>
                    <TrendingUp className={`h-5 w-5 ${isSelected ? colors.icon : "text-muted-foreground"}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm">{p.name}</p>
                    {poolUnits > 0
                      ? <p className="text-xs text-muted-foreground">{poolUnits.toFixed(4)} units ≈ {formatCurrency(availableValue)}</p>
                      : <p className="text-xs text-muted-foreground flex items-center gap-1"><AlertCircle className="h-3 w-3" />No holdings</p>
                    }
                  </div>
                  <Badge variant="outline" className="text-[10px] shrink-0 font-mono">
                    {formatCurrency(unitPrice)}/u
                  </Badge>
                </div>
              </div>
            );
          })}
        </div>
        {selectedWithdrawalPoolIds.length > 0 && (
          <div className="flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold border-2 bg-primary/5 border-primary/30 text-primary">
            <CheckCircle className="h-4 w-4" />
            {selectedWithdrawalPoolIds.length} pool{selectedWithdrawalPoolIds.length > 1 ? "s" : ""} selected — specify amounts on next step
          </div>
        )}
      </div>
    );
  }

  // ── Deposit: multi-select with percentage allocation ──────────────────────
  if (isDeposit) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-primary" />
          <Label className="text-sm font-medium">Choose your investment pools</Label>
        </div>
        <p className="text-xs text-muted-foreground -mt-2">
          Select one or more pools and allocate your deposit percentage. Total must equal 100%.
        </p>

        <div className="grid gap-3">
          {pools.map((p: any, idx: number) => {
            const split = poolSplits.find((s) => s.poolId === p.id);
            const isSelected = !!split;
            const colors = POOL_COLORS[idx % POOL_COLORS.length];
            const unitPrice = getUnitPrice ? getUnitPrice(p.id) : Number(p.open_unit_price);

            return (
              <div
                key={p.id}
                className={`rounded-xl border-2 p-4 transition-all duration-200 ${
                  isSelected
                    ? `${colors.bg} ${colors.border} shadow-sm ring-2 ${colors.ring}`
                    : "border-border hover:border-primary/30 hover:bg-muted/20"
                }`}
              >
                <div className="flex items-center gap-3">
                  <Checkbox
                    checked={isSelected}
                    onCheckedChange={() => onTogglePool(p.id)}
                    className="h-5 w-5"
                  />
                  <div className={`h-10 w-10 rounded-lg flex items-center justify-center shrink-0 ${isSelected ? colors.bg : "bg-muted"}`}>
                    <TrendingUp className={`h-5 w-5 ${isSelected ? colors.icon : "text-muted-foreground"}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm">{p.name}</p>
                    {p.description && <p className="text-xs text-muted-foreground truncate">{p.description}</p>}
                  </div>
                  <Badge variant="outline" className="text-[10px] shrink-0 font-mono">
                    {formatCurrency(unitPrice)}/u
                  </Badge>
                </div>

                {isSelected && (
                  <div className="flex items-center gap-3 mt-3 ml-8 animate-fade-in">
                    <div className="relative">
                      <Input
                        type="number"
                        min="1"
                        max="100"
                        className="w-24 h-9 text-center text-sm font-bold pr-7"
                        value={split!.percentage || ""}
                        onChange={(e) => onUpdateSplitPct(p.id, parseInt(e.target.value) || 0)}
                      />
                      <Percent className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    </div>
                    <div className="h-2.5 flex-1 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-300 bg-primary"
                        style={{ width: `${Math.min(split!.percentage, 100)}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {poolSplits.length > 0 && (
          <div className={`flex items-center justify-between rounded-xl px-4 py-3 text-sm font-bold border-2 transition-colors ${
            totalSplitPct === 100
              ? "bg-emerald-500/10 border-emerald-500/40 text-emerald-700 dark:text-emerald-400"
              : "bg-destructive/10 border-destructive/40 text-destructive"
          }`}>
            <span className="flex items-center gap-2">
              {totalSplitPct === 100 && <CheckCircle className="h-4 w-4" />}
              Total Allocation
            </span>
            <span className="text-lg">{totalSplitPct}%</span>
          </div>
        )}
      </div>
    );
  }

  // ── Single pool selection (switch / transfer) ─────────────────────────────
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <TrendingUp className="h-4 w-4 text-primary" />
        <Label className="text-sm font-medium">
          {isSwitch ? "Select Pool to Switch From" : isTransfer ? "Select Pool to Transfer From" : "Select Investment Pool"}
        </Label>
      </div>
      {isTransfer && (
        <p className="text-xs text-muted-foreground -mt-2">
          Only pools where you have holdings are available for transfer.
        </p>
      )}
      <div className="grid gap-2.5">
        {pools.map((p: any, idx: number) => {
          const colors = POOL_COLORS[idx % POOL_COLORS.length];
          const isSelected = selectedPoolId === p.id;
          const holding = accountHoldings.find((h) => h.pool_id === p.id);
          const poolUnits = holding ? Number(holding.units) : 0;
          const hasUnits = poolUnits > 0;
          const isDisabled = isTransfer && !hasUnits;

          return (
            <button
              key={p.id}
              onClick={() => !isDisabled && onSelectPool(p.id)}
              disabled={isDisabled}
              className={`flex items-center gap-4 p-4 rounded-xl border-2 text-left transition-all duration-200 ${
                isDisabled
                  ? "border-border opacity-40 cursor-not-allowed bg-muted/20"
                  : isSelected
                    ? `${colors.bg} ${colors.border} shadow-md ring-2 ${colors.ring} scale-[1.01]`
                    : "border-border hover:border-primary/30 hover:bg-muted/20"
              }`}
            >
              <div className={`h-10 w-10 rounded-lg flex items-center justify-center shrink-0 ${isSelected ? colors.bg : "bg-muted"}`}>
                <TrendingUp className={`h-5 w-5 ${isSelected ? colors.icon : "text-muted-foreground"}`} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm">{p.name}</p>
                {(isTransfer || isSwitch) && accountHoldings.length > 0 ? (
                  hasUnits ? (
                    <p className="text-xs text-muted-foreground">{poolUnits.toFixed(4)} units held</p>
                  ) : (
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <AlertCircle className="h-3 w-3" /> No holdings
                    </p>
                  )
                ) : (
                  p.description && <p className="text-xs text-muted-foreground truncate">{p.description}</p>
                )}
              </div>
              <Badge variant="outline" className="text-[10px] shrink-0 font-mono">
                {formatCurrency(getUnitPrice ? getUnitPrice(p.id) : Number(p.open_unit_price))}/u
              </Badge>
            </button>
          );
        })}
        {pools.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-6">No pools available</p>
        )}
      </div>
    </div>
  );
};

export default PoolSelectionStep;
