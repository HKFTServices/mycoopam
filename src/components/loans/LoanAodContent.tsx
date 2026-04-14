import { Card, CardContent } from "@/components/ui/card";
import { formatCurrency } from "@/lib/formatCurrency";

interface LoanAodContentProps {
  entityName: string;
  app: any;
  capital: number;
  interestRate: number;
  term: number;
  loanFee: number;
  totalInterest: number;
  totalLoan: number;
  monthlyInstalment: number;
  existingOutstanding?: number;
}

const LoanAodContent = ({
  entityName, app, capital, interestRate, term,
  loanFee, totalInterest, totalLoan, monthlyInstalment,
  existingOutstanding = 0,
}: LoanAodContentProps) => {
  const combinedDebt = existingOutstanding + totalLoan;
  const combinedInstalment = term > 0 ? combinedDebt / term : 0;
  const hasExisting = existingOutstanding > 0;

  return (
    <Card className="border-primary/30">
      <CardContent className="py-4">
        <h3 className="text-center font-bold text-lg mb-4">ACKNOWLEDGMENT OF DEBT</h3>
        <div className="space-y-3 text-sm">
          <p>
            I, <strong>{entityName}</strong>, hereby acknowledge that I am indebted to the Cooperative
            in the amount and on the terms set out below:
          </p>
          <div className="bg-muted/50 rounded-lg p-4">
            <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm">
              <span className="text-muted-foreground">Loan Date:</span>
              <span className="font-mono">{app.loan_date}</span>
              <span className="text-muted-foreground">Capital Amount:</span>
              <span className="font-mono font-semibold">{formatCurrency(capital)}</span>
              <span className="text-muted-foreground">Interest Rate:</span>
              <span className="font-mono">{interestRate}% per annum (simple)</span>
              <span className="text-muted-foreground">Term:</span>
              <span className="font-mono">{term} months</span>
              <span className="text-muted-foreground">Interest Loading:</span>
              <span className="font-mono">{formatCurrency(totalInterest)}</span>
              <span className="text-muted-foreground">Loan Issue Fee:</span>
              <span className="font-mono">{formatCurrency(loanFee)}</span>
              <span className="font-semibold border-t pt-2 mt-1">New Loan Total:</span>
              <span className="font-mono font-bold border-t pt-2 mt-1">{formatCurrency(totalLoan)}</span>
            </div>

            {hasExisting && (
              <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm mt-3 pt-3 border-t border-dashed">
                <span className="text-muted-foreground">Existing Outstanding Loan(s):</span>
                <span className="font-mono text-destructive">{formatCurrency(existingOutstanding)}</span>
                <span className="font-bold">Combined Total Debt:</span>
                <span className="font-mono font-bold text-destructive">{formatCurrency(combinedDebt)}</span>
              </div>
            )}

            <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm mt-3 pt-3 border-t">
              <span className="text-muted-foreground">Monthly Instalment ({term} months):</span>
              <span className="font-mono font-semibold text-primary">
                {formatCurrency(hasExisting ? combinedInstalment : monthlyInstalment)}
              </span>
            </div>
          </div>

          {hasExisting && (
            <div className="bg-accent/40 rounded-lg p-3 border border-accent">
              <p className="text-xs font-medium">
                ⚠ The monthly instalment of{" "}
                <strong>{formatCurrency(combinedInstalment)}</strong> includes repayment of both
                existing ({formatCurrency(existingOutstanding)}) and new ({formatCurrency(totalLoan)})
                loan balances over {term} months.
              </p>
            </div>
          )}

          <p className="text-xs text-muted-foreground">
            Formula: Total = Capital × (1 + term × rate/12) + Fee
          </p>
          <div className="mt-4 pt-4 border-t space-y-2">
            <p className="text-xs">
              <strong>Terms:</strong> I agree to repay the total amount in equal monthly instalments
              as set out in the schedule above. Failure to maintain payments may result in the
              outstanding balance being deducted from my pool holdings.
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default LoanAodContent;
