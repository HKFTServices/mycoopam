import { formatCurrency } from "@/lib/formatCurrency";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { AlertTriangle } from "lucide-react";

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

  const interestRate = loanSettings?.interest_rate_medium ?? 8;
  const loanFee = loanSettings?.loan_fee_medium ?? 150;
  const termMonths = form.term_months_requested || 12;
  const capital = form.amount_requested || 0;

  const totalInterest = capital * termMonths * (interestRate / 100) / 12;
  const totalLoan = capital + totalInterest + loanFee;
  const monthlyInstalment = termMonths > 0 ? totalLoan / termMonths : 0;

  // Pool value limit
  const selectedPoolValue = form.pool_id && getPoolValue ? getPoolValue(form.pool_id) : 0;
  const maxAllowedLoan = selectedPoolValue * poolValueMultiple;
  const exceedsLimit = form.pool_id && maxAllowedLoan > 0 && capital > maxAllowedLoan;

  return (
    <div className="space-y-4 pb-4">
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
              Your pool value: {formatCurrency(selectedPoolValue)} — Max loan: {formatCurrency(maxAllowedLoan)} ({poolValueMultiple}×)
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
              Exceeds max allowed ({formatCurrency(maxAllowedLoan)})
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
          <p className="text-xs text-muted-foreground">Maximum: {maxTermMonths} months</p>
        </div>
        <div className="space-y-2">
          <Label>Monthly Amount Available to Repay (R)</Label>
          <Input
            type="number"
            min={0}
            step={100}
            value={form.monthly_available_repayment || ""}
            placeholder="0"
            onChange={(e) => update({ monthly_available_repayment: parseFloat(e.target.value) || 0 })}
          />
          <p className="text-xs text-muted-foreground">Including existing + new loan repayments</p>
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
              <span className="font-semibold border-t pt-1 mt-1">Total Loan:</span>
              <span className="text-right font-mono font-bold border-t pt-1 mt-1">{formatCurrency(totalLoan)}</span>
              <span className="text-muted-foreground">Monthly Instalment:</span>
              <span className="text-right font-mono font-semibold text-primary">{formatCurrency(monthlyInstalment)}</span>
              {existingOutstanding > 0 && (
                <>
                  <span className="text-muted-foreground">Existing Outstanding:</span>
                  <span className="text-right font-mono text-orange-600">{formatCurrency(existingOutstanding)}</span>
                </>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground mt-3">
              * Final rates determined by manager after risk assessment. Formula: Total = Capital × (1 + term × rate/12) + Fee
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
