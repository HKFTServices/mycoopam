import { useState, useCallback, useRef, type RefObject } from "react";
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
import { Switch } from "@/components/ui/switch";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import { Plus, Pencil, Trash2, Mail, MessageSquare, Bell, Monitor, Eye, Code, Braces } from "lucide-react";
import { toast } from "sonner";
import RichTextEditor, { type RichTextEditorHandle } from "@/components/ui/rich-text-editor";

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
  { tag: "{{entity_account_bank_details}}", label: "Tenant Bank Details" },
  { tag: "{{email_signature}}", label: "Email Signature" },
  { tag: "{{agm_venue}}", label: "AGM Venue" },
  { tag: "{{agm_date}}", label: "AGM Date" },
  { tag: "{{agm_time}}", label: "AGM Time" },
];

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
  { value: "first_membership_dep_stock", label: "First Membership – Stock Deposit" },
  { value: "funds_receipt", label: "Funds Receipt" },
  { value: "stock_purchase_approval", label: "Stock Purchase Approval" },
  { value: "switching_approval", label: "Switching Approval" },
  { value: "termination_of_membership", label: "Termination of Membership" },
  { value: "transfer_approval", label: "Transfer Approval" },
  { value: "withdrawal_approval", label: "Withdrawal Approval" },
];

const LANGUAGES = [
  { value: "en", label: "English" },
  { value: "af", label: "Afrikaans" },
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
  language_code: "en",
  is_active: true,
  is_email_active: true,
  is_sms_active: false,
  is_push_notification_active: false,
  is_web_app_active: false,
  subject: "",
  body_html: "",
};

