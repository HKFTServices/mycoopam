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

type Model = { item_model_id: string; tenant_id: string; category_id: string; brand_id: string | null; model_name: string; model_number: string | null; typical_new_value: number | null; is_active: boolean };

const MamModelsTab = () => {
  const { currentTenant } = useTenant();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Model | null>(null);
  const [form, setForm] = useState({ category_id: "", brand_id: "", model_name: "", model_number: "", typical_new_value: "", is_active: true });

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["si_item_model", currentTenant?.id],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("si_item_model").select("*, si_item_category(category_name), si_brand(brand_name)").eq("tenant_id", currentTenant!.id).order("model_name");
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

  const { data: brands = [] } = useQuery({
    queryKey: ["si_brand_list", currentTenant?.id],
    queryFn: async () => {
      const { data } = await (supabase as any).from("si_brand").select("brand_id, brand_name").eq("tenant_id", currentTenant!.id).eq("is_active", true).order("brand_name");
      return data ?? [];
    },
    enabled: !!currentTenant,
  });

  const upsert = useMutation({
    mutationFn: async (values: typeof form & { item_model_id?: string }) => {
      const payload = { category_id: values.category_id, brand_id: values.brand_id || null, model_name: values.model_name, model_number: values.model_number || null, typical_new_value: values.typical_new_value ? Number(values.typical_new_value) : null, is_active: values.is_active, tenant_id: currentTenant!.id };
      if (values.item_model_id) {
        const { error } = await (supabase as any).from("si_item_model").update(payload).eq("item_model_id", values.item_model_id);
        if (error) throw error;
      } else {
        const { error } = await (supabase as any).from("si_item_model").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["si_item_model"] }); setDialogOpen(false); setEditing(null); toast.success(editing ? "Updated" : "Created"); },
    onError: (e: Error) => toast.error(e.message),
  });

  const openNew = () => { setEditing(null); setForm({ category_id: "", brand_id: "", model_name: "", model_number: "", typical_new_value: "", is_active: true }); setDialogOpen(true); };
  const openEdit = (item: Model) => { setEditing(item); setForm({ category_id: item.category_id, brand_id: item.brand_id || "", model_name: item.model_name, model_number: item.model_number || "", typical_new_value: item.typical_new_value?.toString() || "", is_active: item.is_active }); setDialogOpen(true); };

  return (
    <Card><CardContent className="pt-6">
      <div className="flex justify-between items-center mb-4"><h3 className="font-semibold">Item Models</h3><Button size="sm" onClick={openNew}><Plus className="h-4 w-4 mr-1" />Add</Button></div>
      <Table>
        <TableHeader><TableRow><TableHead>Model</TableHead><TableHead>Number</TableHead><TableHead>Category</TableHead><TableHead>Brand</TableHead><TableHead>New Value</TableHead><TableHead>Active</TableHead><TableHead /></TableRow></TableHeader>
        <TableBody>
          {isLoading ? <TableRow><TableCell colSpan={7} className="text-center">Loading…</TableCell></TableRow> :
            items.map(item => (
              <TableRow key={item.item_model_id}>
                <TableCell>{item.model_name}</TableCell>
                <TableCell className="text-sm">{item.model_number ?? "—"}</TableCell>
                <TableCell className="text-sm">{item.si_item_category?.category_name ?? "—"}</TableCell>
                <TableCell className="text-sm">{item.si_brand?.brand_name ?? "—"}</TableCell>
                <TableCell className="text-sm">{item.typical_new_value != null ? `R ${item.typical_new_value.toLocaleString()}` : "—"}</TableCell>
                <TableCell>{item.is_active ? "✓" : "✗"}</TableCell>
                <TableCell><Button variant="ghost" size="icon" onClick={() => openEdit(item)}><Pencil className="h-4 w-4" /></Button></TableCell>
              </TableRow>
            ))}
        </TableBody>
      </Table>
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing ? "Edit Model" : "New Model"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Label>Model Name</Label><Input value={form.model_name} onChange={e => setForm({ ...form, model_name: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Model Number</Label><Input value={form.model_number} onChange={e => setForm({ ...form, model_number: e.target.value })} /></div>
              <div><Label>Typical New Value</Label><Input type="number" value={form.typical_new_value} onChange={e => setForm({ ...form, typical_new_value: e.target.value })} /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Category</Label>
                <Select value={form.category_id} onValueChange={v => setForm({ ...form, category_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                  <SelectContent>{categories.map((c: any) => <SelectItem key={c.category_id} value={c.category_id}>{c.category_name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Brand</Label>
                <Select value={form.brand_id} onValueChange={v => setForm({ ...form, brand_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Select brand" /></SelectTrigger>
                  <SelectContent>{brands.map((b: any) => <SelectItem key={b.brand_id} value={b.brand_id}>{b.brand_name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex items-center gap-2"><Switch checked={form.is_active} onCheckedChange={v => setForm({ ...form, is_active: v })} /><Label>Active</Label></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button><Button onClick={() => upsert.mutate({ ...form, item_model_id: editing?.item_model_id })} disabled={upsert.isPending}>Save</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </CardContent></Card>
  );
};

export default MamModelsTab;
