import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/contexts/TenantContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import { Plus, Pencil } from "lucide-react";
import { toast } from "sonner";

type Brand = { brand_id: string; tenant_id: string; brand_name: string; is_active: boolean };

const MamBrandsTab = () => {
  const { currentTenant } = useTenant();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Brand | null>(null);
  const [form, setForm] = useState({ brand_name: "", is_active: true });

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["si_brand", currentTenant?.id],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("si_brand").select("*").eq("tenant_id", currentTenant!.id).order("brand_name");
      if (error) throw error;
      return data as Brand[];
    },
    enabled: !!currentTenant,
  });

  const upsert = useMutation({
    mutationFn: async (values: typeof form & { brand_id?: string }) => {
      const payload = { brand_name: values.brand_name, is_active: values.is_active, tenant_id: currentTenant!.id };
      if (values.brand_id) {
        const { error } = await (supabase as any).from("si_brand").update(payload).eq("brand_id", values.brand_id);
        if (error) throw error;
      } else {
        const { error } = await (supabase as any).from("si_brand").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["si_brand"] }); setDialogOpen(false); setEditing(null); toast.success(editing ? "Updated" : "Created"); },
    onError: (e: Error) => toast.error(e.message),
  });

  const openNew = () => { setEditing(null); setForm({ brand_name: "", is_active: true }); setDialogOpen(true); };
  const openEdit = (item: Brand) => { setEditing(item); setForm({ brand_name: item.brand_name, is_active: item.is_active }); setDialogOpen(true); };

  return (
    <Card><CardContent className="pt-6">
      <div className="flex justify-between items-center mb-4"><h3 className="font-semibold">Brands</h3><Button size="sm" onClick={openNew}><Plus className="h-4 w-4 mr-1" />Add</Button></div>
      <Table>
        <TableHeader><TableRow><TableHead>Brand Name</TableHead><TableHead>Active</TableHead><TableHead /></TableRow></TableHeader>
        <TableBody>
          {isLoading ? <TableRow><TableCell colSpan={3} className="text-center">Loading…</TableCell></TableRow> :
            items.map(item => (
              <TableRow key={item.brand_id}>
                <TableCell>{item.brand_name}</TableCell>
                <TableCell>{item.is_active ? "✓" : "✗"}</TableCell>
                <TableCell><Button variant="ghost" size="icon" onClick={() => openEdit(item)}><Pencil className="h-4 w-4" /></Button></TableCell>
              </TableRow>
            ))}
        </TableBody>
      </Table>
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing ? "Edit Brand" : "New Brand"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Label>Brand Name</Label><Input value={form.brand_name} onChange={e => setForm({ ...form, brand_name: e.target.value })} /></div>
            <div className="flex items-center gap-2"><Switch checked={form.is_active} onCheckedChange={v => setForm({ ...form, is_active: v })} /><Label>Active</Label></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button><Button onClick={() => upsert.mutate({ ...form, brand_id: editing?.brand_id })} disabled={upsert.isPending}>Save</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </CardContent></Card>
  );
};

export default MamBrandsTab;
