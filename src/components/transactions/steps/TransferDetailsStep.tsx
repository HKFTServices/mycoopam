import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  ArrowRight, CheckCircle, Loader2, AlertTriangle,
  TrendingDown, Percent, Minus, ShieldCheck,
} from "lucide-react";

interface FeeBreakdown {
  name: string;
  amount: number;
  vat?: number;
}

interface TransferDetailsStepProps {
  tenantId: string;
  fromAccountId: string;
  poolId: string;
  poolName: string;
  currentHolding: number;
  unitPriceSell: number;
  unitPriceBuy: number;
  feeBreakdown: FeeBreakdown[];
  totalFee: number;
  amount: string;
  useAllUnits: boolean;
  notes: string;
  recipientAccountNumber: string;
  recipientAccountId: string;
  recipientIdNumber: string;
  onAmountChange: (v: string) => void;
  onUseAllUnitsChange: (v: boolean) => void;
  onNotesChange: (v: string) => void;
  onRecipientChange: (accountNumber: string, accountId: string, entityName: string) => void;
  onRecipientIdNumberChange: (idNumber: string) => void;
  formatCurrency: (v: number) => string;
}

type AccountValidation = "idle" | "valid" | "invalid" | "self";
type IdValidation = "idle" | "valid" | "invalid";

