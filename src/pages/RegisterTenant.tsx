import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Loader2, ArrowLeft, ArrowRight, Building2, Eye, EyeOff, Upload, X, Coins, Plus, ShieldCheck,
  User, MapPin, FileText, Shield, CheckCircle2, AlertCircle, Scale,
} from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { formatCurrency } from "@/lib/formatCurrency";
import myCoopLogo from "@/assets/mycoop-logo-transparent.png";
import { getTenantUrl } from "@/lib/getSiteUrl";
import { validateRsaId } from "@/lib/rsaIdValidation";

const ADMIN_POOL_NAME = "Admin";

const accountTypeLabels: Record<number, string> = {
  1: "Full Membership", 2: "Customer", 3: "Supplier",
  4: "Associated Membership", 5: "Referral House", 6: "Legal Entity", 7: "Administrator",
};
const typeSuffix: Record<number, string> = {
  1: "M", 2: "C", 3: "S", 4: "A", 5: "R", 6: "L", 7: "D",
};

function generatePrefixes(tenantName: string): Record<number, string> {
  const words = tenantName.trim().split(/\s+/).filter((w) => w.length > 0);
  const initials = words.slice(0, 2).map((w) => w[0].toUpperCase()).join("");
  const firstLetter = initials[0] || "X";
  const result: Record<number, string> = {};
  for (const key of Object.keys(accountTypeLabels)) {
    const k = Number(key);
    result[k] = k === 1 ? (initials || "M") : firstLetter + typeSuffix[k];
  }
  return result;
}

interface PoolOption { id: string; name: string; description: string | null; isAdmin?: boolean; }
type AddressSuggestion = { description: string; place_id: string };

const TOTAL_STEPS = 8;
const stepTitles = [
  "Co-operative & Admin", "Service Agreement", "Branding & Prefixes", "Investment Pools",
  "Personal Details", "Residential Address", "Documents",
  "Terms & Conditions",
];
const stepIcons = [Building2, Scale, Upload, Coins, User, MapPin, FileText, Shield];

const toSentenceCase = (val: string): string =>
  val.replace(/\b\w/g, (c) => c.toUpperCase()).replace(/(?<=\w)\w*/g, (c) => c.toLowerCase());
const deriveInitials = (fullName: string): string =>
  fullName.trim().split(/\s+/).map((w) => w.charAt(0).toUpperCase()).join("");
const formatToInternational = (val: string): string => {
  const digits = val.replace(/[^0-9+]/g, "");
  if (digits.startsWith("0")) return "+27" + digits.slice(1);
  if (digits.startsWith("27") && !digits.startsWith("+")) return "+" + digits;
  return digits;
};
const validatePhone = (val: string, required = false): string => {
  if (!val.trim()) return required ? "Mobile number is required" : "";
  const formatted = formatToInternational(val);
  if (!/^\+[1-9]\d{6,14}$/.test(formatted)) return "Enter a valid international number (e.g. +27831234567)";
  return "";
};

