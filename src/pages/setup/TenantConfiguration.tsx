import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/contexts/TenantContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Loader2, Save, Upload, Shield, Mail, Settings, SendHorizonal, Users, Plus, Trash2, Pencil, Info, Building2, BookOpen, Vault, FileSignature, Sparkles, Eye, Code } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "sonner";
import RichTextEditor from "@/components/ui/rich-text-editor";

const months = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

// ── Share Classes Section ────────────────────────────────────────────────────
const ShareClassesSection = ({ tenantId, glAccounts }: { tenantId?: string; glAccounts: any[] }) => {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [scName, setScName] = useState("");
  const [scPrice, setScPrice] = useState(0);
  const [scMax, setScMax] = useState(0);
  const [scGlAccountId, setScGlAccountId] = useState<string>("");
  const [saving, setSaving] = useState(false);

  const { data: shareClasses = [], isLoading } = useQuery({
    queryKey: ["share_classes", tenantId],
    queryFn: async () => {
      if (!tenantId) return [];
      const { data, error } = await (supabase as any)
        .from("share_classes")
        .select("*")
        .eq("tenant_id", tenantId)
        .not("name", "ilike", "join share")
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!tenantId,
  });

  const openAdd = () => { setEditingId(null); setScName(""); setScPrice(0); setScMax(0); setScGlAccountId(""); setDialogOpen(true); };
  const openEdit = (sc: any) => { setEditingId(sc.id); setScName(sc.name); setScPrice(sc.price_per_share); setScMax(sc.max_per_member); setScGlAccountId(sc.gl_account_id ?? ""); setDialogOpen(true); };

  const handleSave = async () => {
    if (!tenantId || !scName.trim()) return;
    setSaving(true);
    const glId = scGlAccountId || null;
    try {
      if (editingId) {
        const { error } = await (supabase as any).from("share_classes").update({ name: scName.trim(), price_per_share: scPrice, max_per_member: scMax, gl_account_id: glId }).eq("id", editingId);
        if (error) throw error;
        toast.success("Share class updated");
      } else {
        const { error } = await (supabase as any).from("share_classes").insert({ tenant_id: tenantId, name: scName.trim(), price_per_share: scPrice, max_per_member: scMax, gl_account_id: glId });
        if (error) { if (error.code === "23505") { toast.error("A share class with this name already exists"); return; } throw error; }
        toast.success("Share class added");
      }
      queryClient.invalidateQueries({ queryKey: ["share_classes"] });
      setDialogOpen(false);
    } catch (err: any) { toast.error(err.message); } finally { setSaving(false); }
  };

  const handleDelete = async (id: string) => {
    const { error } = await (supabase as any).from("share_classes").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Share class deleted");
    queryClient.invalidateQueries({ queryKey: ["share_classes"] });
  };

  const glLabel = (id: string) => { const gl = glAccounts.find((g: any) => g.id === id); return gl ? `${gl.code} — ${gl.name}` : "—"; };

  return (
    <>
      <div className="border rounded-lg p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <Label className="text-base font-semibold">Additional Share Classes</Label>
            <p className="text-xs text-muted-foreground mt-0.5">Custom share classes beyond standard membership types, each with their own GL account.</p>
          </div>
          <Button size="sm" variant="outline" onClick={openAdd}><Plus className="h-4 w-4 mr-1" />Add Share Class</Button>
        </div>
        {isLoading ? (
          <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : shareClasses.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">No additional share classes configured yet.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Price per Share</TableHead>
                <TableHead>Max per Member</TableHead>
                <TableHead>GL Account</TableHead>
                <TableHead>Active</TableHead>
                <TableHead className="w-20"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {shareClasses.map((sc: any) => (
                <TableRow key={sc.id}>
                  <TableCell className="font-medium">{sc.name}</TableCell>
                  <TableCell>{sc.price_per_share}</TableCell>
                  <TableCell>{sc.max_per_member}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{sc.gl_account_id ? glLabel(sc.gl_account_id) : <span className="italic">None</span>}</TableCell>
                  <TableCell><Badge variant={sc.is_active ? "default" : "secondary"}>{sc.is_active ? "Yes" : "No"}</Badge></TableCell>
                  <TableCell className="flex gap-1">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(sc)}><Pencil className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => handleDelete(sc.id)}><Trash2 className="h-4 w-4" /></Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>{editingId ? "Edit Share Class" : "Add Share Class"}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2"><Label>Name</Label><Input value={scName} onChange={(e) => setScName(e.target.value)} placeholder="e.g. Class A" /></div>
            <div className="space-y-2"><Label>Price per Share</Label><Input type="number" min={0} step="0.01" value={scPrice} onChange={(e) => setScPrice(parseFloat(e.target.value) || 0)} /></div>
            <div className="space-y-2"><Label>Maximum No. of Shares per Member</Label><Input type="number" min={0} value={scMax} onChange={(e) => setScMax(parseInt(e.target.value) || 0)} /></div>
            <div className="space-y-2">
              <Label>GL Account</Label>
              <Select value={scGlAccountId || "none"} onValueChange={(v) => setScGlAccountId(v === "none" ? "" : v)}>
                <SelectTrigger><SelectValue placeholder="Select GL account…" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— None —</SelectItem>
                  {glAccounts.map((gl: any) => <SelectItem key={gl.id} value={gl.id}>{gl.code} — {gl.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving || !scName.trim()}>{saving && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}{editingId ? "Update" : "Add"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

// ── Vault Locations Section ──────────────────────────────────────────────────
const VaultLocationsSection = ({ tenantId }: { tenantId?: string }) => {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  const { data: locations = [], isLoading } = useQuery({
    queryKey: ["vault_locations", tenantId],
    queryFn: async () => {
      if (!tenantId) return [];
      const { data, error } = await (supabase as any).from("vault_locations").select("*").eq("tenant_id", tenantId).order("name");
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!tenantId,
  });

  const openAdd = () => { setEditingId(null); setName(""); setDescription(""); setDialogOpen(true); };
  const openEdit = (loc: any) => { setEditingId(loc.id); setName(loc.name); setDescription(loc.description ?? ""); setDialogOpen(true); };

  const handleSave = async () => {
    if (!tenantId || !name.trim()) return;
    setSaving(true);
    try {
      if (editingId) {
        const { error } = await (supabase as any).from("vault_locations").update({ name: name.trim(), description: description.trim() || null }).eq("id", editingId);
        if (error) throw error;
        toast.success("Vault location updated");
      } else {
        const { error } = await (supabase as any).from("vault_locations").insert({ tenant_id: tenantId, name: name.trim(), description: description.trim() || null });
        if (error) throw error;
        toast.success("Vault location added");
      }
      queryClient.invalidateQueries({ queryKey: ["vault_locations"] });
      setDialogOpen(false);
    } catch (err: any) { toast.error(err.message); } finally { setSaving(false); }
  };

  const handleDelete = async (id: string) => {
    const { error } = await (supabase as any).from("vault_locations").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Vault location deleted");
    queryClient.invalidateQueries({ queryKey: ["vault_locations"] });
  };

  const handleToggleActive = async (loc: any) => {
    const { error } = await (supabase as any).from("vault_locations").update({ is_active: !loc.is_active }).eq("id", loc.id);
    if (error) { toast.error(error.message); return; }
    queryClient.invalidateQueries({ queryKey: ["vault_locations"] });
  };

  return (
    <>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">Define physical vault/storage locations where stock is held.</p>
          <Button size="sm" variant="outline" onClick={openAdd}><Plus className="h-4 w-4 mr-1" />Add Location</Button>
        </div>
        {isLoading ? (
          <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : locations.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">No vault locations configured yet.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Active</TableHead>
                <TableHead className="w-20"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {locations.map((loc: any) => (
                <TableRow key={loc.id}>
                  <TableCell className="font-medium">{loc.name}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{loc.description || <span className="italic">—</span>}</TableCell>
                  <TableCell><Switch checked={loc.is_active} onCheckedChange={() => handleToggleActive(loc)} /></TableCell>
                  <TableCell className="flex gap-1">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(loc)}><Pencil className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => handleDelete(loc.id)}><Trash2 className="h-4 w-4" /></Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>{editingId ? "Edit Vault Location" : "Add Vault Location"}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2"><Label>Name *</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Main Vault, Safe Room A" /></div>
            <div className="space-y-2"><Label>Description</Label><Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional description or address" rows={3} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving || !name.trim()}>{saving && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}{editingId ? "Update" : "Add"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

// ── Email Signature Section ──────────────────────────────────────────────────
const EmailSignatureSection = ({
  form,
  setForm,
  tenantId,
  logoUrl,
  tenantEntities,
  legalEntityId,
}: {
  form: any;
  setForm: (f: any) => void;
  tenantId?: string;
  logoUrl?: string;
  tenantEntities: any[];
  legalEntityId?: string;
}) => {
  const [generating, setGenerating] = useState(false);
  const [previewLang, setPreviewLang] = useState<"en" | "af">("en");
  const [showHtmlSource, setShowHtmlSource] = useState(false);

  const generateSignature = async () => {
    if (!tenantId) return;
    setGenerating(true);
    try {
      const legalEntity = legalEntityId
        ? tenantEntities.find((e: any) => e.id === legalEntityId)
        : null;

      const entityName = legalEntity
        ? [legalEntity.name, legalEntity.last_name].filter(Boolean).join(" ")
        : "Your Co-operative";
      const regNumber = legalEntity?.registration_number || "";
      const showNameText = !logoUrl; // hide name text when logo is present (logo already contains branding)

      // Fetch entity details (contact, email, address) from the entity record
      const { data: entityDetails } = await (supabase as any)
        .from("entities")
        .select("email_address, contact_number, website")
        .eq("id", legalEntityId)
        .maybeSingle();

      const email = entityDetails?.email_address || "";
      const phone = entityDetails?.contact_number || "";
      const website = entityDetails?.website || "";

      const logoHtml = logoUrl
        ? `<img src="${logoUrl}" alt="${entityName}" style="height:48px;max-width:160px;width:auto;margin-bottom:12px;" /><br/>`
        : "";

      const sigEn = `
<div style="border-top:2px solid #1a1a2e;padding-top:16px;margin-top:24px;font-family:Arial,sans-serif;font-size:13px;color:#444;">
  ${logoHtml}
  ${showNameText ? `<strong style="color:#1a1a2e;font-size:14px;">${entityName}</strong>` : ""}
  ${regNumber ? `<br/><span style="font-size:12px;color:#888;">Reg. No: ${regNumber}</span>` : ""}
  ${phone ? `<br/>Tel: ${phone}` : ""}
  ${email ? `<br/>Email: <a href="mailto:${email}" style="color:#1a5276;">${email}</a>` : ""}
  ${website ? `<br/>Web: <a href="${website}" style="color:#1a5276;">${website}</a>` : ""}
  <br/><br/>
  <span style="font-size:11px;color:#999;">This email and any attachments are confidential. If you are not the intended recipient, please delete this message and notify the sender.</span>
</div>`.trim();

      const sigAf = `
<div style="border-top:2px solid #1a1a2e;padding-top:16px;margin-top:24px;font-family:Arial,sans-serif;font-size:13px;color:#444;">
  ${logoHtml}
  ${showNameText ? `<strong style="color:#1a1a2e;font-size:14px;">${entityName}</strong>` : ""}
  ${regNumber ? `<br/><span style="font-size:12px;color:#888;">Reg. Nr: ${regNumber}</span>` : ""}
  ${phone ? `<br/>Tel: ${phone}` : ""}
  ${email ? `<br/>E-pos: <a href="mailto:${email}" style="color:#1a5276;">${email}</a>` : ""}
  ${website ? `<br/>Web: <a href="${website}" style="color:#1a5276;">${website}</a>` : ""}
  <br/><br/>
  <span style="font-size:11px;color:#999;">Hierdie e-pos en enige aanhangsels is vertroulik. Indien u nie die beoogde ontvanger is nie, verwyder asseblief hierdie boodskap en stel die sender in kennis.</span>
</div>`.trim();

      setForm((f: any) => ({ ...f, email_signature_en: sigEn, email_signature_af: sigAf }));
      toast.success("Email signatures generated for English and Afrikaans");
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setGenerating(false);
    }
  };

  const currentSig = previewLang === "en" ? form.email_signature_en : form.email_signature_af;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <FileSignature className="h-5 w-5" />
          Email Signature
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <p className="text-sm text-muted-foreground">
          This signature is automatically appended to all outgoing emails for this tenant.
          You can auto-generate it from the legal entity details or customise the HTML manually.
        </p>

        <div className="flex flex-wrap gap-3">
          <Button variant="outline" onClick={generateSignature} disabled={generating || !legalEntityId}>
            {generating ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Sparkles className="h-4 w-4 mr-1.5" />}
            Auto-Generate from Legal Entity
          </Button>
          {!legalEntityId && (
            <p className="text-xs text-destructive self-center">Set a Legal Entity in the General tab first.</p>
          )}
        </div>

        <Tabs value={previewLang} onValueChange={(v) => setPreviewLang(v as "en" | "af")}>
          <TabsList>
            <TabsTrigger value="en">English</TabsTrigger>
            <TabsTrigger value="af">Afrikaans</TabsTrigger>
          </TabsList>

          <div className="flex justify-end">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 text-xs gap-1"
              onClick={() => setShowHtmlSource(!showHtmlSource)}
            >
              {showHtmlSource ? <Eye className="h-3.5 w-3.5" /> : <Code className="h-3.5 w-3.5" />}
              {showHtmlSource ? "Rich Text" : "HTML Source"}
            </Button>
          </div>

          <TabsContent value="en" className="space-y-4">
            <div className="space-y-2">
              <Label>Signature (English)</Label>
              {showHtmlSource ? (
                <Textarea
                  value={form.email_signature_en}
                  onChange={(e) => setForm({ ...form, email_signature_en: e.target.value })}
                  rows={10}
                  className="font-mono text-xs"
                  placeholder="Enter HTML email signature..."
                />
              ) : (
                <RichTextEditor
                  value={form.email_signature_en}
                  onChange={(val) => setForm({ ...form, email_signature_en: val })}
                  placeholder="Enter email signature..."
                />
              )}
            </div>
          </TabsContent>

          <TabsContent value="af" className="space-y-4">
            <div className="space-y-2">
              <Label>Handtekening (Afrikaans)</Label>
              {showHtmlSource ? (
                <Textarea
                  value={form.email_signature_af}
                  onChange={(e) => setForm({ ...form, email_signature_af: e.target.value })}
                  rows={10}
                  className="font-mono text-xs"
                  placeholder="Voer HTML e-poshandtekening in..."
                />
              ) : (
                <RichTextEditor
                  value={form.email_signature_af}
                  onChange={(val) => setForm({ ...form, email_signature_af: val })}
                  placeholder="Voer e-poshandtekening in..."
                />
              )}
            </div>
          </TabsContent>
        </Tabs>

        {currentSig && (
          <div className="space-y-2">
            <Label className="flex items-center gap-1.5"><Eye className="h-4 w-4" />Preview</Label>
            <div
              className="border rounded-lg p-4 bg-white"
              dangerouslySetInnerHTML={{ __html: currentSig }}
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
};

// ── Main Component ───────────────────────────────────────────────────────────
const TenantConfiguration = () => {
  const { currentTenant } = useTenant();
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    currency_symbol: "R",
    currency_code: "ZAR",
    directors: "",
    financial_year_end_month: 2,
    registration_date: "",
    use_default_security: true,
    require_digit: true,
    require_lowercase: true,
    require_non_alphanumeric: false,
    require_uppercase: true,
    required_length: 6,
    enable_lockout: false,
    max_failed_attempts: 5,
    lockout_duration_seconds: 300,
    smtp_host: "",
    smtp_port: 587,
    smtp_username: "",
    smtp_password: "",
    smtp_from_email: "",
    smtp_from_name: "",
    smtp_enable_ssl: true,
    logo_url: "",
    full_membership_enabled: true,
    full_membership_share_amount: 0,
    full_membership_fee: 0,
    full_membership_monthly_fee: 0,
    associated_membership_enabled: false,
    associated_membership_share_amount: 0,
    associated_membership_fee: 0,
    associated_membership_monthly_fee: 0,
    default_membership_type: "full",
    share_gl_account_id: "" as string,
    membership_fee_gl_account_id: "" as string,
    bank_gl_account_id: "" as string,
    commission_income_gl_account_id: "" as string,
    commission_paid_gl_account_id: "" as string,
    pool_allocation_gl_account_id: "" as string,
    vat_gl_account_id: "" as string,
    stock_control_gl_account_id: "" as string,
    is_vat_registered: false,
    vat_number: "",
    legal_entity_id: "" as string,
    administrator_entity_id: "" as string,
    po_prefix: "PO",
    quote_prefix: "QUO",
    invoice_prefix: "INV",
    supplier_invoice_prefix: "SI",
    email_signature_en: "",
    email_signature_af: "",
  });
  const [uploading, setUploading] = useState(false);
  const [testEmailOpen, setTestEmailOpen] = useState(false);
  const [testEmail, setTestEmail] = useState("");
  const [sendingTest, setSendingTest] = useState(false);

  const { data: config, isLoading } = useQuery({
    queryKey: ["tenant_configuration", currentTenant?.id],
    queryFn: async () => {
      if (!currentTenant) return null;
      const { data, error } = await (supabase as any).from("tenant_configuration").select("*").eq("tenant_id", currentTenant.id).maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!currentTenant,
  });

  const { data: tenantEntities = [] } = useQuery({
    queryKey: ["tenant_entities_for_config", currentTenant?.id],
    queryFn: async () => {
      if (!currentTenant) return [];
      const { data, error } = await (supabase as any).from("entities").select("id, name, last_name, identity_number, registration_number, entity_categories (name, entity_type)").eq("tenant_id", currentTenant.id).eq("is_deleted", false).order("name");
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!currentTenant,
  });

  const { data: glAccounts = [] } = useQuery({
    queryKey: ["gl_accounts_for_config", currentTenant?.id],
    queryFn: async () => {
      if (!currentTenant) return [];
      const { data, error } = await (supabase as any).from("gl_accounts").select("id, code, name, gl_type").eq("tenant_id", currentTenant.id).eq("is_active", true).order("code");
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!currentTenant,
  });

  const entityLabel = (e: any) => {
    const full = [e.name, e.last_name].filter(Boolean).join(" ");
    const id = e.identity_number || e.registration_number || "";
    return id ? `${full} (${id})` : full;
  };

  const GlSelect = ({ field, label, description }: { field: keyof typeof form; label: string; description?: string }) => (
    <div className="space-y-2">
      <Label>{label}</Label>
      {description && <p className="text-xs text-muted-foreground">{description}</p>}
      <Select value={(form[field] as string) || "none"} onValueChange={(v) => setForm({ ...form, [field]: v === "none" ? "" : v })}>
        <SelectTrigger><SelectValue placeholder="Select GL account…" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="none">— None —</SelectItem>
          {glAccounts.map((gl: any) => <SelectItem key={gl.id} value={gl.id}>{gl.code} — {gl.name}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );

  useEffect(() => {
    if (config) {
      setForm({
        currency_symbol: config.currency_symbol ?? "R",
        currency_code: config.currency_code ?? "ZAR",
        directors: config.directors ?? "",
        financial_year_end_month: config.financial_year_end_month ?? 2,
        registration_date: config.registration_date ?? "",
        use_default_security: config.use_default_security ?? true,
        require_digit: config.require_digit ?? true,
        require_lowercase: config.require_lowercase ?? true,
        require_non_alphanumeric: config.require_non_alphanumeric ?? false,
        require_uppercase: config.require_uppercase ?? true,
        required_length: config.required_length ?? 6,
        enable_lockout: config.enable_lockout ?? false,
        max_failed_attempts: config.max_failed_attempts ?? 5,
        lockout_duration_seconds: config.lockout_duration_seconds ?? 300,
        smtp_host: config.smtp_host ?? "",
        smtp_port: config.smtp_port ?? 587,
        smtp_username: config.smtp_username ?? "",
        smtp_password: config.smtp_password ?? "",
        smtp_from_email: config.smtp_from_email ?? "",
        smtp_from_name: config.smtp_from_name ?? "",
        smtp_enable_ssl: config.smtp_enable_ssl ?? true,
        logo_url: config.logo_url ?? "",
        full_membership_enabled: config.full_membership_enabled ?? true,
        full_membership_share_amount: config.full_membership_share_amount ?? 0,
        full_membership_fee: config.full_membership_fee ?? 0,
        full_membership_monthly_fee: config.full_membership_monthly_fee ?? 0,
        associated_membership_enabled: config.associated_membership_enabled ?? false,
        associated_membership_share_amount: config.associated_membership_share_amount ?? 0,
        associated_membership_fee: config.associated_membership_fee ?? 0,
        associated_membership_monthly_fee: config.associated_membership_monthly_fee ?? 0,
        default_membership_type: config.default_membership_type ?? "full",
        is_vat_registered: config.is_vat_registered ?? false,
        vat_number: config.vat_number ?? "",
        legal_entity_id: config.legal_entity_id ?? "",
        administrator_entity_id: config.administrator_entity_id ?? "",
        share_gl_account_id: config.share_gl_account_id ?? "",
        membership_fee_gl_account_id: config.membership_fee_gl_account_id ?? "",
        bank_gl_account_id: config.bank_gl_account_id ?? "",
        commission_income_gl_account_id: config.commission_income_gl_account_id ?? "",
        commission_paid_gl_account_id: config.commission_paid_gl_account_id ?? "",
        pool_allocation_gl_account_id: config.pool_allocation_gl_account_id ?? "",
        vat_gl_account_id: config.vat_gl_account_id ?? "",
        stock_control_gl_account_id: config.stock_control_gl_account_id ?? "",
        po_prefix: (config as any).po_prefix ?? "PO",
        quote_prefix: (config as any).quote_prefix ?? "QUO",
        invoice_prefix: (config as any).invoice_prefix ?? "INV",
        supplier_invoice_prefix: (config as any).supplier_invoice_prefix ?? "SI",
        email_signature_en: (config as any).email_signature_en ?? "",
        email_signature_af: (config as any).email_signature_af ?? "",
      });
    }
  }, [config]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!currentTenant) throw new Error("No tenant");
      const { legal_entity_id, administrator_entity_id, share_gl_account_id, membership_fee_gl_account_id, bank_gl_account_id, commission_income_gl_account_id, commission_paid_gl_account_id, pool_allocation_gl_account_id, vat_gl_account_id, stock_control_gl_account_id, ...rest } = form;
      const cleanPayload = {
        ...rest,
        registration_date: rest.registration_date || null,
        legal_entity_id: legal_entity_id || null,
        administrator_entity_id: administrator_entity_id || null,
        share_gl_account_id: share_gl_account_id || null,
        membership_fee_gl_account_id: membership_fee_gl_account_id || null,
        bank_gl_account_id: bank_gl_account_id || null,
        commission_income_gl_account_id: commission_income_gl_account_id || null,
        commission_paid_gl_account_id: commission_paid_gl_account_id || null,
        pool_allocation_gl_account_id: pool_allocation_gl_account_id || null,
        vat_gl_account_id: vat_gl_account_id || null,
        stock_control_gl_account_id: stock_control_gl_account_id || null,
      };
      if (config?.id) {
        const { error } = await (supabase as any).from("tenant_configuration").update(cleanPayload).eq("id", config.id);
        if (error) throw error;
      } else {
        const { error } = await (supabase as any).from("tenant_configuration").insert({ ...cleanPayload, tenant_id: currentTenant.id });
        if (error) throw error;
      }
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["tenant_configuration"] }); toast.success("Configuration saved"); },
    onError: (e: Error) => toast.error(e.message),
  });

  const resizeImage = (file: File, maxWidth: number, maxHeight: number): Promise<Blob> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > maxWidth || height > maxHeight) {
          const ratio = Math.min(maxWidth / width, maxHeight / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) return reject(new Error("Canvas not supported"));
        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob((blob) => {
          if (blob) resolve(blob);
          else reject(new Error("Failed to resize image"));
        }, "image/png", 0.9);
      };
      img.onerror = () => reject(new Error("Failed to load image"));
      img.src = URL.createObjectURL(file);
    });
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !currentTenant) return;
    setUploading(true);
    try {
      const resized = await resizeImage(file, 200, 200);
      const path = `${currentTenant.id}/logo.png`;
      const { error: uploadError } = await supabase.storage.from("tenant-logos").upload(path, resized, { upsert: true, contentType: "image/png" });
      if (uploadError) throw uploadError;
      const { data: urlData } = supabase.storage.from("tenant-logos").getPublicUrl(path);
      setForm((f) => ({ ...f, logo_url: urlData.publicUrl }));
      toast.success("Logo uploaded & resized to 200×200 max — remember to save.");
    } catch (err: any) { toast.error(err.message); } finally { setUploading(false); }
  };

  const handleSendTestEmail = async () => {
    if (!testEmail) { toast.error("Enter a recipient email"); return; }
    setSendingTest(true);
    try {
      const { data, error } = await supabase.functions.invoke("test-smtp", {
        body: { smtp_host: form.smtp_host, smtp_port: form.smtp_port, smtp_username: form.smtp_username, smtp_password: form.smtp_password, smtp_from_email: form.smtp_from_email, smtp_from_name: form.smtp_from_name, smtp_enable_ssl: form.smtp_enable_ssl, to_email: testEmail },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success("Test email sent successfully!");
      setTestEmailOpen(false);
    } catch (err: any) { toast.error(err.message || "Failed to send test email"); } finally { setSendingTest(false); }
  };

  if (isLoading) {
    return <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Tenant Configuration</h1>
        <p className="text-muted-foreground text-sm mt-1">Financial and organisational settings for {currentTenant?.name ?? "this cooperative"}.</p>
      </div>

      <Tabs defaultValue="general" className="space-y-4">
        <TabsList className="flex-wrap">
          <TabsTrigger value="general" className="gap-1.5"><Settings className="h-4 w-4" />General</TabsTrigger>
          <TabsTrigger value="logo" className="gap-1.5"><Upload className="h-4 w-4" />Logo</TabsTrigger>
          <TabsTrigger value="security" className="gap-1.5"><Shield className="h-4 w-4" />Security</TabsTrigger>
          <TabsTrigger value="smtp" className="gap-1.5"><Mail className="h-4 w-4" />Email SMTP</TabsTrigger>
          <TabsTrigger value="memberships" className="gap-1.5"><Users className="h-4 w-4" />Membership &amp; Shares</TabsTrigger>
          <TabsTrigger value="gl" className="gap-1.5"><BookOpen className="h-4 w-4" />GL Entries</TabsTrigger>
          <TabsTrigger value="vault" className="gap-1.5"><Vault className="h-4 w-4" />Vault &amp; Invoice</TabsTrigger>
          <TabsTrigger value="signature" className="gap-1.5"><FileSignature className="h-4 w-4" />Email Signature</TabsTrigger>
        </TabsList>

        {/* ── General ── */}
        <TabsContent value="general">
          <Card>
            <CardHeader><CardTitle className="text-lg">General Settings</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Currency Symbol</Label>
                  <Input value={form.currency_symbol} onChange={(e) => setForm({ ...form, currency_symbol: e.target.value })} placeholder="R" />
                </div>
                <div className="space-y-2">
                  <Label>Currency Code</Label>
                  <Input value={form.currency_code} onChange={(e) => setForm({ ...form, currency_code: e.target.value })} placeholder="ZAR" />
                </div>
                <div className="space-y-2">
                  <Label>Financial Year End</Label>
                  <Select value={String(form.financial_year_end_month)} onValueChange={(v) => setForm({ ...form, financial_year_end_month: parseInt(v) })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{months.map((m, i) => <SelectItem key={i + 1} value={String(i + 1)}>{m}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Registration Date</Label>
                <Input type="date" value={form.registration_date} onChange={(e) => setForm({ ...form, registration_date: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Directors</Label>
                <Textarea value={form.directors} onChange={(e) => setForm({ ...form, directors: e.target.value })} placeholder="Comma-separated list of directors" rows={3} />
              </div>
              {/* Entity Selections */}
              <div className="space-y-4 pt-2 border-t">
                <div className="flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-muted-foreground" />
                  <Label className="text-base font-semibold">Entity Linkage</Label>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild><Info className="h-4 w-4 text-muted-foreground cursor-help" /></TooltipTrigger>
                      <TooltipContent className="max-w-xs"><p>Create an entity for your co-op or company and ensure all details (including bank details) are completed. This entity's information will be used on statements and emails.</p></TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Select Legal Entity</Label>
                    <div className="flex gap-2">
                      <Select value={form.legal_entity_id || "none"} onValueChange={(v) => setForm({ ...form, legal_entity_id: v === "none" ? "" : v })}>
                        <SelectTrigger className="flex-1"><SelectValue placeholder="Select an entity…" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">— None —</SelectItem>
                          {tenantEntities.map((e: any) => <SelectItem key={e.id} value={e.id}>{entityLabel(e)}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <Button type="button" variant="outline" size="sm" className="whitespace-nowrap" onClick={() => window.open("/apply-membership?type=entity&accountType=6", "_blank")}><Plus className="h-4 w-4 mr-1" />Create Now</Button>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Select Administrator</Label>
                    <div className="flex gap-2">
                      <Select value={form.administrator_entity_id || "none"} onValueChange={(v) => setForm({ ...form, administrator_entity_id: v === "none" ? "" : v })}>
                        <SelectTrigger className="flex-1"><SelectValue placeholder="Select an entity…" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">— None —</SelectItem>
                          {tenantEntities.map((e: any) => <SelectItem key={e.id} value={e.id}>{entityLabel(e)}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <Button type="button" variant="outline" size="sm" className="whitespace-nowrap" onClick={() => window.open("/apply-membership?type=entity&accountType=7", "_blank")}><Plus className="h-4 w-4 mr-1" />Create Now</Button>
                    </div>
                  </div>
                </div>
              </div>
              <div className="space-y-4 pt-2 border-t">
                <div className="flex items-center gap-3">
                  <Switch checked={form.is_vat_registered} onCheckedChange={(v) => setForm({ ...form, is_vat_registered: v, vat_number: v ? form.vat_number : "" })} />
                  <Label>VAT Registered</Label>
                </div>
                {form.is_vat_registered && (
                  <div className="space-y-2 max-w-sm">
                    <Label>VAT Number *</Label>
                    <Input value={form.vat_number} onChange={(e) => setForm({ ...form, vat_number: e.target.value })} placeholder="e.g. 4123456789" />
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Logo ── */}
        <TabsContent value="logo">
          <Card>
            <CardHeader><CardTitle className="text-lg">Upload Logo</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              {form.logo_url && (
                <div className="border rounded-lg p-4 inline-block bg-muted/40">
                  <img src={form.logo_url} alt="Tenant logo" className="max-h-32 object-contain" />
                </div>
              )}
              <div className="space-y-2">
                <Label>Select logo image</Label>
                <Input type="file" accept="image/*" onChange={handleLogoUpload} disabled={uploading} />
                {uploading && <p className="text-sm text-muted-foreground flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" />Uploading…</p>}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Security ── */}
        <TabsContent value="security">
          <Card>
            <CardHeader><CardTitle className="text-lg">Password Complexity</CardTitle></CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center gap-3">
                <Switch checked={form.use_default_security} onCheckedChange={(v) => setForm({ ...form, use_default_security: v })} />
                <Label>Use default settings</Label>
              </div>
              <div className={form.use_default_security ? "opacity-50 pointer-events-none space-y-4" : "space-y-4"}>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {([
                    ["require_digit", "Require digit"],
                    ["require_lowercase", "Require lowercase"],
                    ["require_non_alphanumeric", "Require non-alphanumeric"],
                    ["require_uppercase", "Require uppercase"],
                  ] as const).map(([key, label]) => (
                    <div key={key} className="flex items-center gap-2">
                      <Checkbox checked={form[key]} onCheckedChange={(v) => setForm({ ...form, [key]: !!v })} />
                      <Label>{label}</Label>
                    </div>
                  ))}
                </div>
                <div className="space-y-2 max-w-xs">
                  <Label>Required length</Label>
                  <Input type="number" min={1} value={form.required_length} onChange={(e) => setForm({ ...form, required_length: parseInt(e.target.value) || 1 })} />
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="mt-4">
            <CardHeader><CardTitle className="text-lg">User Lock Out</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-3">
                <Switch checked={form.enable_lockout} onCheckedChange={(v) => setForm({ ...form, enable_lockout: v })} />
                <Label>Enable user account locking on failed login attempts</Label>
              </div>
              <div className={!form.enable_lockout ? "opacity-50 pointer-events-none space-y-4" : "space-y-4"}>
                <div className="space-y-2 max-w-xs">
                  <Label>Maximum failed login attempts</Label>
                  <Input type="number" min={1} value={form.max_failed_attempts} onChange={(e) => setForm({ ...form, max_failed_attempts: parseInt(e.target.value) || 1 })} />
                </div>
                <div className="space-y-2 max-w-xs">
                  <Label>Lockout duration (seconds)</Label>
                  <Input type="number" min={1} value={form.lockout_duration_seconds} onChange={(e) => setForm({ ...form, lockout_duration_seconds: parseInt(e.target.value) || 1 })} />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── SMTP ── */}
        <TabsContent value="smtp">
          <Card>
            <CardHeader><CardTitle className="text-lg">Email SMTP Settings</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2"><Label>SMTP Host</Label><Input value={form.smtp_host} onChange={(e) => setForm({ ...form, smtp_host: e.target.value })} placeholder="smtp.example.com" /></div>
                <div className="space-y-2"><Label>SMTP Port</Label><Input type="number" value={form.smtp_port} onChange={(e) => setForm({ ...form, smtp_port: parseInt(e.target.value) || 587 })} /></div>
                <div className="space-y-2"><Label>Username</Label><Input value={form.smtp_username} onChange={(e) => setForm({ ...form, smtp_username: e.target.value })} placeholder="user@example.com" /></div>
                <div className="space-y-2"><Label>Password</Label><Input type="password" value={form.smtp_password} onChange={(e) => setForm({ ...form, smtp_password: e.target.value })} placeholder="••••••••" /></div>
                <div className="space-y-2"><Label>From Email</Label><Input value={form.smtp_from_email} onChange={(e) => setForm({ ...form, smtp_from_email: e.target.value })} placeholder="noreply@example.com" /></div>
                <div className="space-y-2"><Label>From Name</Label><Input value={form.smtp_from_name} onChange={(e) => setForm({ ...form, smtp_from_name: e.target.value })} placeholder="My Cooperative" /></div>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Switch checked={form.smtp_enable_ssl} onCheckedChange={(v) => setForm({ ...form, smtp_enable_ssl: v })} />
                  <Label>Enable SSL/TLS</Label>
                </div>
                <Button variant="outline" onClick={() => setTestEmailOpen(true)} disabled={!form.smtp_host}>
                  <SendHorizonal className="h-4 w-4 mr-1.5" />Send Test Email
                </Button>
              </div>
            </CardContent>
          </Card>
          <Dialog open={testEmailOpen} onOpenChange={setTestEmailOpen}>
            <DialogContent>
              <DialogHeader><DialogTitle>Send Test Email</DialogTitle></DialogHeader>
              <div className="space-y-2">
                <Label>Recipient Email</Label>
                <Input value={testEmail} onChange={(e) => setTestEmail(e.target.value)} placeholder="test@example.com" type="email" />
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setTestEmailOpen(false)}>Cancel</Button>
                <Button onClick={handleSendTestEmail} disabled={sendingTest}>
                  {sendingTest ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <SendHorizonal className="h-4 w-4 mr-1.5" />}Send
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </TabsContent>

        {/* ── Memberships ── */}
        <TabsContent value="memberships">
          <Card>
            <CardHeader><CardTitle className="text-lg">Membership Configuration</CardTitle></CardHeader>
            <CardContent className="space-y-6">
              {/* Full Membership */}
              <div className="border rounded-lg p-4 space-y-4">
                <div className="flex items-center gap-3">
                  <Checkbox checked={form.full_membership_enabled} onCheckedChange={(v) => setForm({ ...form, full_membership_enabled: !!v })} />
                  <Label className="text-base font-semibold">Full Membership</Label>
                </div>
                <div className={!form.full_membership_enabled ? "opacity-50 pointer-events-none grid grid-cols-1 md:grid-cols-3 gap-4" : "grid grid-cols-1 md:grid-cols-3 gap-4"}>
                  <div className="space-y-2"><Label>Share Amount to Join</Label><Input type="number" min={0} step="0.01" value={form.full_membership_share_amount} onChange={(e) => setForm({ ...form, full_membership_share_amount: parseFloat(e.target.value) || 0 })} /></div>
                  <div className="space-y-2"><Label>Initial Membership Fee</Label><Input type="number" min={0} step="0.01" value={form.full_membership_fee} onChange={(e) => setForm({ ...form, full_membership_fee: parseFloat(e.target.value) || 0 })} /></div>
                  <div className="space-y-2"><Label>Monthly Membership Fee</Label><Input type="number" min={0} step="0.01" value={form.full_membership_monthly_fee} onChange={(e) => setForm({ ...form, full_membership_monthly_fee: parseFloat(e.target.value) || 0 })} /></div>
                </div>
              </div>
              {/* Associated Membership */}
              <div className="border rounded-lg p-4 space-y-4">
                <div className="flex items-center gap-3">
                  <Checkbox checked={form.associated_membership_enabled} onCheckedChange={(v) => setForm({ ...form, associated_membership_enabled: !!v })} />
                  <Label className="text-base font-semibold">Associated Membership</Label>
                </div>
                <div className={!form.associated_membership_enabled ? "opacity-50 pointer-events-none grid grid-cols-1 md:grid-cols-3 gap-4" : "grid grid-cols-1 md:grid-cols-3 gap-4"}>
                  <div className="space-y-2"><Label>Share Amount to Join</Label><Input type="number" min={0} step="0.01" value={form.associated_membership_share_amount} onChange={(e) => setForm({ ...form, associated_membership_share_amount: parseFloat(e.target.value) || 0 })} /></div>
                  <div className="space-y-2"><Label>Initial Membership Fee</Label><Input type="number" min={0} step="0.01" value={form.associated_membership_fee} onChange={(e) => setForm({ ...form, associated_membership_fee: parseFloat(e.target.value) || 0 })} /></div>
                  <div className="space-y-2"><Label>Monthly Membership Fee</Label><Input type="number" min={0} step="0.01" value={form.associated_membership_monthly_fee} onChange={(e) => setForm({ ...form, associated_membership_monthly_fee: parseFloat(e.target.value) || 0 })} /></div>
                </div>
              </div>
              {/* Additional Share Classes */}
              <ShareClassesSection tenantId={currentTenant?.id} glAccounts={glAccounts} />
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── GL Entries ── */}
        <TabsContent value="gl">
          <Card>
            <CardHeader><CardTitle className="text-lg">GL Account Mappings</CardTitle></CardHeader>
            <CardContent className="space-y-6">
              <p className="text-sm text-muted-foreground">These GL accounts drive automated ledger postings across all transaction types.</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <GlSelect field="share_gl_account_id" label="Join Share GL Account" />
                <GlSelect field="membership_fee_gl_account_id" label="Membership Fee GL Account" />
                <GlSelect field="bank_gl_account_id" label="Bank Deposit GL Account" description="Applied to all bank entries (is_bank = true)." />
                <GlSelect field="commission_income_gl_account_id" label="Commission Income GL Account" description="Used when commission is deducted from a deposit." />
                <GlSelect field="commission_paid_gl_account_id" label="Commission Paid GL Account" description="Used when paying commission to referrers." />
                <GlSelect field="pool_allocation_gl_account_id" label="Pool Allocation GL Account" description="Used for all pool investment allocation entries." />
                <GlSelect field="vat_gl_account_id" label="VAT Control GL Account" description="All VAT entries are posted to this GL account." />
                <GlSelect field="stock_control_gl_account_id" label="Stock Control GL Account" description="All stock deposit and withdrawal entries post to this GL account." />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Vault & Invoice ── */}
        <TabsContent value="vault">
          <div className="space-y-6">
            <Card>
              <CardHeader><CardTitle className="text-lg">Document Number Prefixes</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">Prefixes used when generating document reference numbers for stock transactions.</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="space-y-2">
                    <Label>Purchase Order Prefix</Label>
                    <Input value={form.po_prefix} onChange={(e) => setForm({ ...form, po_prefix: e.target.value })} placeholder="PO" />
                    <p className="text-xs text-muted-foreground">e.g. PO-0001</p>
                  </div>
                  <div className="space-y-2">
                    <Label>Quote / Sales Order Prefix</Label>
                    <Input value={form.quote_prefix} onChange={(e) => setForm({ ...form, quote_prefix: e.target.value })} placeholder="QUO" />
                    <p className="text-xs text-muted-foreground">e.g. QUO-0001</p>
                  </div>
                  <div className="space-y-2">
                    <Label>Tax Invoice Prefix</Label>
                    <Input value={form.invoice_prefix} onChange={(e) => setForm({ ...form, invoice_prefix: e.target.value })} placeholder="INV" />
                    <p className="text-xs text-muted-foreground">e.g. INV-0001</p>
                  </div>
                  <div className="space-y-2">
                    <Label>Supplier Invoice Prefix</Label>
                    <Input value={form.supplier_invoice_prefix} onChange={(e) => setForm({ ...form, supplier_invoice_prefix: e.target.value })} placeholder="SI" />
                    <p className="text-xs text-muted-foreground">e.g. SI-0001</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-lg">Vault Locations</CardTitle></CardHeader>
              <CardContent>
                <VaultLocationsSection tenantId={currentTenant?.id} />
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ── Email Signature ── */}
        <TabsContent value="signature">
          <EmailSignatureSection
            form={form}
            setForm={setForm}
            tenantId={currentTenant?.id}
            logoUrl={form.logo_url}
            tenantEntities={tenantEntities}
            legalEntityId={form.legal_entity_id}
          />
        </TabsContent>
      </Tabs>

      <div className="flex justify-end">
        <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
          {saveMutation.isPending ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Save className="h-4 w-4 mr-1.5" />}
          Save Configuration
        </Button>
      </div>
    </div>
  );
};

export default TenantConfiguration;
