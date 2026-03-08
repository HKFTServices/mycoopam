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
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent } from "@/components/ui/card";
import { Plus, Pencil } from "lucide-react";
import { toast } from "sonner";

type EntityCategory = {
  id: string;
  name: string;
  entity_type: string;
};

type RelType = {
  id: string;
  name: string;
  entity_category_id: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  entity_categories?: EntityCategory;
};

const RelationshipTypes = () => {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<RelType | null>(null);
  const [form, setForm] = useState({ name: "", entity_category_id: "", is_active: true });

  const { data: categories = [] } = useQuery({
    queryKey: ["entity_categories"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("entity_categories")
        .select("id, name, entity_type")
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return data as EntityCategory[];
    },
  });

  const { data: types = [], isLoading } = useQuery({
    queryKey: ["relationship_types"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("relationship_types")
        .select("*, entity_categories(id, name, entity_type)")
        .order("name");
      if (error) throw error;
      return data as RelType[];
    },
  });

  const upsert = useMutation({
    mutationFn: async (values: typeof form & { id?: string }) => {
      const payload = {
        name: values.name,
        entity_category_id: values.entity_category_id,
        is_active: values.is_active,
      };
      if (values.id) {
        const { error } = await supabase.from("relationship_types").update(payload).eq("id", values.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("relationship_types").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["relationship_types"] });
      setDialogOpen(false);
      setEditing(null);
      toast.success(editing ? "Relationship type updated" : "Relationship type created");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const openNew = () => {
    setEditing(null);
    setForm({ name: "", entity_category_id: categories[0]?.id || "", is_active: true });
    setDialogOpen(true);
  };

  const openEdit = (rt: RelType) => {
    setEditing(rt);
    setForm({ name: rt.name, entity_category_id: rt.entity_category_id, is_active: rt.is_active });
    setDialogOpen(true);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Relationship Types</h1>
          <p className="text-muted-foreground text-sm mt-1">Define how users relate to entities (e.g. Director, Trustee, Myself).</p>
        </div>
        <Button onClick={openNew} size="sm"><Plus className="h-4 w-4 mr-1.5" />Add Relationship</Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Entity Category</TableHead>
                <TableHead>Active</TableHead>
                <TableHead className="w-16" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={4} className="text-center py-8 text-muted-foreground">Loading…</TableCell></TableRow>
              ) : types.length === 0 ? (
                <TableRow><TableCell colSpan={4} className="text-center py-8 text-muted-foreground">No relationship types yet.</TableCell></TableRow>
              ) : (
                types.map((rt) => (
                  <TableRow key={rt.id}>
                    <TableCell className="font-medium">{rt.name}</TableCell>
                    <TableCell className="text-muted-foreground">{rt.entity_categories?.name || "—"}</TableCell>
                    <TableCell>{rt.is_active ? "Yes" : "No"}</TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(rt)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
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
            <DialogTitle>{editing ? "Edit Relationship Type" : "New Relationship Type"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Director of Company" />
            </div>
            <div className="space-y-2">
              <Label>Entity Category</Label>
              <Select value={form.entity_category_id} onValueChange={(v) => setForm({ ...form, entity_category_id: v })}>
                <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                <SelectContent>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} />
              <Label>Active</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={() => upsert.mutate({ ...form, id: editing?.id })} disabled={!form.name.trim() || !form.entity_category_id || upsert.isPending}>
              {upsert.isPending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default RelationshipTypes;
