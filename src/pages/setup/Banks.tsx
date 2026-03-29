import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent } from "@/components/ui/card";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";

type Bank = {
  id: string;
  name: string;
  logo_url: string | null;
  branch_code: string | null;
  swift_code: string | null;
  sort_route_code: string | null;
  country_id: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

const Banks = () => {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Bank | null>(null);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState({
    name: "", logo_url: "", branch_code: "", swift_code: "", sort_route_code: "", country_id: "", is_active: true,
  });

  const { data: banks = [], isLoading } = useQuery({
    queryKey: ["banks"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("banks")
        .select("*")
        .order("name");
      if (error) throw error;
      return data as Bank[];
    },
  });

  const { data: countries = [] } = useQuery({
    queryKey: ["countries_active"],
    queryFn: async () => {
      const { data } = await supabase.from("countries").select("id, name").eq("is_active", true).order("name");
      return data ?? [];
    },
  });

  const upsert = useMutation({
    mutationFn: async (values: typeof form & { id?: string }) => {
      const payload = {
        name: values.name,
        logo_url: values.logo_url || null,
        branch_code: values.branch_code || null,
        swift_code: values.swift_code || null,
        sort_route_code: values.sort_route_code || null,
        country_id: values.country_id || null,
        is_active: values.is_active,
      };
      if (values.id) {
        const { error } = await supabase.from("banks").update(payload).eq("id", values.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("banks").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["banks"] });
      setDialogOpen(false);
      setEditing(null);
      toast.success(editing ? "Bank updated" : "Bank created");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("banks").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["banks"] });
      toast.success("Bank deleted");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const openNew = () => {
    setEditing(null);
    setForm({ name: "", logo_url: "", branch_code: "", swift_code: "", sort_route_code: "", country_id: "", is_active: true });
    setDialogOpen(true);
  };

  const openEdit = (b: Bank) => {
    setEditing(b);
    setForm({
      name: b.name,
      logo_url: b.logo_url ?? "",
      branch_code: b.branch_code ?? "",
      swift_code: b.swift_code ?? "",
      sort_route_code: b.sort_route_code ?? "",
      country_id: b.country_id ?? "",
      is_active: b.is_active,
    });
    setDialogOpen(true);
  };

  const filtered = banks.filter((b) => b.name.toLowerCase().includes(search.toLowerCase()));
  const getCountryName = (id: string | null) => countries.find((c) => c.id === id)?.name ?? "—";

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-lg sm:text-2xl font-bold tracking-tight">Banks</h1>
          <p className="text-muted-foreground text-xs sm:text-sm mt-1">Manage banks available for member banking details.</p>
        </div>
        <Button onClick={openNew} size="sm" className="w-full sm:w-auto">
          <Plus className="h-4 w-4 mr-1.5" />Add Bank
        </Button>
      </div>

      <div className="w-full sm:max-w-sm">
        <Input placeholder="Search banks..." value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="w-full overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Branch Code</TableHead>
                  <TableHead>SWIFT</TableHead>
                  <TableHead>Country</TableHead>
                  <TableHead>Active</TableHead>
                  <TableHead className="w-24" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Loading…</TableCell></TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No banks found.</TableCell></TableRow>
                ) : (
                  filtered.map((b) => (
                    <TableRow key={b.id}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          {b.logo_url ? (
                            <img
                              src={b.logo_url}
                              alt=""
                              className="h-5 w-5 rounded-sm object-contain bg-background"
                              loading="lazy"
                            />
                          ) : null}
                          <span>{b.name}</span>
                        </div>
                      </TableCell>
                      <TableCell>{b.branch_code ?? "—"}</TableCell>
                      <TableCell>{b.swift_code ?? "—"}</TableCell>
                      <TableCell>{getCountryName(b.country_id)}</TableCell>
                      <TableCell>{b.is_active ? "Yes" : "No"}</TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(b)}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => deleteMutation.mutate(b.id)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
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
            <DialogTitle>{editing ? "Edit Bank" : "New Bank"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Bank Name *</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Standard Bank" />
            </div>
            <div className="space-y-2">
              <Label>Logo URL</Label>
              <Input
                value={form.logo_url}
                onChange={(e) => setForm({ ...form, logo_url: e.target.value })}
                placeholder="https://... (small square logo works best)"
              />
              <p className="text-xs text-muted-foreground">
                Optional. Used as a small icon next to the bank name in debit order details.
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
              <div className="space-y-2">
                <Label>Branch Code</Label>
                <Input value={form.branch_code} onChange={(e) => setForm({ ...form, branch_code: e.target.value })} placeholder="e.g. 051 001" />
              </div>
              <div className="space-y-2">
                <Label>SWIFT Code</Label>
                <Input value={form.swift_code} onChange={(e) => setForm({ ...form, swift_code: e.target.value })} placeholder="e.g. SBZAZAJJ" />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
              <div className="space-y-2">
                <Label>Sort/Route Code</Label>
                <Input value={form.sort_route_code} onChange={(e) => setForm({ ...form, sort_route_code: e.target.value })} placeholder="Optional" />
              </div>
              <div className="space-y-2">
                <Label>Country</Label>
                <Select value={form.country_id} onValueChange={(v) => setForm({ ...form, country_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Select country" /></SelectTrigger>
                  <SelectContent>
                    {countries.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
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

export default Banks;
