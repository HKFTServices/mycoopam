import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/contexts/TenantContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { BookOpen, Plus, Pencil } from "lucide-react";

type GlAccount = {
  id: string;
  tenant_id: string;
  code: string;
  name: string;
  gl_type: string;
  is_active: boolean;
  control_account_id: string | null;
  default_entry_type: string;
  control_accounts?: { name: string; account_type: string } | null;
};

type ControlAccount = {
  id: string;
  name: string;
  account_type: string;
};

const GLAccounts = () => {
  const { currentTenant } = useTenant();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<GlAccount | null>(null);
  const [form, setForm] = useState({
    code: "", name: "", gl_type: "income", is_active: true,
    control_account_id: "", default_entry_type: "debit",
  });

  const { data: glAccounts = [], isLoading } = useQuery({
    queryKey: ["gl_accounts", currentTenant?.id],
    queryFn: async () => {
      if (!currentTenant) return [];
      const { data, error } = await (supabase as any)
        .from("gl_accounts")
        .select("*, control_accounts(name, account_type)")
        .eq("tenant_id", currentTenant.id)
        .order("code");
      if (error) throw error;
      return data as GlAccount[];
    },
    enabled: !!currentTenant,
  });

  const { data: controlAccounts = [] } = useQuery({
    queryKey: ["control_accounts_gl", currentTenant?.id],
    queryFn: async () => {
      if (!currentTenant) return [];
      const { data, error } = await (supabase as any)
        .from("control_accounts")
        .select("id, name, account_type")
        .eq("tenant_id", currentTenant.id)
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return data as ControlAccount[];
    },
    enabled: !!currentTenant,
  });

  const saveMutation = useMutation({
    mutationFn: async (values: typeof form & { id?: string }) => {
      if (!currentTenant) throw new Error("No tenant");
      const payload = {
        code: values.code,
        name: values.name,
        gl_type: values.gl_type,
        is_active: values.is_active,
        control_account_id: values.control_account_id || null,
        default_entry_type: values.default_entry_type,
      };
      if (values.id) {
        const { error } = await (supabase as any).from("gl_accounts").update(payload).eq("id", values.id);
        if (error) throw error;
      } else {
        const { error } = await (supabase as any).from("gl_accounts").insert({ ...payload, tenant_id: currentTenant.id });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["gl_accounts"] });
      toast({ title: editing ? "GL account updated" : "GL account created" });
      setDialogOpen(false);
      setEditing(null);
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const openCreate = () => {
    setEditing(null);
    setForm({ code: "", name: "", gl_type: "income", is_active: true, control_account_id: "", default_entry_type: "debit" });
    setDialogOpen(true);
  };

  const openEdit = (gl: GlAccount) => {
    setEditing(gl);
    setForm({
      code: gl.code,
      name: gl.name,
      gl_type: gl.gl_type,
      is_active: gl.is_active,
      control_account_id: gl.control_account_id || "",
      default_entry_type: gl.default_entry_type || "debit",
    });
    setDialogOpen(true);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <BookOpen className="h-8 w-8 text-primary" />
          <div>
            <h1 className="text-2xl font-bold tracking-tight">GL Accounts</h1>
            <p className="text-muted-foreground text-sm mt-1">
              Manage General Ledger accounts with linked control accounts
            </p>
          </div>
        </div>
        <Button onClick={openCreate}>
          <Plus className="mr-2 h-4 w-4" />Add GL Account
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Code</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Control Account</TableHead>
                <TableHead>Entry Type</TableHead>
                <TableHead>Active</TableHead>
                <TableHead className="w-16" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Loading…</TableCell>
                </TableRow>
              ) : glAccounts.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No GL accounts found</TableCell>
                </TableRow>
              ) : (
                glAccounts.map(gl => (
                  <TableRow key={gl.id}>
                    <TableCell className="font-mono text-sm">{gl.code}</TableCell>
                    <TableCell className="font-medium">{gl.name}</TableCell>
                    <TableCell>
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize ${
                        gl.gl_type === "income" ? "bg-green-500/10 text-green-700" :
                        gl.gl_type === "expense" ? "bg-red-500/10 text-red-700" :
                        gl.gl_type === "asset" ? "bg-blue-500/10 text-blue-700" :
                        "bg-orange-500/10 text-orange-700"
                      }`}>
                        {gl.gl_type}
                      </span>
                    </TableCell>
                    <TableCell className="text-sm">
                      {gl.control_accounts?.name ?? <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell>
                      <Badge variant={gl.default_entry_type === "debit" ? "default" : "outline"}>
                        {gl.default_entry_type === "debit" ? "Debit (↑)" : "Credit (↓)"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${gl.is_active ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
                        {gl.is_active ? "Active" : "Inactive"}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon" onClick={() => openEdit(gl)}><Pencil className="h-4 w-4" /></Button>
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
          <DialogHeader><DialogTitle>{editing ? "Edit GL Account" : "Add GL Account"}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Code *</Label>
                <Input value={form.code} onChange={e => setForm({ ...form, code: e.target.value })} placeholder="e.g. 4100" className="font-mono" />
              </div>
              <div className="space-y-2">
                <Label>Type *</Label>
                <Select value={form.gl_type} onValueChange={v => setForm({ ...form, gl_type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="income">Income</SelectItem>
                    <SelectItem value="expense">Expense</SelectItem>
                    <SelectItem value="asset">Asset</SelectItem>
                    <SelectItem value="liability">Liability</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Name *</Label>
              <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. Admin Income" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Control Account</Label>
                <Select value={form.control_account_id} onValueChange={v => setForm({ ...form, control_account_id: v === "none" ? "" : v })}>
                  <SelectTrigger><SelectValue placeholder="Select control account" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— None —</SelectItem>
                    {controlAccounts.map(ca => (
                      <SelectItem key={ca.id} value={ca.id}>
                        {ca.name}
                        <span className="ml-2 text-xs text-muted-foreground">({ca.account_type})</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Default Entry Type *</Label>
                <Select value={form.default_entry_type} onValueChange={v => setForm({ ...form, default_entry_type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="debit">Debit (Increase)</SelectItem>
                    <SelectItem value="credit">Credit (Decrease)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={form.is_active} onCheckedChange={checked => setForm({ ...form, is_active: checked })} />
              <Label>Active</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={() => {
              if (!form.code.trim() || !form.name.trim()) {
                toast({ title: "Code and name required", variant: "destructive" });
                return;
              }
              saveMutation.mutate({ ...form, id: editing?.id });
            }} disabled={saveMutation.isPending}>
              {saveMutation.isPending ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default GLAccounts;
