import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Loader2, Save, Building2, Upload } from "lucide-react";
import { Separator } from "@/components/ui/separator";

const HeadOfficeSettings = () => {
  const queryClient = useQueryClient();
  const [logoFile, setLogoFile] = useState<File | null>(null);

  const { data: settings, isLoading } = useQuery({
    queryKey: ["head_office_settings"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("head_office_settings")
        .select("*")
        .limit(1)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const [form, setForm] = useState<Record<string, string>>({});

  const getVal = (key: string) => form[key] ?? settings?.[key] ?? "";

  const updateSettings = useMutation({
    mutationFn: async (values: Record<string, any>) => {
      // Upload logo if selected
      let logo_url = settings?.logo_url;
      if (logoFile) {
        const ext = logoFile.name.split(".").pop();
        const path = `head-office/logo.${ext}`;
        const { error: uploadErr } = await supabase.storage
          .from("tenant-logos")
          .upload(path, logoFile, { upsert: true });
        if (uploadErr) throw uploadErr;
        const { data: urlData } = supabase.storage
          .from("tenant-logos")
          .getPublicUrl(path);
        logo_url = urlData.publicUrl;
      }

      const { error } = await (supabase as any)
        .from("head_office_settings")
        .update({ ...values, logo_url })
        .eq("id", settings.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["head_office_settings"] });
      toast.success("Head office settings saved");
      setForm({});
      setLogoFile(null);
    },
    onError: (err: any) => toast.error(err.message),
  });

  const handleSave = () => {
    const updates: Record<string, any> = {};
    Object.entries(form).forEach(([k, v]) => {
      updates[k] = v;
    });
    updateSettings.mutate(updates);
  };

  const setField = (key: string, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const hasChanges = Object.keys(form).length > 0 || logoFile !== null;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Head Office Settings</h1>
          <p className="text-muted-foreground">HKFT Services company details used on invoices and communications</p>
        </div>
        <Button onClick={handleSave} disabled={!hasChanges || updateSettings.isPending}>
          {updateSettings.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
          Save Changes
        </Button>
      </div>

      {/* Company Details */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            Company Details
          </CardTitle>
          <CardDescription>Legal entity information for invoices</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Company Name</Label>
              <Input value={getVal("company_name")} onChange={(e) => setField("company_name", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Registration Number</Label>
              <Input value={getVal("registration_number")} onChange={(e) => setField("registration_number", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>VAT Number</Label>
              <Input value={getVal("vat_number")} onChange={(e) => setField("vat_number", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input type="email" value={getVal("email")} onChange={(e) => setField("email", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Phone</Label>
              <Input value={getVal("phone")} onChange={(e) => setField("phone", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Website</Label>
              <Input value={getVal("website")} onChange={(e) => setField("website", e.target.value)} />
            </div>
          </div>

          <Separator className="my-6" />

          {/* Logo */}
          <div className="space-y-3">
            <Label>Company Logo</Label>
            <div className="flex items-center gap-4">
              {(settings?.logo_url || logoFile) && (
                <img
                  src={logoFile ? URL.createObjectURL(logoFile) : settings?.logo_url}
                  alt="Logo"
                  className="h-16 w-auto rounded border"
                />
              )}
              <label className="cursor-pointer">
                <div className="flex items-center gap-2 px-4 py-2 border rounded-md text-sm hover:bg-muted transition-colors">
                  <Upload className="h-4 w-4" />
                  {logoFile ? logoFile.name : "Upload Logo"}
                </div>
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => setLogoFile(e.target.files?.[0] || null)}
                />
              </label>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Address */}
      <Card>
        <CardHeader>
          <CardTitle>Address</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2 space-y-1.5">
              <Label>Street Address</Label>
              <Input value={getVal("street_address")} onChange={(e) => setField("street_address", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>City</Label>
              <Input value={getVal("city")} onChange={(e) => setField("city", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Province</Label>
              <Input value={getVal("province")} onChange={(e) => setField("province", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Postal Code</Label>
              <Input value={getVal("postal_code")} onChange={(e) => setField("postal_code", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Country</Label>
              <Input value={getVal("country")} onChange={(e) => setField("country", e.target.value)} />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Banking */}
      <Card>
        <CardHeader>
          <CardTitle>Banking Details</CardTitle>
          <CardDescription>Used for payment references on invoices</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Bank Name</Label>
              <Input value={getVal("bank_name")} onChange={(e) => setField("bank_name", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Branch Code</Label>
              <Input value={getVal("bank_branch_code")} onChange={(e) => setField("bank_branch_code", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Account Number</Label>
              <Input value={getVal("bank_account_number")} onChange={(e) => setField("bank_account_number", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Account Holder</Label>
              <Input value={getVal("bank_account_holder")} onChange={(e) => setField("bank_account_holder", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Account Type</Label>
              <Input value={getVal("bank_account_type")} onChange={(e) => setField("bank_account_type", e.target.value)} placeholder="e.g. Cheque, Savings" />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Invoice Settings */}
      <Card>
        <CardHeader>
          <CardTitle>Invoice Settings</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Invoice Prefix</Label>
              <Input value={getVal("invoice_prefix")} onChange={(e) => setField("invoice_prefix", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Next Invoice Number</Label>
              <Input type="number" value={getVal("invoice_next_number")} onChange={(e) => setField("invoice_next_number", e.target.value)} />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default HeadOfficeSettings;
