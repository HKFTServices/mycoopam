import { Badge } from "@/components/ui/badge";
import { Sparkles } from "lucide-react";

interface TransactionTypeStepProps {
  txnTypes: any[];
  selectedTxnTypeId: string;
  onSelect: (id: string) => void;
  accountHasHoldings: boolean;
  accountLabel: string;
}

const COLOR_MAP: Record<string, { bg: string; border: string; text: string; glow: string }> = {
  DEPOSIT_FUNDS: {
    bg: "bg-emerald-500/10",
    border: "border-emerald-500",
    text: "text-emerald-700 dark:text-emerald-400",
    glow: "shadow-emerald-500/20",
  },
  DEPOSIT_STOCK: {
    bg: "bg-teal-500/10",
    border: "border-teal-500",
    text: "text-teal-700 dark:text-teal-400",
    glow: "shadow-teal-500/20",
  },
  WITHDRAW_FUNDS: {
    bg: "bg-orange-500/10",
    border: "border-orange-500",
    text: "text-orange-700 dark:text-orange-400",
    glow: "shadow-orange-500/20",
  },
  WITHDRAW_STOCK: {
    bg: "bg-amber-500/10",
    border: "border-amber-500",
    text: "text-amber-700 dark:text-amber-400",
    glow: "shadow-amber-500/20",
  },
  SWITCH: {
    bg: "bg-violet-500/10",
    border: "border-violet-500",
    text: "text-violet-700 dark:text-violet-400",
    glow: "shadow-violet-500/20",
  },
  TRANSFER: {
    bg: "bg-sky-500/10",
    border: "border-sky-500",
    text: "text-sky-700 dark:text-sky-400",
    glow: "shadow-sky-500/20",
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
          const colors = COLOR_MAP[code] || { bg: "bg-muted", border: "border-border", text: "text-foreground", glow: "" };
          const isSelected = selectedTxnTypeId === t.id;

          return (
            <button
              key={t.id}
              onClick={() => onSelect(t.id)}
              className={`relative flex flex-col items-center justify-center gap-2.5 p-5 rounded-2xl border-2 text-center transition-all duration-200 ${colors.bg} ${
                isSelected
                  ? `${colors.border} ${colors.text} ring-2 ring-offset-2 ring-offset-background ring-current shadow-lg ${colors.glow} scale-[1.03]`
                  : `${colors.border}/40 ${colors.text} opacity-70 hover:opacity-100 hover:shadow-md hover:scale-[1.01]`
              }`}
            >
              <span className="text-3xl drop-shadow-sm">{ICON_MAP[code] || "📋"}</span>
              <div>
                <p className="font-bold text-sm leading-tight">{t.name}</p>
                <p className="text-[10px] opacity-70 mt-1 leading-snug">
                  {DESC_MAP[code] || ""}
                </p>
              </div>
              {isSelected && (
                <div className="absolute top-2 right-2 h-3 w-3 rounded-full bg-current animate-scale-in" />
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
