import { Badge } from "@/components/ui/badge";
import { Sparkles } from "lucide-react";

interface TransactionTypeStepProps {
  txnTypes: any[];
  selectedTxnTypeId: string;
  onSelect: (id: string) => void;
  accountHasHoldings: boolean;
  accountLabel: string;
}

const COLOR_MAP: Record<string, { bg: string; border: string; text: string }> = {
  DEPOSIT_FUNDS: {
    bg: "bg-emerald-50 dark:bg-emerald-950/30",
    border: "border-emerald-200 dark:border-emerald-800",
    text: "text-emerald-700 dark:text-emerald-400",
  },
  DEPOSIT_STOCK: {
    bg: "bg-teal-50 dark:bg-teal-950/30",
    border: "border-teal-200 dark:border-teal-800",
    text: "text-teal-700 dark:text-teal-400",
  },
  WITHDRAW_FUNDS: {
    bg: "bg-orange-50 dark:bg-orange-950/30",
    border: "border-orange-200 dark:border-orange-800",
    text: "text-orange-700 dark:text-orange-400",
  },
  WITHDRAW_STOCK: {
    bg: "bg-amber-50 dark:bg-amber-950/30",
    border: "border-amber-200 dark:border-amber-800",
    text: "text-amber-700 dark:text-amber-400",
  },
  SWITCH: {
    bg: "bg-violet-50 dark:bg-violet-950/30",
    border: "border-violet-200 dark:border-violet-800",
    text: "text-violet-700 dark:text-violet-400",
  },
  TRANSFER: {
    bg: "bg-sky-50 dark:bg-sky-950/30",
    border: "border-sky-200 dark:border-sky-800",
    text: "text-sky-700 dark:text-sky-400",
  },
};

const ICON_MAP: Record<string, string> = {
  DEPOSIT_FUNDS: "💰",
  DEPOSIT_STOCK: "📦",
  WITHDRAW_FUNDS: "🏧",
  WITHDRAW_STOCK: "📤",
  SWITCH: "🔄",
  TRANSFER: "↔️",
};

const DESC_MAP: Record<string, string> = {
  DEPOSIT_FUNDS: "Add money to your investment pools",
  DEPOSIT_STOCK: "Transfer stock items into your account",
  WITHDRAW_FUNDS: "Redeem units back to cash",
  WITHDRAW_STOCK: "Withdraw stock from your portfolio",
  SWITCH: "Move units between pools",
  TRANSFER: "Transfer units to another member",
};

const TransactionTypeStep = ({ txnTypes, selectedTxnTypeId, onSelect, accountHasHoldings, accountLabel }: TransactionTypeStepProps) => {
  return (
    <div className="space-y-4">
      {accountLabel && (
        <div className="rounded-xl bg-muted/40 border border-border px-4 py-3 flex items-center gap-3">
          <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <Sparkles className="h-4 w-4 text-primary" />
          </div>
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">Selected Account</p>
            <p className="text-sm font-semibold truncate">{accountLabel}</p>
          </div>
        </div>
      )}

      <p className="text-sm font-medium">What would you like to do?</p>

      <div className="grid grid-cols-2 gap-3">
        {txnTypes.map((t: any) => {
          const code: string = t.code || "";
          const colors = COLOR_MAP[code] || { bg: "bg-muted", border: "border-border", text: "text-foreground" };
          const isSelected = selectedTxnTypeId === t.id;

          return (
            <button
              key={t.id}
              onClick={() => onSelect(t.id)}
              className={`relative flex flex-col items-center justify-center gap-2 p-5 rounded-xl border text-center transition-all duration-200 ${colors.bg} ${colors.border} ${
                isSelected
                  ? `ring-2 ring-primary shadow-md scale-[1.02]`
                  : `opacity-80 hover:opacity-100 hover:shadow-sm hover:scale-[1.01]`
              }`}
            >
              <span className="text-3xl">{ICON_MAP[code] || "📋"}</span>
              <div>
                <p className={`font-semibold text-sm leading-tight ${colors.text}`}>{t.name}</p>
                <p className="text-[10px] text-muted-foreground mt-1 leading-snug">
                  {DESC_MAP[code] || ""}
                </p>
              </div>
              {isSelected && (
                <div className="absolute top-2 right-2 h-2.5 w-2.5 rounded-full bg-primary animate-scale-in" />
              )}
            </button>
          );
        })}
      </div>

      {accountLabel && !accountHasHoldings && (
        <div className="flex items-center gap-2 rounded-lg bg-amber-500/10 border border-amber-500/30 px-3 py-2">
          <span className="text-amber-600 dark:text-amber-400 text-lg">ℹ️</span>
          <p className="text-xs text-amber-700 dark:text-amber-400">
            This is a new account with no holdings. Only deposit transactions are available.
          </p>
        </div>
      )}
    </div>
  );
};

export default TransactionTypeStep;
