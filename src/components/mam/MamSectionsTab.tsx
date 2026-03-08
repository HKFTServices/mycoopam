import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/contexts/TenantContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import { Plus, Pencil } from "lucide-react";
import { toast } from "sonner";

type Section = {
  section_id: string;
  tenant_id: string;
  section_code: string;
  section_name: string;
  description: string | null;
  notes: string | null;
  sort_order: number;
  is_active: boolean;
};

const MamSectionsTab = () => {
  const { currentTenant } = useTenant();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Section | null>(null);
  const [form, setForm] = useState({ section_code: "", section_name: "", description: "", notes: "", sort_order: 0, is_active: true });

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["si_section", currentTenant?.id],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("si_section").select("*").eq("tenant_id", currentTenant!.id).order("sort_order");
      if (error) throw error;
      return data as Section[];
    },
    enabled: !!currentTenant,
  });

  const upsert = useMutation({
    mutationFn: async (values: typeof form & { section_id?: string }) => {
      const payload = { section_code: values.section_code, section_name: values.section_name, description: values.description || null, notes: values.notes || null, sort_order: values.sort_order, is_active: values.is_active, tenant_id: currentTenant!.id };
      if (values.section_id) {
        const { error } = await (supabase as any).from("si_section").update(payload).eq("section_id", values.section_id);
        if (error) throw error;
      } else {
        const { error } = await (supabase as any).from("si_section").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["si_section"] }); setDialogOpen(false); setEditing(null); toast.success(editing ? "Updated" : "Created"); },
    onError: (e: Error) => toast.error(e.message),
  });

  const openNew = () => { setEditing(null); setForm({ section_code: "", section_name: "", description: "", notes: "", sort_order: items.length, is_active: true }); setDialogOpen(true); };
  const openEdit = (item: Section) => { setEditing(item); setForm({ section_code: item.section_code, section_name: item.section_name, description: item.description || "", notes: item.notes || "", sort_order: item.sort_order, is_active: item.is_active }); setDialogOpen(true); };

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex justify-between items-center mb-4">
          <h3 className="font-semibold">Sections</h3>
          <Button size="sm" onClick={openNew}><Plus className="h-4 w-4 mr-1" />Add</Button>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Code</TableHead><TableHead>Name</TableHead><TableHead>Description</TableHead><TableHead>Order</TableHead><TableHead>Active</TableHead><TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? <TableRow><TableCell colSpan={6} className="text-center">Loading…</TableCell></TableRow> :
              items.map(item => (
                <TableRow key={item.section_id}>
                  <TableCell className="font-mono text-xs">{item.section_code}</TableCell>
                  <TableCell>{item.section_name}</TableCell>
                  <TableCell className="text-muted-foreground text-sm max-w-[200px] truncate">{item.description}</TableCell>
                  <TableCell>{item.sort_order}</TableCell>
                  <TableCell>{item.is_active ? "✓" : "✗"}</TableCell>
                  <TableCell><Button variant="ghost" size="icon" onClick={() => openEdit(item)}><Pencil className="h-4 w-4" /></Button></TableCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent>
            <DialogHeader><DialogTitle>{editing ? "Edit Section" : "New Section"}</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div><Label>Code</Label><Input value={form.section_code} onChange={e => setForm({ ...form, section_code: e.target.value })} /></div>
                <div><Label>Name</Label><Input value={form.section_name} onChange={e => setForm({ ...form, section_name: e.target.value })} /></div>
              </div>
              <div><Label>Description</Label><Textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} /></div>
              <div><Label>Notes</Label><Textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} /></div>
              <div className="grid grid-cols-2 gap-4">
                <div><Label>Sort Order</Label><Input type="number" value={form.sort_order} onChange={e => setForm({ ...form, sort_order: Number(e.target.value) })} /></div>
                <div className="flex items-center gap-2 pt-6"><Switch checked={form.is_active} onCheckedChange={v => setForm({ ...form, is_active: v })} /><Label>Active</Label></div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button onClick={() => upsert.mutate({ ...form, section_id: editing?.section_id })} disabled={upsert.isPending}>Save</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
};

export default MamSectionsTab;
