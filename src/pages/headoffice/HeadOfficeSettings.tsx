import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Loader2, Save, Building2, Upload, Key, Eye, EyeOff, Trash2, AlertTriangle, SendHorizonal } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const PERIOD_OPTIONS = [
  { label: "Last 24 hours", days: 1 },
  { label: "Last 7 days", days: 7 },
  { label: "Last 30 days", days: 30 },
  { label: "Last 90 days", days: 90 },
];

const TABLES_TO_CLEAR = [
  { key: "commissions", label: "Commissions", note: "cleared first (FK)" },
  { key: "admin_stock_transaction_lines", label: "Admin Stock Lines", note: "FK to admin_stock_transactions" },
  { key: "admin_stock_transactions", label: "Admin Stock Transactions", note: "" },
  { key: "loan_applications", label: "Loan Applications", note: "" },
  { key: "operating_journals", label: "Operating Journals (BK)", note: "" },
  { key: "unit_transactions", label: "Unit Transactions (UT)", note: "" },
  { key: "member_shares", label: "Member Shares", note: "" },
  { key: "stock_transactions", label: "Stock Transactions", note: "" },
  { key: "cashflow_transactions_children", label: "CFT (child rows)", note: "parent_id IS NOT NULL" },
  { key: "cashflow_transactions_parents", label: "CFT (root rows)", note: "parent_id IS NULL" },
  { key: "transactions", label: "Transactions", note: "cleared last (FK parent)" },
];

