import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/contexts/TenantContext";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Loader2, Search, Building2 } from "lucide-react";
import { useState } from "react";

const Entities = () => {
  const { currentTenant } = useTenant();
  const [search, setSearch] = useState("");

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

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Entities</h1>
        <p className="text-muted-foreground text-sm mt-1">
          All registered entities — natural persons, companies, trusts, and more
        </p>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search by name, ID, email…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>ID / Reg. Number</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Active</TableHead>
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
                    <Building2 className="h-8 w-8 mx-auto mb-2 opacity-40" />
                    {search ? "No matching entities found." : "No entities yet."}
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((e: any) => {
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
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};

export default Entities;
