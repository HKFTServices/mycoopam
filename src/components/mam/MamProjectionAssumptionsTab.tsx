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

type Assumption = { projection_assumption_id: string; tenant_id: string; yield_pa: number; contribution_esc_perc: number; total_period_months: number; interval_months: number; is_active: boolean };

const MamProjectionAssumptionsTab = () => {
  const { currentTenant } = useTenant();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Assumption | null>(null);
  const [form, setForm] = useState({ yield_pa: "0", contribution_esc_perc: "0", total_period_months: "120", interval_months: "12", is_active: true });

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["si_projection_assumption", currentTenant?.id],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("si_projection_assumption").select("*").eq("tenant_id", currentTenant!.id).order("created_at");
      if (error) throw error;
      return data as Assumption[];
    },
    enabled: !!currentTenant,
  });

  const upsert = useMutation({
    mutationFn: async (values: typeof form & { projection_assumption_id?: string }) => {
      const payload = { yield_pa: Number(values.yield_pa), contribution_esc_perc: Number(values.contribution_esc_perc), total_period_months: Number(values.total_period_months), interval_months: Number(values.interval_months), is_active: values.is_active, tenant_id: currentTenant!.id };
      if (values.projection_assumption_id) {
        const { error } = await (supabase as any).from("si_projection_assumption").update(payload).eq("projection_assumption_id", values.projection_assumption_id);
        if (error) throw error;
      } else {
        const { error } = await (supabase as any).from("si_projection_assumption").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["si_projection_assumption"] }); setDialogOpen(false); setEditing(null); toast.success(editing ? "Updated" : "Created"); },
    onError: (e: Error) => toast.error(e.message),
  });

  const openNew = () => { setEditing(null); setForm({ yield_pa: "0", contribution_esc_perc: "0", total_period_months: "120", interval_months: "12", is_active: true }); setDialogOpen(true); };
  const openEdit = (item: Assumption) => { setEditing(item); setForm({ yield_pa: String(item.yield_pa), contribution_esc_perc: String(item.contribution_esc_perc), total_period_months: String(item.total_period_months), interval_months: String(item.interval_months), is_active: item.is_active }); setDialogOpen(true); };

  return (
    <Card><CardContent className="pt-6">
      <div className="flex justify-between items-center mb-4"><h3 className="font-semibold">Projection Assumptions</h3><Button size="sm" onClick={openNew}><Plus className="h-4 w-4 mr-1" />Add</Button></div>
      <Table>
        <TableHeader><TableRow><TableHead>Yield p.a. %</TableHead><TableHead>Contribution Esc %</TableHead><TableHead>Period (months)</TableHead><TableHead>Interval (months)</TableHead><TableHead>Active</TableHead><TableHead /></TableRow></TableHeader>
        <TableBody>
          {isLoading ? <TableRow><TableCell colSpan={6} className="text-center">Loading…</TableCell></TableRow> :
            items.map(item => (
              <TableRow key={item.projection_assumption_id}>
                <TableCell>{item.yield_pa}%</TableCell>
                <TableCell>{item.contribution_esc_perc}%</TableCell>
                <TableCell>{item.total_period_months}</TableCell>
                <TableCell>{item.interval_months}</TableCell>
                <TableCell>{item.is_active ? "✓" : "✗"}</TableCell>
                <TableCell><Button variant="ghost" size="icon" onClick={() => openEdit(item)}><Pencil className="h-4 w-4" /></Button></TableCell>
              </TableRow>
            ))}
        </TableBody>
      </Table>
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing ? "Edit Assumption" : "New Assumption"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Yield p.a. %</Label><Input type="number" step="0.01" value={form.yield_pa} onChange={e => setForm({ ...form, yield_pa: e.target.value })} /></div>
              <div><Label>Contribution Escalation %</Label><Input type="number" step="0.01" value={form.contribution_esc_perc} onChange={e => setForm({ ...form, contribution_esc_perc: e.target.value })} /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Total Period (months)</Label><Input type="number" value={form.total_period_months} onChange={e => setForm({ ...form, total_period_months: e.target.value })} /></div>
              <div><Label>Interval (months)</Label><Input type="number" value={form.interval_months} onChange={e => setForm({ ...form, interval_months: e.target.value })} /></div>
            </div>
            <div className="flex items-center gap-2"><Switch checked={form.is_active} onCheckedChange={v => setForm({ ...form, is_active: v })} /><Label>Active</Label></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button><Button onClick={() => upsert.mutate({ ...form, projection_assumption_id: editing?.projection_assumption_id })} disabled={upsert.isPending}>Save</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </CardContent></Card>
  );
};

export default MamProjectionAssumptionsTab;
