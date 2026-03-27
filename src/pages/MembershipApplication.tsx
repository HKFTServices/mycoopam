import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useTenant } from "@/contexts/TenantContext";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { TrendingUp, Loader2, Upload, CheckCircle2, Landmark, Users, Shield, CreditCard } from "lucide-react";
import { toast } from "sonner";
import MembershipTypeStep, { useTenantMembershipConfig } from "@/components/membership/MembershipTypeStep";
import type { MembershipSelection } from "@/components/membership/MembershipTypeStep";
import ReferrerStep from "@/components/membership/ReferrerStep";

const MembershipApplication = () => {
  const { user, profile } = useAuth();
  const { currentTenant, company } = useTenant();
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);

  // Membership type
  const { data: tenantConfig } = useTenantMembershipConfig(currentTenant?.id);
  const fullEnabled = tenantConfig?.full_membership_enabled ?? true;
  const assocEnabled = tenantConfig?.associated_membership_enabled ?? false;
  const [selectedMembershipType, setSelectedMembershipType] = useState<MembershipSelection>("full");

  useEffect(() => {
    if (fullEnabled && !assocEnabled) setSelectedMembershipType("full");
    else if (!fullEnabled && assocEnabled) setSelectedMembershipType("associated");
  }, [fullEnabled, assocEnabled]);

  // Determine if bank details are required
  const { data: bankProofRequired = false } = useQuery({
    queryKey: ["bank_proof_required", currentTenant?.id],
    queryFn: async () => {
      if (!currentTenant) return false;
      const { data: relTypes } = await supabase
        .from("relationship_types")
        .select("id, name, entity_category_id, entity_categories!inner(entity_type)")
        .eq("name", "Myself");
      const memberRelType = relTypes?.find((r: any) => r.entity_categories?.entity_type === "natural_person");
      if (!memberRelType) return false;
      const { data: requirements } = await supabase
        .from("document_entity_requirements")
        .select("*, document_types!inner(id, name)")
        .eq("tenant_id", currentTenant.id)
        .eq("relationship_type_id", memberRelType.id)
        .eq("is_active", true)
        .eq("is_required_for_registration", true);
      return (requirements ?? []).some((r: any) =>
        r.document_types?.name?.toLowerCase().includes("proof of bank") ||
        r.document_types?.name?.toLowerCase().includes("bank")
      );
    },
    enabled: !!currentTenant,
  });

  const steps = useMemo(() => [
    { label: "Membership Type", icon: CreditCard },
    { label: bankProofRequired ? "Bank Details" : "Bank Details (Optional)", icon: Landmark },
    { label: "Referrer", icon: Users },
    { label: "Membership T&C", icon: Shield },
  ], [bankProofRequired]);

  const [step, setStep] = useState(0);
  const [skipBank, setSkipBank] = useState(!bankProofRequired);
  const [bankCountry, setBankCountry] = useState("");
  const [bankId, setBankId] = useState("");
  const [bankAccountTypeId, setBankAccountTypeId] = useState("");
  const [accountName, setAccountName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [hasReferrer, setHasReferrer] = useState(false);
  const [referrerId, setReferrerId] = useState("");
  const [commissionPercentage, setCommissionPercentage] = useState("0");
  const [acceptedTerms, setAcceptedTerms] = useState<Record<string, boolean>>({});

  const { data: userAddress } = useQuery({
    queryKey: ["user_address_country", user?.id, currentTenant?.id],
    queryFn: async () => {
      if (!user || !currentTenant) return null;
      const { data } = await supabase.from("addresses").select("country").eq("user_id", user.id).eq("tenant_id", currentTenant.id).eq("is_primary", true).maybeSingle();
      return data;
    },
    enabled: !!user && !!currentTenant,
  });

  const { data: countries = [] } = useQuery({
    queryKey: ["countries_active"],
    queryFn: async () => {
      const { data } = await supabase.from("countries").select("*").eq("is_active", true).order("name");
      return data ?? [];
    },
  });

  useEffect(() => { setSkipBank(!bankProofRequired); }, [bankProofRequired]);

  useEffect(() => {
    if (userAddress?.country && countries.length > 0 && !bankCountry) {
      const match = countries.find((c) => c.name.toLowerCase() === userAddress.country.toLowerCase());
      if (match) setBankCountry(match.id);
    }
  }, [userAddress, countries, bankCountry]);

  useEffect(() => {
    if (profile && !accountName) setAccountName([profile.first_name, profile.last_name].filter(Boolean).join(" "));
  }, [profile, accountName]);

  const { data: banks = [] } = useQuery({
    queryKey: ["banks_by_country", bankCountry],
    queryFn: async () => {
      if (!bankCountry) return [];
      const { data } = await supabase.from("banks").select("*").eq("country_id", bankCountry).eq("is_active", true).order("name");
      return data ?? [];
    },
    enabled: !!bankCountry,
  });

  const { data: bankAccountTypes = [] } = useQuery({
    queryKey: ["bank_account_types"],
    queryFn: async () => {
      const { data } = await supabase.from("bank_account_types").select("*").eq("is_active", true).order("name");
      return data ?? [];
    },
  });

  const selectedBank = banks.find((b) => b.id === bankId);

  const { data: membershipTerms = [] } = useQuery({
    queryKey: ["membership_terms", currentTenant?.id],
    queryFn: async () => {
      if (!currentTenant) return [];
      const { data } = await supabase.from("terms_conditions").select("*").eq("tenant_id", currentTenant.id).eq("is_active", true).eq("condition_type", "membership").eq("language_code", "en").order("effective_from", { ascending: false });
      return data ?? [];
    },
    enabled: !!currentTenant,
  });

  const commissionOptions = useMemo(() => {
    const options = [];
    for (let i = 0; i <= 20; i++) {
      const val = (i * 0.25).toFixed(2);
      options.push({ value: val, label: `${(i * 0.25).toFixed(2)}%` });
    }
    return options;
  }, []);

  const isBankFilled = bankCountry && bankId && bankAccountTypeId && accountName.trim() && accountNumber.trim();
  const isBankStepValid = bankProofRequired ? (isBankFilled && proofFile) : (skipBank || !!isBankFilled);
  const isReferrerStepValid = true;
  const isTcStepValid = membershipTerms.every((t) => acceptedTerms[t.id]);

  const getStepType = (stepIdx: number) => {
    if (stepIdx === 0) return "membership_type";
    if (stepIdx === 1) return "bank";
    if (stepIdx === 2) return "referrer";
    return "tc";
  };

  const currentStepType = getStepType(step);

  const canProceed = currentStepType === "membership_type" ? true
    : currentStepType === "bank" ? isBankStepValid
    : currentStepType === "referrer" ? isReferrerStepValid
    : isTcStepValid;

  const handleSubmit = async () => {
    if (!user || !currentTenant) return;
    setSaving(true);
    try {
      const hasBankDetails = !skipBank && bankId && bankAccountTypeId && accountName.trim() && accountNumber.trim();
      if (hasBankDetails) {
        let proofPath = "";
        let proofName = "";
        if (proofFile) {
          proofName = proofFile.name;
          proofPath = `${user.id}/bank-proof/${Date.now()}_${proofFile.name}`;
          const { error: uploadErr } = await supabase.storage.from("member-documents").upload(proofPath, proofFile);
          if (uploadErr) throw uploadErr;
        }
        const { error: bankErr } = await supabase.from("member_bank_details").insert({
          user_id: user.id, tenant_id: currentTenant.id, bank_id: bankId,
          bank_account_type_id: bankAccountTypeId, account_name: accountName,
          account_number: accountNumber,
          proof_document_name: proofName || null, proof_document_path: proofPath || null,
        });
        if (bankErr) throw bankErr;
      }

      for (const termId of Object.keys(acceptedTerms).filter((k) => acceptedTerms[k])) {
        const { error: tcErr } = await supabase.from("tc_acceptances").insert({
          user_id: user.id, tenant_id: currentTenant.id, terms_condition_id: termId,
        });
        if (tcErr) throw tcErr;
      }

      const { data: userEntity } = await (supabase as any)
        .from("user_entity_relationships").select("entity_id, relationship_types!inner(name)")
        .eq("user_id", user.id).eq("tenant_id", currentTenant.id)
        .eq("relationship_types.name", "Myself").limit(1).maybeSingle();
      if (!userEntity?.entity_id) throw new Error("Entity not found. Please complete registration first.");

      // Use selected membership type: 1 = Full, 4 = Associated
      const accountTypeCode = selectedMembershipType === "associated" ? 4 : 1;
      console.log("Looking up entity_account_types with tenant_id:", currentTenant.id, "account_type:", accountTypeCode);
      const { data: membershipAccountType, error: eatErr } = await (supabase as any)
        .from("entity_account_types").select("id")
        .eq("tenant_id", currentTenant.id).eq("account_type", accountTypeCode).eq("is_active", true).maybeSingle();
      console.log("entity_account_types result:", membershipAccountType, "error:", eatErr);
      if (eatErr) throw new Error(`Account type lookup failed: ${eatErr.message}`);
      if (!membershipAccountType?.id) throw new Error(`Membership account type not configured for tenant ${currentTenant.id}, type ${accountTypeCode}. Contact your administrator.`);

      const { error: eaErr } = await (supabase as any).from("entity_accounts").insert({
        tenant_id: currentTenant.id, entity_id: userEntity.entity_id,
        entity_account_type_id: membershipAccountType.id, status: "pending_activation",
      });
      if (eaErr) throw eaErr;

      const { error: appErr } = await supabase.from("membership_applications").insert({
        user_id: user.id, tenant_id: currentTenant.id,
        entity_id: userEntity.entity_id,
        has_referrer: hasReferrer,
        referrer_id: hasReferrer && referrerId ? referrerId : null,
        commission_percentage: parseFloat(commissionPercentage), status: "pending_activation",
      } as any);
      if (appErr) throw appErr;

      // Also persist referrer link on the entity itself
      if (hasReferrer && referrerId) {
        await (supabase as any).from("entities").update({
          agent_house_agent_id: referrerId,
          agent_commission_percentage: parseFloat(commissionPercentage) || 0,
        }).eq("id", userEntity.entity_id);
      }

      supabase.functions.invoke("send-account-creation-email", {
        body: { tenant_id: currentTenant.id },
      }).catch((err) => console.error("Failed to send account creation email:", err));

      toast.success(
        "Membership application submitted! To activate your membership and receive your membership number, please make your first deposit.",
        {
          duration: 8000,
          action: {
            label: "Deposit Now",
            onClick: () => navigate("/transactions", { state: { openNewTransaction: true, defaultTxnCode: "DEPOSIT_FUNDS" } }),
          },
        }
      );
      navigate("/dashboard", { replace: true });
    } catch (err: any) {
      toast.error(err.message || "Failed to submit application. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="border-b border-border bg-card px-6 py-4">
        <div className="max-w-3xl mx-auto flex items-center gap-3">
          {company.logoUrl ? (
            <img src={company.logoUrl} alt={company.name} className="h-9 max-w-[120px] object-contain" />
          ) : (
            <div className="h-9 w-9 rounded-lg gradient-brand flex items-center justify-center">
              <TrendingUp className="h-5 w-5 text-primary-foreground" />
            </div>
          )}
          <span className="text-xl font-bold">{company.name}</span>
        </div>
      </header>

      <div className="flex-1 flex items-start justify-center p-6 pt-10">
        <div className="w-full max-w-3xl space-y-6 animate-fade-in">
          <div>
            <h1 className="text-2xl font-bold">Membership Application</h1>
            <p className="text-muted-foreground">Complete the steps below to apply for membership</p>
          </div>

          {/* Step indicator */}
          <div className="flex items-center justify-between">
            {steps.map((s, i) => (
              <div key={i} className="flex items-center gap-2 flex-1">
                <div className={`h-9 w-9 rounded-full flex items-center justify-center text-sm font-semibold transition-colors ${
                  i <= step ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                }`}>
                  {i < step ? <CheckCircle2 className="h-5 w-5" /> : i + 1}
                </div>
                <span className={`text-sm font-medium hidden sm:inline ${i <= step ? "text-foreground" : "text-muted-foreground"}`}>
                  {s.label}
                </span>
                {i < steps.length - 1 && <div className={`flex-1 h-px mx-2 ${i < step ? "bg-primary" : "bg-border"}`} />}
              </div>
            ))}
          </div>

          {/* Membership Type Step */}
          {currentStepType === "membership_type" && currentTenant && (
            <MembershipTypeStep
              tenantId={currentTenant.id}
              selected={selectedMembershipType}
              onSelect={setSelectedMembershipType}
            />
          )}

          {/* Bank Details Step */}
          {currentStepType === "bank" && (
            <Card>
              <CardHeader>
                <CardTitle>Bank Details</CardTitle>
                <CardDescription>
                  {bankProofRequired
                    ? "Enter your banking information and upload proof of bank account"
                    : "Bank details are not required at this stage, but you can complete them now if you wish."}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {!bankProofRequired && (
                  <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/30 p-4">
                    <Switch checked={skipBank} onCheckedChange={(v) => setSkipBank(v)} />
                    <Label className="text-sm">Skip bank details for now</Label>
                  </div>
                )}
                {!skipBank && (
                  <>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Country *</Label>
                        <Select value={bankCountry} onValueChange={(v) => { setBankCountry(v); setBankId(""); }}>
                          <SelectTrigger><SelectValue placeholder="Select country" /></SelectTrigger>
                          <SelectContent>
                            {countries.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Bank *</Label>
                        <Select value={bankId} onValueChange={setBankId} disabled={!bankCountry}>
                          <SelectTrigger><SelectValue placeholder={bankCountry ? "Select bank" : "Select country first"} /></SelectTrigger>
                          <SelectContent>
                            {banks.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    {selectedBank && (
                      <div className="rounded-lg border border-border bg-muted/30 p-3 text-sm space-y-1">
                        <div className="flex gap-4">
                          {selectedBank.branch_code && <span><span className="text-muted-foreground">Branch Code:</span> {selectedBank.branch_code}</span>}
                          {selectedBank.swift_code && <span><span className="text-muted-foreground">SWIFT:</span> {selectedBank.swift_code}</span>}
                          {selectedBank.sort_route_code && <span><span className="text-muted-foreground">Sort/Route:</span> {selectedBank.sort_route_code}</span>}
                        </div>
                      </div>
                    )}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <div className="space-y-2">
                        <Label>Account Name *</Label>
                        <Input value={accountName} onChange={(e) => setAccountName(e.target.value)} placeholder="Account holder name" />
                      </div>
                      <div className="space-y-2">
                        <Label>Account Type *</Label>
                        <Select value={bankAccountTypeId} onValueChange={setBankAccountTypeId}>
                          <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                          <SelectContent>
                            {bankAccountTypes.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Account Number *</Label>
                        <Input value={accountNumber} onChange={(e) => setAccountNumber(e.target.value)} placeholder="Account number" />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>Proof of Bank Account{bankProofRequired ? " *" : ""}</Label>
                      <div className="flex items-center gap-3 border border-border rounded-lg p-4">
                        <div className="flex-1">
                          {proofFile ? (
                            <p className="text-sm flex items-center gap-1"><CheckCircle2 className="h-3.5 w-3.5 text-primary" />{proofFile.name}</p>
                          ) : (
                            <p className="text-sm text-muted-foreground">Upload a bank statement or confirmation letter</p>
                          )}
                        </div>
                        <label className="cursor-pointer">
                          <input type="file" className="hidden" accept=".pdf,.jpg,.jpeg,.png" onChange={(e) => { const file = e.target.files?.[0]; if (file) setProofFile(file); }} />
                          <Button variant={proofFile ? "outline" : "default"} size="sm" asChild>
                            <span><Upload className="h-3.5 w-3.5 mr-1.5" />{proofFile ? "Replace" : "Upload"}</span>
                          </Button>
                        </label>
                      </div>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          )}

          {/* Referrer Step */}
          {currentStepType === "referrer" && currentTenant && (
            <ReferrerStep
              data={{
                hasReferrer,
                referrerId,
                commissionPercentage,
              } as any}
              update={(partial: any) => {
                if ("hasReferrer" in partial) setHasReferrer(partial.hasReferrer);
                if ("referrerId" in partial) setReferrerId(partial.referrerId);
                if ("commissionPercentage" in partial) setCommissionPercentage(partial.commissionPercentage);
              }}
              tenantId={currentTenant.id}
            />
          )}

          {/* Membership T&C Step */}
          {currentStepType === "tc" && (
            <Card>
              <CardHeader>
                <CardTitle>Membership Terms & Conditions</CardTitle>
                <CardDescription>Please read and accept the membership terms to complete your application</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {membershipTerms.length === 0 ? (
                  <p className="text-muted-foreground text-sm text-center py-4">No membership terms configured yet. Please contact the administrator.</p>
                ) : membershipTerms.map((term) => (
                  <div key={term.id} className="space-y-3">
                    <h3 className="text-sm font-semibold capitalize">{term.condition_type} Terms</h3>
                    <div className="max-h-48 overflow-y-auto border border-border rounded-lg p-4 bg-muted/30">
                      <div className="prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: term.content }} />
                    </div>
                    <div className="flex items-center gap-2">
                      <Checkbox id={`accept-membership-${term.id}`} checked={!!acceptedTerms[term.id]} onCheckedChange={(checked) => setAcceptedTerms((prev) => ({ ...prev, [term.id]: !!checked }))} />
                      <Label htmlFor={`accept-membership-${term.id}`} className="text-sm">I have read and accept the membership terms and conditions</Label>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Navigation */}
          <div className="flex justify-between">
            <Button variant="outline" onClick={() => step > 0 ? setStep(step - 1) : navigate("/dashboard", { replace: true })}>
              {step === 0 ? "Cancel" : "Back"}
            </Button>
            {step < steps.length - 1 ? (
              <Button onClick={() => setStep(step + 1)} disabled={!canProceed}>Next</Button>
            ) : (
              <Button onClick={handleSubmit} disabled={!canProceed || saving}>
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Submit Application
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default MembershipApplication;
