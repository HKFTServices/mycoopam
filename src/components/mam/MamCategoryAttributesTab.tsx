import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/contexts/TenantContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import { Plus, Pencil } from "lucide-react";
import { toast } from "sonner";

type Attribute = { category_attribute_id: string; tenant_id: string; category_id: string; attribute_code: string; attribute_name: string; data_type: string; is_required: boolean; sort_order: number; is_active: boolean };

const dataTypes = ["text", "number", "date", "boolean", "select"];

const MamCategoryAttributesTab = () => {
  const { currentTenant } = useTenant();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Attribute | null>(null);
  const [form, setForm] = useState({ category_id: "", attribute_code: "", attribute_name: "", data_type: "text", is_required: false, sort_order: 0, is_active: true });

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["si_category_attribute", currentTenant?.id],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("si_category_attribute").select("*, si_item_category(category_name)").eq("tenant_id", currentTenant!.id).order("sort_order");
      if (error) throw error;
      return data as any[];
    },
    enabled: !!currentTenant,
  });

  const { data: categories = [] } = useQuery({
    queryKey: ["si_item_category_list", currentTenant?.id],
    queryFn: async () => {
      const { data } = await (supabase as any).from("si_item_category").select("category_id, category_name").eq("tenant_id", currentTenant!.id).eq("is_active", true).order("category_name");
      return data ?? [];
    },
    enabled: !!currentTenant,
  });

  const upsert = useMutation({
    mutationFn: async (values: typeof form & { category_attribute_id?: string }) => {
      const payload = { category_id: values.category_id, attribute_code: values.attribute_code, attribute_name: values.attribute_name, data_type: values.data_type, is_required: values.is_required, sort_order: values.sort_order, is_active: values.is_active, tenant_id: currentTenant!.id };
      if (values.category_attribute_id) {
        const { error } = await (supabase as any).from("si_category_attribute").update(payload).eq("category_attribute_id", values.category_attribute_id);
        if (error) throw error;
      } else {
        const { error } = await (supabase as any).from("si_category_attribute").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["si_category_attribute"] }); setDialogOpen(false); setEditing(null); toast.success(editing ? "Updated" : "Created"); },
    onError: (e: Error) => toast.error(e.message),
  });

  const openNew = () => { setEditing(null); setForm({ category_id: "", attribute_code: "", attribute_name: "", data_type: "text", is_required: false, sort_order: items.length, is_active: true }); setDialogOpen(true); };
  const openEdit = (item: Attribute) => { setEditing(item); setForm({ category_id: item.category_id, attribute_code: item.attribute_code, attribute_name: item.attribute_name, data_type: item.data_type, is_required: item.is_required, sort_order: item.sort_order, is_active: item.is_active }); setDialogOpen(true); };

  return (
    <Card><CardContent className="pt-6">
      <div className="flex justify-between items-center mb-4"><h3 className="font-semibold">Category Attributes</h3><Button size="sm" onClick={openNew}><Plus className="h-4 w-4 mr-1" />Add</Button></div>
      <Table>
        <TableHeader><TableRow><TableHead>Code</TableHead><TableHead>Name</TableHead><TableHead>Category</TableHead><TableHead>Type</TableHead><TableHead>Required</TableHead><TableHead>Order</TableHead><TableHead>Active</TableHead><TableHead /></TableRow></TableHeader>
        <TableBody>
          {isLoading ? <TableRow><TableCell colSpan={8} className="text-center">Loading…</TableCell></TableRow> :
            items.map((item: any) => (
              <TableRow key={item.category_attribute_id}>
                <TableCell className="font-mono text-xs">{item.attribute_code}</TableCell>
                <TableCell>{item.attribute_name}</TableCell>
                <TableCell className="text-sm">{item.si_item_category?.category_name ?? "—"}</TableCell>
                <TableCell className="text-sm">{item.data_type}</TableCell>
                <TableCell>{item.is_required ? "✓" : "—"}</TableCell>
                <TableCell>{item.sort_order}</TableCell>
                <TableCell>{item.is_active ? "✓" : "✗"}</TableCell>
                <TableCell><Button variant="ghost" size="icon" onClick={() => openEdit(item)}><Pencil className="h-4 w-4" /></Button></TableCell>
              </TableRow>
            ))}
        </TableBody>
      </Table>
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing ? "Edit Attribute" : "New Attribute"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Code</Label><Input value={form.attribute_code} onChange={e => setForm({ ...form, attribute_code: e.target.value })} /></div>
              <div><Label>Name</Label><Input value={form.attribute_name} onChange={e => setForm({ ...form, attribute_name: e.target.value })} /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Category</Label>
                <Select value={form.category_id} onValueChange={v => setForm({ ...form, category_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                  <SelectContent>{categories.map((c: any) => <SelectItem key={c.category_id} value={c.category_id}>{c.category_name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Data Type</Label>
                <Select value={form.data_type} onValueChange={v => setForm({ ...form, data_type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{dataTypes.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div><Label>Sort Order</Label><Input type="number" value={form.sort_order} onChange={e => setForm({ ...form, sort_order: Number(e.target.value) })} /></div>
              <div className="flex items-center gap-2 pt-6"><Switch checked={form.is_required} onCheckedChange={v => setForm({ ...form, is_required: v })} /><Label>Required</Label></div>
              <div className="flex items-center gap-2 pt-6"><Switch checked={form.is_active} onCheckedChange={v => setForm({ ...form, is_active: v })} /><Label>Active</Label></div>
            </div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button><Button onClick={() => upsert.mutate({ ...form, category_attribute_id: editing?.category_attribute_id })} disabled={upsert.isPending}>Save</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </CardContent></Card>
  );
};

export default MamCategoryAttributesTab;
