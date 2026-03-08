import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { formatCurrency } from "@/lib/formatCurrency";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { Loader2, Check, X, Download, FileSignature } from "lucide-react";
import { generateAodHtml } from "@/lib/generateAod";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  application: any;
}

const MemberLoanAcceptDialog = ({ open, onOpenChange, application: app }: Props) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [agreedToTerms, setAgreedToTerms] = useState(false);

  const entityName = app?.entities
    ? [app.entities.name, app.entities.last_name].filter(Boolean).join(" ")
    : "—";

  const capital = Number(app.amount_approved ?? app.amount_requested);
  const term = Number(app.term_months_approved ?? app.term_months_requested);
  const interestRate = Number(app.interest_rate ?? 0);
  const loanFee = Number(app.loan_fee ?? 0);
  const totalInterest = capital * term * (interestRate / 100) / 12;
  const totalLoan = Number(app.total_loan ?? capital + totalInterest + loanFee);
  const monthlyInstalment = Number(app.monthly_instalment ?? (term > 0 ? totalLoan / term : 0));

  const isApproved = app.status === "approved";
  const isAccepted = app.status === "accepted";
  const isDisbursed = app.status === "disbursed";

  const acceptMutation = useMutation({
    mutationFn: async () => {
      const { error } = await (supabase as any)
        .from("loan_applications")
        .update({
          status: "accepted",
          member_accepted_at: new Date().toISOString(),
          member_signature_path: `esign_${user!.id}_${Date.now()}`,
        })
        .eq("id", app.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Loan terms accepted — awaiting admin release of funds");
      queryClient.invalidateQueries({ queryKey: ["loan_applications"] });
      onOpenChange(false);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const rejectMutation = useMutation({
    mutationFn: async () => {
      const { error } = await (supabase as any)
        .from("loan_applications")
        .update({ status: "rejected" })
        .eq("id", app.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Loan terms rejected");
      queryClient.invalidateQueries({ queryKey: ["loan_applications"] });
      onOpenChange(false);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const handleDownloadAod = () => {
    const html = generateAodHtml({
      entityName,
      identityNumber: app.entities?.identity_number ?? "",
      loanDate: app.loan_date,
      capital,
      interestRate,
      term,
      loanFee,
      totalInterest,
      totalLoan,
      monthlyInstalment,
      accountNumber: app.entity_accounts?.account_number ?? "",
    });
    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `AOD_${entityName.replace(/\s+/g, "_")}_${app.loan_date}.html`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("AOD document downloaded");
  };

  // Build repayment schedule
  const schedule: { month: number; date: string; capital: number; interest: number; fee: number; instalment: number; balance: number }[] = [];
  if (term > 0 && capital > 0) {
    const monthlyCapital = capital / term;
    const monthlyInterestPortion = totalInterest / term;
    const monthlyFeePortion = loanFee / term;
    let balance = totalLoan;
    const startDate = new Date(app.loan_date);
    for (let m = 1; m <= term; m++) {
      const payDate = new Date(startDate);
      payDate.setMonth(payDate.getMonth() + m);
      const inst = monthlyInstalment;
      balance -= inst;
      schedule.push({
        month: m,
        date: payDate.toLocaleDateString("en-ZA"),
        capital: monthlyCapital,
        interest: monthlyInterestPortion,
        fee: monthlyFeePortion,
        instalment: inst,
        balance: Math.max(balance, 0),
      });
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>
            {isApproved ? "Loan Terms — Accept or Reject" : "Acknowledgment of Debt"}
          </DialogTitle>
          <DialogDescription>
            {entityName} — {app.entity_accounts?.account_number ?? ""}
            <Badge variant="outline" className="ml-2 text-[10px] capitalize">{app.status}</Badge>
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto -mx-6 px-6 space-y-4">
          {/* AOD Document Preview */}
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
                    <span className="font-semibold border-t pt-2 mt-1">Total Amount Due:</span>
                    <span className="font-mono font-bold border-t pt-2 mt-1">{formatCurrency(totalLoan)}</span>
                    <span className="text-muted-foreground">Monthly Instalment:</span>
                    <span className="font-mono font-semibold text-primary">{formatCurrency(monthlyInstalment)}</span>
                  </div>
                </div>

                <p className="text-xs text-muted-foreground">
                  Formula: Total = Capital × (1 + term × rate/12) + Fee
                </p>

                {/* Repayment Schedule */}
                {schedule.length > 0 && (
                  <div className="mt-4">
                    <h4 className="text-sm font-semibold mb-2">Repayment Schedule</h4>
                    <div className="max-h-48 overflow-y-auto border rounded">
                      <table className="w-full text-xs">
                        <thead className="bg-muted sticky top-0">
                          <tr>
                            <th className="text-left p-1.5">#</th>
                            <th className="text-left p-1.5">Date</th>
                            <th className="text-right p-1.5">Capital</th>
                            <th className="text-right p-1.5">Interest</th>
                            <th className="text-right p-1.5">Instalment</th>
                            <th className="text-right p-1.5">Balance</th>
                          </tr>
                        </thead>
                        <tbody>
                          {schedule.map((row) => (
                            <tr key={row.month} className="border-t">
                              <td className="p-1.5">{row.month}</td>
                              <td className="p-1.5">{row.date}</td>
                              <td className="p-1.5 text-right font-mono">{formatCurrency(row.capital)}</td>
                              <td className="p-1.5 text-right font-mono">{formatCurrency(row.interest)}</td>
                              <td className="p-1.5 text-right font-mono font-semibold">{formatCurrency(row.instalment)}</td>
                              <td className="p-1.5 text-right font-mono">{formatCurrency(row.balance)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                <div className="mt-4 pt-4 border-t space-y-2">
                  <p className="text-xs">
                    <strong>Terms:</strong> I agree to repay the total amount in equal monthly instalments 
                    as set out in the schedule above. Failure to maintain payments may result in the 
                    outstanding balance being deducted from my pool holdings.
                  </p>
                </div>

                {/* Signatures */}
                <div className="grid grid-cols-2 gap-8 mt-6 pt-4 border-t">
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Member Signature</p>
                    {app.member_accepted_at ? (
                      <div className="bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 rounded p-2">
                        <p className="text-xs font-medium text-emerald-700 dark:text-emerald-300">
                          ✓ Electronically signed
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                          {new Date(app.member_accepted_at).toLocaleString("en-ZA")}
                        </p>
                      </div>
                    ) : (
                      <div className="border-b border-dashed h-8" />
                    )}
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Admin Signature</p>
                    {app.admin_signed_at ? (
                      <div className="bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 rounded p-2">
                        <p className="text-xs font-medium text-emerald-700 dark:text-emerald-300">
                          ✓ Signed & Released
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                          {new Date(app.admin_signed_at).toLocaleString("en-ZA")}
                        </p>
                      </div>
                    ) : (
                      <div className="border-b border-dashed h-8" />
                    )}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {app.review_notes && (
            <Card>
              <CardContent className="py-3">
                <p className="text-xs text-muted-foreground">Manager's Notes</p>
                <p className="text-sm mt-1">{app.review_notes}</p>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-between pt-4 border-t">
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleDownloadAod}>
              <Download className="h-4 w-4 mr-1" /> Download AOD
            </Button>
          </div>
          <div className="flex items-center gap-3">
            {isApproved && (
              <>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="agree"
                    checked={agreedToTerms}
                    onCheckedChange={(v) => setAgreedToTerms(!!v)}
                  />
                  <label htmlFor="agree" className="text-xs">
                    I agree to the terms above
                  </label>
                </div>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => rejectMutation.mutate()}
                  disabled={rejectMutation.isPending}
                >
                  {rejectMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <X className="h-4 w-4 mr-1" />}
                  Reject
                </Button>
                <Button
                  size="sm"
                  onClick={() => acceptMutation.mutate()}
                  disabled={!agreedToTerms || acceptMutation.isPending}
                >
                  {acceptMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <FileSignature className="h-4 w-4 mr-1" />}
                  Accept & Sign
                </Button>
              </>
            )}
            {!isApproved && (
              <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default MemberLoanAcceptDialog;
