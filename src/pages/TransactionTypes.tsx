import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeftRight, Plus, Pencil } from "lucide-react";

type TransactionType = {
  id: string;
  name: string;
  code: string;
  description: string | null;
  is_active: boolean;
  initiator_role: string;
  first_approval_role: string | null;
  final_approval_role: string | null;
};

const WORKFLOW_ROLES = [
  { value: "full_member", label: "Member" },
  { value: "clerk", label: "Clerk" },
  { value: "manager", label: "Manager" },
  { value: "tenant_admin", label: "Admin" },
];

const APPROVAL_ROLES = [
  { value: "__none__", label: "None" },
  { value: "clerk", label: "Clerk" },
  { value: "manager", label: "Manager" },
  { value: "tenant_admin", label: "Admin" },
];

const roleBadge = (role: string | null) => {
  if (!role) return <span className="text-muted-foreground text-xs">—</span>;
  const label = [...WORKFLOW_ROLES, ...APPROVAL_ROLES].find(r => r.value === role)?.label || role;
  const variant = role === "tenant_admin" ? "default" : role === "manager" ? "default" : role === "clerk" ? "secondary" : "outline";
  return <Badge variant={variant} className="text-[10px]">{label}</Badge>;
};

const defaultForm = {
  name: "", code: "", description: "", is_active: true,
  initiator_role: "full_member", first_approval_role: "__none__", final_approval_role: "__none__",
};

const TransactionTypes = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<TransactionType | null>(null);
  const [form, setForm] = useState(defaultForm);

  const { data: transactionTypes = [], isLoading } = useQuery({
    queryKey: ["transaction_types"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("transaction_types")
        .select("*")
        .order("name");
      if (error) throw error;
      return data as TransactionType[];
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (values: typeof form & { id?: string }) => {
      const payload = {
        name: values.name,
        code: values.code,
        description: values.description || null,
        is_active: values.is_active,
        initiator_role: values.initiator_role,
        first_approval_role: values.first_approval_role === "__none__" ? null : values.first_approval_role,
        final_approval_role: values.final_approval_role === "__none__" ? null : values.final_approval_role,
      };
      if (values.id) {
        const { error } = await (supabase as any)
          .from("transaction_types").update(payload).eq("id", values.id);
        if (error) throw error;
      } else {
        const { error } = await (supabase as any)
          .from("transaction_types").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["transaction_types"] });
      toast({ title: editing ? "Transaction type updated" : "Transaction type created" });
      closeDialog();
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const openCreate = () => {
    setEditing(null);
    setForm(defaultForm);
    setDialogOpen(true);
  };

  const openEdit = (tt: TransactionType) => {
    setEditing(tt);
    setForm({
      name: tt.name, code: tt.code, description: tt.description || "",
      is_active: tt.is_active, initiator_role: tt.initiator_role,
      first_approval_role: tt.first_approval_role || "__none__",
      final_approval_role: tt.final_approval_role || "__none__",
    });
    setDialogOpen(true);
  };

  const closeDialog = () => { setDialogOpen(false); setEditing(null); };

  const handleSave = () => {
    if (!form.name.trim() || !form.code.trim()) {
      toast({ title: "Name and code are required", variant: "destructive" });
      return;
    }
    saveMutation.mutate({ ...form, id: editing?.id });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-start sm:items-center gap-3">
          <ArrowLeftRight className="h-6 w-6 sm:h-8 sm:w-8 text-primary shrink-0" />
          <div>
            <h1 className="text-lg sm:text-3xl font-bold tracking-tight">Transaction Types</h1>
            <p className="text-muted-foreground text-xs sm:text-sm">Manage transaction types and approval workflows</p>
          </div>
        </div>
        <Button onClick={openCreate} className="w-full sm:w-auto">
          <Plus className="mr-2 h-4 w-4" />
          Add Type
        </Button>
      </div>

      <div className="rounded-lg border border-border bg-card">
        <div className="w-full overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Code</TableHead>
                <TableHead>Initiator</TableHead>
                <TableHead>1st Approval</TableHead>
                <TableHead>Final Approval</TableHead>
                <TableHead>Active</TableHead>
                <TableHead className="w-16" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Loading...</TableCell>
                </TableRow>
              ) : transactionTypes.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No transaction types found</TableCell>
                </TableRow>
              ) : (
                transactionTypes.map((tt) => (
                  <TableRow key={tt.id}>
                    <TableCell className="font-medium">{tt.name}</TableCell>
                    <TableCell className="font-mono text-xs">{tt.code}</TableCell>
                    <TableCell>{roleBadge(tt.initiator_role)}</TableCell>
                    <TableCell>{roleBadge(tt.first_approval_role)}</TableCell>
                    <TableCell>{roleBadge(tt.final_approval_role)}</TableCell>
                    <TableCell>
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${tt.is_active ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
                        {tt.is_active ? "Active" : "Inactive"}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon" onClick={() => openEdit(tt)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Transaction Type" : "Add Transaction Type"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
              <div className="space-y-2">
                <Label>Name</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Deposit Funds" />
              </div>
              <div className="space-y-2">
                <Label>Code</Label>
                <Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} placeholder="e.g. DEPOSIT_FUNDS" className="font-mono" />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Optional description" rows={2} />
            </div>

            <div className="border-t pt-4 space-y-4">
              <h4 className="text-sm font-semibold">Approval Workflow</h4>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
                <div className="space-y-2">
                  <Label className="text-xs">Initiator</Label>
                  <Select value={form.initiator_role} onValueChange={(v) => setForm({ ...form, initiator_role: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {WORKFLOW_ROLES.map(r => (
                        <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">1st Approval</Label>
                  <Select value={form.first_approval_role} onValueChange={(v) => setForm({ ...form, first_approval_role: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {APPROVAL_ROLES.map(r => (
                        <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Final Approval</Label>
                  <Select value={form.final_approval_role} onValueChange={(v) => setForm({ ...form, final_approval_role: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {APPROVAL_ROLES.map(r => (
                        <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Switch checked={form.is_active} onCheckedChange={(checked) => setForm({ ...form, is_active: checked })} />
              <Label>Active</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>Cancel</Button>
            <Button onClick={handleSave} disabled={saveMutation.isPending}>
              {saveMutation.isPending ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default TransactionTypes;
