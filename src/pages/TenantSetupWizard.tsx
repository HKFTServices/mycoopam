import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Loader2, CheckCircle2, Building2, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { Separator } from "@/components/ui/separator";
import myCoopLogo from "@/assets/mycoop-logo-transparent.png";
import { navigateToTenant } from "@/lib/getSiteUrl";

export default function TenantSetupWizard() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const tenantId = searchParams.get("tenant_id");
  const tenantSlug = searchParams.get("slug");

  // Legal entity form
  const [companyName, setCompanyName] = useState("");
  const [registrationNumber, setRegistrationNumber] = useState("");
  const [isVatRegistered, setIsVatRegistered] = useState(false);
  const [vatNumber, setVatNumber] = useState("");
  const [contactNumber, setContactNumber] = useState("");
  const [emailAddress, setEmailAddress] = useState("");
  const [website, setWebsite] = useState("");

  // Address
  const [streetAddress, setStreetAddress] = useState("");
  const [suburb, setSuburb] = useState("");
  const [city, setCity] = useState("");
  const [province, setProvince] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [country, setCountry] = useState("South Africa");

  // Bank details
  const [bankId, setBankId] = useState("");
  const [bankAccountTypeId, setBankAccountTypeId] = useState("");
  const [accountName, setAccountName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");

  // Reference data
  const [banks, setBanks] = useState<any[]>([]);
  const [bankAccountTypes, setBankAccountTypes] = useState<any[]>([]);
  const [tenantName, setTenantName] = useState("");

  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!tenantId) return;
    loadReferenceData();
  }, [tenantId]);

  const loadReferenceData = async () => {
    try {
      // Load tenant name for pre-fill
      const { data: tenant } = await supabase
        .from("tenants")
        .select("name")
        .eq("id", tenantId!)
        .single();
      if (tenant) {
        setTenantName(tenant.name);
        setCompanyName(tenant.name);
        setAccountName(tenant.name);
      }

      // Load banks and account types (global tables)
      const [banksRes, typesRes] = await Promise.all([
        supabase.from("banks").select("id, name").eq("is_active", true).order("name"),
        supabase.from("bank_account_types").select("id, name").eq("is_active", true).order("name"),
      ]);
      setBanks(banksRes.data ?? []);
      setBankAccountTypes(typesRes.data ?? []);
    } catch (err) {
      console.error("Failed to load reference data:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!companyName.trim()) {
      toast.error("Company name is required");
      return;
    }

    setSaving(true);
    try {
      // Get user if authenticated (may not be during initial setup)
      const { data: { user } } = await supabase.auth.getUser();

      const { data, error } = await supabase.functions.invoke("setup-legal-entity", {
        body: {
          tenant_id: tenantId,
          user_id: user?.id || null,
          company_name: companyName.trim(),
          registration_number: registrationNumber.trim() || null,
          is_vat_registered: isVatRegistered,
          vat_number: isVatRegistered ? vatNumber.trim() : null,
          contact_number: contactNumber.trim() || null,
          email_address: emailAddress.trim() || null,
          website: website.trim() || null,
          street_address: streetAddress.trim() || null,
          suburb: suburb.trim() || null,
          city: city.trim() || null,
          province: province.trim() || null,
          postal_code: postalCode.trim() || null,
          country: country.trim(),
          bank_id: bankId || null,
          bank_account_type_id: bankAccountTypeId || null,
          account_holder: accountName.trim() || companyName.trim(),
          account_number: accountNumber.trim() || null,
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      setDone(true);
      toast.success("Company details saved successfully!");
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setSaving(false);
    }
  };

  if (!tenantId) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card className="max-w-md">
          <CardContent className="p-6 text-center">
            <AlertCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
            <p>Missing tenant ID. Please register a co-operative first.</p>
            <Button className="mt-4" onClick={() => navigate("/register-tenant")}>
              Register Co-operative
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="border-b border-border bg-card">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center">
          <div className="flex items-center gap-3">
            <img src={myCoopLogo} alt="MyCoop" className="h-10 w-auto" />
          </div>
        </div>
      </header>

      <main className="flex-1 flex items-start justify-center p-6 pt-8">
        <Card className="w-full max-w-2xl shadow-lg">
          <CardHeader className="text-center space-y-2">
            <div className="mx-auto h-14 w-14 rounded-xl bg-primary/10 flex items-center justify-center mb-2">
              {done ? <CheckCircle2 className="h-7 w-7 text-primary" /> : <Building2 className="h-7 w-7 text-primary" />}
            </div>
            <CardTitle className="text-2xl">
              {done ? "Setup Complete!" : "Register Legal Entity"}
            </CardTitle>
            <CardDescription>
              {done
                ? "Your co-operative is ready. Sign in to start managing your members."
                : `Enter the company details for ${tenantName || "your co-operative"}. This will be used for invoices, statements, and official documents.`}
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-5">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : done ? (
              <Button
                className="w-full"
                size="lg"
                onClick={() => tenantSlug ? navigateToTenant(tenantSlug, navigate) : navigate("/")}
              >
                <CheckCircle2 className="mr-2 h-4 w-4" />
                Go to Sign In
              </Button>
            ) : (
              <>
                {/* Company Details */}
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Company Details</h3>
                  <div className="space-y-2">
                    <Label>Company / Entity Name *</Label>
                    <Input value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="e.g. Precious Metals Connect (Pty) Ltd" maxLength={200} />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label>Registration Number</Label>
                      <Input value={registrationNumber} onChange={(e) => setRegistrationNumber(e.target.value)} placeholder="e.g. 2024/123456/07" maxLength={50} />
                    </div>
                    <div className="space-y-2">
                      <Label>Contact Number</Label>
                      <Input value={contactNumber} onChange={(e) => setContactNumber(e.target.value)} placeholder="e.g. 012 345 6789" maxLength={20} />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label>Email Address</Label>
                      <Input type="email" value={emailAddress} onChange={(e) => setEmailAddress(e.target.value)} placeholder="info@company.co.za" maxLength={255} />
                    </div>
                    <div className="space-y-2">
                      <Label>Website</Label>
                      <Input value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://www.company.co.za" maxLength={255} />
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Switch checked={isVatRegistered} onCheckedChange={setIsVatRegistered} />
                    <Label>VAT Registered</Label>
                    {isVatRegistered && (
                      <Input value={vatNumber} onChange={(e) => setVatNumber(e.target.value)} placeholder="VAT Number" className="flex-1" maxLength={20} />
                    )}
                  </div>
                </div>

                <Separator />

                {/* Address */}
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Physical Address</h3>
                  <div className="space-y-2">
                    <Label>Street Address</Label>
                    <Input value={streetAddress} onChange={(e) => setStreetAddress(e.target.value)} placeholder="e.g. 123 Main Street" maxLength={200} />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label>Suburb</Label>
                      <Input value={suburb} onChange={(e) => setSuburb(e.target.value)} maxLength={100} />
                    </div>
                    <div className="space-y-2">
                      <Label>City</Label>
                      <Input value={city} onChange={(e) => setCity(e.target.value)} maxLength={100} />
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="space-y-2">
                      <Label>Province</Label>
                      <Input value={province} onChange={(e) => setProvince(e.target.value)} maxLength={100} />
                    </div>
                    <div className="space-y-2">
                      <Label>Postal Code</Label>
                      <Input value={postalCode} onChange={(e) => setPostalCode(e.target.value)} maxLength={10} />
                    </div>
                    <div className="space-y-2">
                      <Label>Country</Label>
                      <Input value={country} onChange={(e) => setCountry(e.target.value)} maxLength={100} />
                    </div>
                  </div>
                </div>

                <Separator />

                {/* Bank Details */}
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Bank Details</h3>
                  <p className="text-sm text-muted-foreground">Optional. You can add this later in settings.</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label>Bank</Label>
                      <select
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        value={bankId}
                        onChange={(e) => setBankId(e.target.value)}
                      >
                        <option value="">Select bank...</option>
                        {banks.map((b) => (
                          <option key={b.id} value={b.id}>{b.name}</option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-2">
                      <Label>Account Type</Label>
                      <select
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        value={bankAccountTypeId}
                        onChange={(e) => setBankAccountTypeId(e.target.value)}
                      >
                        <option value="">Select type...</option>
                        {bankAccountTypes.map((t) => (
                          <option key={t.id} value={t.id}>{t.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label>Account Holder Name</Label>
                      <Input value={accountName} onChange={(e) => setAccountName(e.target.value)} maxLength={200} />
                    </div>
                    <div className="space-y-2">
                      <Label>Account Number</Label>
                      <Input value={accountNumber} onChange={(e) => setAccountNumber(e.target.value)} maxLength={30} />
                    </div>
                  </div>
                </div>

                <div className="flex gap-3 pt-2">
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => {
                      setDone(true);
                      toast.info("You can set up company details later in Settings.");
                    }}
                  >
                    Skip for Now
                  </Button>
                  <Button
                    className="flex-1"
                    onClick={handleSave}
                    disabled={saving || !companyName.trim()}
                  >
                    {saving ? (
                      <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Saving...</>
                    ) : (
                      <><Building2 className="mr-2 h-4 w-4" />Save & Continue</>
                    )}
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