const SystemEmailTemplates = () => {
  const { currentTenant } = useTenant();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<CommTemplate | null>(null);
  const [form, setForm] = useState(defaultForm);
  const [langFilter, setLangFilter] = useState<string>("all");
  const [deleteTarget, setDeleteTarget] = useState<CommTemplate | null>(null);
  const [showHtmlSource, setShowHtmlSource] = useState(false);
  const editorRef = useRef<RichTextEditorHandle>(null);
  const subjectInputRef = useRef<HTMLInputElement>(null);

  const { data: templates = [], isLoading } = useQuery({
    queryKey: ["system_email_templates", currentTenant?.id],
    queryFn: async () => {
      if (!currentTenant) return [];
      const { data, error } = await supabase
        .from("communication_templates")
        .select("*")
        .eq("tenant_id", currentTenant.id)
        .eq("is_system_default", true)
        .order("application_event")
        .order("language_code");
      if (error) throw error;
      return data as CommTemplate[];
    },
    enabled: !!currentTenant,
  });

  const filtered = langFilter === "all" ? templates : templates.filter((t) => t.language_code === langFilter);

  const upsert = useMutation({
    mutationFn: async (values: typeof form & { id?: string }) => {
      if (!currentTenant) throw new Error("No tenant");
      const payload = {
        name: values.name,
        notes: values.notes || null,
        application_event: values.application_event,
        language_code: values.language_code,
        is_active: values.is_active,
        is_system_default: true,
        is_email_active: values.is_email_active,
        is_sms_active: values.is_sms_active,
        is_push_notification_active: values.is_push_notification_active,
        is_web_app_active: values.is_web_app_active,
        subject: values.subject || null,
        body_html: values.body_html || null,
      };
      if (values.id) {
        const { error } = await supabase.from("communication_templates").update(payload).eq("id", values.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("communication_templates").insert({ ...payload, tenant_id: currentTenant.id });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["system_email_templates"] });
      setDialogOpen(false);
      setEditing(null);
      toast.success(editing ? "System template updated" : "System template created");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("communication_templates").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["system_email_templates"] });
      setDeleteTarget(null);
      toast.success("System template deleted");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const openNew = () => { setEditing(null); setForm(defaultForm); setDialogOpen(true); };

  const openEdit = (t: CommTemplate) => {
    setEditing(t);
    setForm({
      name: t.name,
      notes: t.notes || "",
      application_event: t.application_event as AppEvent,
      language_code: t.language_code || "en",
      is_active: t.is_active,
      is_email_active: t.is_email_active,
      is_sms_active: t.is_sms_active,
      is_push_notification_active: t.is_push_notification_active,
      is_web_app_active: t.is_web_app_active,
      subject: t.subject || "",
      body_html: t.body_html || "",
    });
    setDialogOpen(true);
  };

  const channelIcons = (t: CommTemplate) => (
    <div className="flex gap-1.5">
      {t.is_email_active && <Mail className="h-3.5 w-3.5 text-muted-foreground" />}
      {t.is_sms_active && <MessageSquare className="h-3.5 w-3.5 text-muted-foreground" />}
      {t.is_push_notification_active && <Bell className="h-3.5 w-3.5 text-muted-foreground" />}
      {t.is_web_app_active && <Monitor className="h-3.5 w-3.5 text-muted-foreground" />}
    </div>
  );

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-lg sm:text-2xl font-bold tracking-tight">System Email Templates</h1>
          <p className="text-muted-foreground text-xs sm:text-sm mt-1">Manage global system default email templates. Tenants can import and customize these.</p>
        </div>
        <div className="flex flex-col sm:flex-row sm:items-center gap-2">
          <Select value={langFilter} onValueChange={setLangFilter}>
            <SelectTrigger className="w-full sm:w-[140px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Languages</SelectItem>
              {LANGUAGES.map((l) => <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button onClick={openNew} size="sm" className="w-full sm:w-auto">
            <Plus className="h-4 w-4 mr-1.5" />Add Template
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="w-full overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead className="hidden md:table-cell">Event</TableHead>
                  <TableHead>Lang</TableHead>
                  <TableHead>Channels</TableHead>
                  <TableHead>Active</TableHead>
                  <TableHead className="w-16" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Loading…</TableCell></TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No system templates yet.</TableCell></TableRow>
                ) : (
                  filtered.map((t) => (
                    <TableRow key={t.id}>
                      <TableCell className="font-medium">{t.name}</TableCell>
                      <TableCell className="hidden md:table-cell text-muted-foreground text-sm">
                        {APPLICATION_EVENTS.find((e) => e.value === t.application_event)?.label || t.application_event}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs uppercase">{t.language_code}</Badge>
                      </TableCell>
                      <TableCell>{channelIcons(t)}</TableCell>
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
          </div>
        </CardContent>
      </Card>

      {/* Edit/Create Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit System Template" : "New System Template"}</DialogTitle>
            <DialogDescription>Configure the system default template. Tenants can import and override this.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Name</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Transaction Confirmation" />
              </div>
              <div className="space-y-2">
                <Label>Application Event</Label>
                <Select value={form.application_event} onValueChange={(v) => setForm({ ...form, application_event: v as AppEvent })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {APPLICATION_EVENTS.map((e) => (
                      <SelectItem key={e.value} value={e.value}>{e.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Language</Label>
                <Select value={form.language_code} onValueChange={(v) => setForm({ ...form, language_code: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {LANGUAGES.map((l) => <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Description of this template…" rows={2} />
            </div>

            <div className="space-y-2">
              <Label>Email Subject</Label>
              <div className="flex flex-col sm:flex-row gap-2">
                <Input ref={subjectInputRef} value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} placeholder="e.g. Welcome to {{tenant_name}}!" className="flex-1" />
                <MergeFieldPicker onInsert={(tag) => {
                  const input = subjectInputRef.current;
                  if (input) {
                    const start = input.selectionStart ?? form.subject.length;
                    const end = input.selectionEnd ?? start;
                    const newVal = form.subject.slice(0, start) + tag + form.subject.slice(end);
                    setForm({ ...form, subject: newVal });
                    setTimeout(() => {
                      input.focus();
                      const cursor = start + tag.length;
                      input.setSelectionRange(cursor, cursor);
                    }, 0);
                  } else {
                    setForm({ ...form, subject: form.subject + tag });
                  }
                }} label="Merge" />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <Label>Email Body</Label>
                <div className="flex gap-1">
                  <MergeFieldPicker onInsert={(tag) => {
                    if (!showHtmlSource && editorRef.current) {
                      editorRef.current.insertText(tag);
                    } else {
                      setForm({ ...form, body_html: form.body_html + tag });
                    }
                  }} />
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
                <Textarea value={form.body_html} onChange={(e) => setForm({ ...form, body_html: e.target.value })} placeholder="<p>Dear {{first_name}},</p>" rows={10} className="font-mono text-xs" />
              ) : (
                <RichTextEditor
                  ref={editorRef}
                  value={form.body_html}
                  onChange={(val) => setForm({ ...form, body_html: val })}
                  placeholder="Dear {{first_name}},..."
                />
              )}
            </div>

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
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={() => upsert.mutate({ ...form, id: editing?.id })} disabled={!form.name.trim() || upsert.isPending}>
              {upsert.isPending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete System Template</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "<strong>{deleteTarget?.name}</strong>"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
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
      <Button type="button" variant="outline" size="sm" className="h-7 text-xs gap-1.5">
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

export default SystemEmailTemplates;
