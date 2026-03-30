import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useTenant } from "@/contexts/TenantContext";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Loader2, User, MapPin, Landmark, FileText, Building, Save, Users } from "lucide-react";
import { toast } from "sonner";
import type { ApplicationData } from "./types";
import { createInitialData } from "./types";
import PersonDetailsStep from "./PersonDetailsStep";
import EntityDetailsStep from "./EntityDetailsStep";
import AddressStep from "./AddressStep";
import BankDetailsStep from "./BankDetailsStep";
import DocumentsStep from "./DocumentsStep";
import ReferrerStep from "./ReferrerStep";

interface EditEntityProfileDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entityId: string;
  entityType?: string; // "natural_person" | "legal_entity"
  initialTab?: "details" | "address" | "bank" | "referrer" | "documents";
}

const EditEntityProfileDialog = ({ open, onOpenChange, entityId, entityType, initialTab }: EditEntityProfileDialogProps) => {
  const { user, profile, refreshProfile } = useAuth();
  const { currentTenant } = useTenant();
  const queryClient = useQueryClient();
  const [data, setData] = useState<ApplicationData>(createInitialData("person"));
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState(initialTab || "details");

  const isNaturalPerson = entityType === "natural_person";

  const update = (partial: Partial<ApplicationData>) =>
    setData((prev) => ({ ...prev, ...partial }));

  // Load entity data
  const { data: entity, isLoading: loadingEntity } = useQuery({
    queryKey: ["edit_entity", entityId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("entities")
        .select("*, entity_categories(id, name, entity_type), titles(id, description)")
        .eq("id", entityId)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: open && !!entityId,
  });

  // Load entity address
  const { data: entityAddress } = useQuery({
    queryKey: ["edit_entity_address", entityId],
    queryFn: async () => {
      if (!currentTenant) return null;
      const { data } = await supabase
        .from("addresses")
        .select("*")
        .eq("entity_id", entityId)
        .eq("tenant_id", currentTenant.id)
        .order("is_primary", { ascending: false })
        .limit(1)
        .maybeSingle();
      // If no entity-level address, try user address
      if (!data && user) {
        const { data: userAddr } = await supabase
          .from("addresses")
          .select("*")
          .eq("user_id", user.id)
          .eq("tenant_id", currentTenant.id)
          .eq("is_primary", true)
          .maybeSingle();
        return userAddr;
      }
      return data;
    },
    enabled: open && !!entityId && !!currentTenant,
  });

  // Referrer data is stored on the entity: agent_house_agent_id → referrers.id, agent_commission_percentage

  // Load entity bank details
  const { data: entityBankDetails } = useQuery({
    queryKey: ["edit_entity_bank", entityId],
    queryFn: async () => {
      if (!currentTenant) return null;
      const { data } = await (supabase as any)
        .from("entity_bank_details")
        .select("*, banks(id, name, country_id), bank_account_types(id, name)")
        .eq("entity_id", entityId)
        .eq("tenant_id", currentTenant.id)
        .eq("is_deleted", false)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data;
    },
    enabled: open && !!entityId && !!currentTenant,
  });

  // Load member bank details (user-level)
  const { data: memberBankDetails } = useQuery({
    queryKey: ["edit_member_bank", user?.id],
    queryFn: async () => {
      if (!user || !currentTenant) return null;
      const { data } = await supabase
        .from("member_bank_details")
        .select("*, banks:bank_id(id, name, country_id), bank_account_types:bank_account_type_id(id, name)")
        .eq("user_id", user.id)
        .eq("tenant_id", currentTenant.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data;
    },
    enabled: open && !!user && !!currentTenant,
  });

  // Bank proof requirement
  const { data: bankProofRequired = false } = useQuery({
    queryKey: ["bank_proof_edit", currentTenant?.id, data.relationshipTypeId],
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
        r.document_types?.name?.toLowerCase().includes("bank")
      );
    },
    enabled: open && !!currentTenant && !!data.relationshipTypeId,
  });

  // Populate form when entity loads
  useEffect(() => {
    if (!entity) return;
    const e = entity;
    const isNP = e.entity_categories?.entity_type === "natural_person";

    setData((prev) => ({
      ...prev,
      type: isNP ? "person" : "entity",
      entityCategoryId: e.entity_category_id || "",
      relationshipTypeId: "",
      titleId: e.title_id || "",
      firstName: e.name || "",
      lastName: e.last_name || "",
      initials: e.initials || "",
      knownAs: e.known_as || "",
      idType: e.passport_number ? "passport" : "rsa_id",
      idNumber: e.identity_number || e.passport_number || "",
      gender: e.gender || "",
      dateOfBirth: e.date_of_birth || "",
      languageCode: e.language_code || "en",
      entityName: isNP ? "" : e.name || "",
      registrationNumber: e.registration_number || "",
      isVatRegistered: e.is_vat_registered || false,
      vatNumber: e.vat_number || "",
      contactNumber: e.contact_number || "",
      altContactNumber: e.additional_contact_number || "",
      emailAddress: e.email_address || "",
      ccEmail: e.additional_email_address || "",
      website: e.website || "",
    }));
  }, [entity]);

  // Populate address
  useEffect(() => {
    if (!entityAddress) return;
    setData((prev) => ({
      ...prev,
      streetAddress: entityAddress.street_address || "",
      suburb: entityAddress.suburb || "",
      city: entityAddress.city || "",
      province: entityAddress.province || "",
      postalCode: entityAddress.postal_code || "",
      country: entityAddress.country || "South Africa",
    }));
  }, [entityAddress]);

  // Populate bank details
  useEffect(() => {
    const bank = entityBankDetails || memberBankDetails;
    if (!bank) return;
    const bankRecord = bank.banks || bank;
    setData((prev) => ({
      ...prev,
      skipBank: false,
      bankCountry: bankRecord?.country_id || "",
      bankId: entityBankDetails ? bank.bank_id : bank.bank_id || "",
      bankAccountTypeId: entityBankDetails ? bank.bank_account_type_id : bank.bank_account_type_id || "",
      accountName: entityBankDetails ? bank.account_holder : bank.account_name || "",
      accountNumber: bank.account_number || "",
    }));
  }, [entityBankDetails, memberBankDetails]);

  // Populate referrer fields from entity data
  useEffect(() => {
    if (!entity) return;
    setData((prev) => ({
      ...prev,
      hasReferrer: !!entity.agent_house_agent_id,
      referrerId: entity.agent_house_agent_id ?? "",
      commissionPercentage: String(entity.agent_commission_percentage ?? "0"),
    }));
  }, [entity]);

  // Resolve relationship type for the entity
  useEffect(() => {
    if (!entity || !user || !currentTenant) return;
    const loadRelType = async () => {
      const { data: rel } = await (supabase as any)
        .from("user_entity_relationships")
        .select("relationship_type_id")
        .eq("entity_id", entityId)
        .eq("user_id", user.id)
        .eq("tenant_id", currentTenant.id)
        .limit(1)
        .maybeSingle();
      if (rel?.relationship_type_id) {
        setData((prev) => ({ ...prev, relationshipTypeId: rel.relationship_type_id }));
      }
    };
    loadRelType();
  }, [entity, user, currentTenant, entityId]);

  useEffect(() => {
    if (!open) return;
    setActiveTab(initialTab || "details");
  }, [open, initialTab]);

  const handleSave = async () => {
    if (!user || !currentTenant || !entity) return;
    setSaving(true);
    try {
      // Update entity
      const entityPayload: any = {
        name: isNaturalPerson ? data.firstName : data.entityName,
        last_name: isNaturalPerson ? data.lastName : null,
        initials: isNaturalPerson ? data.initials || null : null,
        known_as: isNaturalPerson ? data.knownAs || null : null,
        identity_number: isNaturalPerson && data.idType === "rsa_id" ? data.idNumber || null : null,
        passport_number: isNaturalPerson && data.idType === "passport" ? data.idNumber || null : null,
        gender: isNaturalPerson ? data.gender || null : null,
        date_of_birth: isNaturalPerson ? data.dateOfBirth || null : null,
        registration_number: !isNaturalPerson ? data.registrationNumber || null : null,
        is_vat_registered: !isNaturalPerson ? data.isVatRegistered : false,
        vat_number: !isNaturalPerson && data.isVatRegistered ? data.vatNumber || null : null,
        contact_number: data.contactNumber || null,
        additional_contact_number: data.altContactNumber || null,
        email_address: data.emailAddress || null,
        additional_email_address: data.ccEmail || null,
        website: data.website || null,
        title_id: isNaturalPerson ? data.titleId || null : null,
        language_code: data.languageCode,
        entity_category_id: data.entityCategoryId || null,
        last_modifier_user_id: user.id,
      };

      const { error: entityErr } = await (supabase as any)
        .from("entities")
        .update(entityPayload)
        .eq("id", entityId);
      if (entityErr) throw entityErr;

      // Reset phone/email verified on profile if contact details changed
      if (profile) {
        const profileUpdates: any = {};
        const newPhone = data.contactNumber ? data.contactNumber.replace(/[^0-9+]/g, "") : "";
        const oldPhone = profile.phone ? profile.phone.replace(/[^0-9+]/g, "") : "";
        if (newPhone && newPhone !== oldPhone) {
          profileUpdates.phone = data.contactNumber;
          profileUpdates.phone_verified = false;
        }
        const newEmail = data.emailAddress?.toLowerCase().trim() || "";
        const oldEmail = (profile.email || "").toLowerCase().trim();
        if (newEmail && newEmail !== oldEmail) {
          profileUpdates.email_verified = false;
        }
        if (Object.keys(profileUpdates).length > 0) {
          await supabase.from("profiles").update(profileUpdates as any).eq("user_id", user!.id);
          await refreshProfile();
        }
      }

      // Update or create address
      if (data.streetAddress.trim() && data.city.trim()) {
        const addrPayload = {
          street_address: data.streetAddress,
          suburb: data.suburb || null,
          city: data.city,
          province: data.province || null,
          postal_code: data.postalCode || null,
          country: data.country,
        };

        if (entityAddress?.id) {
          await supabase.from("addresses").update(addrPayload).eq("id", entityAddress.id);
        } else {
          await supabase.from("addresses").insert({
            ...addrPayload,
            user_id: user.id,
            entity_id: entityId,
            tenant_id: currentTenant.id,
          } as any);
        }
      }

      // Update or create bank details
      const hasBankData = !data.skipBank && data.bankId && data.bankAccountTypeId && data.accountName.trim() && data.accountNumber.trim();
      if (hasBankData) {
        // Upload proof if new file provided
        let proofPath = "";
        let proofName = "";
        if (data.proofFile) {
          proofName = data.proofFile.name;
          proofPath = `${user.id}/bank-proof/${Date.now()}_${data.proofFile.name}`;
          await supabase.storage.from("member-documents").upload(proofPath, data.proofFile);
        }

        if (entityBankDetails?.id) {
          // Update existing entity bank detail
          await (supabase as any).from("entity_bank_details").update({
            bank_id: data.bankId,
            bank_account_type_id: data.bankAccountTypeId,
            account_holder: data.accountName,
            account_number: data.accountNumber,
            last_modifier_user_id: user.id,
          }).eq("id", entityBankDetails.id);
        } else if (memberBankDetails?.id) {
          // Update existing member bank detail
          await supabase.from("member_bank_details").update({
            bank_id: data.bankId,
            bank_account_type_id: data.bankAccountTypeId,
            account_name: data.accountName,
            account_number: data.accountNumber,
            ...(proofPath ? { proof_document_name: proofName, proof_document_path: proofPath } : {}),
          }).eq("id", memberBankDetails.id);
        } else {
          // Create new member bank detail
          await supabase.from("member_bank_details").insert({
            user_id: user.id,
            tenant_id: currentTenant.id,
            bank_id: data.bankId,
            bank_account_type_id: data.bankAccountTypeId,
            account_name: data.accountName,
            account_number: data.accountNumber,
            proof_document_name: proofName || null,
            proof_document_path: proofPath || null,
          });
        }
      }

      // Save referrer data directly on the entity
      await (supabase as any)
        .from("entities")
        .update({
          agent_house_agent_id: data.hasReferrer && data.referrerId ? data.referrerId : null,
          agent_commission_percentage: data.hasReferrer ? parseFloat(data.commissionPercentage) || 0 : 0,
        })
        .eq("id", entityId);

      // Upload new documents (multiple per type)
      for (const [docTypeId, rawDocFiles] of Object.entries(data.uploadedDocs)) {
        const docFiles = Array.isArray(rawDocFiles) ? rawDocFiles : rawDocFiles ? [rawDocFiles] : [];
        for (const docInfo of docFiles) {
          if (!docInfo.file) continue;
          const filePath = `${user.id}/${docTypeId}/${Date.now()}_${docInfo.name}`;
          await supabase.storage.from("member-documents").upload(filePath, docInfo.file);
          await supabase.from("member_documents").insert({
            user_id: user.id,
            tenant_id: currentTenant.id,
            document_type_id: docTypeId,
            file_name: docInfo.name,
            file_path: filePath,
            file_size: docInfo.file.size,
            mime_type: docInfo.file.type,
          });
        }
      }

      toast.success("Profile updated successfully");
      queryClient.invalidateQueries({ queryKey: ["user_linked_entities"] });
      queryClient.invalidateQueries({ queryKey: ["edit_entity", entityId] });
      queryClient.invalidateQueries({ queryKey: ["edit_entity_address", entityId] });
      queryClient.invalidateQueries({ queryKey: ["edit_entity_bank", entityId] });
      queryClient.invalidateQueries({ queryKey: ["edit_member_bank"] });
      queryClient.invalidateQueries({ queryKey: ["entity_referrer_map"] });
      queryClient.invalidateQueries({ queryKey: ["entity_referrer_map"] });
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err.message || "Failed to update profile");
    } finally {
      setSaving(false);
    }
  };

  if (!currentTenant) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* Desktop-only polish: remove visible scrollbar + use a cleaner header/body/footer layout.
          Mobile stays as-is (bottom sheet behavior comes from `DialogContent` base styles). */}
      <DialogContent className="p-0 overflow-hidden flex flex-col max-h-[92dvh] sm:w-[min(94vw,48rem)] sm:max-w-none sm:h-[min(85vh,720px)] sm:max-h-[85vh]">
        <div className="flex flex-col h-full min-h-0">
          <DialogHeader className="px-4 py-3 border-b bg-muted/20 shrink-0 sm:px-6 sm:py-4">
            <DialogTitle className="text-base sm:text-lg">Edit Profile</DialogTitle>
          </DialogHeader>

          {loadingEntity ? (
            <div className="flex items-center justify-center py-12 sm:py-16">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)} className="flex flex-col flex-1 min-h-0">
                <div className="px-4 pt-3 shrink-0 sm:px-6 overflow-x-auto">
                  <TabsList className="w-fit flex gap-1 rounded-xl bg-muted/40 p-1">
                    <TabsTrigger value="details" className="gap-1.5 text-xs sm:text-sm whitespace-nowrap">
                      {isNaturalPerson ? <User className="h-3.5 w-3.5" /> : <Building className="h-3.5 w-3.5" />}
                      Details
                    </TabsTrigger>
                    <TabsTrigger value="address" className="gap-1.5 text-xs sm:text-sm whitespace-nowrap">
                      <MapPin className="h-3.5 w-3.5" />
                      Address
                    </TabsTrigger>
                    <TabsTrigger value="bank" className="gap-1.5 text-xs sm:text-sm whitespace-nowrap">
                      <Landmark className="h-3.5 w-3.5" />
                      Bank
                    </TabsTrigger>
                    <TabsTrigger value="referrer" className="gap-1.5 text-xs sm:text-sm whitespace-nowrap">
                      <Users className="h-3.5 w-3.5" />
                      Referrer
                    </TabsTrigger>
                    <TabsTrigger value="documents" className="gap-1.5 text-xs sm:text-sm whitespace-nowrap">
                      <FileText className="h-3.5 w-3.5" />
                      Documents
                    </TabsTrigger>
                  </TabsList>
                </div>

                <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-4 pt-3 sm:px-6">
                  <TabsContent value="details" className="mt-0">
                    {isNaturalPerson ? (
                      <PersonDetailsStep data={data} update={update} tenantId={currentTenant.id} isEditing />
                    ) : (
                      <EntityDetailsStep data={data} update={update} tenantId={currentTenant.id} />
                    )}
                  </TabsContent>

                  <TabsContent value="address" className="mt-0">
                    <AddressStep data={data} update={update} tenantId={currentTenant.id} />
                  </TabsContent>

                  <TabsContent value="bank" className="mt-0">
                    <BankDetailsStep data={data} update={update} tenantId={currentTenant.id} bankProofRequired={bankProofRequired} />
                  </TabsContent>

                  <TabsContent value="referrer" className="mt-0">
                    <ReferrerStep data={data} update={update} tenantId={currentTenant.id} />
                  </TabsContent>

                  <TabsContent value="documents" className="mt-0">
                    <DocumentsStep data={data} update={update} tenantId={currentTenant.id} entityId={entityId} />
                  </TabsContent>
                </div>
              </Tabs>

              <div className="flex justify-end gap-3 px-4 py-3 border-t border-border bg-background shrink-0 sm:px-6">
                <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>Cancel</Button>
                <Button size="sm" onClick={handleSave} disabled={saving}>
                  {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Save className="h-4 w-4 mr-1.5" />}
                  Save Changes
                </Button>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default EditEntityProfileDialog;