const HeadOfficeSettings = () => {
  const queryClient = useQueryClient();
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [testEmailOpen, setTestEmailOpen] = useState(false);
  const [testEmail, setTestEmail] = useState("");
  const [sendingTest, setSendingTest] = useState(false);

  // Head office settings query
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

  // System settings (SMS keys) query
  const { data: smsSettings = [], isLoading: smsLoading } = useQuery({
    queryKey: ["system_settings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("system_settings")
        .select("*")
        .in("key", ["SMS_API_KEY", "SMS_CLIENT_ID"])
        .order("key");
      if (error) throw error;
      return data;
    },
  });

  const [form, setForm] = useState<Record<string, string>>({});
  const [visibleKeys, setVisibleKeys] = useState<Record<string, boolean>>({});
  const [smsEditValues, setSmsEditValues] = useState<Record<string, string>>({});

  // Clear test data state
  const [clearDialogOpen, setClearDialogOpen] = useState(false);
  const [clearDays, setClearDays] = useState("7");
  const [clearProgress, setClearProgress] = useState<string[]>([]);

  const getVal = (key: string) => form[key] ?? settings?.[key] ?? "";

  const updateSettings = useMutation({
    mutationFn: async (values: Record<string, any>) => {
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

  const updateSmsSetting = useMutation({
    mutationFn: async ({ id, value }: { id: string; value: string }) => {
      const { error } = await supabase
        .from("system_settings")
        .update({ value })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["system_settings"] });
      toast.success("Setting saved successfully");
    },
    onError: (err: any) => toast.error(err.message || "Failed to save setting"),
  });

  const clearTestDataMutation = useMutation({
    mutationFn: async (days: number) => {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - days);
      const dateStr = cutoff.toISOString().split("T")[0];
      const steps: string[] = [];

      const run = async (table: string, extra?: string) => {
        let q = (supabase as any).from(table).delete().gte("transaction_date", dateStr);
        if (extra === "children") q = (supabase as any).from("cashflow_transactions").delete().gte("transaction_date", dateStr).not("parent_id", "is", null);
        if (extra === "parents") q = (supabase as any).from("cashflow_transactions").delete().gte("transaction_date", dateStr).is("parent_id", null);
        const { error } = await q;
        if (error) throw new Error(`${table}: ${error.message}`);
        steps.push(`✓ ${table}${extra ? ` (${extra})` : ""}`);
        setClearProgress([...steps]);
      };

      await run("commissions");

      const { data: astIds } = await (supabase as any)
        .from("admin_stock_transactions")
        .select("id")
        .gte("transaction_date", dateStr);
      if (astIds && astIds.length > 0) {
        const ids = astIds.map((r: any) => r.id);
        const { error: lineErr } = await (supabase as any)
          .from("admin_stock_transaction_lines")
          .delete()
          .in("admin_stock_transaction_id", ids);
        if (lineErr) throw new Error(`admin_stock_transaction_lines: ${lineErr.message}`);
      }
      steps.push("✓ admin_stock_transaction_lines");
      setClearProgress([...steps]);

      await run("admin_stock_transactions");

      const { error: loanErr } = await (supabase as any)
        .from("loan_applications")
        .delete()
        .gte("created_at", cutoff.toISOString());
      if (loanErr) throw new Error(`loan_applications: ${loanErr.message}`);
      steps.push("✓ loan_applications");
      setClearProgress([...steps]);

      await run("operating_journals");
      await run("unit_transactions");
      await run("member_shares");
      await run("stock_transactions");
      await run("cashflow_transactions", "children");
      await run("cashflow_transactions", "parents");
      const { error: txnError } = await (supabase as any)
        .from("transactions")
        .delete()
        .gte("created_at", cutoff.toISOString());
      if (txnError) throw new Error(`transactions: ${txnError.message}`);
      steps.push("✓ transactions");
      setClearProgress([...steps]);
      return steps;
    },
    onSuccess: (steps) => {
      toast.success(`Test data cleared — ${steps.length} tables processed`);
      setClearDialogOpen(false);
      setClearProgress([]);
    },
    onError: (err: any) => {
      toast.error(err.message || "Failed to clear test data");
      setClearProgress([]);
    },
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

  const handleSaveSms = (setting: any) => {
    const newValue = smsEditValues[setting.id];
    if (newValue === undefined) return;
    updateSmsSetting.mutate({ id: setting.id, value: newValue });
    setSmsEditValues((prev) => {
      const next = { ...prev };
      delete next[setting.id];
      return next;
    });
  };

  const getSmsValue = (setting: any) => {
    if (smsEditValues[setting.id] !== undefined) return smsEditValues[setting.id];
    return setting.value ?? "";
  };

  const maskValue = (val: string) => {
    if (!val) return "";
    if (val.length <= 8) return "••••••••";
    return val.slice(0, 4) + "••••••••" + val.slice(-4);
  };

  const hasChanges = Object.keys(form).length > 0 || logoFile !== null;

  if (isLoading || smsLoading) {
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

      {/* Email / SMTP Settings */}
      <Card>
        <CardHeader>
          <CardTitle>Email / SMTP Settings</CardTitle>
          <CardDescription>Global SMTP configuration used for registration and activation emails</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>SMTP Host</Label>
              <Input value={getVal("smtp_host")} onChange={(e) => setField("smtp_host", e.target.value)} placeholder="e.g. smtp.gmail.com" />
            </div>
            <div className="space-y-1.5">
              <Label>SMTP Port</Label>
              <Input type="number" value={getVal("smtp_port")} onChange={(e) => setField("smtp_port", e.target.value)} placeholder="587" />
            </div>
            <div className="space-y-1.5">
              <Label>SMTP Username</Label>
              <Input value={getVal("smtp_username")} onChange={(e) => setField("smtp_username", e.target.value)} placeholder="user@domain.com" />
            </div>
            <div className="space-y-1.5">
              <Label>SMTP Password</Label>
              <Input type="password" value={getVal("smtp_password")} onChange={(e) => setField("smtp_password", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>From Email</Label>
              <Input type="email" value={getVal("smtp_from_email")} onChange={(e) => setField("smtp_from_email", e.target.value)} placeholder="noreply@domain.com" />
            </div>
            <div className="space-y-1.5">
              <Label>From Name</Label>
              <Input value={getVal("smtp_from_name")} onChange={(e) => setField("smtp_from_name", e.target.value)} placeholder="MyCo-op" />
            </div>
          </div>
              <div className="flex justify-end pt-2">
                <Button variant="outline" onClick={() => setTestEmailOpen(true)} disabled={!getVal("smtp_host")}>
                  <SendHorizonal className="h-4 w-4 mr-1.5" />Send Test Email
                </Button>
              </div>
        </CardContent>
      </Card>

      {/* Test Email Dialog */}
      <Dialog open={testEmailOpen} onOpenChange={setTestEmailOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Send Test Email</DialogTitle></DialogHeader>
          <div className="space-y-2">
            <Label>Recipient Email</Label>
            <Input value={testEmail} onChange={(e) => setTestEmail(e.target.value)} placeholder="test@example.com" type="email" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTestEmailOpen(false)}>Cancel</Button>
            <Button
              disabled={!testEmail || sendingTest}
              onClick={async () => {
                setSendingTest(true);
                try {
                  const { data, error } = await supabase.functions.invoke("test-smtp", {
                    body: {
                      smtp_host: getVal("smtp_host"),
                      smtp_port: parseInt(getVal("smtp_port") || "587"),
                      smtp_username: getVal("smtp_username"),
                      smtp_password: getVal("smtp_password"),
                      smtp_from_email: getVal("smtp_from_email"),
                      smtp_from_name: getVal("smtp_from_name"),
                      smtp_enable_ssl: true,
                      to_email: testEmail,
                    },
                  });
                  if (error) throw error;
                  if (data?.error) throw new Error(data.error);
                  toast.success("Test email sent successfully!");
                  setTestEmailOpen(false);
                } catch (e: any) {
                  toast.error(`Failed: ${e.message}`);
                } finally {
                  setSendingTest(false);
                }
              }}
            >
              {sendingTest ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <SendHorizonal className="h-4 w-4 mr-1.5" />}
              Send
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* SMS API Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Key className="h-5 w-5" />
            SMS API Settings
          </CardTitle>
          <CardDescription>SMS Portal credentials used for OTP verification</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {smsSettings.map((setting: any) => {
            const isEditing = smsEditValues[setting.id] !== undefined;
            const isVisible = visibleKeys[setting.key];

            return (
              <div key={setting.id} className="space-y-2">
                <div className="flex items-center gap-2">
                  <Label className="font-medium">{setting.key.replace(/_/g, " ")}</Label>
                  {setting.description && (
                    <span className="text-xs text-muted-foreground">— {setting.description}</span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex-1">
                    {setting.is_secret && !isVisible && !isEditing && setting.value ? (
                      <Input
                        value={maskValue(setting.value)}
                        disabled
                        className="bg-muted font-mono text-sm"
                      />
                    ) : (
                      <Input
                        type={setting.is_secret && !isVisible ? "password" : "text"}
                        value={getSmsValue(setting)}
                        onChange={(e) =>
                          setSmsEditValues((prev) => ({ ...prev, [setting.id]: e.target.value }))
                        }
                        placeholder={`Enter ${setting.key.replace(/_/g, " ").toLowerCase()}`}
                        className="font-mono text-sm"
                      />
                    )}
                  </div>
                  {setting.is_secret && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setVisibleKeys((prev) => ({ ...prev, [setting.key]: !prev[setting.key] }))}
                      title={isVisible ? "Hide" : "Show"}
                    >
                      {isVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                  )}
                  <Button
                    size="sm"
                    onClick={() => handleSaveSms(setting)}
                    disabled={!isEditing || updateSmsSetting.isPending}
                  >
                    {updateSmsSetting.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Save className="h-4 w-4" />
                    )}
                    Save
                  </Button>
                </div>
                {!setting.value && (
                  <p className="text-xs text-destructive">Not configured yet</p>
                )}
              </div>
            );
          })}
          {smsSettings.length === 0 && (
            <p className="text-sm text-muted-foreground">No SMS settings found in the system settings table.</p>
          )}
        </CardContent>
      </Card>

      {/* Clear Test Data */}
      <Card className="border-destructive/30 bg-destructive/5">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-destructive">
            <Trash2 className="h-5 w-5" />
            Clear Test Data
          </CardTitle>
          <CardDescription>
            Permanently delete transaction data for a selected period. Use for testing only. This action cannot be undone.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-end gap-4">
            <div className="space-y-1.5">
              <Label>Period to clear</Label>
              <Select value={clearDays} onValueChange={setClearDays}>
                <SelectTrigger className="w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PERIOD_OPTIONS.map((o) => (
                    <SelectItem key={o.days} value={String(o.days)}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              variant="destructive"
              onClick={() => { setClearProgress([]); setClearDialogOpen(true); }}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Clear Test Data
            </Button>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {TABLES_TO_CLEAR.map((t) => (
              <Badge key={t.key} variant="outline" className="text-xs text-muted-foreground">
                {t.label}
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Clear Test Data — Step 1 */}
      <AlertDialog open={clearDialogOpen && !confirmStep2} onOpenChange={(o) => { if (!o) setClearDialogOpen(false); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              Clear Test Data — Step 1 of 2
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>
                  This will permanently delete all transaction records from the{" "}
                  <strong>{PERIOD_OPTIONS.find((o) => String(o.days) === clearDays)?.label.toLowerCase()}</strong>{" "}
                  across the following tables:
                </p>
                <ul className="text-sm space-y-1 pl-4 list-disc">
                  {TABLES_TO_CLEAR.map((t) => (
                    <li key={t.key} className="text-foreground">
                      {t.label} {t.note && <span className="text-muted-foreground text-xs">({t.note})</span>}
                    </li>
                  ))}
                </ul>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={(e) => { e.preventDefault(); setConfirmStep2(true); }}
            >
              Continue to Final Confirmation
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Clear Test Data — Step 2: type CONFIRM */}
      <AlertDialog open={confirmStep2} onOpenChange={(o) => { if (!o && !clearTestDataMutation.isPending) { setConfirmStep2(false); setClearDialogOpen(false); setConfirmInput(""); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              Final Confirmation — Step 2 of 2
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>Type <strong className="text-foreground">CONFIRM</strong> below to proceed with deletion.</p>
                <input
                  className="w-full border rounded px-3 py-2 text-sm bg-background text-foreground"
                  placeholder="Type CONFIRM"
                  value={confirmInput}
                  onChange={(e) => setConfirmInput(e.target.value)}
                  disabled={clearTestDataMutation.isPending}
                />
                {clearProgress.length > 0 && (
                  <div className="bg-muted rounded p-2 text-xs font-mono space-y-0.5">
                    {clearProgress.map((s, i) => <div key={i} className="text-primary">{s}</div>)}
                    <div className="flex items-center gap-1 text-muted-foreground">
                      <Loader2 className="h-3 w-3 animate-spin" /> Processing…
                    </div>
                  </div>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={clearTestDataMutation.isPending} onClick={() => { setConfirmStep2(false); setConfirmInput(""); }}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              disabled={confirmInput !== "CONFIRM" || clearTestDataMutation.isPending}
              onClick={(e) => {
                e.preventDefault();
                clearTestDataMutation.mutate(Number(clearDays));
              }}
            >
              {clearTestDataMutation.isPending ? (
                <><Loader2 className="h-4 w-4 animate-spin mr-2" />Clearing…</>
              ) : (
                "Yes, permanently delete"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default HeadOfficeSettings;
