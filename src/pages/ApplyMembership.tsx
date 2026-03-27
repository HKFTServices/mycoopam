import { useState, useEffect, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useTenant } from "@/contexts/TenantContext";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Loader2, TrendingUp, User, MapPin, Users, Landmark, FileText, Shield, Building, CreditCard } from "lucide-react";
import { toast } from "sonner";
import { ApplicationType, ApplicationData, createInitialData } from "@/components/membership/types";
import PersonDetailsStep from "@/components/membership/PersonDetailsStep";
import EntityDetailsStep from "@/components/membership/EntityDetailsStep";
import AddressStep from "@/components/membership/AddressStep";
import ReferrerStep from "@/components/membership/ReferrerStep";
import BankDetailsStep from "@/components/membership/BankDetailsStep";
import DocumentsStep from "@/components/membership/DocumentsStep";
import TermsStep from "@/components/membership/TermsStep";
import MembershipTypeStep, { useTenantMembershipConfig } from "@/components/membership/MembershipTypeStep";
import type { MembershipSelection } from "@/components/membership/MembershipTypeStep";

const TITLES: Record<string, string> = {
  myself: "Apply for Membership — For Myself",
  person: "Apply for Membership — For Another Person",
  entity: "Apply for Membership — For Another Entity",
};

const LEGAL_ENTITY_TITLE = "Register Legal Entity";

