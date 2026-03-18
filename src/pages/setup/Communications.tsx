import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

type AppEvent = Database["public"]["Enums"]["application_event"];
import { useTenant } from "@/contexts/TenantContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil, Trash2, Mail, MessageSquare, Bell, Monitor, Download, Eye, Code, Braces, Languages, Loader2 } from "lucide-react";
import { toast } from "sonner";
import RichTextEditor from "@/components/ui/rich-text-editor";

const APPLICATION_EVENTS: { value: AppEvent; label: string }[] = [
  { value: "none", label: "None (Manual)" },
  { value: "user_registration_completed", label: "User Registration Completed" },
  { value: "account_creation_successful", label: "Account Creation Successful" },
  { value: "transaction_confirmation", label: "Transaction Confirmation" },
  { value: "co_op_name", label: "Co-Op Name" },
  { value: "dear", label: "Dear (Salutation)" },
  { value: "debit_order", label: "Debit Order" },
  { value: "dep_metal_approval", label: "Metal Deposit Approval" },
  { value: "deposit_funds_approval", label: "Funds Deposit Approval" },
  { value: "email_footer", label: "Email Footer" },
  { value: "first_membership_dep_funds", label: "First Membership – Funds Deposit" },
  { value: "first_membership_dep_metal", label: "First Membership – Metal Deposit" },
  { value: "funds_receipt", label: "Funds Receipt" },
  { value: "stock_purchase_approval", label: "Stock Purchase Approval" },
  { value: "switching_approval", label: "Switching Approval" },
  { value: "termination_of_membership", label: "Termination of Membership" },
  { value: "transfer_approval", label: "Transfer Approval" },
  { value: "withdrawal_approval", label: "Withdrawal Approval" },
];

const MERGE_FIELDS = [
  { tag: "{{account_number}}", label: "Member Number" },
  { tag: "{{entity_name}}", label: "Entity Name" },
  { tag: "{{legal_entity_name}}", label: "Legal Entity Name" },
  { tag: "{{user_name}}", label: "User Name" },
  { tag: "{{user_surname}}", label: "User Surname" },
  { tag: "{{title}}", label: "Title" },
  { tag: "{{phone_number}}", label: "Phone Number" },
  { tag: "{{email_address}}", label: "Email Address" },
  { tag: "{{tenant_name}}", label: "Co-op Name" },
  { tag: "{{entity_account_name}}", label: "Entity Account Name" },
  { tag: "{{email_signature}}", label: "Email Signature" },
  { tag: "{{agm_venue}}", label: "AGM Venue" },
  { tag: "{{agm_date}}", label: "AGM Date" },
  { tag: "{{agm_time}}", label: "AGM Time" },
];

type CommTemplate = {
  id: string;
  tenant_id: string;
  name: string;
  is_system_default: boolean;
  is_active: boolean;
  notes: string | null;
  application_event: string;
  language_code: string;
  is_email_active: boolean;
  is_sms_active: boolean;
  is_push_notification_active: boolean;
  is_web_app_active: boolean;
  subject: string | null;
  body_html: string | null;
  created_at: string;
  updated_at: string;
};

const defaultForm = {
  name: "",
  notes: "",
  application_event: "none" as AppEvent,
  is_active: true,
  is_email_active: true,
  is_sms_active: false,
  is_push_notification_active: false,
  is_web_app_active: false,
  subject_en: "",
  body_html_en: "",
  subject_af: "",
  body_html_af: "",
};