const RegisterTenant = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);

  // ─── Step 1: Co-op + Admin credentials ───
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [registrationNumber, setRegistrationNumber] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  // ─── Step 2: Service Agreement (SLA Plan Selection) ───
  const [feePlans, setFeePlans] = useState<any[]>([]);
  const [feePlansLoading, setFeePlansLoading] = useState(false);
  const [selectedPlanId, setSelectedPlanId] = useState("");
  const [slaSignature, setSlaSignature] = useState("");
  const [slaAccepted, setSlaAccepted] = useState(false);

  // ─── Step 3: Logo + Prefixes ───
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [prefixes, setPrefixes] = useState<Record<number, string>>({});

  // ─── Step 4: Pools ───
  const [pools, setPools] = useState<PoolOption[]>([]);
  const [selectedPools, setSelectedPools] = useState<string[]>([]);
  const [customPools, setCustomPools] = useState<string[]>([]);
  const [newPoolName, setNewPoolName] = useState("");
  const [poolsLoading, setPoolsLoading] = useState(false);

  // ─── Step 5: Personal Details ───
  const [titleId, setTitleId] = useState("");
  const [initials, setInitials] = useState("");
  const [knownAs, setKnownAs] = useState("");
  const [idType, setIdType] = useState<"rsa_id" | "passport">("rsa_id");
  const [idNumber, setIdNumber] = useState("");
  const [gender, setGender] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [phone, setPhone] = useState("");
  const [altPhone, setAltPhone] = useState("");
  const [ccEmail, setCcEmail] = useState("");
  const [languageCode, setLanguageCode] = useState("en");
  const [idError, setIdError] = useState("");
  const [phoneError, setPhoneError] = useState("");
  const [altPhoneError, setAltPhoneError] = useState("");

  // ─── Step 6: Address ───
  const [streetAddress, setStreetAddress] = useState("");
  const [suburb, setSuburb] = useState("");
  const [city, setCity] = useState("");
  const [province, setProvince] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [country, setCountry] = useState("South Africa");
  const [addressSearch, setAddressSearch] = useState("");
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [searchTimeout, setSearchTimeout] = useState<ReturnType<typeof setTimeout> | null>(null);

  // ─── Step 7: Documents ───
  const [uploadedDocs, setUploadedDocs] = useState<Record<string, { file: File; name: string }>>({});

  // ─── Step 8: T&Cs ───
  const [acceptedTerms, setAcceptedTerms] = useState<Record<string, boolean>>({});

  // ─── Reference data (fetched once) ───
  const [refData, setRefData] = useState<any>(null);
  const [refLoading, setRefLoading] = useState(false);

  // Auto-generate prefixes
  useEffect(() => {
    if (name.trim()) setPrefixes(generatePrefixes(name));
  }, [name]);

  // Load fee plans at step 2
  useEffect(() => {
    if (step === 2 && feePlans.length === 0) loadFeePlans();
  }, [step]);

  // Load pools at step 4
  useEffect(() => {
    if (step === 4 && pools.length === 0) loadPools();
  }, [step]);

  // Load reference data when reaching step 5
  useEffect(() => {
    if (step >= 5 && !refData && !refLoading) loadRefData();
  }, [step]);

  const loadFeePlans = async () => {
    setFeePlansLoading(true);
    try {
      const { data, error } = await (supabase as any)
        .from("sla_fee_plans")
        .select("*")
        .eq("is_active", true)
        .order("plan_code");
      if (error) throw error;
      setFeePlans(data ?? []);
    } catch (err) {
      console.error("Failed to load fee plans:", err);
    } finally {
      setFeePlansLoading(false);
    }
  };


  const loadPools = async () => {
    setPoolsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("provision-tenant", {
        body: { action: "list_pools" },
      });
      if (error) throw error;
      const poolList = data?.pools ?? [];
      const enriched: PoolOption[] = poolList.map((p: any) => ({
        id: p.id, name: p.name, description: p.description,
        isAdmin: p.name.toLowerCase() === ADMIN_POOL_NAME.toLowerCase(),
      }));
      setPools(enriched);
      setSelectedPools(poolList.map((p: any) => p.id));
    } catch (err) {
      console.error("Failed to load pools:", err);
    } finally {
      setPoolsLoading(false);
    }
  };

  const loadRefData = async () => {
    setRefLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("provision-tenant", {
        body: { action: "list_reference_data" },
      });
      if (error) throw error;
      setRefData(data);
    } catch (err) {
      console.error("Failed to load reference data:", err);
    } finally {
      setRefLoading(false);
    }
  };

  const handleNameChange = (value: string) => {
    setName(value);
    setSlug(value.toLowerCase().replace(/[^a-z0-9\s-]/g, "").replace(/\s+/g, "-").replace(/-+/g, "-").slice(0, 30));
  };

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: "Logo too large", description: "Maximum 5MB", variant: "destructive" });
      return;
    }
    setLogoFile(file);
    const reader = new FileReader();
    reader.onload = () => setLogoPreview(reader.result as string);
    reader.readAsDataURL(file);
  };

  const removeLogo = () => { setLogoFile(null); setLogoPreview(null); };

  const updatePrefix = (accountType: number, value: string) => {
    setPrefixes((prev) => ({ ...prev, [accountType]: value.toUpperCase().replace(/[^A-Z0-9]/g, "") }));
  };

  const adminPoolId = pools.find((p) => p.isAdmin)?.id;
  const togglePool = (id: string) => {
    if (id === adminPoolId) return;
    setSelectedPools((prev) => prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]);
  };

  const addCustomPool = () => {
    const trimmed = newPoolName.trim();
    if (!trimmed) return;
    if (customPools.some((p) => p.toLowerCase() === trimmed.toLowerCase()) ||
        pools.some((p) => p.name.toLowerCase() === trimmed.toLowerCase())) {
      toast({ title: "Pool name already exists", variant: "destructive" });
      return;
    }
    setCustomPools((prev) => [...prev, trimmed]);
    setNewPoolName("");
  };

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

  // ─── Validation ───
  const validateStep = (s: number): boolean => {
    switch (s) {
      case 1:
        if (!name.trim() || !slug.trim() || !registrationNumber.trim() || !email.trim() || !password || !firstName.trim() || !lastName.trim()) {
          toast({ title: "Please fill in all fields", variant: "destructive" }); return false;
        }
        if (password !== confirmPassword) {
          toast({ title: "Passwords do not match", variant: "destructive" }); return false;
        }
        if (password.length < 6) {
          toast({ title: "Password must be at least 6 characters", variant: "destructive" }); return false;
        }
        if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(slug)) {
          toast({ title: "Invalid slug", description: "Only lowercase letters, numbers, and hyphens.", variant: "destructive" }); return false;
        }
        return true;
      case 2:
        if (!selectedPlanId) {
          toast({ title: "Please select a service plan", variant: "destructive" }); return false;
        }
        if (!slaAccepted) {
          toast({ title: "Please accept the service agreement", variant: "destructive" }); return false;
        }
        return true;
      case 3:
        if (Object.entries(prefixes).some(([, v]) => !v.trim())) {
          toast({ title: "All prefixes are required", variant: "destructive" }); return false;
        }
        return true;
      case 4:
        if (selectedPools.length === 0) {
          toast({ title: "Select at least one pool", variant: "destructive" }); return false;
        }
        return true;
      case 5:
        if (!titleId || !firstName.trim() || !lastName.trim() || !idNumber.trim() || idError || !gender || !dateOfBirth || !phone.trim() || phoneError) {
          toast({ title: "Please complete all required fields", variant: "destructive" }); return false;
        }
        return true;
      case 6:
        if (!streetAddress.trim() || !city.trim()) {
          toast({ title: "Street address and city are required", variant: "destructive" }); return false;
        }
        return true;
      case 7: return true; // documents optional
      case 8: {
        const terms = refData?.terms ?? [];
        if (terms.length > 0 && !terms.every((t: any) => acceptedTerms[t.id])) {
          toast({ title: "Please accept all terms & conditions", variant: "destructive" }); return false;
        }
        return true;
      }
      default: return true;
    }
  };

  const handleNext = () => {
    if (!validateStep(step)) return;
    setStep((s) => s + 1);
  };
  const handleBack = () => setStep((s) => s - 1);

  // ─── Submit ───
  const handleSubmit = async () => {
    if (!validateStep(step)) return;
    setLoading(true);
    try {
      // 1. Check slug uniqueness
      const { data: existing } = await supabase.from("tenants").select("id").eq("slug", slug).maybeSingle();
      if (existing) {
        toast({ title: "Slug already taken", description: "Please choose a different URL slug.", variant: "destructive" });
        setStep(1); setLoading(false); return;
      }

      // 2. Create tenant
      const { data: tenant, error: tenantError } = await supabase
        .from("tenants").insert({ name: name.trim(), slug: slug.trim() }).select().single();
      if (tenantError) throw tenantError;

      // 3. Prepare logo as base64 for server-side upload
      let logoBase64: string | null = null;
      let logoFileName: string | null = null;
      let logoMimeType: string | null = null;
      if (logoFile) {
        const arrayBuf = await logoFile.arrayBuffer();
        const bytes = new Uint8Array(arrayBuf);
        let binary = "";
        for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
        logoBase64 = btoa(binary);
        logoFileName = logoFile.name;
        logoMimeType = logoFile.type;
      }

      localStorage.setItem("currentTenantId", tenant.id);
      localStorage.setItem("tenantSlug", slug);
      localStorage.setItem("pendingTenantSlug", slug);

      // 7. Prepare document base64
      const adminDocuments: any[] = [];
      for (const [docTypeId, docInfo] of Object.entries(uploadedDocs)) {
        if (!docInfo.file) continue;
        const arrayBuf = await docInfo.file.arrayBuffer();
        const bytes = new Uint8Array(arrayBuf);
        let binary = "";
        for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
        const base64 = btoa(binary);
        adminDocuments.push({
          doc_type_id: docTypeId,
          file_name: docInfo.name,
          file_data: base64,
          file_size: docInfo.file.size,
          mime_type: docInfo.file.type,
        });
      }

      // 8. Provision tenant with all data
      const { data: provData, error: provError } = await supabase.functions.invoke("provision-tenant", {
        body: {
          tenant_id: tenant.id,
          registration_number: registrationNumber.trim(),
          selected_pool_ids: selectedPools,
          custom_pools: customPools.length > 0 ? customPools : undefined,
          entity_account_type_prefixes: prefixes,
          sla_fee_plan_id: selectedPlanId,
          sla_signature: slaSignature || null,
          logo_data: logoBase64,
          logo_file_name: logoFileName,
          logo_mime_type: logoMimeType,
          admin_details: {
            email: email.trim(),
            password,
            first_name: firstName.trim(),
            last_name: lastName.trim(),
            title_id: titleId,
            initials: initials || null,
            known_as: knownAs || null,
            id_type: idType,
            id_number: idNumber,
            gender,
            date_of_birth: dateOfBirth,
            contact_number: phone ? formatToInternational(phone) : null,
            alt_contact_number: altPhone ? formatToInternational(altPhone) : null,
            cc_email: ccEmail || null,
            language_code: languageCode,
            street_address: streetAddress,
            suburb: suburb || null,
            city,
            province: province || null,
            postal_code: postalCode || null,
            country,
            skip_bank: true,
            bank_id: null,
            bank_account_type_id: null,
            account_name: null,
            account_number: null,
            accepted_term_ids: Object.keys(acceptedTerms).filter((k) => acceptedTerms[k]),
          },
          admin_documents: adminDocuments.length > 0 ? adminDocuments : undefined,
        },
      });

      if (provError) throw provError;
      if (provData?.error) throw new Error(provData.error);

      toast({
        title: "Co-operative registered!",
        description: "Check your email to verify your account, then sign in to complete your setup.",
      });

      // Redirect to the tenant's subdomain
      const tenantUrl = getTenantUrl(slug);
      window.location.href = tenantUrl;
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const titles = refData?.titles ?? [];
  const countries = refData?.countries ?? [];
  const terms = refData?.terms ?? [];
  const documentRequirements = refData?.document_requirements ?? [];

  const isLastStep = step === TOTAL_STEPS;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="border-b border-border bg-card">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src={myCoopLogo} alt="MyCoop" className="h-10 w-auto" />
          </div>
          <Button variant="ghost" size="sm" onClick={() => navigate("/")}>
            <ArrowLeft className="mr-2 h-4 w-4" />Back
          </Button>
        </div>
      </header>

      <main className="flex-1 flex items-start justify-center p-6 pt-8">
        <Card className="w-full max-w-2xl border-border/50 shadow-lg">
          <CardHeader className="text-center space-y-2">
            <div className="mx-auto h-14 w-14 rounded-xl bg-primary/10 flex items-center justify-center mb-2">
              {(() => {
                const Icon = stepIcons[step - 1] || Building2;
                return <Icon className="h-7 w-7 text-primary" />;
              })()}
            </div>
            <CardTitle className="text-2xl">Register Your Co-operative</CardTitle>
            <CardDescription>Step {step} of {TOTAL_STEPS} — {stepTitles[step - 1]}</CardDescription>
            <div className="flex items-center justify-center gap-1 pt-2">
              {Array.from({ length: TOTAL_STEPS }, (_, i) => i + 1).map((s) => (
                <div key={s} className={`h-2 rounded-full transition-all ${
                  s === step ? "w-6 bg-primary" : s < step ? "w-6 bg-primary/40" : "w-6 bg-muted"
                }`} />
              ))}
            </div>
          </CardHeader>
          <CardContent>
            {/* ═══ Step 1: Co-op + Admin ═══ */}
            {step === 1 && (
              <div className="space-y-5">
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Co-operative Details</h3>
                  <div className="space-y-2">
                    <Label htmlFor="name">Co-operative Name</Label>
                    <Input id="name" placeholder="e.g. Precious Metals Connect" value={name} onChange={(e) => handleNameChange(e.target.value)} required maxLength={100} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="slug">URL Slug</Label>
                    <div className="flex items-center gap-2">
                      <Input id="slug" placeholder="e.g. pmc" value={slug} onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))} required maxLength={30} />
                      <span className="text-sm text-muted-foreground whitespace-nowrap">.myco-op.co.za</span>
                    </div>
                   </div>
                  <div className="space-y-2">
                    <Label htmlFor="registrationNumber">Registration Number *</Label>
                    <Input id="registrationNumber" placeholder="e.g. 2025/624300/07" value={registrationNumber} onChange={(e) => setRegistrationNumber(e.target.value)} required maxLength={50} />
                  </div>
                </div>
                <Separator />
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Administrator Account</h3>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label htmlFor="firstName">First Name</Label>
                      <Input id="firstName" value={firstName} onChange={(e) => setFirstName(e.target.value)} required maxLength={50} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="lastName">Last Name</Label>
                      <Input id="lastName" value={lastName} onChange={(e) => setLastName(e.target.value)} required maxLength={50} />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email">Email Address</Label>
                    <Input id="email" type="email" placeholder="admin@example.com" value={email} onChange={(e) => setEmail(e.target.value)} required maxLength={255} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="password">Password</Label>
                    <div className="relative">
                      <Input id="password" type={showPassword ? "text" : "password"} placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} className="pr-10" />
                      <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" tabIndex={-1}>
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="confirmPassword">Confirm Password</Label>
                    <Input id="confirmPassword" type={showPassword ? "text" : "password"} placeholder="••••••••" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required minLength={6} />
                  </div>
                </div>
                <Button className="w-full" onClick={handleNext}>Next <ArrowRight className="ml-2 h-4 w-4" /></Button>
              </div>
            )}

            {/* ═══ Step 2: Service Agreement ═══ */}
            {step === 2 && (
              <div className="space-y-5">
                {feePlansLoading ? (
                  <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
                ) : (
                  <>
                    <p className="text-sm text-muted-foreground">
                      Select your preferred service plan. The setup fee is payable upfront (7-day grace period applies).
                      A higher initial fee results in lower ongoing transaction costs.
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {feePlans.map((plan) => (
                        <div
                          key={plan.id}
                          onClick={() => setSelectedPlanId(plan.id)}
                          className={`border-2 rounded-xl p-4 cursor-pointer transition-all space-y-3 ${
                            selectedPlanId === plan.id
                              ? "border-primary bg-primary/5 shadow-md"
                              : "border-border hover:border-muted-foreground/30"
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <h3 className="font-bold text-lg">{plan.plan_label}</h3>
                            {selectedPlanId === plan.id && <CheckCircle2 className="h-5 w-5 text-primary" />}
                          </div>
                          <div className="space-y-1">
                            <p className="text-2xl font-bold text-primary">
                              {formatCurrency(plan.setup_fee_excl_vat)}
                              <span className="text-xs font-normal text-muted-foreground ml-1">+ VAT setup</span>
                            </p>
                          </div>
                          <Separator />
                          <div className="space-y-1.5 text-sm">
                            <p><span className="font-medium">{plan.deposit_fee_pct}%</span> on all deposits</p>
                            <p><span className="font-medium">{plan.switch_transfer_withdrawal_fee_pct}%</span> on switches, transfers & withdrawals</p>
                          </div>
                          <Separator />
                          <div className="space-y-1.5 text-sm">
                            <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Monthly recurring (% of TPV p.a.)</p>
                            <p>{plan.tpv_tier1_pct_pa}% — TPV &lt; {formatCurrency(plan.tpv_tier1_threshold)}</p>
                            <p>{plan.tpv_tier2_pct_pa}% — TPV {formatCurrency(plan.tpv_tier1_threshold)} – {formatCurrency(plan.tpv_tier2_threshold)}</p>
                            <p>{plan.tpv_tier3_pct_pa}% — TPV &gt; {formatCurrency(plan.tpv_tier2_threshold)}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                    {selectedPlanId && (
                      <div className="border rounded-lg p-4 space-y-3 bg-muted/30">
                        <div className="flex items-start gap-2">
                          <Checkbox
                            id="sla-accept"
                            checked={slaAccepted}
                            onCheckedChange={(checked) => setSlaAccepted(!!checked)}
                          />
                          <Label htmlFor="sla-accept" className="text-sm leading-relaxed">
                            I, on behalf of <strong>{name || "the Co-operative"}</strong> (Registration: {registrationNumber || "—"}),
                            accept the selected service plan and agree to the Service Level Agreement terms between
                            HKFT Services (Pty) Ltd and {name || "the Co-operative"}. The once-off setup fee is payable
                            within 7 days of registration.
                          </Label>
                        </div>
                      </div>
                    )}
                  </>
                )}
                <div className="flex gap-3">
                  <Button variant="outline" className="flex-1" onClick={handleBack}><ArrowLeft className="mr-2 h-4 w-4" />Back</Button>
                  <Button className="flex-1" onClick={handleNext} disabled={feePlansLoading}>Next <ArrowRight className="ml-2 h-4 w-4" /></Button>
                </div>
              </div>
            )}

            {/* ═══ Step 3: Logo + Prefixes ═══ */}
            {step === 3 && (
              <div className="space-y-5">
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Company Logo</h3>
                  <p className="text-sm text-muted-foreground">Upload your co-operative logo. You can also do this later in settings.</p>
                  {logoPreview ? (
                    <div className="flex items-center gap-4">
                      <div className="h-20 w-20 border rounded-lg overflow-hidden flex items-center justify-center bg-muted/30">
                        <img src={logoPreview} alt="Logo preview" className="max-h-full max-w-full object-contain" />
                      </div>
                      <Button variant="outline" size="sm" onClick={removeLogo}><X className="h-4 w-4 mr-1" />Remove</Button>
                    </div>
                  ) : (
                    <label className="flex flex-col items-center justify-center h-28 border-2 border-dashed rounded-lg cursor-pointer hover:border-primary/50 transition-colors">
                      <Upload className="h-6 w-6 text-muted-foreground mb-1" />
                      <span className="text-sm text-muted-foreground">Click to upload logo</span>
                      <span className="text-xs text-muted-foreground">PNG, JPG up to 5MB</span>
                      <input type="file" accept="image/*" className="hidden" onChange={handleLogoChange} />
                    </label>
                  )}
                </div>
                <Separator />
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Account Number Prefixes</h3>
                  <p className="text-sm text-muted-foreground">
                    Auto-generated from your co-op name. These prefixes appear before account numbers (e.g. <span className="font-mono text-foreground">{prefixes[1] || "PM"}00001</span>).
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    {Object.entries(accountTypeLabels).map(([key, label]) => {
                      const k = Number(key);
                      return (
                        <div key={k} className="space-y-1">
                          <Label className="text-xs">{label}</Label>
                          <Input value={prefixes[k] || ""} onChange={(e) => updatePrefix(k, e.target.value)} maxLength={5} className="font-mono uppercase" placeholder="XX" />
                        </div>
                      );
                    })}
                  </div>
                </div>
                <div className="flex gap-3">
                  <Button variant="outline" className="flex-1" onClick={handleBack}><ArrowLeft className="mr-2 h-4 w-4" />Back</Button>
                  <Button className="flex-1" onClick={handleNext}>Next <ArrowRight className="ml-2 h-4 w-4" /></Button>
                </div>
              </div>
            )}

            {/* ═══ Step 4: Pools ═══ */}
            {step === 4 && (
              <div className="space-y-5">
                {poolsLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : (
                  <>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Investment Pools</h3>
                        <Badge variant="secondary">{selectedPools.length} / {pools.length} selected</Badge>
                      </div>
                      <div className="grid gap-3 max-h-64 overflow-y-auto">
                        {pools.map((pool) => (
                          <label key={pool.id} className={`flex items-center gap-4 border rounded-lg p-3 transition-colors ${
                            pool.isAdmin ? "border-primary/50 bg-primary/5 cursor-default"
                              : selectedPools.includes(pool.id) ? "border-primary bg-primary/5 cursor-pointer"
                              : "border-border hover:border-muted-foreground/30 cursor-pointer"
                          }`}>
                            <Checkbox checked={selectedPools.includes(pool.id)} onCheckedChange={() => togglePool(pool.id)} disabled={pool.isAdmin} />
                            <div className="flex items-center gap-3 flex-1">
                              <div className={`h-8 w-8 rounded-full flex items-center justify-center ${pool.isAdmin ? "bg-primary/20" : "bg-primary/10"}`}>
                                {pool.isAdmin ? <ShieldCheck className="h-4 w-4 text-primary" /> : <Coins className="h-4 w-4 text-primary" />}
                              </div>
                              <div className="flex-1">
                                <div className="flex items-center gap-2">
                                  <p className="font-medium text-sm">{pool.name}</p>
                                  {pool.isAdmin && <Badge variant="outline" className="text-xs">Required</Badge>}
                                </div>
                                {pool.description && <p className="text-xs text-muted-foreground">{pool.description}</p>}
                              </div>
                            </div>
                          </label>
                        ))}
                      </div>
                    </div>
                    <div className="space-y-3">
                      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Custom Pools</h3>
                      {customPools.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                          {customPools.map((n) => (
                            <Badge key={n} variant="secondary" className="gap-1 py-1.5 px-3">
                              <Coins className="h-3.5 w-3.5" />{n}
                              <button type="button" onClick={() => setCustomPools((prev) => prev.filter((p) => p !== n))} className="ml-1 hover:text-destructive"><X className="h-3.5 w-3.5" /></button>
                            </Badge>
                          ))}
                        </div>
                      )}
                      <div className="flex gap-2">
                        <Input value={newPoolName} onChange={(e) => setNewPoolName(e.target.value)} placeholder="e.g. Platinum, Property, Crypto"
                          onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addCustomPool())} maxLength={50} />
                        <Button type="button" variant="outline" onClick={addCustomPool} disabled={!newPoolName.trim()}>
                          <Plus className="h-4 w-4 mr-1" />Add
                        </Button>
                      </div>
                    </div>
                    <div className="bg-muted/50 rounded-lg p-4 space-y-2">
                      <h4 className="text-sm font-semibold">Also included automatically:</h4>
                      <ul className="text-xs text-muted-foreground space-y-1">
                        <li>✓ Control accounts, GL accounts & tax types</li>
                        <li>✓ Transaction types & approval workflows</li>
                        <li>✓ Document types, templates & terms</li>
                        <li>✓ Loan settings, permissions & configuration</li>
                      </ul>
                    </div>
                  </>
                )}
                <div className="flex gap-3">
                  <Button variant="outline" className="flex-1" onClick={handleBack}><ArrowLeft className="mr-2 h-4 w-4" />Back</Button>
                  <Button className="flex-1" onClick={handleNext}>Next <ArrowRight className="ml-2 h-4 w-4" /></Button>
                </div>
              </div>
            )}

            {/* ═══ Step 4: Personal Details ═══ */}
            {step === 4 && (
              <div className="space-y-5">
                {refLoading ? (
                  <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
                ) : (
                  <>
                    <p className="text-sm text-muted-foreground">Complete your personal details as the founding administrator. Fields marked with * are mandatory.</p>
                    <div className="grid grid-cols-[120px_1fr_80px] gap-3">
                      <div className="space-y-2">
                        <Label>Title *</Label>
                        <Select value={titleId} onValueChange={setTitleId}>
                          <SelectTrigger><SelectValue placeholder="Title" /></SelectTrigger>
                          <SelectContent>
                            {titles.map((t: any) => (<SelectItem key={t.id} value={t.id}>{t.description}</SelectItem>))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Full Names *</Label>
                        <Input value={firstName} onChange={(e) => setFirstName(e.target.value)}
                          onBlur={() => { const f = toSentenceCase(firstName); setFirstName(f); setInitials(deriveInitials(f)); }}
                          placeholder="Full names" />
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
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-2">
                        <Label>Preferred Language *</Label>
                        <Select value={languageCode} onValueChange={setLanguageCode}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
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
                        <div className="flex items-center gap-2"><RadioGroupItem value="rsa_id" id="reg_rsa_id" /><Label htmlFor="reg_rsa_id">RSA ID Number</Label></div>
                        <div className="flex items-center gap-2"><RadioGroupItem value="passport" id="reg_passport" /><Label htmlFor="reg_passport">Passport</Label></div>
                      </RadioGroup>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div className="space-y-2">
                        <Label>{idType === "rsa_id" ? "RSA ID Number" : "Passport Number"} *</Label>
                        <Input value={idNumber} onChange={(e) => {
                          const val = e.target.value;
                          setIdNumber(val);
                          if (idType === "rsa_id" && val.length === 13) {
                            const result = validateRsaId(val);
                            if (result.valid) { setIdError(""); setGender(result.gender!); setDateOfBirth(result.dateOfBirth!); }
                            else setIdError(result.error || "Invalid ID number");
                          } else if (idType === "rsa_id" && val.length > 0 && val.length < 13) { setIdError("ID must be 13 digits"); }
                          else setIdError("");
                        }} placeholder={idType === "rsa_id" ? "e.g. 64XXX450XXXX6" : "Passport number"} maxLength={idType === "rsa_id" ? 13 : undefined}
                          className={idError ? "border-destructive" : ""} />
                        {idError && <p className="text-xs text-destructive flex items-center gap-1"><AlertCircle className="h-3 w-3" /> {idError}</p>}
                        {idType === "rsa_id" && idNumber.length === 13 && !idError && (
                          <p className="text-xs text-primary flex items-center gap-1"><CheckCircle2 className="h-3 w-3" /> Valid RSA ID</p>
                        )}
                      </div>
                      <div className="space-y-2">
                        <Label>Date of Birth *</Label>
                        <Input type="date" value={dateOfBirth} onChange={(e) => setDateOfBirth(e.target.value)}
                          disabled={idType === "rsa_id" && idNumber.length === 13 && !idError}
                          className={idType === "rsa_id" && idNumber.length === 13 && !idError ? "bg-muted" : ""} />
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
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-2">
                        <Label>Mobile Number *</Label>
                        <Input value={phone} onChange={(e) => { setPhone(e.target.value); setPhoneError(validatePhone(e.target.value, true)); }}
                          onBlur={() => { if (phone.trim()) { const f = formatToInternational(phone.trim()); setPhone(f); setPhoneError(validatePhone(f, true)); } }}
                          placeholder="+27831234567" className={phoneError ? "border-destructive" : ""} />
                        {phoneError && <p className="text-xs text-destructive flex items-center gap-1"><AlertCircle className="h-3 w-3" /> {phoneError}</p>}
                      </div>
                      <div className="space-y-2">
                        <Label>Alternative Mobile Number</Label>
                        <Input value={altPhone} onChange={(e) => { setAltPhone(e.target.value); if (e.target.value.trim()) setAltPhoneError(validatePhone(e.target.value)); else setAltPhoneError(""); }}
                          onBlur={() => { if (altPhone.trim()) { const f = formatToInternational(altPhone.trim()); setAltPhone(f); setAltPhoneError(validatePhone(f)); } }}
                          placeholder="+27831234567" className={altPhoneError ? "border-destructive" : ""} />
                        {altPhoneError && <p className="text-xs text-destructive flex items-center gap-1"><AlertCircle className="h-3 w-3" /> {altPhoneError}</p>}
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-2">
                        <Label>Email Address</Label>
                        <Input value={email} disabled className="bg-muted" />
                      </div>
                      <div className="space-y-2">
                        <Label>CC Email Address</Label>
                        <Input value={ccEmail} onChange={(e) => setCcEmail(e.target.value)} placeholder="Secondary email" />
                      </div>
                    </div>
                  </>
                )}
                <div className="flex gap-3">
                  <Button variant="outline" className="flex-1" onClick={handleBack}><ArrowLeft className="mr-2 h-4 w-4" />Back</Button>
                  <Button className="flex-1" onClick={handleNext} disabled={refLoading}>Next <ArrowRight className="ml-2 h-4 w-4" /></Button>
                </div>
              </div>
            )}

            {/* ═══ Step 5: Address ═══ */}
            {step === 5 && (
              <div className="space-y-5">
                <p className="text-sm text-muted-foreground">Search or manually enter your residential address.</p>
                <div className="space-y-2 relative">
                  <Label>Search Address</Label>
                  <Input value={addressSearch} onChange={(e) => handleAddressSearchChange(e.target.value)} placeholder="Start typing your address..." />
                  {suggestions.length > 0 && (
                    <div className="absolute z-10 top-full left-0 right-0 mt-1 bg-card border border-border rounded-lg shadow-lg max-h-48 overflow-y-auto">
                      {suggestions.map((s) => (
                        <button key={s.place_id} className="w-full text-left px-3 py-2 text-sm hover:bg-muted transition-colors" onClick={() => selectAddress(s)}>
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
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-2"><Label>Suburb</Label><Input value={suburb} onChange={(e) => setSuburb(e.target.value)} placeholder="Suburb" /></div>
                  <div className="space-y-2"><Label>City *</Label><Input value={city} onChange={(e) => setCity(e.target.value)} placeholder="City" /></div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="space-y-2"><Label>Province</Label><Input value={province} onChange={(e) => setProvince(e.target.value)} placeholder="Province" /></div>
                  <div className="space-y-2"><Label>Postal Code</Label><Input value={postalCode} onChange={(e) => setPostalCode(e.target.value)} placeholder="Postal code" /></div>
                  <div className="space-y-2">
                    <Label>Country</Label>
                    <Select value={country} onValueChange={setCountry}>
                      <SelectTrigger><SelectValue placeholder="Select country" /></SelectTrigger>
                      <SelectContent>
                        {countries.length > 0 ? countries.map((c: any) => (<SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>))
                          : <SelectItem value="South Africa">South Africa</SelectItem>}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="flex gap-3">
                  <Button variant="outline" className="flex-1" onClick={handleBack}><ArrowLeft className="mr-2 h-4 w-4" />Back</Button>
                  <Button className="flex-1" onClick={handleNext}>Next <ArrowRight className="ml-2 h-4 w-4" /></Button>
                </div>
              </div>
            )}

            {/* ═══ Step 6: Documents ═══ */}
            {step === 6 && (
              <div className="space-y-5">
                {documentRequirements.length === 0 ? (
                  <div className="text-center py-8">
                    <FileText className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
                    <p className="text-muted-foreground">No document uploads required. You can proceed.</p>
                  </div>
                ) : (
                  <>
                    <p className="text-sm text-muted-foreground">Upload the required identity documents for your registration.</p>
                    {documentRequirements.map((req: any) => {
                      const docType = req.document_types;
                      const uploaded = uploadedDocs[req.document_type_id];
                      return (
                        <div key={req.id} className="border rounded-lg p-4 space-y-2">
                          <div className="flex items-center justify-between">
                            <Label className="font-medium">{docType?.name || "Document"}</Label>
                            {uploaded && <CheckCircle2 className="h-4 w-4 text-primary" />}
                          </div>
                          {uploaded ? (
                            <div className="flex items-center gap-2">
                              <span className="text-sm text-muted-foreground truncate flex-1">{uploaded.name}</span>
                              <Button variant="ghost" size="sm" onClick={() => setUploadedDocs((prev) => {
                                const next = { ...prev }; delete next[req.document_type_id]; return next;
                              })}><X className="h-4 w-4" /></Button>
                            </div>
                          ) : (
                            <label className="flex items-center justify-center h-16 border-2 border-dashed rounded-lg cursor-pointer hover:border-primary/50 transition-colors">
                              <Upload className="h-4 w-4 text-muted-foreground mr-2" />
                              <span className="text-sm text-muted-foreground">Click to upload</span>
                              <input type="file" className="hidden" accept="image/*,.pdf" onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) setUploadedDocs((prev) => ({ ...prev, [req.document_type_id]: { file, name: file.name } }));
                              }} />
                            </label>
                          )}
                        </div>
                      );
                    })}
                  </>
                )}
                <div className="flex gap-3">
                  <Button variant="outline" className="flex-1" onClick={handleBack}><ArrowLeft className="mr-2 h-4 w-4" />Back</Button>
                  <Button className="flex-1" onClick={handleNext}>Next <ArrowRight className="ml-2 h-4 w-4" /></Button>
                </div>
              </div>
            )}

            {/* ═══ Step 7: Terms & Conditions ═══ */}
            {step === 7 && (
              <div className="space-y-5">
                {terms.length === 0 ? (
                  <div className="text-center py-8">
                    <Shield className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
                    <p className="text-muted-foreground">No terms & conditions configured yet. You can proceed.</p>
                  </div>
                ) : (
                  terms.map((term: any) => (
                    <div key={term.id} className="border rounded-lg p-4 space-y-3">
                      <div className="max-h-48 overflow-y-auto text-sm text-muted-foreground prose prose-sm" dangerouslySetInnerHTML={{ __html: term.content || "Terms & Conditions" }} />
                      <label className="flex items-center gap-2 cursor-pointer">
                        <Checkbox checked={!!acceptedTerms[term.id]} onCheckedChange={(checked) => setAcceptedTerms((prev) => ({ ...prev, [term.id]: !!checked }))} />
                        <span className="text-sm font-medium">I accept the terms & conditions</span>
                      </label>
                    </div>
                  ))
                )}
                <div className="flex gap-3">
                  <Button variant="outline" className="flex-1" onClick={handleBack}><ArrowLeft className="mr-2 h-4 w-4" />Back</Button>
                  <Button className="flex-1" onClick={handleSubmit} disabled={loading}>
                    {loading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Registering...</> : <><Building2 className="mr-2 h-4 w-4" />Register Co-operative</>}
                  </Button>
                </div>
              </div>
            )}

          </CardContent>
        </Card>
      </main>
    </div>
  );
};

export default RegisterTenant;
