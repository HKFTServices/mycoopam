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
  entity_type: "natural_person" | "legal_entity";
  name: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

const EntityCategories = () => {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<EntityCategory | null>(null);
  const [form, setForm] = useState({ name: "", entity_type: "natural_person" as "natural_person" | "legal_entity", is_active: true });

  const { data: categories = [], isLoading } = useQuery({
    queryKey: ["entity_categories"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("entity_categories")
        .select("*")
        .order("name");
      if (error) throw error;
      return data as EntityCategory[];
    },
  });

  const upsert = useMutation({
    mutationFn: async (values: typeof form & { id?: string }) => {
      if (values.id) {
        const { error } = await supabase.from("entity_categories").update({
          name: values.name,
          entity_type: values.entity_type,
          is_active: values.is_active,
        }).eq("id", values.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("entity_categories").insert({
          name: values.name,
          entity_type: values.entity_type,
          is_active: values.is_active,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["entity_categories"] });
      setDialogOpen(false);
      setEditing(null);
      toast.success(editing ? "Category updated" : "Category created");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const openNew = () => {
    setEditing(null);
    setForm({ name: "", entity_type: "natural_person", is_active: true });
    setDialogOpen(true);
  };

  const openEdit = (cat: EntityCategory) => {
    setEditing(cat);
    setForm({ name: cat.name, entity_type: cat.entity_type, is_active: cat.is_active });
    setDialogOpen(true);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Entity Categories</h1>
          <p className="text-muted-foreground text-sm mt-1">Manage entity types such as Natural Person, Company, Trust, etc.</p>
        </div>
        <Button onClick={openNew} size="sm"><Plus className="h-4 w-4 mr-1.5" />Add Category</Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Entity Type</TableHead>
                <TableHead>Active</TableHead>
                <TableHead className="w-16" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={4} className="text-center py-8 text-muted-foreground">Loading…</TableCell></TableRow>
              ) : categories.length === 0 ? (
                <TableRow><TableCell colSpan={4} className="text-center py-8 text-muted-foreground">No categories yet. Add one to get started.</TableCell></TableRow>
              ) : (
                categories.map((cat) => (
                  <TableRow key={cat.id}>
                    <TableCell className="font-medium">{cat.name}</TableCell>
                    <TableCell>
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                        cat.entity_type === "natural_person"
                          ? "bg-accent text-accent-foreground"
                          : "bg-secondary text-secondary-foreground"
                      }`}>
                        {cat.entity_type === "natural_person" ? "Natural Person" : "Legal Entity"}
                      </span>
                    </TableCell>
                    <TableCell>{cat.is_active ? "Yes" : "No"}</TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(cat)}>
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
            <DialogTitle>{editing ? "Edit Category" : "New Category"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Company" />
            </div>
            <div className="space-y-2">
              <Label>Entity Type</Label>
              <Select value={form.entity_type} onValueChange={(v) => setForm({ ...form, entity_type: v as "natural_person" | "legal_entity" })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="natural_person">Natural Person</SelectItem>
                  <SelectItem value="legal_entity">Legal Entity</SelectItem>
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
            <Button onClick={() => upsert.mutate({ ...form, id: editing?.id })} disabled={!form.name.trim() || upsert.isPending}>
              {upsert.isPending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default EntityCategories;
