import { useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useTenant } from "@/contexts/TenantContext";
import { formatCurrency } from "@/lib/formatCurrency";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Loader2, Check, X, Send } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  application: any;
}

const LoanReviewDialog = ({ open, onOpenChange, application: app }: Props) => {
  const { user } = useAuth();
  const { currentTenant } = useTenant();
  const queryClient = useQueryClient();

  // Fetch loan settings for rate/fee lookup
  const { data: loanSettings } = useQuery({
    queryKey: ["loan_settings", currentTenant?.id],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("loan_settings")
        .select("*")
        .eq("tenant_id", currentTenant!.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!currentTenant?.id && open,
  });

  // Fetch budget entries
  const { data: budgetEntries = [] } = useQuery({
    queryKey: ["loan_budget_review", app?.entity_account_id],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("loan_budget_entries")
        .select("*, budget_categories(name, category_type)")
        .eq("entity_account_id", app!.entity_account_id)
        .eq("tenant_id", currentTenant!.id);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!currentTenant?.id && open && !!app,
  });

  const [riskLevel, setRiskLevel] = useState(app?.risk_level ?? "medium");
  const [amountApproved, setAmountApproved] = useState(app?.amount_approved ?? app?.amount_requested ?? 0);
  const [termApproved, setTermApproved] = useState(app?.term_months_approved ?? app?.term_months_requested ?? 12);
  const [reviewNotes, setReviewNotes] = useState(app?.review_notes ?? "");

  useEffect(() => {
    if (!app) return;
    setRiskLevel(app.risk_level ?? "medium");
    setAmountApproved(app.amount_approved ?? app.amount_requested);
    setTermApproved(app.term_months_approved ?? app.term_months_requested);
    setReviewNotes(app.review_notes ?? "");
  }, [app]);

  // Calculate based on risk level
  const interestRate = loanSettings ? Number(loanSettings[`interest_rate_${riskLevel}`] ?? 8) : 8;
  const loanFee = loanSettings ? Number(loanSettings[`loan_fee_${riskLevel}`] ?? 150) : 150;
  const totalInterest = amountApproved * termApproved * (interestRate / 100) / 12;
  const totalLoan = amountApproved + totalInterest + loanFee;
  const monthlyInstalment = termApproved > 0 ? totalLoan / termApproved : 0;

  // Budget summary
  const incomeEntries = budgetEntries.filter((b: any) => b.budget_categories?.category_type === "income");
  const expenseEntries = budgetEntries.filter((b: any) => b.budget_categories?.category_type === "expense");
  const totalIncome = incomeEntries.reduce((s: number, b: any) => s + Number(b.amount), 0);
  const totalExpenses = expenseEntries.reduce((s: number, b: any) => s + Number(b.amount), 0);
  const surplus = totalIncome - totalExpenses;

  const approveMutation = useMutation({
    mutationFn: async () => {
      const { error } = await (supabase as any)
        .from("loan_applications")
        .update({
          status: "approved",
          risk_level: riskLevel,
          amount_approved: amountApproved,
          term_months_approved: termApproved,
          interest_rate: interestRate,
          loan_fee: loanFee,
          total_loan: totalLoan,
          monthly_instalment: monthlyInstalment,
          reviewed_by: user!.id,
          reviewed_at: new Date().toISOString(),
          review_notes: reviewNotes,
        })
        .eq("id", app.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Loan application approved — awaiting member acceptance");
      queryClient.invalidateQueries({ queryKey: ["loan_applications"] });
      onOpenChange(false);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const declineMutation = useMutation({
    mutationFn: async () => {
      if (!reviewNotes.trim()) throw new Error("Please provide a reason for declining");
      const { error } = await (supabase as any)
        .from("loan_applications")
        .update({
          status: "declined",
          reviewed_by: user!.id,
          reviewed_at: new Date().toISOString(),
          review_notes: reviewNotes,
        })
        .eq("id", app.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Loan application declined");
      queryClient.invalidateQueries({ queryKey: ["loan_applications"] });
      onOpenChange(false);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const disburseMutation = useMutation({
    mutationFn: async () => {
      const { error } = await (supabase as any)
        .from("loan_applications")
        .update({
          status: "disbursed",
          admin_signed_at: new Date().toISOString(),
          admin_signature_path: `signed_by_${user!.id}`,
        })
        .eq("id", app.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Loan disbursed — funds released");
      queryClient.invalidateQueries({ queryKey: ["loan_applications"] });
      onOpenChange(false);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const isPending = app.status === "pending";
  const isAccepted = app.status === "accepted";
  const isReadOnly = !isPending && !isAccepted;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>
            {isPending ? "Review Loan Application" : isAccepted ? "Release Funds" : "Loan Application Details"}
          </DialogTitle>
          <DialogDescription>
            {app.entities ? [app.entities.name, app.entities.last_name].filter(Boolean).join(" ") : "—"}
            {" — "}Account: {app.entity_accounts?.account_number ?? "—"}
            <Badge variant="outline" className="ml-2 text-[10px] capitalize">{app.status}</Badge>
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto -mx-6 px-6 space-y-4">
          {/* Member's Request */}
          <Card>
            <CardContent className="py-4 space-y-2">
              <h4 className="text-sm font-semibold">Member's Request</h4>
              <div className="grid grid-cols-2 gap-x-8 gap-y-1 text-sm">
                <span className="text-muted-foreground">Loan Date:</span>
                <span>{app.loan_date}</span>
                <span className="text-muted-foreground">Amount Requested:</span>
                <span className="font-mono">{formatCurrency(app.amount_requested)}</span>
                <span className="text-muted-foreground">Term Requested:</span>
                <span>{app.term_months_requested} months</span>
                <span className="text-muted-foreground">Monthly Available:</span>
                <span className="font-mono">{formatCurrency(app.monthly_available_repayment)}</span>
                <span className="text-muted-foreground">Existing Outstanding:</span>
                <span className="font-mono">{formatCurrency(app.existing_outstanding)}</span>
                <span className="text-muted-foreground">Reason:</span>
                <span>{app.reason || "—"}</span>
                <span className="text-muted-foreground">Security Assets:</span>
                <span>{app.security_assets || "—"}</span>
              </div>
            </CardContent>
          </Card>

          {/* Budget Summary */}
          {budgetEntries.length > 0 && (
            <Card>
              <CardContent className="py-4">
                <h4 className="text-sm font-semibold mb-2">Budget Summary</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs font-medium text-emerald-600 mb-1">Income</p>
                    {incomeEntries.map((b: any) => (
                      <div key={b.id} className="flex justify-between text-xs">
                        <span className="text-muted-foreground">{b.budget_categories?.name}</span>
                        <span className="font-mono">{formatCurrency(Number(b.amount))}</span>
                      </div>
                    ))}
                    <div className="flex justify-between text-xs font-semibold border-t pt-1 mt-1 text-emerald-600">
                      <span>Total</span>
                      <span>{formatCurrency(totalIncome)}</span>
                    </div>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-red-600 mb-1">Expenses</p>
                    {expenseEntries.map((b: any) => (
                      <div key={b.id} className="flex justify-between text-xs">
                        <span className="text-muted-foreground">{b.budget_categories?.name}</span>
                        <span className="font-mono">{formatCurrency(Number(b.amount))}</span>
                      </div>
                    ))}
                    <div className="flex justify-between text-xs font-semibold border-t pt-1 mt-1 text-red-600">
                      <span>Total</span>
                      <span>{formatCurrency(totalExpenses)}</span>
                    </div>
                  </div>
                </div>
                <div className={`flex justify-between text-sm font-bold mt-3 pt-2 border-t ${surplus >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                  <span>Monthly Surplus / (Deficit)</span>
                  <span>{formatCurrency(surplus)}</span>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Manager's Assessment */}
          <Card className="border-primary/30">
            <CardContent className="py-4 space-y-4">
              <h4 className="text-sm font-semibold">Manager's Assessment</h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label className="text-xs">Risk Level</Label>
                  <Select value={riskLevel} onValueChange={setRiskLevel} disabled={isReadOnly}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">Low Risk</SelectItem>
                      <SelectItem value="medium">Medium Risk</SelectItem>
                      <SelectItem value="high">High Risk</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Approved Amount (R)</Label>
                  <Input
                    type="number"
                    min={0}
                    value={amountApproved}
                    onChange={(e) => setAmountApproved(parseFloat(e.target.value) || 0)}
                    disabled={isReadOnly}
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Approved Term (Months)</Label>
                  <Input
                    type="number"
                    min={1}
                    max={loanSettings?.max_term_months ?? 120}
                    value={termApproved}
                    onChange={(e) => setTermApproved(parseInt(e.target.value) || 12)}
                    disabled={isReadOnly}
                  />
                </div>
              </div>

              {/* Calculated figures */}
              <div className="bg-muted/50 rounded-lg p-3">
                <div className="grid grid-cols-2 gap-x-8 gap-y-1 text-sm">
                  <span className="text-muted-foreground">Interest Rate ({riskLevel}):</span>
                  <span className="text-right font-mono">{interestRate}% p.a.</span>
                  <span className="text-muted-foreground">Interest Loading:</span>
                  <span className="text-right font-mono">{formatCurrency(totalInterest)}</span>
                  <span className="text-muted-foreground">Loan Fee:</span>
                  <span className="text-right font-mono">{formatCurrency(loanFee)}</span>
                  <span className="font-semibold border-t pt-1 mt-1">Total Loan:</span>
                  <span className="text-right font-mono font-bold border-t pt-1 mt-1">{formatCurrency(totalLoan)}</span>
                  <span className="text-muted-foreground">Monthly Instalment:</span>
                  <span className="text-right font-mono font-semibold text-primary">{formatCurrency(monthlyInstalment)}</span>
                </div>
                {monthlyInstalment > app.monthly_available_repayment && (
                  <p className="text-xs text-destructive mt-2">
                    ⚠ Monthly instalment exceeds member's stated available repayment of {formatCurrency(app.monthly_available_repayment)}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label className="text-xs">Review Notes</Label>
                <Textarea
                  value={reviewNotes}
                  onChange={(e) => setReviewNotes(e.target.value)}
                  placeholder="Add notes about this application..."
                  rows={3}
                  disabled={isReadOnly && !isAccepted}
                />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Footer Actions */}
        <div className="flex justify-between pt-4 border-t">
          <div>
            {isPending && (
              <Button
                variant="destructive"
                onClick={() => declineMutation.mutate()}
                disabled={declineMutation.isPending}
              >
                {declineMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <X className="h-4 w-4 mr-2" />}
                Decline
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
            {isPending && (
              <Button onClick={() => approveMutation.mutate()} disabled={approveMutation.isPending}>
                {approveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Check className="h-4 w-4 mr-2" />}
                Approve & Send to Member
              </Button>
            )}
            {isAccepted && (
              <Button onClick={() => disburseMutation.mutate()} disabled={disburseMutation.isPending}>
                {disburseMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Send className="h-4 w-4 mr-2" />}
                Sign & Release Funds
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default LoanReviewDialog;
