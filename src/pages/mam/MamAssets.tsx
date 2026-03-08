import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useTenant } from "@/contexts/TenantContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Loader2, Search, Plus, Pencil, Trash2, Package } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const MamAssets = () => {
  const { user } = useAuth();
  const { currentTenant } = useTenant();
  const tenantId = currentTenant?.id;
  const { toast } = useToast();
  const qc = useQueryClient();

  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Form state
  const [formEntityId, setFormEntityId] = useState("");
  const [formCategoryId, setFormCategoryId] = useState("");
  const [formBrandId, setFormBrandId] = useState("");
  const [formModelId, setFormModelId] = useState("");
  const [formName, setFormName] = useState("");
  const [formValue, setFormValue] = useState("");
  const [formQty, setFormQty] = useState("1");
  const [formYear, setFormYear] = useState("");
  const [formNotes, setFormNotes] = useState("");

  // Get entities the user is linked to
  const { data: userEntities = [] } = useQuery({
    queryKey: ["user_entities_for_assets", user?.id, tenantId],
    queryFn: async () => {
      if (!user || !tenantId) return [];
      const { data, error } = await (supabase as any)
        .from("user_entity_relationships")
        .select("entity_id, entities (id, name, last_name)")
        .eq("user_id", user.id)
        .eq("tenant_id", tenantId)
        .eq("is_active", true);
      if (error) throw error;
      // Deduplicate entities
      const map = new Map<string, any>();
      (data ?? []).forEach((r: any) => {
        if (r.entities) map.set(r.entities.id, r.entities);
      });
      return Array.from(map.values());
    },
    enabled: !!user && !!tenantId,
  });

  const entityIds = userEntities.map((e: any) => e.id);

  // Assets for user's entities
  const { data: assets = [], isLoading } = useQuery({
    queryKey: ["member_assets", tenantId, entityIds],
    queryFn: async () => {
      if (!tenantId || entityIds.length === 0) return [];
      const { data, error } = await (supabase as any)
        .from("si_member_asset")
        .select(`
          *, 
          si_item_category (category_id, category_code, category_name),
          si_brand (brand_id, brand_name),
          si_item_model (item_model_id, model_name),
          entities (id, name, last_name)
        `)
        .eq("tenant_id", tenantId)
        .in("entity_id", entityIds)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!tenantId && entityIds.length > 0,
  });

  // Reference data
  const { data: categories = [] } = useQuery({
    queryKey: ["si_categories_ref", tenantId],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("si_item_category")
        .select("category_id, category_code, category_name")
        .eq("tenant_id", tenantId)
        .eq("is_active", true)
        .order("category_name");
      return data ?? [];
    },
    enabled: !!tenantId,
  });

  const { data: brands = [] } = useQuery({
    queryKey: ["si_brands_ref", tenantId],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("si_brand")
        .select("brand_id, brand_name")
        .eq("tenant_id", tenantId)
        .eq("is_active", true)
        .order("brand_name");
      return data ?? [];
    },
    enabled: !!tenantId,
  });

  const { data: models = [] } = useQuery({
    queryKey: ["si_models_ref", tenantId, formCategoryId, formBrandId],
    queryFn: async () => {
      let q = (supabase as any)
        .from("si_item_model")
        .select("item_model_id, model_name, category_id, brand_id")
        .eq("tenant_id", tenantId)
        .eq("is_active", true);
      if (formCategoryId) q = q.eq("category_id", formCategoryId);
      if (formBrandId) q = q.eq("brand_id", formBrandId);
      const { data } = await q.order("model_name");
      return data ?? [];
    },
    enabled: !!tenantId,
  });

  const entityLabel = (e: any) => [e.name, e.last_name].filter(Boolean).join(" ");

  const resetForm = () => {
    setEditId(null);
    setFormEntityId(userEntities.length === 1 ? userEntities[0].id : "");
    setFormCategoryId("");
    setFormBrandId("");
    setFormModelId("");
    setFormName("");
    setFormValue("");
    setFormQty("1");
    setFormYear("");
    setFormNotes("");
  };

  const openAdd = () => { resetForm(); setDialogOpen(true); };

  const openEdit = (a: any) => {
    setEditId(a.member_asset_id);
    setFormEntityId(a.entity_id);
    setFormCategoryId(a.category_id);
    setFormBrandId(a.brand_id ?? "");
    setFormModelId(a.item_model_id ?? "");
    setFormName(a.asset_display_name);
    setFormValue(String(a.declared_value ?? 0));
    setFormQty(String(a.quantity ?? 1));
    setFormYear(a.year_model ? String(a.year_model) : "");
    setFormNotes(a.notes ?? "");
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!tenantId || !formEntityId || !formCategoryId || !formName) return;
    setSaving(true);
    try {
      const payload: any = {
        tenant_id: tenantId,
        entity_id: formEntityId,
        category_id: formCategoryId,
        brand_id: formBrandId || null,
        item_model_id: formModelId || null,
        asset_display_name: formName,
        declared_value: parseFloat(formValue) || 0,
        quantity: parseInt(formQty) || 1,
        year_model: formYear ? parseInt(formYear) : null,
        notes: formNotes || null,
      };

      if (editId) {
        const { error } = await (supabase as any)
          .from("si_member_asset")
          .update(payload)
          .eq("member_asset_id", editId);
        if (error) throw error;
        toast({ title: "Asset updated" });
      } else {
        const { error } = await (supabase as any)
          .from("si_member_asset")
          .insert(payload);
        if (error) throw error;
        toast({ title: "Asset registered" });
      }
      qc.invalidateQueries({ queryKey: ["member_assets"] });
      setDialogOpen(false);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    setDeleting(true);
    try {
      const { error } = await (supabase as any)
        .from("si_member_asset")
        .delete()
        .eq("member_asset_id", deleteId);
      if (error) throw error;
      toast({ title: "Asset deleted" });
      qc.invalidateQueries({ queryKey: ["member_assets"] });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setDeleting(false);
      setDeleteId(null);
    }
  };

  const filtered = assets.filter((a: any) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      a.asset_display_name?.toLowerCase().includes(q) ||
      a.si_item_category?.category_name?.toLowerCase().includes(q) ||
      a.si_brand?.brand_name?.toLowerCase().includes(q) ||
      a.si_item_model?.model_name?.toLowerCase().includes(q)
    );
  });

  const formatCurrency = (v: number) =>
    new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR" }).format(v);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">My Assets</h1>
          <p className="text-muted-foreground text-sm mt-1">Register and manage your declared assets</p>
        </div>
        <Button onClick={openAdd} disabled={userEntities.length === 0}>
          <Plus className="h-4 w-4 mr-1.5" /> Add Asset
        </Button>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Search assets…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Asset Name</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Brand / Model</TableHead>
                <TableHead className="text-right">Value</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead>Year</TableHead>
                {userEntities.length > 1 && <TableHead>Entity</TableHead>}
                <TableHead className="w-20"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-12">
                    <Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" />
                  </TableCell>
                </TableRow>
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-12 text-muted-foreground">
                    <Package className="h-8 w-8 mx-auto mb-2 opacity-40" />
                    {search ? "No matching assets." : "No assets registered yet."}
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((a: any) => (
                  <TableRow key={a.member_asset_id}>
                    <TableCell className="font-medium">{a.asset_display_name}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">{a.si_item_category?.category_name ?? "—"}</Badge>
                    </TableCell>
                    <TableCell className="text-sm">
                      {[a.si_brand?.brand_name, a.si_item_model?.model_name].filter(Boolean).join(" · ") || "—"}
                    </TableCell>
                    <TableCell className="text-right text-sm">{formatCurrency(a.declared_value)}</TableCell>
                    <TableCell className="text-right text-sm">{a.quantity}</TableCell>
                    <TableCell className="text-sm">{a.year_model ?? "—"}</TableCell>
                    {userEntities.length > 1 && (
                      <TableCell className="text-sm">{entityLabel(a.entities ?? {})}</TableCell>
                    )}
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(a)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => setDeleteId(a.member_asset_id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editId ? "Edit Asset" : "Register New Asset"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {userEntities.length > 1 && (
              <div className="space-y-2">
                <Label>Entity</Label>
                <Select value={formEntityId} onValueChange={setFormEntityId}>
                  <SelectTrigger><SelectValue placeholder="Select entity" /></SelectTrigger>
                  <SelectContent>
                    {userEntities.map((e: any) => (
                      <SelectItem key={e.id} value={e.id}>{entityLabel(e)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-2">
              <Label>Category *</Label>
              <Select value={formCategoryId} onValueChange={(v) => { setFormCategoryId(v); setFormModelId(""); }}>
                <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                <SelectContent>
                  {categories.map((c: any) => (
                    <SelectItem key={c.category_id} value={c.category_id}>{c.category_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Brand</Label>
                <Select value={formBrandId} onValueChange={(v) => { setFormBrandId(v); setFormModelId(""); }}>
                  <SelectTrigger><SelectValue placeholder="Optional" /></SelectTrigger>
                  <SelectContent>
                    {brands.map((b: any) => (
                      <SelectItem key={b.brand_id} value={b.brand_id}>{b.brand_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Model</Label>
                <Select value={formModelId} onValueChange={setFormModelId}>
                  <SelectTrigger><SelectValue placeholder="Optional" /></SelectTrigger>
                  <SelectContent>
                    {models.map((m: any) => (
                      <SelectItem key={m.item_model_id} value={m.item_model_id}>{m.model_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Asset Name *</Label>
              <Input value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="e.g. 2022 Krugerrand 1oz" />
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Declared Value</Label>
                <Input type="number" value={formValue} onChange={(e) => setFormValue(e.target.value)} placeholder="0.00" />
              </div>
              <div className="space-y-2">
                <Label>Quantity</Label>
                <Input type="number" value={formQty} onChange={(e) => setFormQty(e.target.value)} min="1" />
              </div>
              <div className="space-y-2">
                <Label>Year</Label>
                <Input type="number" value={formYear} onChange={(e) => setFormYear(e.target.value)} placeholder="e.g. 2022" />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea value={formNotes} onChange={(e) => setFormNotes(e.target.value)} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving || !formCategoryId || !formName || !formEntityId}>
              {saving && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
              {editId ? "Save Changes" : "Register Asset"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Asset</AlertDialogTitle>
            <AlertDialogDescription>Are you sure? This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={deleting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {deleting && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />} Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default MamAssets;
