import { useState } from "react";
import { formatLocalDate } from "@/lib/formatDate";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/contexts/TenantContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import RichTextEditor from "@/components/ui/rich-text-editor";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent } from "@/components/ui/card";
import { Plus, Pencil, Eye } from "lucide-react";
import { toast } from "sonner";

const CONDITION_TYPES = [
  { value: "registration", label: "Registration" },
  { value: "membership", label: "Membership" },
  { value: "pool", label: "Pool" },
  { value: "tax", label: "Tax" },
] as const;

const LANGUAGES = [
  { value: "en", label: "English" },
  { value: "af", label: "Afrikaans" },
] as const;

type TermsCondition = {
  id: string;
  tenant_id: string;
  content: string;
  condition_type: string;
  effective_from: string;
  is_active: boolean;
  language_code: string;
  created_at: string;
  updated_at: string;
};

const TermsConditions = () => {
  const { currentTenant } = useTenant();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewContent, setPreviewContent] = useState("");
  const [editing, setEditing] = useState<TermsCondition | null>(null);
  type ConditionType = "registration" | "membership" | "pool" | "tax";
  const [form, setForm] = useState({
    content: "",
    condition_type: "registration" as ConditionType,
    effective_from: formatLocalDate(),
    is_active: true,
    language_code: "en",
  });

  const { data: terms = [], isLoading } = useQuery({
    queryKey: ["terms_conditions", currentTenant?.id],
    queryFn: async () => {
      if (!currentTenant) return [];
      const { data, error } = await supabase
        .from("terms_conditions")
        .select("*")
        .eq("tenant_id", currentTenant.id)
        .order("condition_type")
        .order("language_code");
      if (error) throw error;
      return data as TermsCondition[];
    },
    enabled: !!currentTenant,
  });

  const upsert = useMutation({
    mutationFn: async (values: typeof form & { id?: string }) => {
      if (!currentTenant) throw new Error("No tenant");
      const payload = {
        content: values.content,
        condition_type: values.condition_type,
        effective_from: values.effective_from,
        is_active: values.is_active,
        language_code: values.language_code,
      };
      if (values.id) {
        const { error } = await supabase.from("terms_conditions").update(payload).eq("id", values.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("terms_conditions").insert({
          ...payload,
          tenant_id: currentTenant.id,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["terms_conditions"] });
      setDialogOpen(false);
      setEditing(null);
      toast.success(editing ? "Terms updated" : "Terms created");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const openNew = () => {
    setEditing(null);
    setForm({ content: "", condition_type: "registration", effective_from: formatLocalDate(), is_active: true, language_code: "en" });
    setDialogOpen(true);
  };

  const openEdit = (t: TermsCondition) => {
    setEditing(t);
    setForm({
      content: t.content,
      condition_type: t.condition_type as ConditionType,
      effective_from: t.effective_from.split("T")[0],
      is_active: t.is_active,
      language_code: t.language_code,
    });
    setDialogOpen(true);
  };

  const typeLabel = (type: string) => CONDITION_TYPES.find((t) => t.value === type)?.label ?? type;
  const langLabel = (code: string) => LANGUAGES.find((l) => l.value === code)?.label ?? code;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Terms & Conditions</h1>
          <p className="text-muted-foreground text-sm mt-1">Manage T&C documents for registration, membership, pools and tax.</p>
        </div>
        <Button onClick={openNew} size="sm"><Plus className="h-4 w-4 mr-1.5" />Add Terms</Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Type</TableHead>
                <TableHead>Language</TableHead>
                <TableHead>Effective From</TableHead>
                <TableHead>Active</TableHead>
                <TableHead className="w-24" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Loading…</TableCell></TableRow>
              ) : terms.length === 0 ? (
                <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">No terms yet. Add one to get started.</TableCell></TableRow>
              ) : (
                terms.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell>
                      <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-accent text-accent-foreground">
                        {typeLabel(t.condition_type)}
                      </span>
                    </TableCell>
                    <TableCell>{langLabel(t.language_code)}</TableCell>
                    <TableCell>{new Date(t.effective_from).toLocaleDateString()}</TableCell>
                    <TableCell>{t.is_active ? "Yes" : "No"}</TableCell>
                    <TableCell className="flex gap-1">
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setPreviewContent(t.content); setPreviewOpen(true); }}>
                        <Eye className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(t)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Edit/Create Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Terms" : "New Terms"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Type</Label>
                <Select value={form.condition_type} onValueChange={(v) => setForm({ ...form, condition_type: v as ConditionType })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CONDITION_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Language</Label>
                <Select value={form.language_code} onValueChange={(v) => setForm({ ...form, language_code: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {LANGUAGES.map((l) => (
                      <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Effective From</Label>
              <Input type="date" value={form.effective_from} onChange={(e) => setForm({ ...form, effective_from: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Content (HTML)</Label>
              <Textarea
                value={form.content}
                onChange={(e) => setForm({ ...form, content: e.target.value })}
                placeholder="<p>Enter terms and conditions HTML content...</p>"
                rows={10}
              />
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} />
              <Label>Active</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={() => upsert.mutate({ ...form, id: editing?.id })} disabled={!form.content.trim() || upsert.isPending}>
              {upsert.isPending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Preview Dialog */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Preview</DialogTitle>
          </DialogHeader>
          <div className="prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: previewContent }} />
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default TermsConditions;
