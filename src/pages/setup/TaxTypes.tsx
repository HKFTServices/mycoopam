import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";

type TaxType = {
  id: string;
  name: string;
  description: string | null;
  percentage: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

const TaxTypes = () => {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<TaxType | null>(null);
  const [form, setForm] = useState({ name: "", description: "", percentage: 0, is_active: true });

  const { data: types = [], isLoading } = useQuery({
    queryKey: ["tax_types"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("tax_types")
        .select("*")
        .order("name");
      if (error) throw error;
      return data as TaxType[];
    },
  });

  const upsert = useMutation({
    mutationFn: async (values: typeof form & { id?: string }) => {
      const payload = { name: values.name, description: values.description || null, percentage: values.percentage, is_active: values.is_active };
      if (values.id) {
        const { error } = await (supabase as any).from("tax_types").update(payload).eq("id", values.id);
        if (error) throw error;
      } else {
        const { error } = await (supabase as any).from("tax_types").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tax_types"] });
      setDialogOpen(false);
      setEditing(null);
      toast.success(editing ? "Tax type updated" : "Tax type created");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from("tax_types").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tax_types"] });
      toast.success("Tax type deleted");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const openNew = () => {
    setEditing(null);
    setForm({ name: "", description: "", percentage: 0, is_active: true });
    setDialogOpen(true);
  };

  const openEdit = (t: TaxType) => {
    setEditing(t);
    setForm({ name: t.name, description: t.description ?? "", percentage: t.percentage, is_active: t.is_active });
    setDialogOpen(true);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-lg sm:text-2xl font-bold tracking-tight">Tax Types</h1>
          <p className="text-muted-foreground text-xs sm:text-sm mt-1">Manage VAT and other tax categories applied to items.</p>
        </div>
        <Button onClick={openNew} size="sm" className="w-full sm:w-auto">
          <Plus className="h-4 w-4 mr-1.5" />Add Tax Type
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="w-full overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Percentage</TableHead>
                  <TableHead>Active</TableHead>
                  <TableHead className="w-24" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Loading…</TableCell></TableRow>
                ) : types.length === 0 ? (
                  <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">No tax types yet.</TableCell></TableRow>
                ) : (
                  types.map((t) => (
                    <TableRow key={t.id}>
                      <TableCell className="font-medium">{t.name}</TableCell>
                      <TableCell className="text-muted-foreground">{t.description ?? "—"}</TableCell>
                      <TableCell>{t.percentage}%</TableCell>
                      <TableCell>{t.is_active ? "Yes" : "No"}</TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(t)}><Pencil className="h-3.5 w-3.5" /></Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => deleteMutation.mutate(t.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Tax Type" : "New Tax Type"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Name *</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. VAT" />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="e.g. Standard VAT" />
            </div>
            <div className="space-y-2">
              <Label>Percentage (%)</Label>
              <Input type="number" step="0.01" value={form.percentage} onChange={(e) => setForm({ ...form, percentage: parseFloat(e.target.value) || 0 })} />
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

export default TaxTypes;
