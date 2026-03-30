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
import { Loader2, X, Download, FileSignature, HandCoins } from "lucide-react";
import { generateAodHtml } from "@/lib/generateAod";
import SignaturePad from "@/components/ui/signature-pad";
import LoanAodContent from "@/components/loans/LoanAodContent";
import LoanRepaymentSchedule from "@/components/loans/LoanRepaymentSchedule";
import DebitOrderSignUpDialog from "@/components/debit-orders/DebitOrderSignUpDialog";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  application: any;
}

const MemberLoanAcceptDialog = ({ open, onOpenChange, application: app }: Props) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [memberSignature, setMemberSignature] = useState<string | null>(null);
  const [showDebitOrder, setShowDebitOrder] = useState(false);

  const entityName = app?.entities
    ? [app?.entities?.name, app?.entities?.last_name].filter(Boolean).join(" ")
    : "—";

  const capital = Number(app?.amount_approved ?? app?.amount_requested ?? 0);
  const term = Number(app?.term_months_approved ?? app?.term_months_requested ?? 0);
  const interestRate = Number(app?.interest_rate ?? 0);
  const loanFee = Number(app?.loan_fee ?? 0);
  const totalInterest = capital * term * (interestRate / 100) / 12;
  const totalLoan = Number(app?.total_loan ?? capital + totalInterest + loanFee);
  const monthlyInstalment = Number(app?.monthly_instalment ?? (term > 0 ? totalLoan / term : 0));

  const isApproved = app?.status === "approved";

  const acceptMutation = useMutation({
    mutationFn: async () => {
      if (!memberSignature) throw new Error("Please sign the document first");
      const { error } = await (supabase as any)
        .from("loan_applications")
        .update({
          status: "accepted",
          member_accepted_at: new Date().toISOString(),
          member_signature_path: `esign_${user!.id}_${Date.now()}`,
          member_signature_data: memberSignature,
        })
        .eq("id", app.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Loan terms accepted — awaiting admin release of funds");
      queryClient.invalidateQueries({ queryKey: ["loan_applications"] });
      onOpenChange(false);
      // Auto-prompt debit order setup
      setShowDebitOrder(true);
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
  if (app && term > 0 && capital > 0) {
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

  if (!app) return null;

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
          <LoanAodContent
            entityName={entityName}
            app={app}
            capital={capital}
            interestRate={interestRate}
            term={term}
            loanFee={loanFee}
            totalInterest={totalInterest}
            totalLoan={totalLoan}
            monthlyInstalment={monthlyInstalment}
          />

          {schedule.length > 0 && <LoanRepaymentSchedule schedule={schedule} />}

          {/* Signatures Section */}
          <Card>
            <CardContent className="py-4 space-y-4">
              <h4 className="text-sm font-semibold">Signatures</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  {app.member_accepted_at && app.member_signature_data ? (
                    <div className="space-y-1">
                      <span className="text-xs text-muted-foreground">Member Signature</span>
                      <div className="border rounded-md bg-white p-1">
                        <img src={app.member_signature_data} alt="Member signature" className="w-full h-auto" />
                      </div>
                      <p className="text-[10px] text-muted-foreground">
                        Signed: {new Date(app.member_accepted_at).toLocaleString("en-ZA")}
                      </p>
                    </div>
                  ) : isApproved ? (
                    <SignaturePad
                      label="Member Signature"
                      value={memberSignature ?? undefined}
                      onChange={setMemberSignature}
                    />
                  ) : (
                    <div>
                      <span className="text-xs text-muted-foreground">Member Signature</span>
                      <div className="border-b border-dashed h-8 mt-1" />
                    </div>
                  )}
                </div>
                <div>
                  {app.admin_signed_at && app.admin_signature_data ? (
                    <div className="space-y-1">
                      <span className="text-xs text-muted-foreground">Admin Signature</span>
                      <div className="border rounded-md bg-white p-1">
                        <img src={app.admin_signature_data} alt="Admin signature" className="w-full h-auto" />
                      </div>
                      <p className="text-[10px] text-muted-foreground">
                        Signed: {new Date(app.admin_signed_at).toLocaleString("en-ZA")}
                      </p>
                    </div>
                  ) : (
                    <div>
                      <span className="text-xs text-muted-foreground">Admin Signature</span>
                      <div className="border-b border-dashed h-8 mt-1" />
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Disbursement Info */}
          {app.status === "disbursed" && (
            <Card className="border-emerald-300">
              <CardContent className="py-3">
                <h4 className="text-sm font-semibold text-emerald-700 mb-2 flex items-center gap-2">
                  <HandCoins className="h-4 w-4 text-emerald-700" />
                  Disbursement Details
                </h4>
                <div className="grid grid-cols-2 gap-x-8 gap-y-1 text-sm">
                  <span className="text-muted-foreground">Reference:</span>
                  <span className="font-mono">{app.disbursement_reference ?? "—"}</span>
                  <span className="text-muted-foreground">Date:</span>
                  <span>{app.disbursement_date ?? "—"}</span>
                  <span className="text-muted-foreground">Amount Paid:</span>
                  <span className="font-mono font-semibold">{formatCurrency(Number(app.disbursement_amount ?? 0))}</span>
                </div>
              </CardContent>
            </Card>
          )}

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
                  disabled={!agreedToTerms || !memberSignature || acceptMutation.isPending}
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

    {/* Auto-prompt debit order after loan acceptance */}
    {app?.entity_accounts?.id && app?.entities?.id && (
      <DebitOrderSignUpDialog
        open={showDebitOrder}
        onOpenChange={setShowDebitOrder}
        entityId={app.entities.id ?? app.entity_id}
        entityName={entityName}
        entityAccountId={app.entity_account_id}
        accountNumber={app.entity_accounts?.account_number}
      />
    )}
  </>
  );
};

export default MemberLoanAcceptDialog;
