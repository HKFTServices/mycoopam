import { formatCurrency } from "@/lib/formatCurrency";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { AlertTriangle, Info, ChevronDown } from "lucide-react";
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { useState } from "react";

interface LoanForm {
  loan_date: string;
  amount_requested: number;
  term_months_requested: number;
  monthly_available_repayment: number;
  reason: string;
  security_assets: string;
  pool_id: string;
}

interface Props {
  form: LoanForm;
  onChange: (form: LoanForm) => void;
  loanSettings: any;
  existingOutstanding: number;
  maxTermMonths: number;
  pools?: { id: string; name: string }[];
  getPoolValue?: (poolId: string) => number;
  poolValueMultiple?: number;
}

const LoanDetailsStep = ({
  form, onChange, loanSettings, existingOutstanding, maxTermMonths,
  pools = [], getPoolValue, poolValueMultiple = 1,
}: Props) => {
  const update = (partial: Partial<LoanForm>) => onChange({ ...form, ...partial });
  const [rulesOpen, setRulesOpen] = useState(true);

  const interestRate = loanSettings?.interest_rate_medium ?? 8;
  const loanFee = loanSettings?.loan_fee_medium ?? 150;
  const termMonths = form.term_months_requested || 12;
  const capital = form.amount_requested || 0;

  const totalInterest = capital * termMonths * (interestRate / 100) / 12;
  const newLoanTotal = capital + totalInterest + loanFee;
  const combinedOutstanding = existingOutstanding + newLoanTotal;
  const monthlyInstalment = termMonths > 0 ? combinedOutstanding / termMonths : 0;

  // Pool value limit
  const selectedPoolValue = form.pool_id && getPoolValue ? getPoolValue(form.pool_id) : 0;
  const maxAllowedLoan = selectedPoolValue * poolValueMultiple;
  // Max allowed must cover existing loans too
  const availableForNewLoan = Math.max(0, maxAllowedLoan - existingOutstanding);
  const exceedsLimit = form.pool_id && maxAllowedLoan > 0 && capital > availableForNewLoan;

  const interestTypeLabel = loanSettings?.interest_type === "compound" ? "Compound" : "Simple";

  return (
    <div className="space-y-4 pb-4">
      {/* Loan conditions banner driven by tenant loan_settings */}
      <Collapsible open={rulesOpen} onOpenChange={setRulesOpen}>
        <Card className="border-blue-200 bg-blue-50/60 dark:border-blue-900 dark:bg-blue-950/30">
          <CollapsibleTrigger asChild>
            <button className="w-full text-left px-4 py-3 flex items-start gap-2 cursor-pointer hover:bg-blue-100/50 dark:hover:bg-blue-900/30 rounded-t-lg transition-colors">
              <Info className="h-4 w-4 text-blue-600 dark:text-blue-400 mt-0.5 shrink-0" />
              <span className="text-sm font-semibold text-blue-800 dark:text-blue-300 flex-1">
                Co-op Loan Conditions
              </span>
              <ChevronDown className={`h-4 w-4 text-blue-600 dark:text-blue-400 mt-0.5 transition-transform ${rulesOpen ? "rotate-180" : ""}`} />
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent className="pt-0 pb-3 px-4">
              <ul className="text-xs text-blue-800 dark:text-blue-300 space-y-1.5 list-disc list-inside">
                <li>
                  All loans — existing plus new — must be fully repaid within{" "}
                  <strong>{maxTermMonths} month{maxTermMonths !== 1 ? "s" : ""}</strong>.
                </li>
                <li>
                  The maximum total loan exposure is{" "}
                  <strong>{poolValueMultiple}× your pool value</strong> in the selected pool
                  {form.pool_id && selectedPoolValue > 0 && (
                    <> (currently <strong>{formatCurrency(maxAllowedLoan)}</strong>)</>
                  )}.
                  This limit includes any existing outstanding loans.
                </li>
                {existingOutstanding > 0 && form.pool_id && maxAllowedLoan > 0 && (
                  <li className="text-orange-700 dark:text-orange-400 font-medium">
                    Existing outstanding: {formatCurrency(existingOutstanding)} — available for new loan:{" "}
                    <strong>{formatCurrency(availableForNewLoan)}</strong>.
                  </li>
                )}
                <li>
                  Interest is calculated as <strong>{interestTypeLabel} Interest</strong> at rates
                  between <strong>{loanSettings?.interest_rate_low ?? 5}%</strong> and{" "}
                  <strong>{loanSettings?.interest_rate_high ?? 12}%</strong> p.a., depending on risk assessment.
                </li>
                <li>
                  A once-off loan fee of between{" "}
                  <strong>{formatCurrency(loanSettings?.loan_fee_low ?? 150)}</strong> and{" "}
                  <strong>{formatCurrency(loanSettings?.loan_fee_high ?? 300)}</strong> applies.
                </li>
                <li>
                  You may apply for a longer repayment period; however the board will endeavour to
                  adhere strictly to the above rules to ensure fair access for all members.
                </li>
              </ul>
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Loan Date</Label>
          <Input
            type="date"
            value={form.loan_date}
            onChange={(e) => update({ loan_date: e.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label>Pool (Source of Loan)</Label>
          <Select value={form.pool_id} onValueChange={(v) => update({ pool_id: v })}>
            <SelectTrigger>
              <SelectValue placeholder="Select pool..." />
            </SelectTrigger>
            <SelectContent>
              {pools.map((p) => (
                <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {form.pool_id && selectedPoolValue > 0 && (
            <p className="text-xs text-muted-foreground">
              Pool value: {formatCurrency(selectedPoolValue)} — Max total exposure: {formatCurrency(maxAllowedLoan)} ({poolValueMultiple}×)
              {existingOutstanding > 0 && (
                <span className="block">Available for new loan: <strong>{formatCurrency(availableForNewLoan)}</strong></span>
              )}
            </p>
          )}
          {form.pool_id && selectedPoolValue === 0 && getPoolValue && (
            <p className="text-xs text-orange-600">
              No holdings found in this pool
            </p>
          )}
        </div>
        <div className="space-y-2">
          <Label>Loan Amount Requested (R)</Label>
          <Input
            type="number"
            min={0}
            step={1000}
            value={form.amount_requested || ""}
            placeholder="0"
            onChange={(e) => update({ amount_requested: parseFloat(e.target.value) || 0 })}
            className={exceedsLimit ? "border-destructive" : ""}
          />
          {exceedsLimit && (
            <p className="text-xs text-destructive flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" />
              Exceeds available limit ({formatCurrency(availableForNewLoan)})
              {existingOutstanding > 0 && (
                <span className="block ml-5">
                  (Max {formatCurrency(maxAllowedLoan)} minus existing {formatCurrency(existingOutstanding)})
                </span>
              )}
            </p>
          )}
        </div>
        <div className="space-y-2">
          <Label>Repayment Term (Months)</Label>
          <Input
            type="number"
            min={1}
            max={maxTermMonths}
            value={form.term_months_requested}
            onChange={(e) => update({ term_months_requested: parseInt(e.target.value) || 12 })}
          />
          <p className="text-xs text-muted-foreground">Maximum: {maxTermMonths} months. You may request a longer period, but approval is at the board's discretion.</p>
        </div>
        <div className="space-y-2">
          <Label>Monthly Amount Available to Repay (R)</Label>
          <Input
            type="number"
            min={0}
            step={100}
            value={form.monthly_available_repayment || ""}
            placeholder={monthlyInstalment > 0 ? monthlyInstalment.toFixed(2) : "0"}
            onChange={(e) => update({ monthly_available_repayment: parseFloat(e.target.value) || 0 })}
          />
          {monthlyInstalment > 0 && (
            <p className={`text-xs ${form.monthly_available_repayment > 0 && form.monthly_available_repayment < monthlyInstalment ? "text-destructive font-medium" : "text-muted-foreground"}`}>
              Minimum required: {formatCurrency(monthlyInstalment)}/month
              {form.monthly_available_repayment > 0 && form.monthly_available_repayment < monthlyInstalment && (
                <span className="block">⚠ Below minimum — admin review required</span>
              )}
              {form.monthly_available_repayment >= monthlyInstalment && form.monthly_available_repayment > 0 && (
                <span className="block text-emerald-600">✓ Meets or exceeds minimum instalment</span>
              )}
            </p>
          )}
          {monthlyInstalment <= 0 && (
            <p className="text-xs text-muted-foreground">Enter loan amount above to see minimum instalment</p>
          )}
        </div>
      </div>

      {capital > 0 && (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="py-4">
            <h4 className="text-sm font-semibold mb-3">Estimated Loan Summary (Medium Risk)</h4>
            <div className="grid grid-cols-2 gap-x-8 gap-y-1 text-sm">
              <span className="text-muted-foreground">Capital Amount:</span>
              <span className="text-right font-mono">{formatCurrency(capital)}</span>
              <span className="text-muted-foreground">Interest Loading ({interestRate}% p.a. × {termMonths} months):</span>
              <span className="text-right font-mono">{formatCurrency(totalInterest)}</span>
              <span className="text-muted-foreground">Loan Issue Fee:</span>
              <span className="text-right font-mono">{formatCurrency(loanFee)}</span>
              <span className="font-semibold border-t pt-1 mt-1">New Loan Total:</span>
              <span className="text-right font-mono font-bold border-t pt-1 mt-1">{formatCurrency(newLoanTotal)}</span>
              {existingOutstanding > 0 && (
                <>
                  <span className="text-muted-foreground">Existing Outstanding Loans:</span>
                  <span className="text-right font-mono text-destructive">{formatCurrency(existingOutstanding)}</span>
                  <span className="font-semibold border-t pt-1 mt-1">Combined Outstanding:</span>
                  <span className="text-right font-mono font-bold border-t pt-1 mt-1 text-destructive">{formatCurrency(combinedOutstanding)}</span>
                </>
              )}
              <span className="text-muted-foreground border-t pt-1 mt-1">Monthly Instalment ({termMonths} months):</span>
              <span className="text-right font-mono font-semibold text-primary border-t pt-1 mt-1">{formatCurrency(monthlyInstalment)}</span>
            </div>
            <p className="text-[11px] text-muted-foreground mt-3">
              * Monthly instalment = {existingOutstanding > 0 ? "(Existing outstanding + New loan total)" : "Total loan"} ÷ {termMonths} months. Final rates determined by manager after risk assessment.
            </p>
          </CardContent>
        </Card>
      )}

      <div className="space-y-2">
        <Label>Reason for Loan</Label>
        <Textarea
          value={form.reason}
          onChange={(e) => update({ reason: e.target.value })}
          placeholder="Briefly describe the purpose of the loan..."
          rows={3}
        />
      </div>

      <div className="space-y-2">
        <Label>Assets Available as Security</Label>
        <Textarea
          value={form.security_assets}
          onChange={(e) => update({ security_assets: e.target.value })}
          placeholder="List any assets pledged as security (e.g. gold holdings, pool units)..."
          rows={3}
        />
      </div>
    </div>
  );
};

export default LoanDetailsStep;