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

type CoopStructure = { coop_structure_id: string; tenant_id: string; admin_fee_percent: number; is_active: boolean };

const MamCoopStructureTab = () => {
  const { currentTenant } = useTenant();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<CoopStructure | null>(null);
  const [form, setForm] = useState({ admin_fee_percent: "0", is_active: true });

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["si_coop_structure", currentTenant?.id],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("si_coop_structure").select("*").eq("tenant_id", currentTenant!.id).order("created_at");
      if (error) throw error;
      return data as CoopStructure[];
    },
    enabled: !!currentTenant,
  });

  const upsert = useMutation({
    mutationFn: async (values: typeof form & { coop_structure_id?: string }) => {
      const payload = { admin_fee_percent: Number(values.admin_fee_percent), is_active: values.is_active, tenant_id: currentTenant!.id };
      if (values.coop_structure_id) {
        const { error } = await (supabase as any).from("si_coop_structure").update(payload).eq("coop_structure_id", values.coop_structure_id);
        if (error) throw error;
      } else {
        const { error } = await (supabase as any).from("si_coop_structure").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["si_coop_structure"] }); setDialogOpen(false); setEditing(null); toast.success(editing ? "Updated" : "Created"); },
    onError: (e: Error) => toast.error(e.message),
  });

  const openNew = () => { setEditing(null); setForm({ admin_fee_percent: "0", is_active: true }); setDialogOpen(true); };
  const openEdit = (item: CoopStructure) => { setEditing(item); setForm({ admin_fee_percent: String(item.admin_fee_percent), is_active: item.is_active }); setDialogOpen(true); };

  return (
    <Card><CardContent className="pt-6">
      <div className="flex justify-between items-center mb-4"><h3 className="font-semibold">Coop Structure</h3><Button size="sm" onClick={openNew}><Plus className="h-4 w-4 mr-1" />Add</Button></div>
      <Table>
        <TableHeader><TableRow><TableHead>Admin Fee %</TableHead><TableHead>Active</TableHead><TableHead /></TableRow></TableHeader>
        <TableBody>
          {isLoading ? <TableRow><TableCell colSpan={3} className="text-center">Loading…</TableCell></TableRow> :
            items.map(item => (
              <TableRow key={item.coop_structure_id}>
                <TableCell>{item.admin_fee_percent}%</TableCell>
                <TableCell>{item.is_active ? "✓" : "✗"}</TableCell>
                <TableCell><Button variant="ghost" size="icon" onClick={() => openEdit(item)}><Pencil className="h-4 w-4" /></Button></TableCell>
              </TableRow>
            ))}
        </TableBody>
      </Table>
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing ? "Edit Coop Structure" : "New Coop Structure"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Label>Admin Fee %</Label><Input type="number" step="0.01" value={form.admin_fee_percent} onChange={e => setForm({ ...form, admin_fee_percent: e.target.value })} /></div>
            <div className="flex items-center gap-2"><Switch checked={form.is_active} onCheckedChange={v => setForm({ ...form, is_active: v })} /><Label>Active</Label></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button><Button onClick={() => upsert.mutate({ ...form, coop_structure_id: editing?.coop_structure_id })} disabled={upsert.isPending}>Save</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </CardContent></Card>
  );
};

export default MamCoopStructureTab;