const Communications = () => {
  const { currentTenant } = useTenant();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<CommTemplate | null>(null);
  const [editingAf, setEditingAf] = useState<CommTemplate | null>(null);
  const [form, setForm] = useState(defaultForm);
  const [deleteTarget, setDeleteTarget] = useState<CommTemplate | null>(null);
  const [showHtmlSource, setShowHtmlSource] = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("en");
  const [isTranslating, setIsTranslating] = useState(false);

  // All custom templates for this tenant
  const { data: allTemplates = [], isLoading } = useQuery({
    queryKey: ["communication_templates", currentTenant?.id],
    queryFn: async () => {
      if (!currentTenant) return [];
      const { data, error } = await supabase
        .from("communication_templates")
        .select("*")
        .eq("tenant_id", currentTenant.id)
        .eq("is_system_default", false)
        .order("name");
      if (error) throw error;
      return data as CommTemplate[];
    },
    enabled: !!currentTenant,
  });

  // Only show English templates in the list (AF is accessed via tabs in dialog)
  const englishTemplates = allTemplates.filter((t) => t.language_code === "en");

  // Find AF pair for a given EN template
  const findAfPair = (enTemplate: CommTemplate) =>
    allTemplates.find(
      (t) =>
        t.language_code === "af" &&
        t.name === enTemplate.name &&
        t.application_event === enTemplate.application_event
    );

  // System templates available for import
  const { data: systemTemplates = [] } = useQuery({
    queryKey: ["system_templates_for_import", currentTenant?.id],
    queryFn: async () => {
      if (!currentTenant) return [];
      const { data, error } = await supabase
        .from("communication_templates")
        .select("*")
        .eq("tenant_id", currentTenant.id)
        .eq("is_system_default", true)
        .eq("language_code", "en")
        .order("application_event");
      if (error) throw error;
      return data as CommTemplate[];
    },
    enabled: !!currentTenant && importDialogOpen,
  });

  const upsert = useMutation({
    mutationFn: async (values: typeof form & { id?: string; afId?: string }) => {
      if (!currentTenant) throw new Error("No tenant");

      // English payload
      const enPayload = {
        name: values.name,
        notes: values.notes || null,
        application_event: values.application_event,
        language_code: "en",
        is_active: values.is_active,
        is_system_default: false,
        is_email_active: values.is_email_active,
        is_sms_active: values.is_sms_active,
        is_push_notification_active: values.is_push_notification_active,
        is_web_app_active: values.is_web_app_active,
        subject: values.subject_en || null,
        body_html: values.body_html_en || null,
      };

      // Save English version
      if (values.id) {
        const { error } = await supabase.from("communication_templates").update(enPayload).eq("id", values.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("communication_templates").insert({ ...enPayload, tenant_id: currentTenant.id });
        if (error) throw error;
      }

      // Afrikaans payload
      const afPayload = {
        name: values.name,
        notes: values.notes || null,
        application_event: values.application_event,
        language_code: "af",
        is_active: values.is_active,
        is_system_default: false,
        is_email_active: values.is_email_active,
        is_sms_active: values.is_sms_active,
        is_push_notification_active: values.is_push_notification_active,
        is_web_app_active: values.is_web_app_active,
        subject: values.subject_af || null,
        body_html: values.body_html_af || null,
      };

      // Save Afrikaans version
      if (values.afId) {
        const { error } = await supabase.from("communication_templates").update(afPayload).eq("id", values.afId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("communication_templates").insert({ ...afPayload, tenant_id: currentTenant.id });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["communication_templates"] });
      setDialogOpen(false);
      setEditing(null);
      setEditingAf(null);
      toast.success(editing ? "Template updated" : "Template created");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const importMutation = useMutation({
    mutationFn: async (systemTemplate: CommTemplate) => {
      if (!currentTenant) throw new Error("No tenant");
      // Import EN version
      const { error: enErr } = await supabase.from("communication_templates").insert([{
        tenant_id: currentTenant.id,
        name: `${systemTemplate.name} (Custom)`,
        notes: `Imported from system template: ${systemTemplate.name}`,
        application_event: systemTemplate.application_event as AppEvent,
        language_code: "en",
        is_active: systemTemplate.is_active,
        is_system_default: false,
        is_email_active: systemTemplate.is_email_active,
        is_sms_active: systemTemplate.is_sms_active,
        is_push_notification_active: systemTemplate.is_push_notification_active,
        is_web_app_active: systemTemplate.is_web_app_active,
        subject: systemTemplate.subject,
        body_html: systemTemplate.body_html,
      }]);
      if (enErr) throw enErr;

      // Also import AF system version if it exists, or create empty AF placeholder
      const { data: afSystem } = await supabase
        .from("communication_templates")
        .select("*")
        .eq("tenant_id", currentTenant.id)
        .eq("is_system_default", true)
        .eq("application_event", systemTemplate.application_event as unknown as AppEvent)
        .eq("language_code", "af")
        .maybeSingle();

      const { error: afErr } = await supabase.from("communication_templates").insert([{
        tenant_id: currentTenant.id,
        name: `${systemTemplate.name} (Custom)`,
        notes: `Imported from system template: ${systemTemplate.name}`,
        application_event: systemTemplate.application_event as unknown as AppEvent,
        language_code: "af",
        is_active: systemTemplate.is_active,
        is_system_default: false,
        is_email_active: systemTemplate.is_email_active,
        is_sms_active: systemTemplate.is_sms_active,
        is_push_notification_active: systemTemplate.is_push_notification_active,
        is_web_app_active: systemTemplate.is_web_app_active,
        subject: afSystem?.subject || "",
        body_html: afSystem?.body_html || "",
      }]);
      if (afErr) throw afErr;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["communication_templates"] });
      setImportDialogOpen(false);
      toast.success("System template imported (EN + AF) — you can now customize it.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (enTemplate: CommTemplate) => {
      // Delete both EN and AF versions
      const afPair = findAfPair(enTemplate);
      const { error } = await supabase.from("communication_templates").delete().eq("id", enTemplate.id);
      if (error) throw error;
      if (afPair) {
        const { error: afErr } = await supabase.from("communication_templates").delete().eq("id", afPair.id);
        if (afErr) throw afErr;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["communication_templates"] });
      setDeleteTarget(null);
      toast.success("Template deleted (EN + AF)");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const openNew = () => {
    setEditing(null);
    setEditingAf(null);
    setForm(defaultForm);
    setActiveTab("en");
    setShowHtmlSource(false);
    setDialogOpen(true);
  };

  const openEdit = (enTemplate: CommTemplate) => {
    const afPair = findAfPair(enTemplate);
    setEditing(enTemplate);
    setEditingAf(afPair || null);
    setForm({
      name: enTemplate.name,
      notes: enTemplate.notes || "",
      application_event: enTemplate.application_event as AppEvent,
      is_active: enTemplate.is_active,
      is_email_active: enTemplate.is_email_active,
      is_sms_active: enTemplate.is_sms_active,
      is_push_notification_active: enTemplate.is_push_notification_active,
      is_web_app_active: enTemplate.is_web_app_active,
      subject_en: enTemplate.subject || "",
      body_html_en: enTemplate.body_html || "",
      subject_af: afPair?.subject || "",
      body_html_af: afPair?.body_html || "",
    });
    setActiveTab("en");
    setShowHtmlSource(false);
    setDialogOpen(true);
  };

  const insertMergeField = (tag: string) => {
    const langKey = activeTab === "af" ? "body_html_af" : "body_html_en";
    setForm((prev) => ({ ...prev, [langKey]: prev[langKey] + tag }));
  };

  const channelIcons = (t: CommTemplate) => (
    <div className="flex gap-1.5">
      {t.is_email_active && <Mail className="h-3.5 w-3.5 text-muted-foreground" />}
      {t.is_sms_active && <MessageSquare className="h-3.5 w-3.5 text-muted-foreground" />}
      {t.is_push_notification_active && <Bell className="h-3.5 w-3.5 text-muted-foreground" />}
      {t.is_web_app_active && <Monitor className="h-3.5 w-3.5 text-muted-foreground" />}
    </div>
  );

  const hasAfVersion = (t: CommTemplate) => !!findAfPair(t);

  // Shared content editor for a language tab
  const renderContentEditor = (lang: "en" | "af") => {
    const subjectKey = lang === "af" ? "subject_af" : "subject_en";
    const bodyKey = lang === "af" ? "body_html_af" : "body_html_en";

    return (
      <div className="space-y-4">
        <div className="space-y-2">
          <Label>Email Subject ({lang === "af" ? "Afrikaans" : "English"})</Label>
          <div className="flex gap-2">
            <Input
              className="flex-1"
              value={form[subjectKey]}
              onChange={(e) => setForm({ ...form, [subjectKey]: e.target.value })}
              placeholder={lang === "af" ? "bv. Welkom by {{tenant_name}}!" : "e.g. Welcome to {{tenant_name}}!"}
            />
            <MergeFieldPicker onInsert={(tag) => setForm((prev) => ({ ...prev, [subjectKey]: prev[subjectKey] + tag }))} />
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>Email Body ({lang === "af" ? "Afrikaans" : "English"})</Label>
            <div className="flex items-center gap-1">
              <MergeFieldPicker onInsert={(tag) => insertMergeFieldForLang(lang, tag)} label="Insert Field" />
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
          </div>
          {showHtmlSource ? (
            <Textarea
              value={form[bodyKey]}
              onChange={(e) => setForm({ ...form, [bodyKey]: e.target.value })}
              placeholder={lang === "af" ? "<p>Geagte {{first_name}},</p>" : "<p>Dear {{first_name}},</p>"}
              rows={10}
              className="font-mono text-xs"
            />
          ) : (
            <RichTextEditor
              value={form[bodyKey]}
              onChange={(val) => setForm({ ...form, [bodyKey]: val })}
              placeholder={lang === "af" ? "Geagte {{first_name}},..." : "Dear {{first_name}},..."}
            />
          )}
        </div>
      </div>
    );
  };

  const insertMergeFieldForLang = (lang: "en" | "af", tag: string) => {
    const bodyKey = lang === "af" ? "body_html_af" : "body_html_en";
    setForm((prev) => ({ ...prev, [bodyKey]: prev[bodyKey] + tag }));
  };

  const generateAfrikaans = async () => {
    if (!form.subject_en && !form.body_html_en) {
      toast.error("Please add English content first before generating Afrikaans.");
      return;
    }
    setIsTranslating(true);
    try {
      const { data, error } = await supabase.functions.invoke("translate-template", {
        body: { subject: form.subject_en, body_html: form.body_html_en },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setForm((prev) => ({
        ...prev,
        subject_af: data.subject_af || prev.subject_af,
        body_html_af: data.body_html_af || prev.body_html_af,
      }));
      setActiveTab("af");
      toast.success("Afrikaans version generated — please review and edit as needed.");
    } catch (e: any) {
      toast.error(`Translation failed: ${e.message}`);
    } finally {
      setIsTranslating(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Campaign Templates</h1>
          <p className="text-muted-foreground text-sm mt-1">Manage custom email, SMS, and notification templates. Each template has English and Afrikaans versions.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setImportDialogOpen(true)}>
            <Download className="h-4 w-4 mr-1.5" />Import System Template
          </Button>
          <Button onClick={openNew} size="sm"><Plus className="h-4 w-4 mr-1.5" />Add Template</Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead className="hidden md:table-cell">Event</TableHead>
                <TableHead>Channels</TableHead>
                <TableHead>Active</TableHead>
                <TableHead className="w-16" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Loading…</TableCell></TableRow>
              ) : englishTemplates.length === 0 ? (
                <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">No custom templates yet. Import a system template to get started.</TableCell></TableRow>
              ) : (
                englishTemplates.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="font-medium">{t.name}</TableCell>
                    <TableCell className="hidden md:table-cell text-muted-foreground text-sm">
                      {APPLICATION_EVENTS.find((e) => e.value === t.application_event)?.label || t.application_event}
                    </TableCell>
                    <TableCell>{channelIcons(t)}</TableCell>
                    <TableCell>
                      {hasAfVersion(t) ? (
                        <Badge variant="outline" className="text-xs bg-primary/10 text-primary border-primary/20">AF ✓</Badge>
                      ) : (
                        <Badge variant="outline" className="text-xs text-muted-foreground">—</Badge>
                      )}
                    </TableCell>
                    <TableCell>{t.is_active ? "Yes" : "No"}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(t)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => setDeleteTarget(t)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Template" : "New Template"}</DialogTitle>
            <DialogDescription>Configure the template with English and Afrikaans content. Use merge fields to personalise messages.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Name</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Quarterly Statements" />
              </div>
              <div className="space-y-2">
                <Label>Application Event</Label>
                {editing ? (
                  <Input
                    value={APPLICATION_EVENTS.find((e) => e.value === form.application_event)?.label || form.application_event}
                    disabled
                    className="bg-muted"
                  />
                ) : (
                  <Input value="Manual" disabled className="bg-muted" />
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Description of this template…" rows={2} />
            </div>

            {/* English / Afrikaans Tabs */}
            <Tabs value={activeTab} onValueChange={(v) => { setActiveTab(v); setShowHtmlSource(false); }}>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="en">🇬🇧 English</TabsTrigger>
                <TabsTrigger value="af">🇿🇦 Afrikaans</TabsTrigger>
              </TabsList>
              <TabsContent value="en" className="mt-4">
                {renderContentEditor("en")}
              </TabsContent>
              <TabsContent value="af" className="mt-4">
                {renderContentEditor("af")}
              </TabsContent>
            </Tabs>

            {/* Channels */}
            <div className="border border-border rounded-lg p-4 space-y-3">
              <Label className="text-sm font-semibold">Channels</Label>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex items-center gap-2">
                  <Switch checked={form.is_email_active} onCheckedChange={(v) => setForm({ ...form, is_email_active: v })} />
                  <Label className="flex items-center gap-1.5"><Mail className="h-3.5 w-3.5" /> Email</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Switch checked={form.is_sms_active} onCheckedChange={(v) => setForm({ ...form, is_sms_active: v })} />
                  <Label className="flex items-center gap-1.5"><MessageSquare className="h-3.5 w-3.5" /> SMS</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Switch checked={form.is_push_notification_active} onCheckedChange={(v) => setForm({ ...form, is_push_notification_active: v })} />
                  <Label className="flex items-center gap-1.5"><Bell className="h-3.5 w-3.5" /> Push</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Switch checked={form.is_web_app_active} onCheckedChange={(v) => setForm({ ...form, is_web_app_active: v })} />
                  <Label className="flex items-center gap-1.5"><Monitor className="h-3.5 w-3.5" /> Web App</Label>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Switch checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} />
              <Label>Active</Label>
            </div>
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5 sm:mr-auto"
              onClick={generateAfrikaans}
              disabled={isTranslating || (!form.subject_en && !form.body_html_en)}
            >
              {isTranslating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Languages className="h-4 w-4" />}
              {isTranslating ? "Generating…" : "Generate Afrikaans"}
            </Button>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button
              onClick={() => upsert.mutate({ ...form, id: editing?.id, afId: editingAf?.id })}
              disabled={!form.name.trim() || upsert.isPending}
            >
              {upsert.isPending ? "Saving…" : "Save (EN + AF)"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Import System Template Dialog */}
      <Dialog open={importDialogOpen} onOpenChange={setImportDialogOpen}>
        <DialogContent className="max-w-lg max-h-[70vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Import System Template</DialogTitle>
            <DialogDescription>Select a system template to copy into your custom templates. Both EN and AF versions will be imported.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            {systemTemplates.length === 0 ? (
              <p className="text-center text-muted-foreground py-4">No system templates available.</p>
            ) : (
              systemTemplates.map((st) => (
                <div key={st.id} className="flex items-center justify-between border border-border rounded-lg px-4 py-3">
                  <div>
                    <p className="font-medium text-sm">{st.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {APPLICATION_EVENTS.find((e) => e.value === st.application_event)?.label || st.application_event}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => importMutation.mutate(st)}
                    disabled={importMutation.isPending}
                  >
                    <Download className="h-3.5 w-3.5 mr-1" />Import
                  </Button>
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Template</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "<strong>{deleteTarget?.name}</strong>"? Both English and Afrikaans versions will be removed. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget)}
            >
              {deleteMutation.isPending ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

// Merge Field Picker Component
const MergeFieldPicker = ({ onInsert, label = "Merge Fields" }: { onInsert: (tag: string) => void; label?: string }) => (
  <Popover>
    <PopoverTrigger asChild>
      <Button type="button" variant="outline" size="sm" className="h-8 text-xs gap-1.5">
        <Braces className="h-3.5 w-3.5" />
        {label}
      </Button>
    </PopoverTrigger>
    <PopoverContent className="w-56 p-1" align="end">
      <div className="space-y-0.5">
        {MERGE_FIELDS.map((f) => (
          <button
            key={f.tag}
            type="button"
            className="w-full text-left px-3 py-1.5 text-sm rounded-sm hover:bg-accent hover:text-accent-foreground transition-colors"
            onClick={() => onInsert(f.tag)}
          >
            <span className="font-medium">{f.label}</span>
            <span className="text-muted-foreground text-xs ml-2 font-mono">{f.tag}</span>
          </button>
        ))}
      </div>
    </PopoverContent>
  </Popover>
);

export default Communications;
