import { useState, useEffect, useRef } from "react";
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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { TrendingUp, Loader2, Upload, CheckCircle2, User, MapPin, FileText, Shield, Camera, AlertCircle, Phone, UserPlus } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { toast } from "sonner";
import { validateRsaId } from "@/lib/rsaIdValidation";

const STEPS = [
  { label: "Personal Details", icon: User },
  { label: "Residential Address", icon: MapPin },
  { label: "Documents", icon: FileText },
  { label: "Terms & Conditions", icon: Shield },
];

type AddressSuggestion = { description: string; place_id: string };

const Onboarding = () => {
  const { user, profile, refreshProfile } = useAuth();
  const { currentTenant, branding } = useTenant();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [entityId, setEntityId] = useState<string | null>(null);

  // Personal details
  const [titleId, setTitleId] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [initials, setInitials] = useState("");
  const [knownAs, setKnownAs] = useState("");
  const [idType, setIdType] = useState<"rsa_id" | "passport">("rsa_id");
  const [idNumber, setIdNumber] = useState("");
  const [gender, setGender] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [phone, setPhone] = useState(profile?.phone ?? "");
  const [altPhone, setAltPhone] = useState("");
  const [ccEmail, setCcEmail] = useState("");
  const [idError, setIdError] = useState("");
  const [phoneError, setPhoneError] = useState("");
  const [altPhoneError, setAltPhoneError] = useState("");
  const [languageCode, setLanguageCode] = useState("en");

  const formatToInternational = (val: string): string => {
    const digits = val.replace(/[^0-9+]/g, "");
    if (digits.startsWith("0")) return "+27" + digits.slice(1);
    if (digits.startsWith("27") && !digits.startsWith("+")) return "+" + digits;
    return digits;
  };

  const toSentenceCase = (val: string): string =>
    val.replace(/\b\w/g, (c) => c.toUpperCase()).replace(/(?<=\w)\w*/g, (c) => c.toLowerCase());

  const deriveInitials = (fullName: string): string =>
    fullName.trim().split(/\s+/).map((w) => w.charAt(0).toUpperCase()).join("");

  const validatePhone = (val: string, required = false): string => {
    if (!val.trim()) return required ? "Mobile number is required" : "";
    const formatted = formatToInternational(val);
    if (!/^\+[1-9]\d{6,14}$/.test(formatted)) return "Enter a valid international number (e.g. +27831234567)";
    return "";
  };

  // Phone OTP verification
  const [otpSent, setOtpSent] = useState(false);
  const [otpCode, setOtpCode] = useState("");
  const [phoneVerified, setPhoneVerified] = useState(false);
  const [sendingOtp, setSendingOtp] = useState(false);
  const [verifyingOtp, setVerifyingOtp] = useState(false);

  // Address
  const [streetAddress, setStreetAddress] = useState("");
  const [suburb, setSuburb] = useState("");
  const [city, setCity] = useState("");
  const [province, setProvince] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [country, setCountry] = useState("South Africa");
  const [addressSearch, setAddressSearch] = useState("");
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [searchTimeout, setSearchTimeout] = useState<ReturnType<typeof setTimeout> | null>(null);

  // Documents
  const [uploadedDocs, setUploadedDocs] = useState<Record<string, { file: File; name: string }>>({});
  const [savedDocs, setSavedDocs] = useState<Record<string, string>>({});

  // Avatar
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(profile?.avatar_url ?? null);
  const initializedEntityIdRef = useRef<string | null>(null);

  // T&C
  const [acceptedTerms, setAcceptedTerms] = useState<Record<string, boolean>>({});
  const [showMembershipPrompt, setShowMembershipPrompt] = useState(false);

  useEffect(() => {
    if (profile) {
      setPhone(profile.phone ?? "");
      if (profile.avatar_url) setAvatarPreview(profile.avatar_url);
      // Restore phone verified status from profile
      if ((profile as any).phone_verified) setPhoneVerified(true);
      // Restore saved onboarding step
      const savedStep = (profile as any).onboarding_step;
      if (typeof savedStep === "number" && savedStep > 0 && savedStep < STEPS.length) {
        setStep(savedStep);
      }
    }
  }, [profile]);

  // Fetch existing entity for this user (for resume)
  const { data: existingEntity } = useQuery({
    queryKey: ["my_entity", user?.id, currentTenant?.id],
    queryFn: async () => {
      if (!user || !currentTenant) return null;
      const { data } = await (supabase as any)
        .from("user_entity_relationships")
        .select("entity_id")
        .eq("user_id", user.id)
        .eq("tenant_id", currentTenant.id)
        .eq("is_primary", true)
        .maybeSingle();
      return data?.entity_id ?? null;
    },
    enabled: !!user && !!currentTenant,
  });

  useEffect(() => {
    if (existingEntity) setEntityId(existingEntity);
  }, [existingEntity]);

  // Fetch entity details for resume (populate form from entity, not profile)
  const { data: entityDetails } = useQuery({
    queryKey: ["entity_details", entityId],
    queryFn: async () => {
      if (!entityId) return null;
      const { data } = await (supabase as any)
        .from("entities")
        .select("*")
        .eq("id", entityId)
        .maybeSingle();
      return data;
    },
    enabled: !!entityId,
  });

  useEffect(() => {
    if (!entityDetails?.id || initializedEntityIdRef.current === entityDetails.id) return;

    initializedEntityIdRef.current = entityDetails.id;
    setFirstName(entityDetails.name ?? "");
    setLastName(entityDetails.last_name ?? "");
    setTitleId(entityDetails.title_id ?? "");
    setInitials(entityDetails.initials ?? "");
    setKnownAs(entityDetails.known_as ?? "");
    setGender(entityDetails.gender ?? "");
    setDateOfBirth(entityDetails.date_of_birth ?? "");
    setAltPhone(entityDetails.additional_contact_number ?? "");
    setCcEmail(entityDetails.additional_email_address ?? "");
    setLanguageCode(entityDetails.language_code ?? "en");
    if (entityDetails.identity_number) {
      setIdType("rsa_id");
      setIdNumber(entityDetails.identity_number);
    } else if (entityDetails.passport_number) {
      setIdType("passport");
      setIdNumber(entityDetails.passport_number);
    }
  }, [entityDetails]);

  // Fetch saved address linked to entity
  const { data: savedAddress } = useQuery({
    queryKey: ["saved_address", entityId, currentTenant?.id],
    queryFn: async () => {
      if (!entityId || !currentTenant) return null;
      const { data } = await supabase
        .from("addresses")
        .select("*")
        .eq("entity_id", entityId)
        .eq("tenant_id", currentTenant.id)
        .eq("is_primary", true)
        .maybeSingle();
      return data;
    },
    enabled: !!entityId && !!currentTenant,
  });

  useEffect(() => {
    if (savedAddress) {
      setStreetAddress(savedAddress.street_address ?? "");
      setSuburb(savedAddress.suburb ?? "");
      setCity(savedAddress.city ?? "");
      setProvince(savedAddress.province ?? "");
      setPostalCode(savedAddress.postal_code ?? "");
      setCountry(savedAddress.country ?? "South Africa");
    }
  }, [savedAddress]);

  // Fetch titles
  const { data: titles = [] } = useQuery({
    queryKey: ["titles"],
    queryFn: async () => {
      const { data } = await supabase.from("titles").select("*").eq("is_active", true).order("description");
      return data ?? [];
    },
  });

  // Fetch countries
  const { data: countries = [] } = useQuery({
    queryKey: ["countries"],
    queryFn: async () => {
      const { data } = await supabase.from("countries").select("*").eq("is_active", true).order("name");
      return data ?? [];
    },
  });

  // Fetch saved documents linked to entity
  const { data: existingDocs = [] } = useQuery({
    queryKey: ["saved_docs", entityId, currentTenant?.id],
    queryFn: async () => {
      if (!entityId || !currentTenant) return [];
      const { data } = await (supabase as any)
        .from("entity_documents")
        .select("document_type_id, file_name")
        .eq("entity_id", entityId)
        .eq("tenant_id", currentTenant.id)
        .eq("is_deleted", false);
      return data ?? [];
    },
    enabled: !!entityId && !!currentTenant,
  });

  useEffect(() => {
    if (existingDocs.length > 0) {
      const map: Record<string, string> = {};
      existingDocs.forEach((d: any) => { map[d.document_type_id] = d.file_name; });
      setSavedDocs(map);
    }
  }, [existingDocs]);

  // Fetch required document types for natural person member
  const { data: requiredDocs = [] } = useQuery({
    queryKey: ["required_docs", currentTenant?.id],
    queryFn: async () => {
      if (!currentTenant) return [];
      // Get relationship type for "Myself" under natural person
      const { data: relTypes } = await supabase
        .from("relationship_types")
        .select("id, name, entity_category_id, entity_categories!inner(entity_type)")
        .eq("name", "Myself");

      const memberRelType = relTypes?.find((r: any) => r.entity_categories?.entity_type === "natural_person");
      if (!memberRelType) return [];

      const { data: requirements } = await supabase
        .from("document_entity_requirements")
        .select("*, document_types!inner(id, name)")
        .eq("tenant_id", currentTenant.id)
        .eq("relationship_type_id", memberRelType.id)
        .eq("is_active", true)
        .eq("is_required_for_registration", true);

      return requirements ?? [];
    },
    enabled: !!currentTenant,
  });

  // Fetch T&C for registration
  const { data: termsForRegistration = [] } = useQuery({
    queryKey: ["registration_terms", currentTenant?.id],
    queryFn: async () => {
      if (!currentTenant) return [];
      const { data } = await supabase
        .from("terms_conditions")
        .select("*")
        .eq("tenant_id", currentTenant.id)
        .eq("is_active", true)
        .eq("condition_type", "registration")
        .eq("language_code", "en")
        .order("condition_type");
      return data ?? [];
    },
    enabled: !!currentTenant,
  });

  // Address autocomplete
  const searchAddress = async (input: string) => {
    if (input.length < 3) { setSuggestions([]); return; }
    try {
      const res = await supabase.functions.invoke("google-places", {
        body: { input, type: "autocomplete" },
      });
      if (res.data?.predictions) {
        setSuggestions(res.data.predictions.map((p: any) => ({ description: p.description, place_id: p.place_id })));
      }
    } catch { setSuggestions([]); }
  };

  const selectAddress = async (suggestion: AddressSuggestion) => {
    setSuggestions([]);
    setAddressSearch(suggestion.description);
    try {
      const res = await supabase.functions.invoke("google-places", {
        body: { input: suggestion.place_id, type: "details" },
      });
      if (res.data?.result) {
        const components = res.data.result.address_components ?? [];
        const get = (type: string) => components.find((c: any) => c.types.includes(type))?.long_name ?? "";
        const streetNum = get("street_number");
        const route = get("route");
        setStreetAddress([streetNum, route].filter(Boolean).join(" "));
        setSuburb(get("sublocality") || get("sublocality_level_1") || get("neighborhood"));
        setCity(get("locality") || get("administrative_area_level_2"));
        setProvince(get("administrative_area_level_1"));
        setPostalCode(get("postal_code"));
        setCountry(get("country") || "South Africa");
      }
    } catch { /* keep manual entry */ }
  };

  const handleAddressSearchChange = (value: string) => {
    setAddressSearch(value);
    if (searchTimeout) clearTimeout(searchTimeout);
    setSearchTimeout(setTimeout(() => searchAddress(value), 400));
  };

  // File upload handler
  const handleFileSelect = (docTypeId: string, file: File) => {
    setUploadedDocs((prev) => ({ ...prev, [docTypeId]: { file, name: file.name } }));
  };

  // Step validation
  const isStep1Valid = Boolean(
    titleId &&
    firstName.trim() &&
    lastName.trim() &&
    idNumber.trim() &&
    !idError &&
    gender &&
    dateOfBirth &&
    phone.trim() &&
    !phoneError
  );
  const isStep2Valid = streetAddress.trim() && city.trim();
  const isStep3Valid = requiredDocs.every((r: any) => uploadedDocs[r.document_type_id] || savedDocs[r.document_type_id]);
  const isStep4Valid = termsForRegistration.every((t) => acceptedTerms[t.id]);

  const canProceed = [isStep1Valid, isStep2Valid, isStep3Valid, isStep4Valid][step];
  const [stepSaving, setStepSaving] = useState(false);

  const saveStep = async (currentStep: number) => {
    if (!user || !currentTenant) return;
    setStepSaving(true);
    try {
      if (currentStep === 0) {
        // Upload avatar if changed
        let avatarUrl = profile?.avatar_url ?? null;
        if (avatarFile) {
          const ext = avatarFile.name.split(".").pop();
          const filePath = `${user.id}/avatar.${ext}`;
          const { error: avatarErr } = await supabase.storage
            .from("avatars")
            .upload(filePath, avatarFile, { upsert: true });
          if (avatarErr) throw avatarErr;
          const { data: urlData } = supabase.storage.from("avatars").getPublicUrl(filePath);
          avatarUrl = urlData.publicUrl;
        }

        // Save phone/avatar/phone_verified to profile
        const { error: profileErr } = await supabase.from("profiles").update({
          phone,
          avatar_url: avatarUrl,
          phone_verified: phoneVerified,
        } as any).eq("user_id", user.id);
        if (profileErr) throw profileErr;

        // Find "Myself" relationship type
        const { data: relTypes } = await supabase
          .from("relationship_types")
          .select("id, name, entity_category_id, entity_categories!inner(entity_type, id)")
          .eq("name", "Myself");
        const myselfRel = relTypes?.find((r: any) => r.entity_categories?.entity_type === "natural_person");
        const naturalPersonCategoryId = (myselfRel as any)?.entity_categories?.id;

        const entityPayload = {
          tenant_id: currentTenant.id,
          name: firstName,
          last_name: lastName,
          initials: initials || null,
          known_as: knownAs || null,
          identity_number: idType === "rsa_id" ? idNumber : null,
          passport_number: idType === "passport" ? idNumber : null,
          gender: gender || null,
          date_of_birth: dateOfBirth || null,
          contact_number: phone || null,
          additional_contact_number: altPhone || null,
          email_address: profile?.email || null,
          additional_email_address: ccEmail || null,
          title_id: titleId || null,
          language_code: languageCode,
          entity_category_id: naturalPersonCategoryId || null,
          creator_user_id: user.id,
          is_registration_complete: false,
        };

        if (entityId) {
          // Update existing entity
          const { error: updateErr } = await (supabase as any)
            .from("entities")
            .update(entityPayload)
            .eq("id", entityId);
          if (updateErr) throw updateErr;
        } else {
          // Create new entity
          const { data: entityData, error: entityErr } = await (supabase as any)
            .from("entities")
            .insert(entityPayload)
            .select("id")
            .single();
          if (entityErr) throw entityErr;
          const newEntityId = entityData.id;
          setEntityId(newEntityId);

          // Create user-entity relationship
          if (myselfRel) {
            const { error: linkErr } = await (supabase as any)
              .from("user_entity_relationships")
              .insert({
                tenant_id: currentTenant.id,
                user_id: user.id,
                entity_id: newEntityId,
                relationship_type_id: myselfRel.id,
                is_primary: true,
              });
            if (linkErr) throw linkErr;
          }
        }
        toast.success("Personal details saved");
      } else if (currentStep === 1) {
        if (!entityId) throw new Error("Entity not found. Please go back and save personal details first.");
        // Upsert address linked to entity
        const addressData = {
          entity_id: entityId,
          tenant_id: currentTenant.id,
          street_address: streetAddress,
          suburb: suburb || null,
          city,
          province: province || null,
          postal_code: postalCode || null,
          country,
        };
        const { data: existing } = await supabase.from("addresses")
          .select("id")
          .eq("entity_id", entityId)
          .eq("tenant_id", currentTenant.id)
          .eq("is_primary", true)
          .limit(1)
          .maybeSingle();
        if (existing) {
          const { error } = await supabase.from("addresses").update(addressData).eq("id", existing.id);
          if (error) throw error;
        } else {
          const { error } = await supabase.from("addresses").insert(addressData);
          if (error) throw error;
        }
        toast.success("Address saved");
      } else if (currentStep === 2) {
        if (!entityId) throw new Error("Entity not found. Please go back and save personal details first.");
        // Upload documents to entity_documents
        for (const [docTypeId, docInfo] of Object.entries(uploadedDocs)) {
          if (!docInfo.file) continue;
          const filePath = `${user.id}/${entityId}/${docTypeId}/${Date.now()}_${docInfo.name}`;
          const { error: uploadErr } = await supabase.storage
            .from("member-documents")
            .upload(filePath, docInfo.file);
          if (uploadErr) throw uploadErr;
          const { error: docErr } = await (supabase as any).from("entity_documents").insert({
            entity_id: entityId,
            tenant_id: currentTenant.id,
            document_type_id: docTypeId,
            file_name: docInfo.name,
            file_path: filePath,
            file_size: docInfo.file.size,
            mime_type: docInfo.file.type,
            creator_user_id: user.id,
          });
          if (docErr) throw docErr;
        }
        toast.success("Documents saved");
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to save. Please try again.");
      throw err;
    } finally {
      setStepSaving(false);
    }
  };

  const handleNext = async () => {
    try {
      await saveStep(step);
      const nextStep = step + 1;
      setStep(nextStep);
      // Persist step progress
      if (user) {
        await supabase.from("profiles").update({
          onboarding_step: nextStep,
        } as any).eq("user_id", user.id);
      }
    } catch {
      // error already toasted
    }
  };

  const saveAll = async () => {
    if (!user || !currentTenant || !entityId) return;
    setSaving(true);
    try {
      // Save T&C acceptances (only if there are terms)
      for (const termId of Object.keys(acceptedTerms).filter((k) => acceptedTerms[k])) {
        const { error: tcErr } = await supabase.from("tc_acceptances").insert({
          user_id: user.id,
          tenant_id: currentTenant.id,
          terms_condition_id: termId,
        });
        if (tcErr) throw tcErr;
      }

      // Check if this user is already a tenant admin (first admin of a new tenant)
      const { data: existingRoles } = await (supabase as any)
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .eq("tenant_id", currentTenant.id)
        .in("role", ["tenant_admin", "super_admin"]);
      const isTenantAdmin = (existingRoles ?? []).length > 0;

      // For legacy users who are already registered, just mark onboarding complete
      // For tenant admins (first user), auto-approve
      // For new regular users, set status to pending_approval for admin review
      const currentStatus = (profile as any)?.registration_status;
      const isLegacyUser = currentStatus === "registered";
      const profileUpdate: any = { needs_onboarding: false };

      if (isLegacyUser || isTenantAdmin) {
        profileUpdate.registration_status = "registered";
      } else {
        profileUpdate.registration_status = "pending_approval";
      }

      const { error: statusErr } = await supabase.from("profiles").update(profileUpdate).eq("user_id", user.id);
      if (statusErr) throw statusErr;

      // Mark entity as registration complete
      const { error: entityErr } = await (supabase as any)
        .from("entities")
        .update({ is_registration_complete: true })
        .eq("id", entityId);
      if (entityErr) throw entityErr;

      // Ensure tenant membership exists (required for RLS on pools, etc.)
      const { data: existingMembership } = await (supabase as any)
        .from("tenant_memberships")
        .select("id")
        .eq("user_id", user.id)
        .eq("tenant_id", currentTenant.id)
        .maybeSingle();
      if (!existingMembership) {
        await (supabase as any).from("tenant_memberships").insert({
          user_id: user.id,
          tenant_id: currentTenant.id,
          is_active: true,
        });
      }

      // Only create membership application for regular new users (not legacy or tenant admin)
      if (!isLegacyUser && !isTenantAdmin) {
        const { data: existingApp } = await (supabase as any)
          .from("membership_applications")
          .select("id")
          .eq("user_id", user.id)
          .eq("tenant_id", currentTenant.id)
          .in("status", ["pending_review", "first_approved"])
          .maybeSingle();
        if (existingApp) {
          await (supabase as any).from("membership_applications")
            .update({ status: "pending_review" }).eq("id", existingApp.id);
        } else {
          await (supabase as any).from("membership_applications").insert({
            user_id: user.id,
            tenant_id: currentTenant.id,
            status: "pending_review",
          });
        }
      }

      // Refresh the cached profile so ProtectedRoute sees updated state
      await refreshProfile();

      // Send registration confirmation email (fire-and-forget)
      supabase.functions.invoke("send-registration-email", {
        body: { tenant_id: currentTenant.id },
      }).catch((err) => console.error("Failed to send registration email:", err));

      if (isLegacyUser || isTenantAdmin) {
        toast.success(isTenantAdmin ? "Registration complete! Welcome to your co-operative." : "Onboarding complete! Welcome back.");
        navigate("/dashboard");
      } else {
        toast.success("Registration submitted for approval! You'll be notified once approved.");
        setShowMembershipPrompt(true);
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to save. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="border-b border-border bg-card px-6 py-4">
        <div className="max-w-3xl mx-auto flex items-center gap-3">
          {branding.logoUrl ? (
            <img src={branding.logoUrl} alt={branding.legalEntityName ?? currentTenant?.name ?? "Logo"} className="h-9 w-auto object-contain" />
          ) : (
            <div className="h-9 w-9 rounded-lg gradient-brand flex items-center justify-center">
              <TrendingUp className="h-5 w-5 text-primary-foreground" />
            </div>
          )}
          <span className="text-xl font-bold">{branding.legalEntityName || currentTenant?.name || ""}</span>
        </div>
      </header>

      <div className="flex-1 flex items-start justify-center p-6 pt-10">
        <div className="w-full max-w-3xl space-y-6 animate-fade-in">
          <div>
            <h1 className="text-2xl font-bold">User Registration</h1>
            <p className="text-muted-foreground">Complete the steps below to complete User registration</p>
          </div>
          {/* Step indicator */}
          <div className="flex items-center justify-between">
            {STEPS.map((s, i) => (
              <div key={i} className="flex items-center gap-2 flex-1">
                <div className={`h-9 w-9 rounded-full flex items-center justify-center text-sm font-semibold transition-colors ${
                  i < step ? "bg-primary text-primary-foreground" :
                  i === step ? "bg-primary text-primary-foreground" :
                  "bg-muted text-muted-foreground"
                }`}>
                  {i < step ? <CheckCircle2 className="h-5 w-5" /> : i + 1}
                </div>
                <span className={`text-sm font-medium hidden sm:inline ${i <= step ? "text-foreground" : "text-muted-foreground"}`}>
                  {s.label}
                </span>
                {i < STEPS.length - 1 && <div className={`flex-1 h-px mx-2 ${i < step ? "bg-primary" : "bg-border"}`} />}
              </div>
            ))}
          </div>

          {/* Step 1: Personal Details */}
          {step === 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Personal Details</CardTitle>
                <CardDescription>Fields marked with * are mandatory</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex gap-4">
                  {/* Avatar spanning both rows */}
                  <div className="shrink-0 flex flex-col items-center gap-1">
                    <div className="relative group cursor-pointer">
                      <Avatar className="h-28 w-28">
                        {avatarPreview ? (
                          <AvatarImage src={avatarPreview} alt="Profile photo" />
                        ) : (
                          <AvatarFallback className="text-lg bg-muted">
                            {firstName && lastName ? `${firstName[0]}${lastName[0]}`.toUpperCase() : <User className="h-6 w-6" />}
                          </AvatarFallback>
                        )}
                      </Avatar>
                      <label
                        htmlFor="avatar-upload"
                        className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                      >
                        <Camera className="h-5 w-5 text-white" />
                      </label>
                      <input
                        id="avatar-upload"
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            setAvatarFile(file);
                            setAvatarPreview(URL.createObjectURL(file));
                          }
                        }}
                      />
                    </div>
                    <span className="text-xs text-muted-foreground">Upload profile pic</span>
                  </div>
                  {/* Name fields */}
                  <div className="flex-1 space-y-3">
                    <div className="grid grid-cols-[100px_1fr_80px] gap-3">
                      <div className="space-y-2">
                        <Label>Title *</Label>
                        <Select value={titleId} onValueChange={setTitleId}>
                          <SelectTrigger><SelectValue placeholder="Title" /></SelectTrigger>
                          <SelectContent>
                            {titles.map((t: any) => (
                              <SelectItem key={t.id} value={t.id}>{t.description}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Full Names *</Label>
                        <Input
                          value={firstName}
                          onChange={(e) => setFirstName(e.target.value)}
                          onBlur={() => {
                            const formatted = toSentenceCase(firstName);
                            setFirstName(formatted);
                            setInitials(deriveInitials(formatted));
                          }}
                          placeholder="Full names"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Initials</Label>
                        <Input value={initials} onChange={(e) => setInitials(e.target.value)} placeholder="e.g. WP" />
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-2">
                        <Label>Last Name *</Label>
                        <Input value={lastName} onChange={(e) => setLastName(e.target.value)} onBlur={() => setLastName(toSentenceCase(lastName))} placeholder="Last name" />
                      </div>
                      <div className="space-y-2">
                        <Label>Known As</Label>
                        <Input value={knownAs} onChange={(e) => setKnownAs(e.target.value)} onBlur={() => setKnownAs(toSentenceCase(knownAs))} placeholder="Nickname" />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Preferred Language *</Label>
                    <Select value={languageCode} onValueChange={setLanguageCode}>
                      <SelectTrigger><SelectValue placeholder="Select language" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="en">English</SelectItem>
                        <SelectItem value="af">Afrikaans</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>ID Type</Label>
                  <RadioGroup value={idType} onValueChange={(v) => { setIdType(v as "rsa_id" | "passport"); setIdNumber(""); setIdError(""); setGender(""); setDateOfBirth(""); }} className="flex gap-4">
                    <div className="flex items-center gap-2">
                      <RadioGroupItem value="rsa_id" id="rsa_id" />
                      <Label htmlFor="rsa_id">RSA ID Number</Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <RadioGroupItem value="passport" id="passport" />
                      <Label htmlFor="passport">Passport</Label>
                    </div>
                  </RadioGroup>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label>{idType === "rsa_id" ? "RSA ID Number" : "Passport Number"} *</Label>
                    <Input
                      value={idNumber}
                      onChange={(e) => {
                        const val = e.target.value;
                        setIdNumber(val);
                        if (idType === "rsa_id" && val.length === 13) {
                          const result = validateRsaId(val);
                          if (result.valid) {
                            setIdError("");
                            setGender(result.gender!);
                            setDateOfBirth(result.dateOfBirth!);
                            toast.success(`ID valid — ${result.gender === "male" ? "Male" : "Female"}, DOB: ${result.dateOfBirth}`);
                          } else {
                            setIdError(result.error || "Invalid ID number");
                          }
                        } else if (idType === "rsa_id" && val.length > 0 && val.length < 13) {
                          setIdError("ID must be 13 digits");
                        } else {
                          setIdError("");
                        }
                      }}
                      placeholder={idType === "rsa_id" ? "e.g. 64XXX450XXXX6" : "Passport number"}
                      maxLength={idType === "rsa_id" ? 13 : undefined}
                      className={idError ? "border-destructive" : ""}
                    />
                    {idError && (
                      <p className="text-xs text-destructive flex items-center gap-1">
                        <AlertCircle className="h-3 w-3" /> {idError}
                      </p>
                    )}
                    {idType === "rsa_id" && idNumber.length === 13 && !idError && (
                      <p className="text-xs text-primary flex items-center gap-1">
                        <CheckCircle2 className="h-3 w-3" /> Valid RSA ID
                      </p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label>Date of Birth *</Label>
                    <Input
                      type="date"
                      value={dateOfBirth}
                      onChange={(e) => setDateOfBirth(e.target.value)}
                      disabled={idType === "rsa_id" && idNumber.length === 13 && !idError}
                      className={idType === "rsa_id" && idNumber.length === 13 && !idError ? "bg-muted" : ""}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Gender *</Label>
                    <Select value={gender} onValueChange={setGender} disabled={idType === "rsa_id" && idNumber.length === 13 && !idError}>
                      <SelectTrigger className={idType === "rsa_id" && idNumber.length === 13 && !idError ? "bg-muted" : ""}>
                        <SelectValue placeholder="Select gender" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="male">Male</SelectItem>
                        <SelectItem value="female">Female</SelectItem>
                        <SelectItem value="other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Mobile Number * {phoneVerified && <span className="text-primary text-xs ml-1">✓ Verified</span>}</Label>
                    <div className="flex gap-2">
                      <Input
                        value={phone}
                        onChange={(e) => {
                          const val = e.target.value;
                          setPhone(val);
                          setPhoneVerified(false);
                          setOtpSent(false);
                          setOtpCode("");
                          setPhoneError(validatePhone(val, true));
                        }}
                        onBlur={() => {
                          if (phone.trim()) {
                            const formatted = formatToInternational(phone.trim());
                            setPhone(formatted);
                            setPhoneError(validatePhone(formatted, true));
                          }
                        }}
                        placeholder="+27831234567"
                        className={`flex-1 ${phoneError ? "border-destructive" : ""}`}
                      />
                      {!phoneVerified && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={!phone.trim() || !!phoneError || sendingOtp}
                          onClick={async () => {
                            setSendingOtp(true);
                            try {
                              const { data, error } = await supabase.functions.invoke("send-otp", {
                                body: { phone: phone.trim(), action: "send" },
                              });
                              if (error) throw error;
                              setOtpSent(true);
                              toast.success(data?.message || "Verification code sent!");
                            } catch (err: any) {
                              toast.error(err.message || "Failed to send code");
                            } finally {
                              setSendingOtp(false);
                            }
                          }}
                        >
                          {sendingOtp ? <Loader2 className="h-4 w-4 animate-spin" /> : <Phone className="h-4 w-4" />}
                          {otpSent ? "Resend" : "Verify"}
                        </Button>
                      )}
                    </div>
                    {otpSent && !phoneVerified && (
                      <div className="flex gap-2 mt-2">
                        <Input
                          value={otpCode}
                          onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                          placeholder="Enter 6-digit code"
                          maxLength={6}
                          className="flex-1"
                        />
                        <Button
                          type="button"
                          size="sm"
                          disabled={otpCode.length !== 6 || verifyingOtp}
                          onClick={async () => {
                            setVerifyingOtp(true);
                            try {
                              const { data, error } = await supabase.functions.invoke("send-otp", {
                                body: { phone: phone.trim(), action: "verify", code: otpCode },
                              });
                              if (error) throw error;
                              if (data?.verified) {
                                setPhoneVerified(true);
                                toast.success("Phone number verified!");
                              } else {
                                toast.error(data?.error || "Invalid code");
                              }
                            } catch (err: any) {
                              toast.error(err.message || "Verification failed");
                            } finally {
                              setVerifyingOtp(false);
                            }
                          }}
                        >
                          {verifyingOtp ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirm"}
                        </Button>
                      </div>
                    )}
                    {phoneError && (
                      <p className="text-xs text-destructive flex items-center gap-1">
                        <AlertCircle className="h-3 w-3" /> {phoneError}
                      </p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label>Alternative Mobile Number</Label>
                    <Input
                      value={altPhone}
                      onChange={(e) => {
                        setAltPhone(e.target.value);
                        if (e.target.value.trim()) setAltPhoneError(validatePhone(e.target.value));
                        else setAltPhoneError("");
                      }}
                      onBlur={() => {
                        if (altPhone.trim()) {
                          const formatted = formatToInternational(altPhone.trim());
                          setAltPhone(formatted);
                          setAltPhoneError(validatePhone(formatted));
                        }
                      }}
                      placeholder="+27831234567"
                      className={altPhoneError ? "border-destructive" : ""}
                    />
                    {altPhoneError && (
                      <p className="text-xs text-destructive flex items-center gap-1">
                        <AlertCircle className="h-3 w-3" /> {altPhoneError}
                      </p>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="flex items-center gap-2">
                      Email Address
                      {(profile as any)?.email_verified ? (
                        <span className="text-primary text-xs">✓ Verified</span>
                      ) : (
                        <span className="text-muted-foreground text-xs">— Please verify via activation email</span>
                      )}
                    </Label>
                    <Input value={user?.email ?? ""} disabled className="bg-muted" />
                  </div>
                  <div className="space-y-2">
                    <Label>CC Email Address</Label>
                    <Input value={ccEmail} onChange={(e) => setCcEmail(e.target.value)} placeholder="Secondary email" />
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Step 2: Address */}
          {step === 1 && (
            <Card>
              <CardHeader>
                <CardTitle>Residential Address</CardTitle>
                <CardDescription>Search or manually enter your address</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2 relative">
                  <Label>Search Address</Label>
                  <Input
                    value={addressSearch}
                    onChange={(e) => handleAddressSearchChange(e.target.value)}
                    placeholder="Start typing your address..."
                  />
                  {suggestions.length > 0 && (
                    <div className="absolute z-10 top-full left-0 right-0 mt-1 bg-card border border-border rounded-lg shadow-lg max-h-48 overflow-y-auto">
                      {suggestions.map((s) => (
                        <button
                          key={s.place_id}
                          className="w-full text-left px-3 py-2 text-sm hover:bg-muted transition-colors"
                          onClick={() => selectAddress(s)}
                        >
                          {s.description}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <Label>Street Address *</Label>
                  <Input value={streetAddress} onChange={(e) => setStreetAddress(e.target.value)} placeholder="Street number and name" />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Suburb</Label>
                    <Input value={suburb} onChange={(e) => setSuburb(e.target.value)} placeholder="Suburb" />
                  </div>
                  <div className="space-y-2">
                    <Label>City *</Label>
                    <Input value={city} onChange={(e) => setCity(e.target.value)} placeholder="City" />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label>Province</Label>
                    <Input value={province} onChange={(e) => setProvince(e.target.value)} placeholder="Province" />
                  </div>
                  <div className="space-y-2">
                    <Label>Postal Code</Label>
                    <Input value={postalCode} onChange={(e) => setPostalCode(e.target.value)} placeholder="Postal code" />
                  </div>
                  <div className="space-y-2">
                    <Label>Country</Label>
                    <Select value={country} onValueChange={setCountry}>
                      <SelectTrigger><SelectValue placeholder="Select country" /></SelectTrigger>
                      <SelectContent>
                        {countries.map((c: any) => (
                          <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Step 3: Documents */}
          {step === 2 && (
            <Card>
              <CardHeader>
                <CardTitle>Upload Documents</CardTitle>
                <CardDescription>Upload the required documents for your registration</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {requiredDocs.length === 0 ? (
                  <p className="text-muted-foreground text-sm text-center py-4">No documents required for registration.</p>
                ) : (
                  requiredDocs.map((req: any) => {
                    const hasNewUpload = !!uploadedDocs[req.document_type_id];
                    const hasSaved = !!savedDocs[req.document_type_id];
                    const docName = hasNewUpload ? uploadedDocs[req.document_type_id].name : hasSaved ? savedDocs[req.document_type_id] : null;
                    return (
                      <div key={req.document_type_id} className="flex items-center justify-between border border-border rounded-lg p-4">
                        <div className="flex-1">
                          <p className="text-sm font-medium">{req.document_types?.name}</p>
                          {docName && (
                            <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                              <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
                              {docName} {hasSaved && !hasNewUpload && <span className="text-primary">(saved)</span>}
                            </p>
                          )}
                        </div>
                        <label className="cursor-pointer">
                          <input
                            type="file"
                            className="hidden"
                            accept=".pdf,.jpg,.jpeg,.png"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) handleFileSelect(req.document_type_id, file);
                            }}
                          />
                          <Button variant={docName ? "outline" : "default"} size="sm" asChild>
                            <span><Upload className="h-3.5 w-3.5 mr-1.5" />{docName ? "Replace" : "Upload"}</span>
                          </Button>
                        </label>
                      </div>
                    );
                  })
                )}
              </CardContent>
            </Card>
          )}

          {/* Step 4: Terms & Conditions */}
          {step === 3 && (
            <Card>
              <CardHeader>
                <CardTitle>Terms & Conditions</CardTitle>
                <CardDescription>Please read and accept the terms below to complete your registration</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {termsForRegistration.length === 0 ? (
                  <p className="text-muted-foreground text-sm text-center py-4">
                    No terms and conditions have been configured yet. You can proceed with registration.
                  </p>
                ) : termsForRegistration.map((term) => (
                  <div key={term.id} className="space-y-3">
                    <h3 className="text-sm font-semibold capitalize">{term.condition_type} Terms</h3>
                    <div className="max-h-48 overflow-y-auto border border-border rounded-lg p-4 bg-muted/30">
                      <div className="prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: term.content }} />
                    </div>
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id={`accept-${term.id}`}
                        checked={!!acceptedTerms[term.id]}
                        onCheckedChange={(checked) => setAcceptedTerms((prev) => ({ ...prev, [term.id]: !!checked }))}
                      />
                      <Label htmlFor={`accept-${term.id}`} className="text-sm">
                        I have read and accept the {term.condition_type} terms and conditions
                      </Label>
                    </div>
                  </div>
                ))}
              
              </CardContent>
            </Card>
          )}

          {/* Navigation */}
          {step === 0 && !canProceed && (
            <div className="text-sm text-destructive flex items-center gap-1.5 bg-destructive/10 p-3 rounded-lg">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>
                Please complete:{" "}
                {[
                  !titleId && "Title",
                  !firstName.trim() && "Full Names",
                  !lastName.trim() && "Last Name",
                  !idNumber.trim() && (idType === "rsa_id" ? "RSA ID Number" : "Passport Number"),
                  idError && "Fix ID number error",
                  !gender && "Gender",
                  !dateOfBirth && "Date of Birth",
                  !phone.trim() && "Mobile Number",
                  phoneError && "Fix mobile number format",
                ].filter(Boolean).join(", ")}
              </span>
            </div>
          )}
          <div className="flex justify-between">
            <Button variant="outline" onClick={() => setStep(step - 1)} disabled={step === 0}>
              Back
            </Button>
            {step < STEPS.length - 1 ? (
              <Button onClick={handleNext} disabled={!canProceed || stepSaving}>
                {stepSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Next
              </Button>
            ) : (
              <Button onClick={saveAll} disabled={!canProceed || saving}>
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Complete User Registration
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Membership Application Prompt */}
      <Dialog open={showMembershipPrompt} onOpenChange={() => {}}>
        <DialogContent className="sm:max-w-md" onPointerDownOutside={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="h-5 w-5 text-primary" />
              Apply for Membership
            </DialogTitle>
            <DialogDescription>
              Your registration is complete! Would you like to apply for membership in your own name now?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setShowMembershipPrompt(false);
                navigate("/dashboard", { replace: true });
              }}
            >
              Not Now
            </Button>
            <Button
              onClick={() => {
                setShowMembershipPrompt(false);
                navigate("/membership-application", { replace: true });
              }}
            >
              <UserPlus className="h-4 w-4 mr-1.5" />
              Yes, Apply Now
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Onboarding;
