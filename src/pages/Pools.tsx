import { useState } from "react";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/contexts/TenantContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { GlobalPriceScheduleCard } from "@/components/pools/GlobalPriceScheduleCard";
import { PoolTransactionRulesTab } from "@/components/pools/PoolTransactionRulesTab";

type ControlAccount = {
  id: string;
  name: string;
  account_type: string;
  is_active: boolean;
};

type Pool = {
  id: string;
  tenant_id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  pool_statement_description: string | null;
  pool_statement_display_type: string | null;
  fixed_unit_price: number;
  open_unit_price: number;
  is_deleted: boolean;
  icon_url: string | null;
  cash_control_account_id: string | null;
  vat_control_account_id: string | null;
  loan_control_account_id: string | null;
  created_at: string;
  updated_at: string;
};

const Pools = () => {
  const { currentTenant } = useTenant();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Pool | null>(null);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState({
    name: "",
    description: "",
    pool_statement_description: "",
    pool_statement_display_type: "",
    fixed_unit_price: 1.00,
    open_unit_price: 1.00,
    is_active: true,
    icon_url: "",
  });

  // Fetch pools
  const { data: pools = [], isLoading } = useQuery({
    queryKey: ["pools", currentTenant?.id],
    queryFn: async () => {
      if (!currentTenant) return [];
      const { data, error } = await (supabase as any)
        .from("pools")
        .select("*")
        .eq("tenant_id", currentTenant.id)
        .eq("is_deleted", false)
        .order("name");
      if (error) throw error;
      return (data ?? []) as Pool[];
    },
    enabled: !!currentTenant,
  });

  // Fetch control accounts for display
  const { data: controlAccounts = [] } = useQuery({
    queryKey: ["control_accounts", currentTenant?.id],
    queryFn: async () => {
      if (!currentTenant) return [];
      const { data, error } = await (supabase as any)
        .from("control_accounts")
        .select("id, name, account_type, is_active, pool_id")
        .eq("tenant_id", currentTenant.id)
        .order("name");
      if (error) throw error;
      return (data ?? []) as (ControlAccount & { pool_id: string })[];
    },
    enabled: !!currentTenant,
  });

  const getControlAccountsForPool = (poolId: string) =>
    controlAccounts.filter((ca) => ca.pool_id === poolId);

  const createMutation = useMutation({
    mutationFn: async (values: typeof form) => {
      if (!currentTenant) throw new Error("No tenant");
      const { error } = await (supabase as any).from("pools").insert({
        tenant_id: currentTenant.id,
        name: values.name,
        description: values.description || null,
        pool_statement_description: values.pool_statement_description || null,
        pool_statement_display_type: values.pool_statement_display_type || null,
        fixed_unit_price: values.fixed_unit_price,
        open_unit_price: values.open_unit_price,
        is_active: values.is_active,
        icon_url: values.icon_url || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pools"] });
      queryClient.invalidateQueries({ queryKey: ["control_accounts"] });
      setDialogOpen(false);
      toast.success("Pool created with control accounts");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateMutation = useMutation({
    mutationFn: async (values: typeof form & { id: string }) => {
      const { error } = await (supabase as any)
        .from("pools")
        .update({
          name: values.name,
          description: values.description || null,
          pool_statement_description: values.pool_statement_description || null,
          pool_statement_display_type: values.pool_statement_display_type || null,
          fixed_unit_price: values.fixed_unit_price,
          open_unit_price: values.open_unit_price,
          is_active: values.is_active,
          icon_url: values.icon_url || null,
        })
        .eq("id", values.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pools"] });
      setDialogOpen(false);
      setEditing(null);
      toast.success("Pool updated");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      // Soft delete
      const { error } = await (supabase as any)
        .from("pools")
        .update({ is_deleted: true, deletion_time: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pools"] });
      toast.success("Pool deleted");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const openNew = () => {
    setEditing(null);
    setForm({ name: "", description: "", pool_statement_description: "", pool_statement_display_type: "", fixed_unit_price: 1.00, open_unit_price: 1.00, is_active: true, icon_url: "" });
    setDialogOpen(true);
  };

  const openEdit = (p: Pool) => {
    setEditing(p);
    setForm({
      name: p.name,
      description: p.description ?? "",
      pool_statement_description: p.pool_statement_description ?? "",
      pool_statement_display_type: p.pool_statement_display_type ?? "",
      fixed_unit_price: p.fixed_unit_price ?? 1.00,
      open_unit_price: (p as any).open_unit_price ?? 1.00,
      is_active: p.is_active,
      icon_url: p.icon_url ?? "",
    });
    setDialogOpen(true);
  };

  const handleSave = () => {
    if (editing) {
      updateMutation.mutate({ ...form, id: editing.id });
    } else {
      createMutation.mutate(form);
    }
  };

  const isSaving = createMutation.isPending || updateMutation.isPending;
  const filtered = pools.filter((p) => p.name.toLowerCase().includes(search.toLowerCase()));

  const accountTypeBadge = (type: string) => {
    const variants: Record<string, string> = {
      cash: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400",
      vat: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
      loan: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
    };
    return (
      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${variants[type] ?? ""}`}>
        {type.charAt(0).toUpperCase() + type.slice(1)}
      </span>
    );
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Pools</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Manage investment pools. Each pool auto-creates Cash, VAT and Loan control accounts.
          </p>
        </div>
        <Button onClick={openNew} size="sm">
          <Plus className="h-4 w-4 mr-1.5" />Add Pool
        </Button>
      </div>

      {/* Global Price Update Schedule */}
      <GlobalPriceScheduleCard />

      <div className="max-w-sm">
        <Input placeholder="Search pools..." value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">Icon</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Statement Description</TableHead>
                <TableHead>Display Type</TableHead>
                <TableHead>Open UP</TableHead>
                <TableHead>Fixed UP</TableHead>
                <TableHead>Control Accounts</TableHead>
                <TableHead>Active</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Updated</TableHead>
                <TableHead className="w-24" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                 <TableCell colSpan={12} className="text-center py-8 text-muted-foreground">Loading…</TableCell>
                </TableRow>
              ) : filtered.length === 0 ? (
                <TableRow>
                   <TableCell colSpan={12} className="text-center py-8 text-muted-foreground">No pools found.</TableCell>
                </TableRow>
              ) : (
                filtered.map((p) => {
                  const cas = getControlAccountsForPool(p.id);
                  const displayTypeLabel: Record<string, string> = {
                    display_in_summary: "In Summary",
                    display_below_summary: "Below Summary",
                    do_not_display: "Hidden",
                  };
                  return (
                    <TableRow key={p.id}>
                      <TableCell>
                        {p.icon_url ? (
                          <img src={p.icon_url} alt={p.name} className="h-8 w-8 rounded object-cover" />
                        ) : (
                          <div className="h-8 w-8 rounded bg-muted flex items-center justify-center text-xs font-medium text-muted-foreground">
                            {p.name.charAt(0)}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="font-medium">{p.name}</TableCell>
                      <TableCell className="text-muted-foreground max-w-[200px] truncate">
                        {p.description ?? "—"}
                      </TableCell>
                      <TableCell className="text-muted-foreground max-w-[200px] truncate">
                        {p.pool_statement_description ?? "—"}
                      </TableCell>
                      <TableCell>
                        {p.pool_statement_display_type
                          ? displayTypeLabel[p.pool_statement_display_type] ?? p.pool_statement_display_type
                          : "—"}
                      </TableCell>
                      <TableCell>{(p as any).open_unit_price?.toFixed(2) ?? "1.00"}</TableCell>
                      <TableCell>{p.fixed_unit_price.toFixed(2)}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {cas.map((ca) => (
                            <span key={ca.id}>{accountTypeBadge(ca.account_type)}</span>
                          ))}
                          {cas.length === 0 && <span className="text-muted-foreground text-sm">—</span>}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={p.is_active ? "default" : "secondary"}>
                          {p.is_active ? "Yes" : "No"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-xs whitespace-nowrap">
                        {new Date(p.created_at).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-xs whitespace-nowrap">
                        {new Date(p.updated_at).toLocaleDateString()}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(p)}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive hover:text-destructive"
                            onClick={() => deleteMutation.mutate(p.id)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>




      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className={editing ? "max-w-2xl" : undefined}>
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Pool" : "New Pool"}</DialogTitle>
            <DialogDescription>
              {editing
                ? "Update pool details and transaction rules."
                : "Create a new pool. Cash, VAT and Loan control accounts will be created automatically."}
            </DialogDescription>
          </DialogHeader>

          {editing ? (
            <Tabs defaultValue="details" className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="details">Details</TabsTrigger>
                <TabsTrigger value="transactions">Transactions</TabsTrigger>
              </TabsList>
              <TabsContent value="details">
                <PoolDetailsForm form={form} setForm={setForm} />
                <DialogFooter className="mt-4">
                  <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
                  <Button onClick={handleSave} disabled={!form.name.trim() || isSaving}>
                    {isSaving && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
                    {isSaving ? "Saving…" : "Save"}
                  </Button>
                </DialogFooter>
              </TabsContent>
              <TabsContent value="transactions">
                <PoolTransactionRulesTab poolId={editing.id} />
              </TabsContent>
            </Tabs>
          ) : (
            <>
              <PoolDetailsForm form={form} setForm={setForm} />
              <DialogFooter>
                <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
                <Button onClick={handleSave} disabled={!form.name.trim() || isSaving}>
                  {isSaving && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
                  {isSaving ? "Saving…" : "Save"}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

// Extracted form fields component
const PoolDetailsForm = ({
  form,
  setForm,
}: {
  form: { name: string; description: string; pool_statement_description: string; pool_statement_display_type: string; fixed_unit_price: number; open_unit_price: number; is_active: boolean; icon_url: string };
  setForm: (f: typeof form) => void;
}) => (
  <div className="space-y-4 py-2">
    <div className="space-y-2">
      <Label>Pool Name *</Label>
      <Input
        value={form.name}
        onChange={(e) => setForm({ ...form, name: e.target.value })}
        placeholder="e.g. Gold"
      />
    </div>
    <div className="space-y-2">
      <Label>Icon URL</Label>
      <div className="flex items-center gap-3">
        {form.icon_url && (
          <img src={form.icon_url} alt="Pool icon" className="h-10 w-10 rounded object-cover" />
        )}
        <Input
          value={form.icon_url}
          onChange={(e) => setForm({ ...form, icon_url: e.target.value })}
          placeholder="https://... (optional image URL)"
        />
      </div>
    </div>
    <div className="space-y-2">
      <Label>Description</Label>
      <Textarea
        value={form.description}
        onChange={(e) => setForm({ ...form, description: e.target.value })}
        placeholder="Optional description"
        rows={2}
      />
    </div>
    <div className="space-y-2">
      <Label>Statement Description</Label>
      <Input
        value={form.pool_statement_description}
        onChange={(e) => setForm({ ...form, pool_statement_description: e.target.value })}
        placeholder="Optional"
      />
    </div>
    <div className="space-y-2">
      <Label>Statement Display Type</Label>
      <Select
        value={form.pool_statement_display_type}
        onValueChange={(v) => setForm({ ...form, pool_statement_display_type: v })}
      >
        <SelectTrigger>
          <SelectValue placeholder="Select display type" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="display_in_summary">Display in Summary</SelectItem>
          <SelectItem value="display_below_summary">Display Below Summary</SelectItem>
          <SelectItem value="do_not_display">Do not Display</SelectItem>
        </SelectContent>
      </Select>
    </div>
    <div className="grid grid-cols-2 gap-4">
      <div className="space-y-2">
        <Label>Open Unit Price</Label>
        <Input
          type="number"
          step="0.01"
          min="0"
          value={form.open_unit_price}
          onChange={(e) => setForm({ ...form, open_unit_price: parseFloat(e.target.value) || 0 })}
          placeholder="e.g. 1.00"
        />
      </div>
      <div className="space-y-2">
        <Label>Fixed Unit Price</Label>
        <Input
          type="number"
          step="0.01"
          min="0"
          value={form.fixed_unit_price}
          onChange={(e) => setForm({ ...form, fixed_unit_price: parseFloat(e.target.value) || 0 })}
          placeholder="e.g. 1.00"
        />
      </div>
    </div>
    <div className="flex items-center gap-2">
      <Switch
        checked={form.is_active}
        onCheckedChange={(v) => setForm({ ...form, is_active: v })}
      />
      <Label>Active</Label>
    </div>
  </div>
);

export default Pools;
