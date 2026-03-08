import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/contexts/TenantContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import { Plus, Pencil } from "lucide-react";
import { toast } from "sonner";

type Category = { category_id: string; tenant_id: string; section_id: string | null; category_code: string; category_name: string; category_group: string | null; description: string | null; is_active: boolean };
type Section = { section_id: string; section_name: string };

const MamCategoriesTab = () => {
  const { currentTenant } = useTenant();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Category | null>(null);
  const [form, setForm] = useState({ category_code: "", category_name: "", section_id: "", category_group: "", description: "", is_active: true });

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["si_item_category", currentTenant?.id],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("si_item_category").select("*, si_section(section_name)").eq("tenant_id", currentTenant!.id).order("category_name");
      if (error) throw error;
      return data as (Category & { si_section: { section_name: string } | null })[];
    },
    enabled: !!currentTenant,
  });

  const { data: sections = [] } = useQuery({
    queryKey: ["si_section_list", currentTenant?.id],
    queryFn: async () => {
      const { data } = await (supabase as any).from("si_section").select("section_id, section_name").eq("tenant_id", currentTenant!.id).eq("is_active", true).order("sort_order");
      return (data ?? []) as Section[];
    },
    enabled: !!currentTenant,
  });

  const upsert = useMutation({
    mutationFn: async (values: typeof form & { category_id?: string }) => {
      const payload = { category_code: values.category_code, category_name: values.category_name, section_id: values.section_id || null, category_group: values.category_group || null, description: values.description || null, is_active: values.is_active, tenant_id: currentTenant!.id };
      if (values.category_id) {
        const { error } = await (supabase as any).from("si_item_category").update(payload).eq("category_id", values.category_id);
        if (error) throw error;
      } else {
        const { error } = await (supabase as any).from("si_item_category").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["si_item_category"] }); setDialogOpen(false); setEditing(null); toast.success(editing ? "Updated" : "Created"); },
    onError: (e: Error) => toast.error(e.message),
  });

  const openNew = () => { setEditing(null); setForm({ category_code: "", category_name: "", section_id: "", category_group: "", description: "", is_active: true }); setDialogOpen(true); };
  const openEdit = (item: Category) => { setEditing(item); setForm({ category_code: item.category_code, category_name: item.category_name, section_id: item.section_id || "", category_group: item.category_group || "", description: item.description || "", is_active: item.is_active }); setDialogOpen(true); };

  return (
    <Card><CardContent className="pt-6">
      <div className="flex justify-between items-center mb-4"><h3 className="font-semibold">Item Categories</h3><Button size="sm" onClick={openNew}><Plus className="h-4 w-4 mr-1" />Add</Button></div>
      <Table>
        <TableHeader><TableRow><TableHead>Code</TableHead><TableHead>Name</TableHead><TableHead>Section</TableHead><TableHead>Group</TableHead><TableHead>Active</TableHead><TableHead /></TableRow></TableHeader>
        <TableBody>
          {isLoading ? <TableRow><TableCell colSpan={6} className="text-center">Loading…</TableCell></TableRow> :
            items.map(item => (
              <TableRow key={item.category_id}>
                <TableCell className="font-mono text-xs">{item.category_code}</TableCell>
                <TableCell>{item.category_name}</TableCell>
                <TableCell className="text-sm">{(item as any).si_section?.section_name ?? "—"}</TableCell>
                <TableCell className="text-sm">{item.category_group ?? "—"}</TableCell>
                <TableCell>{item.is_active ? "✓" : "✗"}</TableCell>
                <TableCell><Button variant="ghost" size="icon" onClick={() => openEdit(item)}><Pencil className="h-4 w-4" /></Button></TableCell>
              </TableRow>
            ))}
        </TableBody>
      </Table>
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing ? "Edit Category" : "New Category"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Code</Label><Input value={form.category_code} onChange={e => setForm({ ...form, category_code: e.target.value })} /></div>
              <div><Label>Name</Label><Input value={form.category_name} onChange={e => setForm({ ...form, category_name: e.target.value })} /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Section</Label>
                <Select value={form.section_id} onValueChange={v => setForm({ ...form, section_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Select section" /></SelectTrigger>
                  <SelectContent>{sections.map(s => <SelectItem key={s.section_id} value={s.section_id}>{s.section_name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Group</Label><Input value={form.category_group} onChange={e => setForm({ ...form, category_group: e.target.value })} /></div>
            </div>
            <div><Label>Description</Label><Textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} /></div>
            <div className="flex items-center gap-2"><Switch checked={form.is_active} onCheckedChange={v => setForm({ ...form, is_active: v })} /><Label>Active</Label></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button><Button onClick={() => upsert.mutate({ ...form, category_id: editing?.category_id })} disabled={upsert.isPending}>Save</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </CardContent></Card>
  );
};

export default MamCategoriesTab;
