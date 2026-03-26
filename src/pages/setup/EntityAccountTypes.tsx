import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/contexts/TenantContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent } from "@/components/ui/card";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";

type EntityAccountType = {
  id: string;
  tenant_id: string;
  name: string;
  prefix: string;
  allow_public_registration: boolean;
  account_type: number;
  is_active: boolean;
  number_count: number;
  membership_fee: number;
  created_at: string;
  updated_at: string;
};

const accountTypeLabels: Record<number, string> = {
  1: "Full Membership",
  2: "Customer",
  3: "Supplier",
  4: "Associated Membership",
  5: "Referral House",
  6: "Legal Entity",
  7: "Administrator",
};

const EntityAccountTypes = () => {
  const { currentTenant } = useTenant();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<EntityAccountType | null>(null);
  const [form, setForm] = useState({
    name: "", prefix: "", allow_public_registration: false,
    account_type: 1, is_active: true, number_count: 5, membership_fee: 0,
  });

  const { data: types = [], isLoading } = useQuery({
    queryKey: ["entity_account_types", currentTenant?.id],
    queryFn: async () => {
      if (!currentTenant) return [];
      const { data, error } = await (supabase as any)
        .from("entity_account_types")
        .select("*")
        .eq("tenant_id", currentTenant.id)
        .order("name");
      if (error) throw error;
      return data as EntityAccountType[];
    },
    enabled: !!currentTenant,
  });

  const upsert = useMutation({
    mutationFn: async (values: typeof form & { id?: string }) => {
      if (!currentTenant) throw new Error("No tenant selected");
      const payload = {
        name: values.name,
        prefix: values.prefix,
        allow_public_registration: values.allow_public_registration,
        account_type: values.account_type,
        is_active: values.is_active,
        number_count: values.number_count,
        membership_fee: values.membership_fee,
        tenant_id: currentTenant.id,
      };
      if (values.id) {
        const { error } = await (supabase as any).from("entity_account_types").update(payload).eq("id", values.id);
        if (error) throw error;
      } else {
        const { error } = await (supabase as any).from("entity_account_types").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["entity_account_types", currentTenant?.id] });
      setDialogOpen(false);
      setEditing(null);
      toast.success(editing ? "Account type updated" : "Account type created");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from("entity_account_types").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["entity_account_types", currentTenant?.id] });
      toast.success("Account type deleted");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const openNew = () => {
    setEditing(null);
    setForm({ name: "", prefix: "", allow_public_registration: false, account_type: 1, is_active: true, number_count: 5, membership_fee: 0 });
    setDialogOpen(true);
  };

  const openEdit = (t: EntityAccountType) => {
    setEditing(t);
    setForm({
      name: t.name, prefix: t.prefix,
      allow_public_registration: t.allow_public_registration,
      account_type: t.account_type, is_active: t.is_active,
      number_count: t.number_count, membership_fee: t.membership_fee ?? 0,
    });
    setDialogOpen(true);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Entity Account Types</h1>
          <p className="text-muted-foreground text-sm mt-1">Manage account types such as Membership, Customer, Supplier.</p>
        </div>
        <Button onClick={openNew} size="sm"><Plus className="h-4 w-4 mr-1.5" />Add Type</Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Prefix</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Fee</TableHead>
                <TableHead>Public Reg.</TableHead>
                <TableHead>Num Count</TableHead>
                <TableHead>Active</TableHead>
                <TableHead className="w-24" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">Loading…</TableCell></TableRow>
              ) : types.length === 0 ? (
                <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">No account types yet.</TableCell></TableRow>
              ) : (
                types.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="font-medium">{t.name}</TableCell>
                    <TableCell>{t.prefix}</TableCell>
                    <TableCell>{accountTypeLabels[t.account_type] ?? t.account_type}</TableCell>
                    <TableCell>{(t.account_type === 1 || t.account_type === 4) ? t.membership_fee.toFixed(2) : "—"}</TableCell>
                    <TableCell>{t.allow_public_registration ? "Yes" : "No"}</TableCell>
                    <TableCell>{t.number_count}</TableCell>
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
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Account Type" : "New Account Type"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Name *</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Membership" />
              </div>
              <div className="space-y-2">
                <Label>Prefix *</Label>
                <Input value={form.prefix} onChange={(e) => setForm({ ...form, prefix: e.target.value })} placeholder="e.g. AEM" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Account Type</Label>
                <select
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  value={form.account_type}
                  onChange={(e) => setForm({ ...form, account_type: parseInt(e.target.value) })}
                >
                  {Object.entries(accountTypeLabels).map(([val, label]) => (
                    <option key={val} value={val}>{label}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label>Number Count</Label>
                <Input type="number" value={form.number_count} onChange={(e) => setForm({ ...form, number_count: parseInt(e.target.value) || 5 })} />
              </div>
            </div>
            {(form.account_type === 1 || form.account_type === 4) && (
              <div className="space-y-2">
                <Label>Membership Fee</Label>
                <Input type="number" step="0.01" min="0" value={form.membership_fee} onChange={(e) => setForm({ ...form, membership_fee: parseFloat(e.target.value) || 0 })} placeholder="e.g. 250.00" />
              </div>
            )}
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Switch checked={form.allow_public_registration} onCheckedChange={(v) => setForm({ ...form, allow_public_registration: v })} />
                <Label>Allow Public Registration</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} />
                <Label>Active</Label>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={() => upsert.mutate({ ...form, id: editing?.id })} disabled={!form.name.trim() || !form.prefix.trim() || upsert.isPending}>
              {upsert.isPending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default EntityAccountTypes;
