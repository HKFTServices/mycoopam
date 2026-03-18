import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/contexts/TenantContext";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import SignaturePad from "@/components/ui/signature-pad";
import { CreditCard, AlertCircle } from "lucide-react";
import { formatLocalDate } from "@/lib/formatDate";

interface DebitOrderStepProps {
  entityId: string;
  // Bank details
  bankName: string;
  onBankNameChange: (v: string) => void;
  branchCode: string;
  onBranchCodeChange: (v: string) => void;
  accountName: string;
  onAccountNameChange: (v: string) => void;
  bankAccountNumber: string;
  onBankAccountNumberChange: (v: string) => void;
  bankAccountType: string;
  onBankAccountTypeChange: (v: string) => void;
  // Debit order details
  frequency: string;
  onFrequencyChange: (v: string) => void;
  startDate: string;
  onStartDateChange: (v: string) => void;
  debitOrderNotes: string;
  onDebitOrderNotesChange: (v: string) => void;
  // Signature
  signatureData: string | null;
  onSignatureDataChange: (v: string | null) => void;
  // Summary info for display
  grossAmount: number;
  formatCurrency: (v: number) => string;
}

const getFirstOfNextMonth = () => {
  const now = new Date();
  const next = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return formatLocalDate(next);
};

const DebitOrderStep = ({
  entityId,
  bankName, onBankNameChange,
  branchCode, onBranchCodeChange,
  accountName, onAccountNameChange,
  bankAccountNumber, onBankAccountNumberChange,
  bankAccountType, onBankAccountTypeChange,
  frequency, onFrequencyChange,
  startDate, onStartDateChange,
  debitOrderNotes, onDebitOrderNotesChange,
  signatureData, onSignatureDataChange,
  grossAmount, formatCurrency,
}: DebitOrderStepProps) => {
  const { currentTenant } = useTenant();

  // Pre-fill bank details from entity_bank_details
  const { data: existingBank } = useQuery({
    queryKey: ["entity_bank_debit_txn", entityId, currentTenant?.id],
    queryFn: async () => {
      if (!currentTenant) return null;
      const { data } = await (supabase as any)
        .from("entity_bank_details")
        .select("account_holder, account_number, bank_id, bank_account_type_id, banks(name, branch_code), bank_account_types(name)")
        .eq("entity_id", entityId)
        .eq("tenant_id", currentTenant.id)
        .eq("is_active", true)
        .eq("is_deleted", false)
        .limit(1)
        .maybeSingle();
      return data;
    },
    enabled: !!entityId && !!currentTenant,
  });

  // Auto-fill bank details when data loads (only if fields are empty)
  useEffect(() => {
    if (existingBank && !bankName && !bankAccountNumber) {
      onBankNameChange(existingBank.banks?.name ?? "");
      onBranchCodeChange(existingBank.banks?.branch_code ?? "");
      onAccountNameChange(existingBank.account_holder ?? "");
      onBankAccountNumberChange(existingBank.account_number ?? "");
      onBankAccountTypeChange(existingBank.bank_account_types?.name?.toLowerCase() ?? "savings");
    }
  }, [existingBank]);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="rounded-xl border-2 border-primary/20 bg-primary/5 p-4 flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-primary flex items-center justify-center shrink-0">
          <CreditCard className="h-5 w-5 text-primary-foreground" />
        </div>
        <div>
          <p className="font-bold text-sm">Debit Order Setup</p>
          <p className="text-xs text-muted-foreground">
            Set up a recurring debit order of {formatCurrency(grossAmount)} per month
          </p>
        </div>
      </div>

      {/* Frequency & Start Date */}
      <div>
        <h3 className="font-semibold text-sm mb-3">Debit Order Schedule</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <div>
            <Label>Debit Day</Label>
            <Input value="1st" disabled className="bg-muted" />
          </div>
          <div>
            <Label>Frequency</Label>
            <Select value={frequency} onValueChange={onFrequencyChange}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="monthly">Monthly</SelectItem>
                <SelectItem value="quarterly">Quarterly</SelectItem>
                <SelectItem value="annually">Annually</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="col-span-2 sm:col-span-1">
            <Label>Start Date (1st of month)</Label>
            <Input
              type="month"
              value={startDate.substring(0, 7)}
              onChange={(e) => onStartDateChange(e.target.value + "-01")}
              min={getFirstOfNextMonth().substring(0, 7)}
            />
          </div>
        </div>
      </div>

      <Separator />

      {/* Bank Details */}
      <div>
        <h3 className="font-semibold text-sm mb-3">Bank Details</h3>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Bank Name</Label>
            <Input value={bankName} onChange={(e) => onBankNameChange(e.target.value)} placeholder="e.g. FNB" />
          </div>
          <div>
            <Label>Branch Code</Label>
            <Input value={branchCode} onChange={(e) => onBranchCodeChange(e.target.value)} placeholder="e.g. 250655" />
          </div>
          <div>
            <Label>Account Holder Name</Label>
            <Input value={accountName} onChange={(e) => onAccountNameChange(e.target.value)} placeholder="Name on bank account" />
          </div>
          <div>
            <Label>Account Number</Label>
            <Input value={bankAccountNumber} onChange={(e) => onBankAccountNumberChange(e.target.value)} placeholder="Bank account number" />
          </div>
          <div>
            <Label>Account Type</Label>
            <Select value={bankAccountType} onValueChange={onBankAccountTypeChange}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="savings">Savings</SelectItem>
                <SelectItem value="current">Current / Cheque</SelectItem>
                <SelectItem value="transmission">Transmission</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      <Separator />

      {/* Notes */}
      <div>
        <Label>Additional Notes (optional)</Label>
        <Textarea
          value={debitOrderNotes}
          onChange={(e) => onDebitOrderNotesChange(e.target.value)}
          placeholder="Any special instructions for the debit order..."
          rows={2}
        />
      </div>

      <Separator />

      {/* Signature */}
      <div>
        <h3 className="font-semibold text-sm mb-2">Signature</h3>
        <p className="text-xs text-muted-foreground mb-3">
          By signing below, you authorize the debit order mandate for {formatCurrency(grossAmount)} {frequency}.
        </p>
        <div className="border rounded-md p-4">
          <SignaturePad
            value={signatureData ?? undefined}
            onChange={onSignatureDataChange}
            label="SIGNATURE AS USED FOR SIGNING CHEQUES"
            width={600}
            height={150}
          />
        </div>
        {!signatureData && (
          <p className="text-xs text-destructive flex items-center gap-1 mt-2">
            <AlertCircle className="h-3 w-3" />
            Signature is required to proceed
          </p>
        )}
      </div>
    </div>
  );
};

export default DebitOrderStep;