const ApplyMembership = () => {
  const [searchParams] = useSearchParams();
  const rawAppType = (searchParams.get("type") || "myself") as ApplicationType;
  const isLegalEntityMode = searchParams.get("mode") === "legal_entity";
  // Force entity type when in legal entity mode
  const appType = isLegalEntityMode ? "entity" as ApplicationType : rawAppType;
  const { user, profile } = useAuth();
  const { currentTenant } = useTenant();
  const navigate = useNavigate();
  const [data, setData] = useState<ApplicationData>(createInitialData(appType));
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);

  // Membership type config
  const { data: tenantConfig } = useTenantMembershipConfig(currentTenant?.id);
  const fullEnabled = tenantConfig?.full_membership_enabled ?? true;
  const assocEnabled = tenantConfig?.associated_membership_enabled ?? false;

  // Auto-select membership type
  useEffect(() => {
    if (fullEnabled && !assocEnabled) update({ selectedMembershipType: "full" });
    else if (!fullEnabled && assocEnabled) update({ selectedMembershipType: "associated" });
  }, [fullEnabled, assocEnabled]);
  const update = (partial: Partial<ApplicationData>) => setData((prev) => ({ ...prev, ...partial }));

  // For "myself", auto-resolve category and relationship type
  const { data: myselfRelType } = useQuery({
    queryKey: ["myself_rel_type"],
    queryFn: async () => {
      const { data } = await supabase
        .from("relationship_types")
        .select("id, name, entity_category_id, entity_categories!inner(entity_type, id)")
        .eq("name", "Myself");
      return data?.find((r: any) => r.entity_categories?.entity_type === "natural_person") ?? null;
    },
    enabled: appType === "myself",
  });

  // For "myself", pre-fill from profile
  useEffect(() => {
    if (appType === "myself" && myselfRelType && profile) {
      update({
        entityCategoryId: (myselfRelType as any).entity_categories?.id || "",
        relationshipTypeId: myselfRelType.id,
        accountName: [profile.first_name, profile.last_name].filter(Boolean).join(" "),
      });
    }
  }, [appType, myselfRelType, profile]);

  // Pre-fill address for "myself" from saved address
  const { data: savedAddress } = useQuery({
    queryKey: ["user_address", user?.id, currentTenant?.id],
    queryFn: async () => {
      if (!user || !currentTenant) return null;
      const { data } = await supabase.from("addresses").select("*").eq("user_id", user.id).eq("tenant_id", currentTenant.id).eq("is_primary", true).maybeSingle();
      return data;
    },
    enabled: !!user && !!currentTenant && appType === "myself",
  });

  useEffect(() => {
    if (appType === "myself" && savedAddress) {
      update({
        streetAddress: savedAddress.street_address ?? "",
        suburb: savedAddress.suburb ?? "",
        city: savedAddress.city ?? "",
        province: savedAddress.province ?? "",
        postalCode: savedAddress.postal_code ?? "",
        country: savedAddress.country ?? "South Africa",
      });
    }
  }, [savedAddress, appType]);

  // Check bank proof requirement
  const { data: bankProofRequired = false } = useQuery({
    queryKey: ["bank_proof_req", currentTenant?.id, data.relationshipTypeId],
    queryFn: async () => {
      if (!currentTenant || !data.relationshipTypeId) return false;
      const { data: requirements } = await supabase
        .from("document_entity_requirements")
        .select("*, document_types!inner(name)")
        .eq("tenant_id", currentTenant.id)
        .eq("relationship_type_id", data.relationshipTypeId)
        .eq("is_active", true)
        .eq("is_required_for_registration", true);
      return (requirements ?? []).some((r: any) =>
        r.document_types?.name?.toLowerCase().includes("proof of bank") ||
        r.document_types?.name?.toLowerCase().includes("bank")
      );
    },
    enabled: !!currentTenant && !!data.relationshipTypeId,
  });

  // Fetch required doc IDs for validation
  const { data: requiredDocIds = [] } = useQuery({
    queryKey: ["required_doc_ids", currentTenant?.id, data.relationshipTypeId],
    queryFn: async () => {
      if (!currentTenant || !data.relationshipTypeId) return [];
      const { data: reqs } = await supabase
        .from("document_entity_requirements")
        .select("document_type_id")
        .eq("tenant_id", currentTenant.id)
        .eq("relationship_type_id", data.relationshipTypeId)
        .eq("is_active", true)
        .eq("is_required_for_registration", true);
      return (reqs ?? []).map((r: any) => r.document_type_id);
    },
    enabled: !!currentTenant && !!data.relationshipTypeId,
  });

  // Fetch membership terms for validation
  const { data: membershipTerms = [] } = useQuery({
    queryKey: ["membership_terms_ids", currentTenant?.id],
    queryFn: async () => {
      if (!currentTenant) return [];
      const { data: d } = await supabase.from("terms_conditions").select("id").eq("tenant_id", currentTenant.id).eq("is_active", true).eq("condition_type", "membership").eq("language_code", "en");
      return d ?? [];
    },
    enabled: !!currentTenant,
  });

  // Step definitions
  const steps = useMemo(() => {
    const membershipStep = { key: "membership_type", label: "Membership Type", icon: CreditCard };
    const commonWithDocs = [
      { key: "referrer", label: "Referrer & Commission", icon: Users },
      { key: "bank", label: "Bank Details", icon: Landmark },
      { key: "documents", label: "Documents", icon: FileText },
      { key: "tc", label: "Terms & Conditions", icon: Shield },
    ];
    const commonNoDocs = [
      { key: "referrer", label: "Referrer & Commission", icon: Users },
      { key: "bank", label: "Bank Details", icon: Landmark },
      { key: "tc", label: "Terms & Conditions", icon: Shield },
    ];
    if (appType === "myself") {
      // No address or documents step for myself (already provided during onboarding)
      return [membershipStep, ...commonNoDocs];
    }
    if (appType === "person") return [{ key: "person", label: "Personal Details", icon: User }, membershipStep, { key: "address", label: "Address", icon: MapPin }, ...commonWithDocs];
    // entity
    return [{ key: "entity", label: "Entity Details", icon: Building }, membershipStep, { key: "address", label: "Address", icon: MapPin }, ...commonWithDocs];
  }, [appType]);

  const currentKey = steps[step]?.key;

  // Validation
  const isPersonValid = data.entityCategoryId && data.relationshipTypeId && data.titleId && data.firstName.trim() && data.lastName.trim() && data.idNumber.trim() && data.gender && data.dateOfBirth && data.contactNumber.trim() && data.emailAddress.trim();
  const isEntityValid = data.entityCategoryId && data.relationshipTypeId && data.entityName.trim() && data.registrationNumber.trim() && data.contactNumber.trim() && data.emailAddress.trim();
  const isAddressValid = data.streetAddress.trim() && data.city.trim();
  const isReferrerValid = true;
  const isBankFilled = data.bankCountry && data.bankId && data.bankAccountTypeId && data.accountName.trim() && data.accountNumber.trim();
  const isBankValid = bankProofRequired ? (isBankFilled && data.proofFile) : (data.skipBank || !!isBankFilled);
  const isDocsValid = requiredDocIds.every((id: string) => data.uploadedDocs[id]?.length > 0);
  const isTcValid = membershipTerms.every((t: any) => data.acceptedTerms[t.id]);
  const isMembershipTypeValid = data.selectedMembershipType === "full" || data.selectedMembershipType === "associated";

  const stepValidation: Record<string, boolean> = {
    person: !!isPersonValid,
    entity: !!isEntityValid,
    membership_type: isMembershipTypeValid,
    address: !!isAddressValid,
    referrer: isReferrerValid,
    bank: !!isBankValid,
    documents: isDocsValid,
    tc: isTcValid,
  };

  const canProceed = stepValidation[currentKey] ?? false;

  const handleSubmit = async () => {
    if (!user || !currentTenant) return;
    setSaving(true);
    try {
      let entityId: string;

      if (appType === "myself") {
        // Find existing entity
        const { data: rel } = await (supabase as any)
          .from("user_entity_relationships")
          .select("entity_id")
          .eq("user_id", user.id)
          .eq("tenant_id", currentTenant.id)
          .eq("is_primary", true)
          .maybeSingle();
        if (!rel?.entity_id) throw new Error("Entity not found. Please complete registration first.");
        entityId = rel.entity_id;

        // Update address if changed
        const { data: existingAddr } = await supabase.from("addresses").select("id").eq("user_id", user.id).eq("tenant_id", currentTenant.id).eq("is_primary", true).maybeSingle();
        const addrData = {
          street_address: data.streetAddress,
          suburb: data.suburb || null,
          city: data.city,
          province: data.province || null,
          postal_code: data.postalCode || null,
          country: data.country,
        };
        if (existingAddr) {
          await supabase.from("addresses").update(addrData).eq("id", existingAddr.id);
        }
      } else {
        // Create new entity
        const isNaturalPerson = appType === "person";
        const entityPayload: any = {
          tenant_id: currentTenant.id,
          name: isNaturalPerson ? data.firstName : data.entityName,
          last_name: isNaturalPerson ? data.lastName : null,
          initials: isNaturalPerson ? data.initials || null : null,
          known_as: isNaturalPerson ? data.knownAs || null : null,
          identity_number: isNaturalPerson ? data.idNumber || null : null,
          gender: isNaturalPerson ? data.gender || null : null,
          date_of_birth: isNaturalPerson ? data.dateOfBirth || null : null,
          registration_number: !isNaturalPerson ? data.registrationNumber || null : null,
          is_vat_registered: !isNaturalPerson ? data.isVatRegistered : false,
          vat_number: !isNaturalPerson && data.isVatRegistered ? data.vatNumber || null : null,
          contact_number: data.contactNumber || null,
          additional_contact_number: data.altContactNumber || null,
          email_address: data.emailAddress || null,
          additional_email_address: data.ccEmail || null,
          website: !isNaturalPerson ? data.website || null : null,
          title_id: isNaturalPerson ? data.titleId || null : null,
          language_code: data.languageCode,
          entity_category_id: data.entityCategoryId || null,
          creator_user_id: user.id,
          is_registration_complete: true,
        };

        const { data: entityData, error: entityErr } = await (supabase as any)
          .from("entities").insert(entityPayload).select("id").single();
        if (entityErr) throw entityErr;
        entityId = entityData.id;

        // Create user-entity relationship
        await (supabase as any).from("user_entity_relationships").insert({
          tenant_id: currentTenant.id,
          user_id: user.id,
          entity_id: entityId,
          relationship_type_id: data.relationshipTypeId,
          is_primary: false,
        });

        // Create entity address
        await supabase.from("addresses").insert({
          user_id: user.id,
          entity_id: entityId,
          tenant_id: currentTenant.id,
          street_address: data.streetAddress,
          suburb: data.suburb || null,
          city: data.city,
          province: data.province || null,
          postal_code: data.postalCode || null,
          country: data.country,
        } as any);
      }

      // Save bank details to entity_bank_details
      const hasBankDetails = !data.skipBank && data.bankId && data.bankAccountTypeId && data.accountName.trim() && data.accountNumber.trim();
      if (hasBankDetails) {
        await (supabase as any).from("entity_bank_details").insert({
          tenant_id: currentTenant.id,
          entity_id: entityId,
          bank_id: data.bankId,
          bank_account_type_id: data.bankAccountTypeId,
          account_holder: data.accountName,
          account_number: data.accountNumber,
          creator_user_id: user.id,
        });

        // Upload bank proof as entity document if provided
        if (data.proofFile) {
          const proofPath = `${currentTenant.id}/${entityId}/bank-proof/${Date.now()}_${data.proofFile.name}`;
          const { error: uploadErr } = await supabase.storage.from("member-documents").upload(proofPath, data.proofFile);
          if (uploadErr) throw uploadErr;

          await (supabase as any).from("entity_documents").insert({
            tenant_id: currentTenant.id,
            entity_id: entityId,
            file_name: data.proofFile.name,
            file_path: proofPath,
            file_size: data.proofFile.size,
            mime_type: data.proofFile.type,
            description: "Proof of Bank Account",
            creator_user_id: user.id,
          });
        }
      }

      // Upload documents to entity_documents
      for (const [docTypeId, rawDocFiles] of Object.entries(data.uploadedDocs)) {
        const docFiles = Array.isArray(rawDocFiles) ? rawDocFiles : rawDocFiles ? [rawDocFiles] : [];
        for (const docInfo of docFiles) {
          if (!docInfo.file) continue;
          const filePath = `${currentTenant.id}/${entityId}/${docTypeId}/${Date.now()}_${docInfo.name}`;
          await supabase.storage.from("member-documents").upload(filePath, docInfo.file);
          await (supabase as any).from("entity_documents").insert({
            tenant_id: currentTenant.id,
            entity_id: entityId,
            document_type_id: docTypeId,
            file_name: docInfo.name,
            file_path: filePath,
            file_size: docInfo.file.size,
            mime_type: docInfo.file.type,
            creator_user_id: user.id,
          });
        }
      }

      // Save T&C acceptances
      for (const termId of Object.keys(data.acceptedTerms).filter((k) => data.acceptedTerms[k])) {
        await supabase.from("tc_acceptances").insert({
          user_id: user.id,
          tenant_id: currentTenant.id,
          terms_condition_id: termId,
        });
      }

      if (isLegalEntityMode) {
        // Legal entity mode: use the setup-legal-entity edge function
        const { data: result, error: fnError } = await supabase.functions.invoke("setup-legal-entity", {
          body: {
            tenant_id: currentTenant.id,
            user_id: user.id,
            company_name: data.entityName.trim(),
            registration_number: data.registrationNumber.trim() || null,
            is_vat_registered: data.isVatRegistered,
            vat_number: data.isVatRegistered ? data.vatNumber.trim() : null,
            contact_number: data.contactNumber.trim() || null,
            email_address: data.emailAddress.trim() || null,
            website: data.website.trim() || null,
            street_address: data.streetAddress.trim() || null,
            suburb: data.suburb.trim() || null,
            city: data.city.trim() || null,
            province: data.province.trim() || null,
            postal_code: data.postalCode.trim() || null,
            country: data.country.trim(),
            bank_id: data.bankId || null,
            bank_account_type_id: data.bankAccountTypeId || null,
            account_holder: data.accountName.trim() || data.entityName.trim(),
            account_number: data.accountNumber.trim() || null,
          },
        });

        if (fnError) throw fnError;
        if (result?.error) throw new Error(result.error);

        const legalEntityId = result?.entity_id;

        // Upload documents for the legal entity
        if (legalEntityId) {
          for (const [docTypeId, rawDocFiles] of Object.entries(data.uploadedDocs)) {
            const docFiles = Array.isArray(rawDocFiles) ? rawDocFiles : rawDocFiles ? [rawDocFiles] : [];
            for (const docInfo of docFiles) {
              if (!docInfo.file) continue;
              const filePath = `${currentTenant.id}/${legalEntityId}/${docTypeId}/${Date.now()}_${docInfo.name}`;
              await supabase.storage.from("member-documents").upload(filePath, docInfo.file);
              await (supabase as any).from("entity_documents").insert({
                tenant_id: currentTenant.id,
                entity_id: legalEntityId,
                document_type_id: docTypeId,
                file_name: docInfo.name,
                file_path: filePath,
                file_size: docInfo.file.size,
                mime_type: docInfo.file.type,
                creator_user_id: user.id,
              });
            }
          }

          // Save T&C acceptances
          for (const termId of Object.keys(data.acceptedTerms).filter((k) => data.acceptedTerms[k])) {
            await supabase.from("tc_acceptances").insert({
              user_id: user.id,
              tenant_id: currentTenant.id,
              terms_condition_id: termId,
            });
          }
        }

        toast.success("Legal entity registered and linked to your co-operative!");
        navigate("/dashboard", { replace: true });
      } else {
        // Normal membership flow
        // Find correct Membership account type based on selection
        // account_type 1 = Full Membership, account_type 4 = Associated Membership
        const accountTypeCode = data.selectedMembershipType === "associated" ? 4 : 1;
        const { data: membershipType } = await (supabase as any)
          .from("entity_account_types")
          .select("id")
          .eq("account_type", accountTypeCode)
          .eq("is_active", true)
          .maybeSingle();
        if (!membershipType?.id) throw new Error("Membership account type not configured.");

        // Create entity account
        await (supabase as any).from("entity_accounts").insert({
          tenant_id: currentTenant.id,
          entity_id: entityId,
          entity_account_type_id: membershipType.id,
          status: "pending_activation",
        });

        // Create membership application with entity_id for per-entity referrer tracking
        await supabase.from("membership_applications").insert({
          user_id: user.id,
          tenant_id: currentTenant.id,
          entity_id: entityId,
          has_referrer: data.hasReferrer,
          referrer_id: data.hasReferrer && data.referrerId ? data.referrerId : null,
          commission_percentage: parseFloat(data.commissionPercentage),
          status: "pending_activation",
        } as any);

        // Also persist referrer link on the entity itself
        if (data.hasReferrer && data.referrerId) {
          await (supabase as any).from("entities").update({
            agent_house_agent_id: data.referrerId,
            agent_commission_percentage: parseFloat(data.commissionPercentage) || 0,
          }).eq("id", entityId);
        }

        // Send email
        supabase.functions.invoke("send-account-creation-email", {
          body: { tenant_id: currentTenant.id },
        }).catch(console.error);

        toast.success("Membership application submitted successfully!");
        navigate("/dashboard/memberships", { replace: true });
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to submit application.");
    } finally {
      setSaving(false);
    }
  };

  if (!currentTenant) return null;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="border-b border-border bg-card px-6 py-4">
        <div className="max-w-3xl mx-auto flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg gradient-brand flex items-center justify-center">
            <TrendingUp className="h-5 w-5 text-primary-foreground" />
          </div>
          <span className="text-xl font-bold">CoopAdmin</span>
        </div>
      </header>

      <div className="flex-1 flex items-start justify-center p-6 pt-10">
        <div className="w-full max-w-3xl space-y-6 animate-fade-in">
          <div>
            <h1 className="text-2xl font-bold">{TITLES[appType]}</h1>
            <p className="text-muted-foreground">Complete the steps below to apply for membership</p>
          </div>

          {/* Step indicator */}
          <div className="flex flex-wrap items-center gap-y-2 justify-between">
            {steps.map((s, i) => (
              <div key={s.key} className="flex items-center gap-2 flex-1 min-w-0">
                <div className={`h-9 w-9 shrink-0 rounded-full flex items-center justify-center text-sm font-semibold transition-colors ${
                  i < step ? "bg-primary text-primary-foreground" :
                  i === step ? "bg-primary text-primary-foreground" :
                  "bg-muted text-muted-foreground"
                }`}>
                  {i < step ? <CheckCircle2 className="h-5 w-5" /> : i + 1}
                </div>
                <span className={`text-xs font-medium hidden lg:inline truncate ${i <= step ? "text-foreground" : "text-muted-foreground"}`}>
                  {s.label}
                </span>
                {i < steps.length - 1 && <div className={`flex-1 h-px mx-1 ${i < step ? "bg-primary" : "bg-border"}`} />}
              </div>
            ))}
          </div>

          {/* Step content */}
          {currentKey === "person" && <PersonDetailsStep data={data} update={update} tenantId={currentTenant.id} />}
          {currentKey === "entity" && <EntityDetailsStep data={data} update={update} tenantId={currentTenant.id} />}
          {currentKey === "membership_type" && (
            <MembershipTypeStep
              tenantId={currentTenant.id}
              selected={data.selectedMembershipType}
              onSelect={(type) => update({ selectedMembershipType: type })}
            />
          )}
          {currentKey === "address" && <AddressStep data={data} update={update} tenantId={currentTenant.id} />}
          {currentKey === "referrer" && <ReferrerStep data={data} update={update} tenantId={currentTenant.id} />}
          {currentKey === "bank" && <BankDetailsStep data={data} update={update} tenantId={currentTenant.id} bankProofRequired={bankProofRequired} />}
          {currentKey === "documents" && <DocumentsStep data={data} update={update} tenantId={currentTenant.id} />}
          {currentKey === "tc" && <TermsStep data={data} update={update} tenantId={currentTenant.id} />}

          {/* Navigation */}
          <div className="flex justify-between">
            <Button variant="outline" onClick={() => step > 0 ? setStep(step - 1) : navigate("/dashboard/memberships", { replace: true })}>
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

export default ApplyMembership;
