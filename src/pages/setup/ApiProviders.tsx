import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";

type ApiProvider = {
  id: string;
  name: string;
  base_url: string;
  auth_method: string;
  auth_param_name: string;
  secret_name: string;
  base_currency: string;
  response_path: string;
  is_active: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

const defaultForm = {
  name: "",
  base_url: "",
  auth_method: "query_param",
  auth_param_name: "access_key",
  secret_name: "",
  base_currency: "ZAR",
  response_path: "rates",
  is_active: true,
  notes: "",
};

const ApiProviders = () => {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ApiProvider | null>(null);
  const [form, setForm] = useState({ ...defaultForm });

  const { data: providers = [], isLoading } = useQuery({
    queryKey: ["api_providers"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("api_providers")
        .select("*")
        .order("name");
      if (error) throw error;
      return data as ApiProvider[];
    },
  });

  const upsert = useMutation({
    mutationFn: async (values: typeof form & { id?: string }) => {
      const payload = {
        name: values.name,
        base_url: values.base_url,
        auth_method: values.auth_method,
        auth_param_name: values.auth_param_name,
        secret_name: values.secret_name,
        base_currency: values.base_currency,
        response_path: values.response_path,
        is_active: values.is_active,
        notes: values.notes || null,
      };
      if (values.id) {
        const { error } = await (supabase as any).from("api_providers").update(payload).eq("id", values.id);
        if (error) throw error;
      } else {
        const { error } = await (supabase as any).from("api_providers").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["api_providers"] });
      setDialogOpen(false);
      setEditing(null);
      toast.success(editing ? "Provider updated" : "Provider created");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from("api_providers").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["api_providers"] });
      toast.success("Provider deleted");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const openNew = () => {
    setEditing(null);
    setForm({ ...defaultForm });
    setDialogOpen(true);
  };

  const openEdit = (p: ApiProvider) => {
    setEditing(p);
    setForm({
      name: p.name,
      base_url: p.base_url,
      auth_method: p.auth_method,
      auth_param_name: p.auth_param_name,
      secret_name: p.secret_name,
      base_currency: p.base_currency,
      response_path: p.response_path,
      is_active: p.is_active,
      notes: p.notes ?? "",
    });
    setDialogOpen(true);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">API Providers</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Configure external price feed providers. Items can reference a provider to fetch live prices.
          </p>
        </div>
        <Button onClick={openNew} size="sm"><Plus className="h-4 w-4 mr-1.5" />Add Provider</Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Base URL</TableHead>
                <TableHead>Auth Method</TableHead>
                <TableHead>Secret Name</TableHead>
                <TableHead>Base Currency</TableHead>
                <TableHead>Active</TableHead>
                <TableHead className="w-24" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Loading…</TableCell></TableRow>
              ) : providers.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No providers configured.</TableCell></TableRow>
              ) : (
                providers.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">{p.name}</TableCell>
                    <TableCell className="font-mono text-xs max-w-[250px] truncate">{p.base_url}</TableCell>
                    <TableCell><Badge variant="outline">{p.auth_method}</Badge></TableCell>
                    <TableCell className="font-mono text-xs">{p.secret_name}</TableCell>
                    <TableCell>{p.base_currency}</TableCell>
                    <TableCell>
                      <Badge variant={p.is_active ? "default" : "secondary"}>
                        {p.is_active ? "Yes" : "No"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(p)}><Pencil className="h-3.5 w-3.5" /></Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => deleteMutation.mutate(p.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
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
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Provider" : "New API Provider"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Provider Name *</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Metals API" />
            </div>
            <div className="space-y-2">
              <Label>Base URL *</Label>
              <Input value={form.base_url} onChange={(e) => setForm({ ...form, base_url: e.target.value })} placeholder="e.g. https://metals-api.com/api" className="font-mono text-sm" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Auth Method</Label>
                <Input value={form.auth_method} onChange={(e) => setForm({ ...form, auth_method: e.target.value })} placeholder="query_param" />
              </div>
              <div className="space-y-2">
                <Label>Auth Param Name</Label>
                <Input value={form.auth_param_name} onChange={(e) => setForm({ ...form, auth_param_name: e.target.value })} placeholder="access_key" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Secret Name *</Label>
                <Input value={form.secret_name} onChange={(e) => setForm({ ...form, secret_name: e.target.value })} placeholder="e.g. METALS_API_KEY" className="font-mono text-sm" />
                <p className="text-xs text-muted-foreground">The environment secret name holding the API key</p>
              </div>
              <div className="space-y-2">
                <Label>Base Currency</Label>
                <Input value={form.base_currency} onChange={(e) => setForm({ ...form, base_currency: e.target.value.toUpperCase() })} placeholder="ZAR" />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Response Path</Label>
              <Input value={form.response_path} onChange={(e) => setForm({ ...form, response_path: e.target.value })} placeholder="rates" className="font-mono text-sm" />
              <p className="text-xs text-muted-foreground">JSON path to the rates object in the API response</p>
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Additional notes about this provider..." rows={2} />
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} />
              <Label>Active</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button
              onClick={() => upsert.mutate({ ...form, id: editing?.id })}
              disabled={!form.name.trim() || !form.base_url.trim() || !form.secret_name.trim() || upsert.isPending}
            >
              {upsert.isPending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ApiProviders;
