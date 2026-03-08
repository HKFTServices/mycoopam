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

type PoolCategory = { pool_category_id: string; tenant_id: string; pool_id: string; category_id: string; allocation_perc: number; is_active: boolean };

const MamPoolCategoriesTab = () => {
  const { currentTenant } = useTenant();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<PoolCategory | null>(null);
  const [form, setForm] = useState({ pool_id: "", category_id: "", allocation_perc: "0", is_active: true });

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["si_pool_category", currentTenant?.id],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("si_pool_category").select("*, pools(name), si_item_category(category_name)").eq("tenant_id", currentTenant!.id).order("created_at");
      if (error) throw error;
      return data as any[];
    },
    enabled: !!currentTenant,
  });

  const { data: pools = [] } = useQuery({
    queryKey: ["pools_list", currentTenant?.id],
    queryFn: async () => {
      const { data } = await (supabase as any).from("pools").select("id, name").eq("tenant_id", currentTenant!.id).order("name");
      return data ?? [];
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
    mutationFn: async (values: typeof form & { pool_category_id?: string }) => {
      const payload = { pool_id: values.pool_id, category_id: values.category_id, allocation_perc: Number(values.allocation_perc), is_active: values.is_active, tenant_id: currentTenant!.id };
      if (values.pool_category_id) {
        const { error } = await (supabase as any).from("si_pool_category").update(payload).eq("pool_category_id", values.pool_category_id);
        if (error) throw error;
      } else {
        const { error } = await (supabase as any).from("si_pool_category").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["si_pool_category"] }); setDialogOpen(false); setEditing(null); toast.success(editing ? "Updated" : "Created"); },
    onError: (e: Error) => toast.error(e.message),
  });

  const openNew = () => { setEditing(null); setForm({ pool_id: "", category_id: "", allocation_perc: "0", is_active: true }); setDialogOpen(true); };
  const openEdit = (item: PoolCategory) => { setEditing(item); setForm({ pool_id: item.pool_id, category_id: item.category_id, allocation_perc: String(item.allocation_perc), is_active: item.is_active }); setDialogOpen(true); };

  return (
    <Card><CardContent className="pt-6">
      <div className="flex justify-between items-center mb-4"><h3 className="font-semibold">Pool → Category Mappings</h3><Button size="sm" onClick={openNew}><Plus className="h-4 w-4 mr-1" />Add</Button></div>
      <Table>
        <TableHeader><TableRow><TableHead>Pool</TableHead><TableHead>Category</TableHead><TableHead>Allocation %</TableHead><TableHead>Active</TableHead><TableHead /></TableRow></TableHeader>
        <TableBody>
          {isLoading ? <TableRow><TableCell colSpan={5} className="text-center">Loading…</TableCell></TableRow> :
            items.map((item: any) => (
              <TableRow key={item.pool_category_id}>
                <TableCell>{item.pools?.name ?? "—"}</TableCell>
                <TableCell>{item.si_item_category?.category_name ?? "—"}</TableCell>
                <TableCell>{item.allocation_perc}%</TableCell>
                <TableCell>{item.is_active ? "✓" : "✗"}</TableCell>
                <TableCell><Button variant="ghost" size="icon" onClick={() => openEdit(item)}><Pencil className="h-4 w-4" /></Button></TableCell>
              </TableRow>
            ))}
        </TableBody>
      </Table>
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing ? "Edit Pool Category" : "New Pool Category"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Pool</Label>
                <Select value={form.pool_id} onValueChange={v => setForm({ ...form, pool_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Select pool" /></SelectTrigger>
                  <SelectContent>{pools.map((p: any) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Category</Label>
                <Select value={form.category_id} onValueChange={v => setForm({ ...form, category_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                  <SelectContent>{categories.map((c: any) => <SelectItem key={c.category_id} value={c.category_id}>{c.category_name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Allocation %</Label><Input type="number" step="0.01" value={form.allocation_perc} onChange={e => setForm({ ...form, allocation_perc: e.target.value })} /></div>
              <div className="flex items-center gap-2 pt-6"><Switch checked={form.is_active} onCheckedChange={v => setForm({ ...form, is_active: v })} /><Label>Active</Label></div>
            </div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button><Button onClick={() => upsert.mutate({ ...form, pool_category_id: editing?.pool_category_id })} disabled={upsert.isPending}>Save</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </CardContent></Card>
  );
};

export default MamPoolCategoriesTab;
