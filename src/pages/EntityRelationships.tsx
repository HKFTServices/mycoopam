import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/contexts/TenantContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Search, Link2, Plus, Trash2 } from "lucide-react";
import { MobileTableHint } from "@/components/ui/mobile-table-hint";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const EntityRelationships = () => {
  const { currentTenant } = useTenant();
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formUserId, setFormUserId] = useState("");
  const [formEntityId, setFormEntityId] = useState("");
  const [formRelTypeId, setFormRelTypeId] = useState("");
  
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const { data: relationships = [], isLoading } = useQuery({
    queryKey: ["all_entity_relationships", currentTenant?.id],
    queryFn: async () => {
      if (!currentTenant) return [];
      const { data, error } = await (supabase as any)
        .from("user_entity_relationships")
        .select(`
          id, is_active, is_primary, created_at, user_id, entity_id,
          relationship_types (name),
          entities (name, last_name, identity_number, registration_number, entity_categories (name, entity_type))
        `)
        .eq("tenant_id", currentTenant.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!currentTenant,
  });

  // All profiles for the tenant (for user dropdown + display)
  const { data: allProfiles = [] } = useQuery({
    queryKey: ["all_profiles_for_tenant", currentTenant?.id],
    queryFn: async () => {
      if (!currentTenant) return [];
      const { data: memberships } = await (supabase as any)
        .from("tenant_memberships")
        .select("user_id")
        .eq("tenant_id", currentTenant.id)
        .eq("is_active", true);
      if (!memberships || memberships.length === 0) return [];
      const uids = memberships.map((m: any) => m.user_id);
      const { data, error } = await (supabase as any)
        .from("profiles")
        .select("user_id, first_name, last_name, email")
        .in("user_id", uids);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!currentTenant,
  });

  // All entities for the tenant (for entity dropdown)
  const { data: allEntities = [] } = useQuery({
    queryKey: ["all_entities_for_link", currentTenant?.id],
    queryFn: async () => {
      if (!currentTenant) return [];
      const { data, error } = await (supabase as any)
        .from("entities")
        .select("id, name, last_name, identity_number, registration_number, entity_category_id, entity_categories (id, entity_type)")
        .eq("tenant_id", currentTenant.id)
        .eq("is_deleted", false)
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!currentTenant,
  });

  // Relationship types for the tenant
  const { data: relTypes = [] } = useQuery({
    queryKey: ["rel_types_for_link", currentTenant?.id],
    queryFn: async () => {
      if (!currentTenant) return [];
      const { data, error } = await (supabase as any)
        .from("relationship_types")
        .select("id, name, entity_category_id")
        .eq("tenant_id", currentTenant.id)
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!currentTenant,
  });

  // Filter relationship types based on selected entity's category
  const selectedEntity = allEntities.find((e: any) => e.id === formEntityId);
  const filteredRelTypes = formEntityId && selectedEntity?.entity_category_id
    ? relTypes.filter((rt: any) => rt.entity_category_id === selectedEntity.entity_category_id)
    : relTypes;

  const profileMap = Object.fromEntries(
    allProfiles.map((p: any) => [p.user_id, p])
  );

  const profileLabel = (p: any) => {
    const name = [p.first_name, p.last_name].filter(Boolean).join(" ");
    return name ? `${name} (${p.email})` : p.email;
  };

  const entityLabel = (e: any) => {
    const name = [e.name, e.last_name].filter(Boolean).join(" ");
    const id = e.identity_number || e.registration_number;
    return id ? `${name} — ${id}` : name;
  };

  const resetForm = () => {
    setFormUserId("");
    setFormEntityId("");
    setFormRelTypeId("");
    
  };

  const handleSave = async () => {
    if (!currentTenant || !formUserId || !formEntityId || !formRelTypeId) return;
    setSaving(true);
    try {
      const { error } = await (supabase as any)
        .from("user_entity_relationships")
        .insert({
          user_id: formUserId,
          entity_id: formEntityId,
          relationship_type_id: formRelTypeId,
          tenant_id: currentTenant.id,
          is_primary: true,
        });
      if (error) {
        if (error.code === "23505") {
          toast({
            title: "Relationship already exists",
            description: "This user already has this relationship type with the selected entity. You can cancel or choose a different combination.",
            variant: "destructive",
          });
          return;
        }
        throw error;
      }
      toast({ title: "Relationship created successfully" });
      queryClient.invalidateQueries({ queryKey: ["all_entity_relationships"] });
      setDialogOpen(false);
      resetForm();
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
        .from("user_entity_relationships")
        .delete()
        .eq("id", deleteId);
      if (error) throw error;
      toast({ title: "Relationship deleted" });
      queryClient.invalidateQueries({ queryKey: ["all_entity_relationships"] });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setDeleting(false);
      setDeleteId(null);
    }
  };

  const filtered = relationships.filter((r: any) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    const entityName = [r.entities?.name, r.entities?.last_name].filter(Boolean).join(" ").toLowerCase();
    const profile = profileMap[r.user_id];
    const userName = profile ? [profile.first_name, profile.last_name].filter(Boolean).join(" ").toLowerCase() : "";
    const userEmail = (profile?.email ?? "").toLowerCase();
    const relName = (r.relationship_types?.name ?? "").toLowerCase();
    return entityName.includes(q) || userName.includes(q) || userEmail.includes(q) || relName.includes(q);
  });

  return (
    <div className="space-y-4 sm:space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-lg sm:text-2xl font-bold tracking-tight">Entity User Relationships</h1>
          <p className="text-muted-foreground text-xs sm:text-sm mt-0.5">All linked users and their entity relationships</p>
        </div>
        <Button onClick={() => { resetForm(); setDialogOpen(true); }} size="sm">
          <Plus className="h-4 w-4 mr-1.5" />
          <span className="hidden sm:inline">Link User to Entity</span>
          <span className="sm:hidden">Link</span>
        </Button>
      </div>

      <MobileTableHint />

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Search by user, entity, or relationship…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Entity</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Relationship</TableHead>
                <TableHead>Active</TableHead>
                <TableHead className="w-12"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-12">
                    <Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" />
                  </TableCell>
                </TableRow>
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-12 text-muted-foreground">
                    <Link2 className="h-8 w-8 mx-auto mb-2 opacity-40" />
                    {search ? "No matching relationships found." : "No relationships yet."}
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((r: any) => {
                  const entity = r.entities;
                  const entityName = entity ? [entity.name, entity.last_name].filter(Boolean).join(" ") : "—";
                  const category = entity?.entity_categories;
                  const profile = profileMap[r.user_id];
                  const userName = profile
                    ? [profile.first_name, profile.last_name].filter(Boolean).join(" ") || profile.email
                    : r.user_id.slice(0, 8) + "…";

                  return (
                    <TableRow key={r.id}>
                      <TableCell>
                        <div>
                          <span className="font-medium text-sm">{userName}</span>
                          {profile?.email && userName !== profile.email && (
                            <p className="text-xs text-muted-foreground">{profile.email}</p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div>
                          <span className="font-medium text-sm">{entityName}</span>
                          {entity?.identity_number && <p className="text-xs text-muted-foreground">{entity.identity_number}</p>}
                          {entity?.registration_number && <p className="text-xs text-muted-foreground">{entity.registration_number}</p>}
                        </div>
                      </TableCell>
                      <TableCell>
                        {category && (
                          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                            category.entity_type === "natural_person" ? "bg-accent text-accent-foreground" : "bg-secondary text-secondary-foreground"
                          }`}>
                            {category.name}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm">{r.relationship_types?.name ?? "—"}</TableCell>
                      <TableCell>
                        <Badge variant={r.is_active ? "default" : "secondary"}>{r.is_active ? "Yes" : "No"}</Badge>
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => setDeleteId(r.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Create Relationship Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Link User to Entity</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>User</Label>
              <Select value={formUserId} onValueChange={setFormUserId}>
                <SelectTrigger><SelectValue placeholder="Select a user" /></SelectTrigger>
                <SelectContent>
                  {allProfiles.map((p: any) => (
                    <SelectItem key={p.user_id} value={p.user_id}>{profileLabel(p)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Entity</Label>
              <Select value={formEntityId} onValueChange={(v) => { setFormEntityId(v); setFormRelTypeId(""); }}>
                <SelectTrigger><SelectValue placeholder="Select an entity" /></SelectTrigger>
                <SelectContent>
                  {allEntities.map((e: any) => (
                    <SelectItem key={e.id} value={e.id}>{entityLabel(e)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Relationship Type</Label>
              <Select value={formRelTypeId} onValueChange={setFormRelTypeId}>
                <SelectTrigger><SelectValue placeholder="Select relationship type" /></SelectTrigger>
                <SelectContent>
                  {filteredRelTypes.map((rt: any) => (
                    <SelectItem key={rt.id} value={rt.id}>{rt.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving || !formUserId || !formEntityId || !formRelTypeId}>
              {saving && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Relationship</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this user-entity relationship? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={deleting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {deleting && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default EntityRelationships;
