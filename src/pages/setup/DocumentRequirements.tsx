import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/contexts/TenantContext";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
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
import { Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";

type DocReq = {
  id: string;
  tenant_id: string;
  document_type_id: string;
  relationship_type_id: string;
  is_required_for_registration: boolean;
  is_active: boolean;
  document_types?: { id: string; name: string };
  relationship_types?: { id: string; name: string };
};

const DocumentRequirements = () => {
  const { currentTenant } = useTenant();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<DocReq | null>(null);
  const [form, setForm] = useState({
    document_type_id: "",
    relationship_type_id: "",
    is_required_for_registration: false,
    is_active: true,
  });

  const { data: docTypes = [] } = useQuery({
    queryKey: ["document_types", currentTenant?.id],
    queryFn: async () => {
      if (!currentTenant) return [];
      const { data, error } = await supabase.from("document_types").select("id, name").eq("tenant_id", currentTenant.id).eq("is_active", true).order("name");
      if (error) throw error;
      return data;
    },
    enabled: !!currentTenant,
  });

  const { data: relTypes = [] } = useQuery({
    queryKey: ["relationship_types_active"],
    queryFn: async () => {
      const { data, error } = await supabase.from("relationship_types").select("id, name").eq("is_active", true).order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: requirements = [], isLoading } = useQuery({
    queryKey: ["document_entity_requirements", currentTenant?.id],
    queryFn: async () => {
      if (!currentTenant) return [];
      const { data, error } = await supabase
        .from("document_entity_requirements")
        .select("*, document_types(id, name), relationship_types(id, name)")
        .eq("tenant_id", currentTenant.id)
        .order("created_at");
      if (error) throw error;
      return data as DocReq[];
    },
    enabled: !!currentTenant,
  });

  const upsert = useMutation({
    mutationFn: async (values: typeof form & { id?: string }) => {
      if (!currentTenant) throw new Error("No tenant");
      const payload = {
        document_type_id: values.document_type_id,
        relationship_type_id: values.relationship_type_id,
        is_required_for_registration: values.is_required_for_registration,
        is_active: values.is_active,
      };
      if (values.id) {
        const { error } = await supabase.from("document_entity_requirements").update(payload).eq("id", values.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("document_entity_requirements").insert({ ...payload, tenant_id: currentTenant.id });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["document_entity_requirements"] });
      setDialogOpen(false);
      setEditing(null);
      toast.success(editing ? "Requirement updated" : "Requirement created");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("document_entity_requirements").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["document_entity_requirements"] });
      toast.success("Requirement deleted");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const openNew = () => {
    setEditing(null);
    setForm({ document_type_id: "", relationship_type_id: "", is_required_for_registration: false, is_active: true });
    setDialogOpen(true);
  };

  const openEdit = (r: DocReq) => {
    setEditing(r);
    setForm({
      document_type_id: r.document_type_id,
      relationship_type_id: r.relationship_type_id,
      is_required_for_registration: r.is_required_for_registration,
      is_active: r.is_active,
    });
    setDialogOpen(true);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Document Requirements</h1>
          <p className="text-muted-foreground text-sm mt-1">Map which documents are required for each relationship type.</p>
        </div>
        <Button onClick={openNew} size="sm"><Plus className="h-4 w-4 mr-1.5" />Add Requirement</Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Document</TableHead>
                <TableHead>Relationship</TableHead>
                <TableHead>Required for Registration</TableHead>
                <TableHead>Active</TableHead>
                <TableHead className="w-24" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Loading…</TableCell></TableRow>
              ) : requirements.length === 0 ? (
                <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">No requirements configured yet.</TableCell></TableRow>
              ) : (
                requirements.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.document_types?.name || "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{r.relationship_types?.name || "—"}</TableCell>
                    <TableCell>{r.is_required_for_registration ? "Yes" : "No"}</TableCell>
                    <TableCell>{r.is_active ? "Yes" : "No"}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(r)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => deleteMut.mutate(r.id)}>
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

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Requirement" : "New Requirement"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Document Type</Label>
              <Select value={form.document_type_id} onValueChange={(v) => setForm({ ...form, document_type_id: v })}>
                <SelectTrigger><SelectValue placeholder="Select document type" /></SelectTrigger>
                <SelectContent>
                  {docTypes.map((d) => (
                    <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Relationship Type</Label>
              <Select value={form.relationship_type_id} onValueChange={(v) => setForm({ ...form, relationship_type_id: v })}>
                <SelectTrigger><SelectValue placeholder="Select relationship type" /></SelectTrigger>
                <SelectContent>
                  {relTypes.map((r) => (
                    <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={form.is_required_for_registration} onCheckedChange={(v) => setForm({ ...form, is_required_for_registration: v })} />
              <Label>Required for Registration</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} />
              <Label>Active</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={() => upsert.mutate({ ...form, id: editing?.id })} disabled={!form.document_type_id || !form.relationship_type_id || upsert.isPending}>
              {upsert.isPending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default DocumentRequirements;
