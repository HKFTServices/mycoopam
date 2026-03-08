import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useTenant } from "@/contexts/TenantContext";
import { formatCurrency } from "@/lib/formatCurrency";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Loader2, ArrowLeft, ArrowRight, Send } from "lucide-react";
import BudgetStep from "./steps/BudgetStep";
import LoanDetailsStep from "./steps/LoanDetailsStep";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entityAccountId: string;
  entityId: string;
  entityName: string;
}

const LoanApplicationDialog = ({ open, onOpenChange, entityAccountId, entityId, entityName }: Props) => {
  const { user } = useAuth();
  const { currentTenant } = useTenant();
  const queryClient = useQueryClient();
  const [step, setStep] = useState<"budget" | "details">("budget");

  // Loan settings
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

  // Existing outstanding loans
  const { data: existingOutstanding = 0 } = useQuery({
    queryKey: ["existing_loan_outstanding", currentTenant?.id, entityId],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("get_loan_outstanding", {
        p_tenant_id: currentTenant!.id,
      });
      if (error) throw error;
      const match = (data ?? []).find((d: any) => d.entity_id === entityId);
      return match ? Number(match.outstanding) : 0;
    },
    enabled: !!currentTenant?.id && !!entityId && open,
  });

  // Budget entries (check if recent)
  const { data: budgetData } = useQuery({
    queryKey: ["loan_budget_entries", currentTenant?.id, entityAccountId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("loan_budget_entries")
        .select("*, budget_categories(name, category_type)")
        .eq("tenant_id", currentTenant!.id)
        .eq("entity_account_id", entityAccountId);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!currentTenant?.id && !!entityAccountId && open,
  });

  // Check if budget was completed within 6 months
  const hasBudget = (budgetData?.length ?? 0) > 0;
  const budgetIsRecent = hasBudget && budgetData?.some((b: any) => {
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    return new Date(b.updated_at) > sixMonthsAgo;
  });

  // Fetch pools for selection
  const { data: pools = [] } = useQuery({
    queryKey: ["pools_for_loan", currentTenant?.id],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("pools")
        .select("id, name")
        .eq("tenant_id", currentTenant!.id)
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!currentTenant?.id && open,
  });

  // Loan details form state
  const [loanForm, setLoanForm] = useState({
    loan_date: new Date().toISOString().split("T")[0],
    amount_requested: 0,
    term_months_requested: loanSettings?.max_term_months ?? 12,
    monthly_available_repayment: 0,
    reason: "",
    security_assets: "",
    pool_id: "",
  });

  const submitMutation = useMutation({
    mutationFn: async () => {
      if (!currentTenant || !user) throw new Error("Missing context");
      if (loanForm.amount_requested <= 0) throw new Error("Loan amount must be greater than zero");
      if (!loanForm.reason.trim()) throw new Error("Reason is required");
      if (!loanForm.pool_id) throw new Error("Please select a pool");

      const { error } = await (supabase as any)
        .from("loan_applications")
        .insert({
          tenant_id: currentTenant.id,
          entity_account_id: entityAccountId,
          entity_id: entityId,
          applicant_user_id: user.id,
          loan_date: loanForm.loan_date,
          amount_requested: loanForm.amount_requested,
          term_months_requested: loanForm.term_months_requested,
          monthly_available_repayment: loanForm.monthly_available_repayment,
          existing_outstanding: existingOutstanding,
          reason: loanForm.reason,
          security_assets: loanForm.security_assets,
          pool_id: loanForm.pool_id,
          status: "pending",
        });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Loan application submitted successfully");
      queryClient.invalidateQueries({ queryKey: ["loan_applications"] });
      onOpenChange(false);
      setStep("budget");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const handleClose = (v: boolean) => {
    onOpenChange(v);
    if (!v) setStep("budget");
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-3xl h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>
            Apply for Loan — {entityName}
          </DialogTitle>
          <DialogDescription>
            {step === "budget"
              ? `Step 1: Budget Summary${budgetIsRecent ? " (recent budget found — review and update if needed)" : ""}`
              : "Step 2: Loan Details"}
            {existingOutstanding > 0 && (
              <span className="block mt-1 text-orange-600">
                Existing outstanding loan: {formatCurrency(existingOutstanding)}
              </span>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto -mx-6 px-6">
          {step === "budget" ? (
            <BudgetStep
              tenantId={currentTenant?.id ?? ""}
              entityAccountId={entityAccountId}
              existingEntries={budgetData ?? []}
              isRecent={budgetIsRecent ?? false}
            />
          ) : (
            <LoanDetailsStep
              form={loanForm}
              onChange={setLoanForm}
              loanSettings={loanSettings}
              existingOutstanding={existingOutstanding}
              maxTermMonths={loanSettings?.max_term_months ?? 12}
            />
          )}
        </div>

        <div className="flex justify-between pt-4 border-t">
          {step === "details" ? (
            <Button variant="outline" onClick={() => setStep("budget")}>
              <ArrowLeft className="h-4 w-4 mr-2" /> Back to Budget
            </Button>
          ) : <div />}
          {step === "budget" ? (
            <Button onClick={() => setStep("details")}>
              Next: Loan Details <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          ) : (
            <Button onClick={() => submitMutation.mutate()} disabled={submitMutation.isPending}>
              {submitMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Send className="h-4 w-4 mr-2" />}
              Submit Application
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default LoanApplicationDialog;
