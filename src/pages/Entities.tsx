import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/contexts/TenantContext";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { SortableTableHead, useSort, compareValues } from "@/components/ui/sortable-table-head";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Loader2, Search, Building2, Plus } from "lucide-react";
import { useState, useMemo } from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import CreateEntityDialog from "@/components/entities/CreateEntityDialog";

const Entities = () => {
  const { currentTenant } = useTenant();
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const isMobile = useIsMobile();

  const { data: entities = [], isLoading } = useQuery({
    queryKey: ["entities", currentTenant?.id],
    queryFn: async () => {
      if (!currentTenant) return [];
      const { data, error } = await (supabase as any)
        .from("entities")
        .select(`
          *,
          entity_categories (name, entity_type),
          titles (description)
        `)
        .eq("tenant_id", currentTenant.id)
        .eq("is_deleted", false)
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!currentTenant,
  });

  type SortKey = "name" | "category" | "id" | "contact" | "email" | "active";
  const { sort, toggle } = useSort<SortKey>({ key: "name", direction: "asc" });

  const filtered = entities.filter((e: any) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    const fullName = [e.name, e.last_name].filter(Boolean).join(" ").toLowerCase();
    return (
      fullName.includes(q) ||
      (e.identity_number ?? "").toLowerCase().includes(q) ||
      (e.registration_number ?? "").toLowerCase().includes(q) ||
      (e.email_address ?? "").toLowerCase().includes(q) ||
      (e.contact_number ?? "").toLowerCase().includes(q) ||
      (e.entity_categories?.name ?? "").toLowerCase().includes(q)
    );
  });

  const sorted = useMemo(() => {
    if (!sort) return filtered;
    const get = (e: any): unknown => {
      switch (sort.key) {
        case "name": return [e.name, e.last_name].filter(Boolean).join(" ");
        case "category": return e.entity_categories?.name;
        case "id": return e.identity_number || e.registration_number || e.passport_number;
        case "contact": return e.contact_number;
        case "email": return e.email_address;
        case "active": return e.is_active ? 1 : 0;
      }
    };
    return [...filtered].sort((a, b) => compareValues(get(a), get(b), sort.direction));
  }, [filtered, sort]);

  const renderMobileCard = (e: any) => {
    const fullName = [e.name, e.last_name].filter(Boolean).join(" ");
    const category = e.entity_categories;
    const idNum = e.identity_number || e.registration_number || e.passport_number;

    return (
      <Card key={e.id} className="overflow-hidden">
        <CardContent className="p-2.5 space-y-1.5">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="font-medium text-sm truncate">{fullName}</p>
              {e.known_as && <p className="text-xs text-muted-foreground">({e.known_as})</p>}
            </div>
            <Badge variant={e.is_active ? "default" : "secondary"} className="text-[10px] shrink-0">
              {e.is_active ? "Active" : "Inactive"}
            </Badge>
          </div>
          <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground min-w-0">
            {category && (
              <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${
                category.entity_type === "natural_person"
                  ? "bg-accent text-accent-foreground"
                  : "bg-secondary text-secondary-foreground"
              }`}>
                {category.name}
              </span>
            )}
            {idNum && (
              <code className="font-mono bg-muted px-1.5 py-0.5 rounded text-[11px] max-w-full truncate inline-block">
                {idNum}
              </code>
            )}
          </div>
          {(e.contact_number || e.email_address) && (
            <div className="text-xs text-muted-foreground space-y-0.5">
              {e.contact_number && <p>{e.contact_number}</p>}
              {e.email_address && <p className="truncate">{e.email_address}</p>}
            </div>
          )}
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="space-y-4 sm:space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 sm:gap-4">
        <div>
          <h1 className="text-lg sm:text-2xl font-bold tracking-tight">Entities</h1>
          <p className="text-muted-foreground text-xs sm:text-sm mt-0.5">
            All registered entities — natural persons, companies, trusts, and more
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)} size="sm" className="w-full sm:w-auto">
          <Plus className="h-4 w-4 mr-1" /> Create Entity
        </Button>
      </div>

      <CreateEntityDialog open={createOpen} onOpenChange={setCreateOpen} />

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search by name, ID, email…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : sorted.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Building2 className="h-8 w-8 mx-auto mb-2 opacity-40" />
          {search ? "No matching entities found." : "No entities yet."}
        </div>
      ) : isMobile ? (
        <div className="space-y-3">
          {sorted.map(renderMobileCard)}
        </div>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <SortableTableHead sortKey="name" sort={sort} onSort={toggle}>Name</SortableTableHead>
                  <SortableTableHead sortKey="category" sort={sort} onSort={toggle}>Category</SortableTableHead>
                  <SortableTableHead sortKey="id" sort={sort} onSort={toggle}>ID / Reg. Number</SortableTableHead>
                  <SortableTableHead sortKey="contact" sort={sort} onSort={toggle}>Contact</SortableTableHead>
                  <SortableTableHead sortKey="email" sort={sort} onSort={toggle}>Email</SortableTableHead>
                  <SortableTableHead sortKey="active" sort={sort} onSort={toggle}>Active</SortableTableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sorted.map((e: any) => {
                  const fullName = [e.name, e.last_name].filter(Boolean).join(" ");
                  const category = e.entity_categories;
                  const idNum = e.identity_number || e.registration_number || e.passport_number;

                  return (
                    <TableRow key={e.id}>
                      <TableCell>
                        <span className="font-medium">{fullName}</span>
                        {e.known_as && (
                          <p className="text-xs text-muted-foreground">({e.known_as})</p>
                        )}
                      </TableCell>
                      <TableCell>
                        {category && (
                          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                            category.entity_type === "natural_person"
                              ? "bg-accent text-accent-foreground"
                              : "bg-secondary text-secondary-foreground"
                          }`}>
                            {category.name}
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        {idNum ? (
                          <code className="text-sm font-mono bg-muted px-1.5 py-0.5 rounded">{idNum}</code>
                        ) : (
                          <span className="text-xs text-muted-foreground italic">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm">{e.contact_number || "—"}</TableCell>
                      <TableCell className="text-sm">{e.email_address || "—"}</TableCell>
                      <TableCell>
                        <Badge variant={e.is_active ? "default" : "secondary"}>
                          {e.is_active ? "Yes" : "No"}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default Entities;
