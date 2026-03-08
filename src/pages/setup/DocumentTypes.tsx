import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/contexts/TenantContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent } from "@/components/ui/card";
import { Plus, Pencil } from "lucide-react";
import { toast } from "sonner";

type DocumentType = {
  id: string;
  tenant_id: string;
  name: string;
  comment_instruction: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

const DocumentTypes = () => {
  const { currentTenant } = useTenant();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<DocumentType | null>(null);
  const [form, setForm] = useState({ name: "", comment_instruction: "", is_active: true });

  const { data: types = [], isLoading } = useQuery({
    queryKey: ["document_types", currentTenant?.id],
    queryFn: async () => {
      if (!currentTenant) return [];
      const { data, error } = await supabase
        .from("document_types")
        .select("*")
        .eq("tenant_id", currentTenant.id)
        .order("name");
      if (error) throw error;
      return data as DocumentType[];
    },
    enabled: !!currentTenant,
  });

  const upsert = useMutation({
    mutationFn: async (values: typeof form & { id?: string }) => {
      if (!currentTenant) throw new Error("No tenant");
      const payload = {
        name: values.name,
        comment_instruction: values.comment_instruction || null,
        is_active: values.is_active,
      };
      if (values.id) {
        const { error } = await supabase.from("document_types").update(payload).eq("id", values.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("document_types").insert({ ...payload, tenant_id: currentTenant.id });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["document_types"] });
      setDialogOpen(false);
      setEditing(null);
      toast.success(editing ? "Document type updated" : "Document type created");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const openNew = () => {
    setEditing(null);
    setForm({ name: "", comment_instruction: "", is_active: true });
    setDialogOpen(true);
  };

  const openEdit = (dt: DocumentType) => {
    setEditing(dt);
    setForm({ name: dt.name, comment_instruction: dt.comment_instruction || "", is_active: dt.is_active });
    setDialogOpen(true);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Document Types</h1>
          <p className="text-muted-foreground text-sm mt-1">Manage KYC and other document types required for registration.</p>
        </div>
        <Button onClick={openNew} size="sm"><Plus className="h-4 w-4 mr-1.5" />Add Document Type</Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead className="hidden md:table-cell">Instruction</TableHead>
                <TableHead>Active</TableHead>
                <TableHead className="w-16" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={4} className="text-center py-8 text-muted-foreground">Loading…</TableCell></TableRow>
              ) : types.length === 0 ? (
                <TableRow><TableCell colSpan={4} className="text-center py-8 text-muted-foreground">No document types yet.</TableCell></TableRow>
              ) : (
                types.map((dt) => (
                  <TableRow key={dt.id}>
                    <TableCell className="font-medium">{dt.name}</TableCell>
                    <TableCell className="hidden md:table-cell text-muted-foreground text-sm max-w-xs truncate">{dt.comment_instruction || "—"}</TableCell>
                    <TableCell>{dt.is_active ? "Yes" : "No"}</TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(dt)}>
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

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Document Type" : "New Document Type"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. ID Passport" />
            </div>
            <div className="space-y-2">
              <Label>Upload Instruction</Label>
              <Textarea value={form.comment_instruction} onChange={(e) => setForm({ ...form, comment_instruction: e.target.value })} placeholder="Instructions shown to the user when uploading…" rows={3} />
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
    </div>
  );
};

export default DocumentTypes;
