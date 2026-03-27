import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Loader2, ArrowLeft, ArrowRight, Building2, Eye, EyeOff, Upload, X, Coins, Plus, ShieldCheck, User, MapPin, Landmark, CheckCircle2 } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import myCoopLogo from "@/assets/mycoop-logo-transparent.png";
import { getSiteUrl } from "@/lib/getSiteUrl";
import { validateRsaId } from "@/lib/rsaIdValidation";

const ADMIN_POOL_NAME = "Admin";

const accountTypeLabels: Record<number, string> = {
  1: "Full Membership",
  2: "Customer",
  3: "Supplier",
  4: "Associated Membership",
  5: "Referral House",
  6: "Legal Entity",
  7: "Administrator",
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
    if (k === 1) {
      result[k] = initials || "M";
    } else {
      result[k] = firstLetter + typeSuffix[k];
    }
  }
  return result;
}

interface PoolOption {
  id: string;
  name: string;
  description: string | null;
  isAdmin?: boolean;
}

type AddressSuggestion = { description: string; place_id: string };

const TOTAL_STEPS = 6;
const stepTitles = [
  "Co-operative & Admin",
  "Branding & Prefixes",
  "Investment Pools",
  "Personal Details",
  "Residential Address",
  "Bank Details",
];

const RegisterTenant = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [step, setStep] = useState(1);

  // Step 1: Tenant + Admin
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  // Step 2: Logo + Prefixes
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [prefixes, setPrefixes] = useState<Record<number, string>>({});

  // Step 3: Pools
  const [pools, setPools] = useState<PoolOption[]>([]);
  const [selectedPools, setSelectedPools] = useState<string[]>([]);
  const [customPools, setCustomPools] = useState<string[]>([]);
  const [newPoolName, setNewPoolName] = useState("");
  const [poolsLoading, setPoolsLoading] = useState(false);

  // Step 4: Personal Details
  const [titleId, setTitleId] = useState("");
  const [initials, setInitials] = useState("");
  const [knownAs, setKnownAs] = useState("");
  const [idType, setIdType] = useState<"rsa_id" | "passport">("rsa_id");
  const [idNumber, setIdNumber] = useState("");
  const [gender, setGender] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [phone, setPhone] = useState("");
  const [altPhone, setAltPhone] = useState("");
  const [idError, setIdError] = useState("");
  const [languageCode, setLanguageCode] = useState("en");

  // Step 5: Address
  const [streetAddress, setStreetAddress] = useState("");
  const [suburb, setSuburb] = useState("");
  const [city, setCity] = useState("");
  const [province, setProvince] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [country, setCountry] = useState("South Africa");
  const [addressSearch, setAddressSearch] = useState("");
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [searchTimeout, setSearchTimeout] = useState<ReturnType<typeof setTimeout> | null>(null);

  // Step 6: Bank Details
  const [bankCountry, setBankCountry] = useState("");
  const [bankId, setBankId] = useState("");
  const [bankAccountTypeId, setBankAccountTypeId] = useState("");
  const [accountName, setAccountName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [skipBank, setSkipBank] = useState(false);

  const [loading, setLoading] = useState(false);

  // Queries for step 4+
  const { data: titles = [] } = useQuery({
    queryKey: ["reg_titles"],
    queryFn: async () => {
      const { data } = await supabase.from("titles").select("*").eq("is_active", true).order("description");
      return data ?? [];
    },
  });

  const { data: countries = [] } = useQuery({
    queryKey: ["reg_countries"],
    queryFn: async () => {
      const { data } = await supabase.from("countries").select("*").eq("is_active", true).order("name");
      return data ?? [];
    },
  });

  const { data: banks = [] } = useQuery({
    queryKey: ["reg_banks", bankCountry],
    queryFn: async () => {
      if (!bankCountry) return [];
      const { data } = await supabase.from("banks").select("*").eq("country_id", bankCountry).eq("is_active", true).order("name");
      return data ?? [];
    },
    enabled: !!bankCountry,
  });

  const { data: bankAccountTypes = [] } = useQuery({
    queryKey: ["reg_bank_account_types"],
    queryFn: async () => {
      const { data } = await supabase.from("bank_account_types").select("*").eq("is_active", true).order("name");
      return data ?? [];
    },
  });

  // Auto-generate prefixes when name changes
  useEffect(() => {
    if (name.trim()) setPrefixes(generatePrefixes(name));
  }, [name]);

  // Load pools when reaching step 3
  useEffect(() => {
    if (step === 3 && pools.length === 0) loadPools();
  }, [step]);

  // Auto-derive initials
  useEffect(() => {
    if (firstName || lastName) {
      setInitials(
        [firstName, lastName].filter(Boolean).map((w) => w.charAt(0).toUpperCase()).join("")
      );
    }
  }, [firstName, lastName]);

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

  // ID number validation
  const handleIdNumberChange = (value: string) => {
    setIdNumber(value);
    if (idType === "rsa_id" && value.length === 13) {
      const result = validateRsaId(value);
      if (!result.valid) {
        setIdError(result.error || "Invalid ID");
      } else {
        setIdError("");
        if (result.dateOfBirth) setDateOfBirth(result.dateOfBirth);
        if (result.gender) setGender(result.gender);
      }
    } else if (idType === "rsa_id" && value.length > 0 && value.length < 13) {
      setIdError("ID must be 13 digits");
    } else {
      setIdError("");
    }
  };

  // Address autocomplete
  const searchAddress = async (input: string) => {
    if (input.length < 3) { setSuggestions([]); return; }
    try {
      const res = await supabase.functions.invoke("google-places", { body: { input, type: "autocomplete" } });
      if (res.data?.predictions) {
        setSuggestions(res.data.predictions.map((p: any) => ({ description: p.description, place_id: p.place_id })));
      }
    } catch { setSuggestions([]); }
  };

  const selectAddress = async (suggestion: AddressSuggestion) => {
    setSuggestions([]);
    setAddressSearch(suggestion.description);
    try {
      const res = await supabase.functions.invoke("google-places", { body: { input: suggestion.place_id, type: "details" } });
      if (res.data?.result) {
        const components = res.data.result.address_components ?? [];
        const get = (type: string) => components.find((c: any) => c.types.includes(type))?.long_name ?? "";
        setStreetAddress([get("street_number"), get("route")].filter(Boolean).join(" "));
        setSuburb(get("sublocality") || get("sublocality_level_1") || get("neighborhood"));
        setCity(get("locality") || get("administrative_area_level_2"));
        setProvince(get("administrative_area_level_1"));
        setPostalCode(get("postal_code"));
        setCountry(get("country") || "South Africa");
      }
    } catch { /* manual entry */ }
  };

  const handleAddressSearchChange = (value: string) => {
    setAddressSearch(value);
    if (searchTimeout) clearTimeout(searchTimeout);
    setSearchTimeout(setTimeout(() => searchAddress(value), 400));
  };

  const formatToInternational = (val: string): string => {
    const digits = val.replace(/[^0-9+]/g, "");
    if (digits.startsWith("0")) return "+27" + digits.slice(1);
    if (digits.startsWith("27") && !digits.startsWith("+")) return "+" + digits;
    return digits;
  };

  // Validation
  const validateStep1 = () => {
    if (!name.trim() || !slug.trim() || !email.trim() || !password || !firstName.trim() || !lastName.trim()) {
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
  };

  const validateStep4 = () => {
    if (!titleId || !idNumber.trim() || idError || !gender || !dateOfBirth || !phone.trim()) {
      toast({ title: "Please complete all required fields", variant: "destructive" }); return false;
    }
    return true;
  };

  const validateStep5 = () => {
    if (!streetAddress.trim() || !city.trim()) {
      toast({ title: "Street address and city are required", variant: "destructive" }); return false;
    }
    return true;
  };

  const validateStep6 = () => {
    if (skipBank) return true;
    if (!bankCountry || !bankId || !bankAccountTypeId || !accountName.trim() || !accountNumber.trim()) {
      toast({ title: "Please complete all bank fields or skip", variant: "destructive" }); return false;
    }
    return true;
  };

  const handleNext = () => {
    if (step === 1 && !validateStep1()) return;
    if (step === 2) {
      const emptyPrefixes = Object.entries(prefixes).filter(([, v]) => !v.trim());
      if (emptyPrefixes.length > 0) {
        toast({ title: "All prefixes are required", variant: "destructive" }); return;
      }
    }
    if (step === 4 && !validateStep4()) return;
    if (step === 5 && !validateStep5()) return;
    setStep((s) => s + 1);
  };

  const handleBack = () => setStep((s) => s - 1);

  const selectedBank = banks.find((b: any) => b.id === bankId);

  const handleSubmit = async () => {
    if (!validateStep6()) return;

    setLoading(true);
    try {
      // 1. Check slug uniqueness
      const { data: existing } = await supabase.from("tenants").select("id").eq("slug", slug).maybeSingle();
      if (existing) {
        toast({ title: "Slug already taken", description: "Please choose a different URL slug.", variant: "destructive" });
        setStep(1); setLoading(false); return;
      }

      // 2. Create tenant
      const { data: tenant, error: tenantError } = await supabase.from("tenants").insert({ name: name.trim(), slug: slug.trim() }).select().single();
      if (tenantError) throw tenantError;

      // 3. Upload logo if provided
      let logoUrl: string | null = null;
      if (logoFile) {
        const ext = logoFile.name.split(".").pop() || "png";
        const path = `${tenant.id}/logo.${ext}`;
        const { error: uploadError } = await supabase.storage.from("tenant-logos").upload(path, logoFile, { upsert: true });
        if (uploadError) console.error("Logo upload error:", uploadError);
        else {
          const { data: urlData } = supabase.storage.from("tenant-logos").getPublicUrl(path);
          logoUrl = urlData.publicUrl;
        }
      }

      // 4. Sign up admin user
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          emailRedirectTo: getSiteUrl(),
          data: { first_name: firstName.trim(), last_name: lastName.trim() },
        },
      });
      if (authError) throw authError;
      if (authData.user?.identities?.length === 0) {
        throw new Error("An account with this email already exists. Please use a different email.");
      }

      // 5. Bootstrap tenant admin
      if (authData.user) {
        const { error: bootstrapError } = await supabase.rpc("bootstrap_tenant_admin" as any, {
          p_tenant_id: tenant.id,
          p_user_id: authData.user.id,
        });
        if (bootstrapError) console.error("Bootstrap error:", bootstrapError);
      }

      localStorage.setItem("currentTenantId", tenant.id);

      // 6. Send registration email
      if (authData.user) {
        supabase.functions.invoke("send-registration-email", {
          body: { tenant_id: tenant.id },
        }).catch((err) => console.error("Failed to send registration email:", err));
      }

      // 7. Provision tenant with pools, prefixes, logo, AND admin personal details
      const prefixMap: Record<string, string> = {};
      for (const [k, v] of Object.entries(prefixes)) prefixMap[k] = v;

      const adminDetails: any = {
        user_id: authData.user?.id,
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        title_id: titleId || null,
        initials: initials || null,
        known_as: knownAs || null,
        id_type: idType,
        id_number: idNumber.trim(),
        gender: gender || null,
        date_of_birth: dateOfBirth || null,
        phone: formatToInternational(phone),
        alt_phone: altPhone ? formatToInternational(altPhone) : null,
        email: email.trim(),
        language_code: languageCode,
        // Address
        street_address: streetAddress.trim(),
        suburb: suburb || null,
        city: city.trim(),
        province: province || null,
        postal_code: postalCode || null,
        address_country: country || "South Africa",
      };

      // Bank details (if not skipped)
      if (!skipBank && bankId && accountName && accountNumber) {
        adminDetails.bank_id = bankId;
        adminDetails.bank_account_type_id = bankAccountTypeId;
        adminDetails.account_name = accountName.trim();
        adminDetails.account_number = accountNumber.trim();
      }

      const { data: provData, error: provError } = await supabase.functions.invoke("provision-tenant", {
        body: {
          tenant_id: tenant.id,
          selected_pool_ids: selectedPools,
          custom_pools: customPools.length > 0 ? customPools : undefined,
          entity_account_type_prefixes: prefixMap,
          logo_url: logoUrl,
          admin_details: adminDetails,
        },
      });

      if (provError) throw provError;
      if (provData?.error) throw new Error(provData.error);

      toast({
        title: "Co-operative registered!",
        description: "Check your email to verify your account, then sign in to complete your setup.",
      });

      navigate(`/auth?tenant=${slug}`);
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

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
              <Building2 className="h-7 w-7 text-primary" />
            </div>
            <CardTitle className="text-2xl">Register Your Co-operative</CardTitle>
            <CardDescription>Step {step} of {TOTAL_STEPS} — {stepTitles[step - 1]}</CardDescription>
            <div className="flex items-center justify-center gap-1.5 pt-2">
              {Array.from({ length: TOTAL_STEPS }, (_, i) => i + 1).map((s) => (
                <div
                  key={s}
                  className={`h-2 rounded-full transition-all ${
                    s === step ? "w-8 bg-primary" : s < step ? "w-8 bg-primary/40" : "w-8 bg-muted"
                  }`}
                />
              ))}
            </div>
          </CardHeader>
          <CardContent>
            {/* Step 1: Co-op + Admin */}
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
                <Button className="w-full" onClick={handleNext}>
                  Next <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            )}

            {/* Step 2: Logo + Prefixes */}
            {step === 2 && (
              <div className="space-y-5">
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Company Logo</h3>
                  <p className="text-sm text-muted-foreground">Upload your co-operative logo. You can also do this later in settings.</p>
                  {logoPreview ? (
                    <div className="flex items-center gap-4">
                      <div className="h-20 w-20 border rounded-lg overflow-hidden flex items-center justify-center bg-muted/30">
                        <img src={logoPreview} alt="Logo preview" className="max-h-full max-w-full object-contain" />
                      </div>
                      <Button variant="outline" size="sm" onClick={removeLogo}>
                        <X className="h-4 w-4 mr-1" />Remove
                      </Button>
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

            {/* Step 3: Pools */}
            {step === 3 && (
              <div className="space-y-5">
                {poolsLoading ? (
                  <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
                ) : (
                  <>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Investment Pools</h3>
                        <Badge variant="secondary">{selectedPools.length} / {pools.length} selected</Badge>
                      </div>
                      <div className="grid gap-3 max-h-64 overflow-y-auto">
                        {pools.map((pool) => (
                          <label key={pool.id} className={`flex items-center gap-4 border rounded-lg p-3 transition-colors ${pool.isAdmin ? "border-primary/50 bg-primary/5 cursor-default" : selectedPools.includes(pool.id) ? "border-primary bg-primary/5 cursor-pointer" : "border-border hover:border-muted-foreground/30 cursor-pointer"}`}>
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
                        <Input value={newPoolName} onChange={(e) => setNewPoolName(e.target.value)} placeholder="e.g. Platinum, Property, Crypto" onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addCustomPool())} maxLength={50} />
                        <Button type="button" variant="outline" onClick={addCustomPool} disabled={!newPoolName.trim()}><Plus className="h-4 w-4 mr-1" />Add</Button>
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
                  <Button className="flex-1" onClick={handleNext} disabled={selectedPools.length === 0}>Next <ArrowRight className="ml-2 h-4 w-4" /></Button>
                </div>
              </div>
            )}

            {/* Step 4: Personal Details */}
            {step === 4 && (
              <div className="space-y-5">
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Your Personal Information</h3>
                  <p className="text-sm text-muted-foreground">As the founding administrator, complete your personal details below.</p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Title *</Label>
                    <Select value={titleId} onValueChange={setTitleId}>
                      <SelectTrigger><SelectValue placeholder="Select title" /></SelectTrigger>
                      <SelectContent>
                        {titles.map((t: any) => (
                          <SelectItem key={t.id} value={t.id}>{t.description}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Language</Label>
                    <Select value={languageCode} onValueChange={setLanguageCode}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="en">English</SelectItem>
                        <SelectItem value="af">Afrikaans</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>First Name *</Label>
                    <Input value={firstName} disabled className="bg-muted/50" />
                  </div>
                  <div className="space-y-2">
                    <Label>Last Name *</Label>
                    <Input value={lastName} disabled className="bg-muted/50" />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Initials</Label>
                    <Input value={initials} onChange={(e) => setInitials(e.target.value)} maxLength={5} />
                  </div>
                  <div className="space-y-2">
                    <Label>Known As</Label>
                    <Input value={knownAs} onChange={(e) => setKnownAs(e.target.value)} placeholder="Nickname" maxLength={50} />
                  </div>
                </div>

                <div className="space-y-3">
                  <Label>ID Type</Label>
                  <RadioGroup value={idType} onValueChange={(v) => { setIdType(v as any); setIdNumber(""); setIdError(""); setGender(""); setDateOfBirth(""); }} className="flex gap-4">
                    <div className="flex items-center space-x-2"><RadioGroupItem value="rsa_id" id="rsa_id" /><Label htmlFor="rsa_id" className="cursor-pointer">SA ID Number</Label></div>
                    <div className="flex items-center space-x-2"><RadioGroupItem value="passport" id="passport" /><Label htmlFor="passport" className="cursor-pointer">Passport</Label></div>
                  </RadioGroup>
                </div>

                <div className="space-y-2">
                  <Label>{idType === "rsa_id" ? "SA ID Number" : "Passport Number"} *</Label>
                  <Input value={idNumber} onChange={(e) => handleIdNumberChange(e.target.value)} placeholder={idType === "rsa_id" ? "13-digit ID number" : "Passport number"} maxLength={idType === "rsa_id" ? 13 : 20} />
                  {idError && <p className="text-xs text-destructive">{idError}</p>}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Gender *</Label>
                    <Select value={gender} onValueChange={setGender} disabled={idType === "rsa_id" && !!gender && !idError}>
                      <SelectTrigger><SelectValue placeholder="Select gender" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="male">Male</SelectItem>
                        <SelectItem value="female">Female</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Date of Birth *</Label>
                    <Input type="date" value={dateOfBirth} onChange={(e) => setDateOfBirth(e.target.value)} disabled={idType === "rsa_id" && !!dateOfBirth && !idError} />
                  </div>
                </div>

                <Separator />

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Mobile Number *</Label>
                    <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+27831234567 or 0831234567" />
                  </div>
                  <div className="space-y-2">
                    <Label>Alternative Number</Label>
                    <Input value={altPhone} onChange={(e) => setAltPhone(e.target.value)} placeholder="Optional" />
                  </div>
                </div>

                <div className="flex gap-3">
                  <Button variant="outline" className="flex-1" onClick={handleBack}><ArrowLeft className="mr-2 h-4 w-4" />Back</Button>
                  <Button className="flex-1" onClick={handleNext}>Next <ArrowRight className="ml-2 h-4 w-4" /></Button>
                </div>
              </div>
            )}

            {/* Step 5: Address */}
            {step === 5 && (
              <div className="space-y-5">
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Residential Address</h3>
                  <p className="text-sm text-muted-foreground">Search or manually enter your address.</p>
                </div>

                <div className="space-y-2 relative">
                  <Label>Search Address</Label>
                  <Input value={addressSearch} onChange={(e) => handleAddressSearchChange(e.target.value)} placeholder="Start typing the address..." />
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

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2"><Label>Suburb</Label><Input value={suburb} onChange={(e) => setSuburb(e.target.value)} placeholder="Suburb" /></div>
                  <div className="space-y-2"><Label>City *</Label><Input value={city} onChange={(e) => setCity(e.target.value)} placeholder="City" /></div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="space-y-2"><Label>Province</Label><Input value={province} onChange={(e) => setProvince(e.target.value)} placeholder="Province" /></div>
                  <div className="space-y-2"><Label>Postal Code</Label><Input value={postalCode} onChange={(e) => setPostalCode(e.target.value)} placeholder="Postal code" /></div>
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

                <div className="flex gap-3">
                  <Button variant="outline" className="flex-1" onClick={handleBack}><ArrowLeft className="mr-2 h-4 w-4" />Back</Button>
                  <Button className="flex-1" onClick={handleNext}>Next <ArrowRight className="ml-2 h-4 w-4" /></Button>
                </div>
              </div>
            )}

            {/* Step 6: Bank Details */}
            {step === 6 && (
              <div className="space-y-5">
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Bank Details</h3>
                  <p className="text-sm text-muted-foreground">Your personal banking details. You can skip this and add them later.</p>
                </div>

                <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/30 p-4">
                  <Checkbox checked={skipBank} onCheckedChange={(v) => setSkipBank(!!v)} id="skipBank" />
                  <Label htmlFor="skipBank" className="text-sm cursor-pointer">Skip bank details for now</Label>
                </div>

                {!skipBank && (
                  <>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Country *</Label>
                        <Select value={bankCountry} onValueChange={(v) => { setBankCountry(v); setBankId(""); }}>
                          <SelectTrigger><SelectValue placeholder="Select country" /></SelectTrigger>
                          <SelectContent>{countries.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Bank *</Label>
                        <Select value={bankId} onValueChange={setBankId} disabled={!bankCountry}>
                          <SelectTrigger><SelectValue placeholder={bankCountry ? "Select bank" : "Select country first"} /></SelectTrigger>
                          <SelectContent>{banks.map((b: any) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                    </div>

                    {selectedBank && (
                      <div className="rounded-lg border border-border bg-muted/30 p-3 text-sm space-y-1">
                        <div className="flex gap-4">
                          {selectedBank.branch_code && <span><span className="text-muted-foreground">Branch Code:</span> {selectedBank.branch_code}</span>}
                          {selectedBank.swift_code && <span><span className="text-muted-foreground">SWIFT:</span> {selectedBank.swift_code}</span>}
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
                          <SelectContent>{bankAccountTypes.map((t: any) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Account Number *</Label>
                        <Input value={accountNumber} onChange={(e) => setAccountNumber(e.target.value)} placeholder="Account number" />
                      </div>
                    </div>
                  </>
                )}

                <div className="flex gap-3">
                  <Button variant="outline" className="flex-1" onClick={handleBack}><ArrowLeft className="mr-2 h-4 w-4" />Back</Button>
                  <Button className="flex-1" onClick={handleSubmit} disabled={loading}>
                    {loading ? (
                      <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Registering...</>
                    ) : (
                      <><Building2 className="mr-2 h-4 w-4" />Register Co-operative</>
                    )}
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
