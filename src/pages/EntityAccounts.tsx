import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useTenant } from "@/contexts/TenantContext";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Search, Briefcase, Plus, UserPlus, Pencil } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import CreateEntityAccountDialog from "@/components/entity-accounts/CreateEntityAccountDialog";

const statusVariant = (status: string): "default" | "secondary" | "destructive" | "outline" => {
  switch (status) {
    case "active": return "default";
    case "approved": return "outline";
    case "pending_activation": return "secondary";
    case "declined":
    case "suspended":
    case "terminated": return "destructive";
    default: return "outline";
  }
};

const statusLabel = (status: string) =>
  status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

const EntityAccounts = () => {
  const { user } = useAuth();
  const { currentTenant } = useTenant();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);

  // Check if user is admin
  const { data: isAdmin = false } = useQuery({
    queryKey: ["is_admin", user?.id, currentTenant?.id],
    queryFn: async () => {
      if (!user) return false;
      const { data: roles } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id);
      return (roles ?? []).some(
        (r: any) => r.role === "super_admin" || (r.role === "tenant_admin")
      );
    },
    enabled: !!user,
  });

  // For admins: fetch all tenant entities; for members: fetch only linked entities
  const { data: userEntities = [], isLoading: loadingEntities } = useQuery({
    queryKey: ["user_linked_entities", user?.id, currentTenant?.id, isAdmin],
    queryFn: async () => {
      if (!currentTenant || !user) return [];

      if (isAdmin) {
        // Admins see all tenant entities
        const { data: entities, error } = await (supabase as any)
          .from("entities")
          .select(`id, name, last_name, identity_number, registration_number, entity_categories (name, entity_type)`)
          .eq("tenant_id", currentTenant.id)
          .eq("is_deleted", false)
          .order("name");
        if (error) throw error;
        return (entities ?? []).map((e: any) => ({ ...e, relationshipName: null }));
      }

      // Members see only linked entities
      const { data: rels, error: relError } = await (supabase as any)
        .from("user_entity_relationships")
        .select(`entity_id, relationship_types (name)`)
        .eq("user_id", user.id)
        .eq("tenant_id", currentTenant.id)
        .eq("is_active", true);
      if (relError) throw relError;
      if (!rels || rels.length === 0) return [];

      const entityIds = rels.map((r: any) => r.entity_id);
      const relMap = Object.fromEntries(rels.map((r: any) => [r.entity_id, r.relationship_types?.name]));

      const { data: entities, error } = await (supabase as any)
        .from("entities")
        .select(`id, name, last_name, identity_number, registration_number, entity_categories (name, entity_type)`)
        .in("id", entityIds)
        .eq("is_deleted", false)
        .order("name");
      if (error) throw error;
      return (entities ?? []).map((e: any) => ({ ...e, relationshipName: relMap[e.id] }));
    },
    enabled: !!user && !!currentTenant,
  });

  const linkedEntityIds = userEntities.map((e: any) => e.id);
  const { data: accounts = [], isLoading: loadingAccounts } = useQuery({
    queryKey: ["user_entity_accounts", linkedEntityIds],
    queryFn: async () => {
      if (!currentTenant || linkedEntityIds.length === 0) return [];
      const { data, error } = await (supabase as any)
        .from("entity_accounts")
        .select(`id, account_number, status, is_approved, is_active, entity_id, entity_account_types (name)`)
        .in("entity_id", linkedEntityIds)
        .eq("tenant_id", currentTenant.id);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!currentTenant && linkedEntityIds.length > 0,
  });

  const isLoading = loadingEntities || loadingAccounts;

  type AccountRow = {
    id: string;
    entityName: string;
    identityNumber?: string;
    registrationNumber?: string;
    categoryName?: string;
    entityType?: string;
    relationshipName?: string;
    accountTypeName?: string;
    accountNumber?: string;
    status?: string;
    isApproved?: boolean;
    isActive?: boolean;
    hasAccount: boolean;
    entityId: string;
  };

  const rows: AccountRow[] = userEntities.map((e: any) => {
    const entityAccounts = accounts.filter((a: any) => a.entity_id === e.id);
    const fullName = [e.name, e.last_name].filter(Boolean).join(" ");
    const category = e.entity_categories;
    const relationshipName = e.relationshipName;

    if (entityAccounts.length > 0) {
      return entityAccounts.map((a: any) => ({
        id: a.id,
        entityName: fullName,
        identityNumber: e.identity_number,
        registrationNumber: e.registration_number,
        categoryName: category?.name,
        entityType: category?.entity_type,
        relationshipName,
        accountTypeName: a.entity_account_types?.name,
        accountNumber: a.account_number,
        status: a.status,
        isApproved: a.is_approved,
        isActive: a.is_active,
        hasAccount: true,
        entityId: e.id,
      }));
    }

    return [{
      id: `no-account-${e.id}`,
      entityName: fullName,
      identityNumber: e.identity_number,
      registrationNumber: e.registration_number,
      categoryName: category?.name,
      entityType: category?.entity_type,
      relationshipName,
      accountTypeName: undefined,
      accountNumber: undefined,
      status: undefined,
      isApproved: undefined,
      isActive: undefined,
      hasAccount: false,
      entityId: e.id,
    }];
  }).flat();

  const filtered = rows.filter((r) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      r.entityName.toLowerCase().includes(q) ||
      (r.identityNumber ?? "").toLowerCase().includes(q) ||
      (r.registrationNumber ?? "").toLowerCase().includes(q) ||
      (r.relationshipName ?? "").toLowerCase().includes(q) ||
      (r.accountTypeName ?? "").toLowerCase().includes(q) ||
      (r.accountNumber ?? "").toLowerCase().includes(q) ||
      (r.status ?? "").toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Entity Accounts</h1>
          <p className="text-muted-foreground text-sm mt-1">All entities and their accounts</p>
        </div>
        <Button onClick={() => setDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-1.5" />
          Create Entity Account
        </Button>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Search by name, number, or status…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Entity Name</TableHead>
                <TableHead>Relationship</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Account Type</TableHead>
                <TableHead>Account Number</TableHead>
                <TableHead>Approved</TableHead>
                <TableHead>Active</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Combined Unit Value</TableHead>
                <TableHead className="w-16" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={10} className="text-center py-12">
                    <Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" />
                  </TableCell>
                </TableRow>
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={10} className="text-center py-12 text-muted-foreground">
                    <Briefcase className="h-8 w-8 mx-auto mb-2 opacity-40" />
                    {search ? "No matching records found." : "No entity accounts yet."}
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>
                      <div>
                        <span className="font-medium">{r.entityName}</span>
                        {r.identityNumber && <p className="text-xs text-muted-foreground">{r.identityNumber}</p>}
                        {r.registrationNumber && <p className="text-xs text-muted-foreground">{r.registrationNumber}</p>}
                      </div>
                    </TableCell>
                    <TableCell>
                      {r.relationshipName ? (
                        <span className="text-sm">{r.relationshipName}</span>
                      ) : (
                        <span className="text-xs text-muted-foreground italic">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {r.categoryName && (
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                          r.entityType === "natural_person" ? "bg-accent text-accent-foreground" : "bg-secondary text-secondary-foreground"
                        }`}>
                          {r.categoryName}
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      {r.accountTypeName ? <span className="text-sm">{r.accountTypeName}</span> : <span className="text-xs text-muted-foreground italic">None</span>}
                    </TableCell>
                    <TableCell>
                      {r.accountNumber ? <code className="text-sm font-mono bg-muted px-1.5 py-0.5 rounded">{r.accountNumber}</code> : <span className="text-xs text-muted-foreground italic">Not allocated</span>}
                    </TableCell>
                    <TableCell>
                      {r.hasAccount ? (
                        <Badge variant={r.isApproved ? "default" : "secondary"}>{r.isApproved ? "Yes" : "No"}</Badge>
                      ) : <span className="text-xs text-muted-foreground italic">—</span>}
                    </TableCell>
                    <TableCell>
                      {r.hasAccount ? (
                        <Badge variant={r.isActive ? "default" : "destructive"}>{r.isActive ? "Yes" : "No"}</Badge>
                      ) : <span className="text-xs text-muted-foreground italic">—</span>}
                    </TableCell>
                    <TableCell>
                      {r.status ? <Badge variant={statusVariant(r.status)}>{statusLabel(r.status)}</Badge> : <span className="text-xs text-muted-foreground italic">—</span>}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">R 0.00</TableCell>
                    <TableCell>
                      {!r.hasAccount && (
                        <Button variant="outline" size="sm" className="whitespace-nowrap">
                          <UserPlus className="h-3.5 w-3.5 mr-1.5" />Apply
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <CreateEntityAccountDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </div>
  );
};

export default EntityAccounts;