const TransferDetailsStep = ({
  tenantId, fromAccountId, poolId, poolName,
  currentHolding, unitPriceSell, unitPriceBuy,
  feeBreakdown, totalFee,
  amount, useAllUnits, notes,
  recipientAccountNumber, recipientAccountId, recipientIdNumber,
  onAmountChange, onUseAllUnitsChange, onNotesChange, onRecipientChange,
  onRecipientIdNumberChange,
  formatCurrency,
}: TransferDetailsStepProps) => {
  const [accountInput, setAccountInput] = useState(recipientAccountNumber);
  const [idInput, setIdInput] = useState(recipientIdNumber);

  const [validatingAccount, setValidatingAccount] = useState(false);
  const [accountValidation, setAccountValidation] = useState<AccountValidation>("idle");

  // Resolved info from account lookup
  const [resolvedEntityId, setResolvedEntityId] = useState<string | null>(null);
  const [resolvedAccountId, setResolvedAccountId] = useState<string | null>(null);
  const [resolvedAccountNumber, setResolvedAccountNumber] = useState<string | null>(null);
  const [resolvedEntityName, setResolvedEntityName] = useState<string | null>(null);

  const [validatingId, setValidatingId] = useState(false);
  const [idValidation, setIdValidation] = useState<IdValidation>("idle");
  const [verifiedPersonName, setVerifiedPersonName] = useState<string | null>(null);

  const accountDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const idDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const allUnitsValue = currentHolding * unitPriceSell;
  const amountNum = parseFloat(amount) || 0;
  const netTransferAmount = useAllUnits ? Math.max(0, allUnitsValue - totalFee) : amountNum;
  const grossRedemption = netTransferAmount + totalFee;
  const grossUnitsRedeemed = unitPriceSell > 0 ? grossRedemption / unitPriceSell : 0;
  const netUnitsReceived = unitPriceBuy > 0 ? netTransferAmount / unitPriceBuy : 0;
  const maxValue = currentHolding * unitPriceSell;

  const bothValid = accountValidation === "valid" && idValidation === "valid";

  const validateAccount = async (val: string) => {
    const trimmed = val.trim().toUpperCase();
    if (!trimmed) {
      setAccountValidation("idle");
      setResolvedEntityId(null);
      setResolvedAccountId(null);
      setResolvedAccountNumber(null);
      setResolvedEntityName(null);
      onRecipientChange("", "", "");
      setIdValidation("idle");
      onRecipientIdNumberChange("");
      return;
    }
    setValidatingAccount(true);
    try {
      const { data } = await (supabase as any)
        .from("entity_accounts")
        .select("id, account_number, entity_id, entity_account_types!inner(account_type), entities!inner(name, last_name)")
        .eq("tenant_id", tenantId)
        .eq("account_number", trimmed)
        .eq("is_approved", true)
        .eq("entity_account_types.account_type", 1)
        .limit(1);

      const acc = data?.[0] ?? null;
      if (!acc) {
        setAccountValidation("invalid");
        setResolvedEntityId(null);
        setResolvedAccountId(null);
        setResolvedAccountNumber(null);
        setResolvedEntityName(null);
        onRecipientChange("", "", "");
      } else if (acc.id === fromAccountId) {
        setAccountValidation("self");
        setResolvedEntityId(null);
        setResolvedAccountId(null);
        setResolvedAccountNumber(null);
        setResolvedEntityName(null);
        onRecipientChange("", "", "");
      } else {
        const entityName = [acc.entities?.name, acc.entities?.last_name].filter(Boolean).join(" ");
        setAccountValidation("valid");
        setResolvedEntityId(acc.entity_id);
        setResolvedAccountId(acc.id);
        setResolvedAccountNumber(acc.account_number);
        setResolvedEntityName(entityName);
        // Reset ID field when account changes
        setIdValidation("idle");
        setIdInput("");
        setVerifiedPersonName(null);
        onRecipientIdNumberChange("");
        onRecipientChange("", "", "");
      }
    } catch {
      setAccountValidation("invalid");
      setResolvedEntityId(null);
      setResolvedAccountId(null);
      setResolvedAccountNumber(null);
      setResolvedEntityName(null);
      onRecipientChange("", "", "");
    } finally {
      setValidatingAccount(false);
    }
  };

  /**
   * Verifies the ID/passport number via a SECURITY DEFINER DB function, which bypasses
   * RLS safely. It checks all entities linked (via shared user) to the recipient's entity.
   * Works for individuals, joint accounts, companies, and trusts.
   */
  const validateId = async (val: string) => {
    const trimmed = val.trim();
    if (!trimmed || !resolvedEntityId) {
      setIdValidation("idle");
      setVerifiedPersonName(null);
      onRecipientChange("", "", "");
      onRecipientIdNumberChange("");
      return;
    }
    setValidatingId(true);
    try {
      const { data, error } = await (supabase as any)
        .rpc("verify_transfer_recipient_id", {
          p_entity_id: resolvedEntityId,
          p_id_number: trimmed,
        });

      const result = data?.[0];

      if (error || !result || !result.is_valid) {
        setIdValidation("invalid");
        setVerifiedPersonName(null);
        onRecipientChange("", "", "");
        onRecipientIdNumberChange("");
      } else {
        setIdValidation("valid");
        setVerifiedPersonName(result.person_name);
        onRecipientIdNumberChange(trimmed);
        if (resolvedAccountNumber && resolvedAccountId && resolvedEntityName) {
          onRecipientChange(resolvedAccountNumber, resolvedAccountId, resolvedEntityName);
        }
      }
    } catch {
      setIdValidation("invalid");
      setVerifiedPersonName(null);
      onRecipientChange("", "", "");
      onRecipientIdNumberChange("");
    } finally {
      setValidatingId(false);
    }
  };

  const handleAccountInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.toUpperCase();
    setAccountInput(val);
    setAccountValidation("idle");
    setIdValidation("idle");
    setResolvedEntityId(null);
    setResolvedAccountId(null);
    setResolvedAccountNumber(null);
    setResolvedEntityName(null);
    setVerifiedPersonName(null);
    onRecipientChange("", "", "");
    onRecipientIdNumberChange("");

    if (accountDebounceRef.current) clearTimeout(accountDebounceRef.current);
    if (val.trim().length >= 3) {
      accountDebounceRef.current = setTimeout(() => validateAccount(val), 600);
    }
  };

  const handleIdInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setIdInput(val);
    setIdValidation("idle");
    setVerifiedPersonName(null);
    onRecipientChange("", "", "");
    onRecipientIdNumberChange("");

    if (idDebounceRef.current) clearTimeout(idDebounceRef.current);
    if (val.trim().length >= 5 && resolvedEntityId) {
      idDebounceRef.current = setTimeout(() => validateId(val), 600);
    }
  };

  useEffect(() => () => {
    if (accountDebounceRef.current) clearTimeout(accountDebounceRef.current);
    if (idDebounceRef.current) clearTimeout(idDebounceRef.current);
  }, []);

  return (
    <div className="space-y-5">
      {/* Verification Notice */}
      <div className="rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 flex items-start gap-2">
        <ShieldCheck className="h-4 w-4 text-primary mt-0.5 shrink-0" />
        <p className="text-xs text-muted-foreground">
          To protect both parties, verify the recipient's <strong>membership number</strong> and the <strong>ID/passport number of the person linked to that membership</strong> — whether an individual, director, trustee, or authorised holder.
        </p>
      </div>

      {/* 1. Recipient account number */}
      <div className="space-y-2">
        <Label className="text-sm font-medium flex items-center gap-2">
          <ArrowRight className="h-4 w-4 text-primary" />
          Recipient Membership Number
        </Label>
        <div className="relative">
          <Input
            placeholder="e.g. AEM00001"
            value={accountInput}
            onChange={handleAccountInputChange}
            className="font-mono pr-9"
          />
          {validatingAccount && (
            <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
          )}
          {!validatingAccount && accountValidation === "valid" && (
            <CheckCircle className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-primary" />
          )}
          {!validatingAccount && (accountValidation === "invalid" || accountValidation === "self") && (
            <AlertTriangle className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-destructive" />
          )}
        </div>
        {accountValidation === "valid" && resolvedEntityName && (
          <p className="text-sm text-primary flex items-center gap-1.5">
            <CheckCircle className="h-3.5 w-3.5" />
            Account <span className="font-mono font-semibold">{accountInput.trim()}</span> — <span className="font-semibold">{resolvedEntityName}</span> — is an active membership.
          </p>
        )}
        {accountValidation === "invalid" && (
          <p className="text-sm text-destructive flex items-center gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5" />
            No active membership found with that number.
          </p>
        )}
        {accountValidation === "self" && (
          <p className="text-sm text-destructive flex items-center gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5" />
            Cannot transfer to your own account.
          </p>
        )}
      </div>

      {/* 2. Linked person's ID/passport — shown once account is valid */}
      {accountValidation === "valid" && (
        <div className="space-y-2">
          <Label className="text-sm font-medium flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-primary" />
            ID / Passport Number of Linked Person
          </Label>
          <p className="text-xs text-muted-foreground">
            Enter the SA ID or passport number of the person linked to this account (e.g. the member, director, trustee, or authorised account holder).
          </p>
          <div className="relative">
            <Input
              placeholder="Enter ID or passport number"
              value={idInput}
              onChange={handleIdInputChange}
              className="pr-9 font-mono"
            />
            {validatingId && (
              <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
            )}
            {!validatingId && idValidation === "valid" && (
              <CheckCircle className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-primary" />
            )}
            {!validatingId && idValidation === "invalid" && (
              <AlertTriangle className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-destructive" />
            )}
          </div>
          {idValidation === "valid" && verifiedPersonName && (
            <p className="text-sm text-primary flex items-center gap-1.5">
              <CheckCircle className="h-3.5 w-3.5" />
              Verified — <strong>{verifiedPersonName}</strong> confirmed as linked person.
            </p>
          )}
          {idValidation === "invalid" && (
            <p className="text-sm text-destructive flex items-center gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5" />
              ID/passport number does not match any person linked to this membership.
            </p>
          )}
        </div>
      )}

      {/* 3. From pool summary */}
      <div className="rounded-xl border-2 border-orange-500/30 bg-orange-500/5 p-4 space-y-3">
        <p className="text-xs font-bold uppercase tracking-wider text-orange-600 dark:text-orange-400 flex items-center gap-1.5">
          <TrendingDown className="h-3.5 w-3.5" /> Redeem From — {poolName}
        </p>
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Available Units</span>
          <span className="font-semibold font-mono">{currentHolding.toFixed(4)}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Unit Price (UP Sell)</span>
          <span className="font-semibold font-mono">{formatCurrency(unitPriceSell)}</span>
        </div>
        <div className="flex justify-between text-sm font-bold text-orange-600 dark:text-orange-400">
          <span>Available Value</span>
          <span>{formatCurrency(maxValue)}</span>
        </div>
      </div>

      {/* 4. Amount / Transfer all — only shown when recipient is fully verified */}
      {bothValid && (
        <>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium">Transfer Amount</Label>
              <div className="flex items-center gap-2">
                <Label className="text-xs text-muted-foreground">Transfer All</Label>
                <Switch checked={useAllUnits} onCheckedChange={onUseAllUnitsChange} />
              </div>
            </div>

            {!useAllUnits && (
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm font-medium">R</span>
                <Input
                  type="number"
                  min="1"
                  step="0.01"
                  placeholder="0.00"
                  className="pl-7"
                  value={amount}
                  onChange={(e) => onAmountChange(e.target.value)}
                />
              </div>
            )}

            {useAllUnits && (
              <div className="rounded-lg bg-muted/50 px-3 py-2 text-sm font-semibold text-primary">
                All units will be transferred: {formatCurrency(allUnitsValue)}
              </div>
            )}
          </div>

          {/* Fee breakdown */}
          {feeBreakdown.length > 0 && grossRedemption > 0 && (
            <div className="rounded-xl border-2 border-border bg-muted/20 p-3 space-y-2">
              <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <Percent className="h-3 w-3" /> Fee Breakdown
              </p>
              {feeBreakdown.map((fee, i) => (
                <div key={i} className="flex justify-between text-sm text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    <Minus className="h-3 w-3" /> {fee.name}
                  </span>
                  <span className="text-destructive font-mono">{formatCurrency(fee.amount)}</span>
                </div>
              ))}
              <Separator />
              <div className="flex justify-between text-sm font-bold text-orange-600 dark:text-orange-400">
                <span>Gross Redeemed from Sender</span>
                <span className="font-mono">{formatCurrency(grossRedemption)}</span>
              </div>
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Gross Units Redeemed (UP Sell {formatCurrency(unitPriceSell)})</span>
                <span className="font-mono">{grossUnitsRedeemed.toFixed(4)} units</span>
              </div>
              <Separator />
              <div className="flex justify-between text-sm font-bold text-primary">
                <span>Net Units Credited to Recipient</span>
                <span className="font-mono">{netUnitsReceived.toFixed(4)} units</span>
              </div>
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Net Value to Recipient</span>
                <span className="font-mono">{formatCurrency(netTransferAmount)}</span>
              </div>
            </div>
          )}

          {/* Notes */}
          <div className="space-y-1.5">
            <Label className="text-sm text-muted-foreground">Notes (optional)</Label>
            <Textarea
              placeholder="Add a note for the approver..."
              value={notes}
              onChange={(e) => onNotesChange(e.target.value)}
              rows={2}
              className="text-sm"
            />
          </div>
        </>
      )}
    </div>
  );
};

export default TransferDetailsStep;
