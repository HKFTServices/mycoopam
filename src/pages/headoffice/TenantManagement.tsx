import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Loader2, Save, Building2, Search, Users, Wallet, DollarSign } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { formatCurrency } from "@/lib/formatCurrency";

const TenantManagement = () => {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [selectedTenant, setSelectedTenant] = useState<any>(null);
  const [feeForm, setFeeForm] = useState<Record<string, string>>({});

  // Fetch all tenants with stats
  const { data: tenants = [], isLoading } = useQuery({
    queryKey: ["ho_tenants"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tenants")
        .select("id, name, slug, is_active, created_at")
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  // Fetch fee configs
  const { data: feeConfigs = [] } = useQuery({
    queryKey: ["ho_tenant_fees"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("tenant_fee_config")
        .select("*");
      if (error) throw error;
      return data;
    },
  });

  // Fetch member counts per tenant
  const { data: memberCounts = {} } = useQuery({
    queryKey: ["ho_member_counts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tenant_memberships")
        .select("tenant_id");
      if (error) throw error;
      const counts: Record<string, number> = {};
      (data ?? []).forEach((m: any) => {
        counts[m.tenant_id] = (counts[m.tenant_id] || 0) + 1;
      });
      return counts;
    },
  });

  // Fetch pool counts per tenant
  const { data: poolCounts = {} } = useQuery({
    queryKey: ["ho_pool_counts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pools")
        .select("tenant_id");
      if (error) throw error;
      const counts: Record<string, number> = {};
      (data ?? []).forEach((p: any) => {
        counts[p.tenant_id] = (counts[p.tenant_id] || 0) + 1;
      });
      return counts;
    },
  });

  const saveFeeConfig = useMutation({
    mutationFn: async (tenantId: string) => {
      const existing = feeConfigs.find((f: any) => f.tenant_id === tenantId);
      const payload = {
        tenant_id: tenantId,
        monthly_admin_fee: Number(feeForm.monthly_admin_fee || existing?.monthly_admin_fee || 0),
        per_member_fee: Number(feeForm.per_member_fee || existing?.per_member_fee || 0),
        transaction_fee_percentage: Number(feeForm.transaction_fee_percentage || existing?.transaction_fee_percentage || 0),
        vault_fee: Number(feeForm.vault_fee || existing?.vault_fee || 0),
        notes: feeForm.notes ?? existing?.notes ?? "",
      };
      if (existing) {
        const { error } = await (supabase as any)
          .from("tenant_fee_config")
          .update(payload)
          .eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await (supabase as any)
          .from("tenant_fee_config")
          .insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ho_tenant_fees"] });
      toast.success("Fee configuration saved");
      setSelectedTenant(null);
      setFeeForm({});
    },
    onError: (err: any) => toast.error(err.message),
  });

  const filtered = tenants.filter((t: any) =>
    t.name.toLowerCase().includes(search.toLowerCase()) ||
    t.slug?.toLowerCase().includes(search.toLowerCase())
  );

  const getFeeConfig = (tenantId: string) => feeConfigs.find((f: any) => f.tenant_id === tenantId);
  const getFeeVal = (key: string) => {
    if (feeForm[key] !== undefined) return feeForm[key];
    const existing = getFeeConfig(selectedTenant?.id);
    return existing?.[key]?.toString() ?? "";
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Tenant Management</h1>
        <p className="text-muted-foreground">Manage co-operatives, fee structures, and billing</p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center gap-3">
              <Building2 className="h-8 w-8 text-primary" />
              <div>
                <p className="text-2xl font-bold">{tenants.length}</p>
                <p className="text-sm text-muted-foreground">Total Tenants</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center gap-3">
              <Users className="h-8 w-8 text-primary" />
              <div>
                <p className="text-2xl font-bold">
                  {Object.values(memberCounts as Record<string, number>).reduce((a, b) => a + b, 0)}
                </p>
                <p className="text-sm text-muted-foreground">Total Members</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center gap-3">
              <DollarSign className="h-8 w-8 text-primary" />
              <div>
                <p className="text-2xl font-bold">{feeConfigs.length}</p>
                <p className="text-sm text-muted-foreground">Configured Fee Plans</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search & Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search tenants..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tenant</TableHead>
                <TableHead>Slug</TableHead>
                <TableHead className="text-center">Members</TableHead>
                <TableHead className="text-center">Pools</TableHead>
                <TableHead>Monthly Fee</TableHead>
                <TableHead>Per Member</TableHead>
                <TableHead>Status</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((tenant: any) => {
                const fee = getFeeConfig(tenant.id);
                return (
                  <TableRow key={tenant.id}>
                    <TableCell className="font-medium">{tenant.name}</TableCell>
                    <TableCell className="text-muted-foreground">{tenant.slug}</TableCell>
                    <TableCell className="text-center">{(memberCounts as any)[tenant.id] || 0}</TableCell>
                    <TableCell className="text-center">{(poolCounts as any)[tenant.id] || 0}</TableCell>
                    <TableCell>{fee ? formatCurrency(fee.monthly_admin_fee) : "—"}</TableCell>
                    <TableCell>{fee ? formatCurrency(fee.per_member_fee) : "—"}</TableCell>
                    <TableCell>
                      <Badge variant={tenant.is_active ? "default" : "secondary"}>
                        {tenant.is_active ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setSelectedTenant(tenant);
                          setFeeForm({});
                        }}
                      >
                        <Wallet className="h-3.5 w-3.5 mr-1" />
                        Fees
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                    No tenants found
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Fee Configuration Dialog */}
      <Dialog open={!!selectedTenant} onOpenChange={(open) => !open && setSelectedTenant(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Fee Configuration — {selectedTenant?.name}</DialogTitle>
            <DialogDescription>Set the monthly billing structure for this tenant</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Monthly Admin Fee</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={getFeeVal("monthly_admin_fee")}
                  onChange={(e) => setFeeForm((p) => ({ ...p, monthly_admin_fee: e.target.value }))}
                  placeholder="0.00"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Per Member Fee</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={getFeeVal("per_member_fee")}
                  onChange={(e) => setFeeForm((p) => ({ ...p, per_member_fee: e.target.value }))}
                  placeholder="0.00"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Transaction Fee %</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={getFeeVal("transaction_fee_percentage")}
                  onChange={(e) => setFeeForm((p) => ({ ...p, transaction_fee_percentage: e.target.value }))}
                  placeholder="0.00"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Vault Fee</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={getFeeVal("vault_fee")}
                  onChange={(e) => setFeeForm((p) => ({ ...p, vault_fee: e.target.value }))}
                  placeholder="0.00"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Input
                value={getFeeVal("notes")}
                onChange={(e) => setFeeForm((p) => ({ ...p, notes: e.target.value }))}
                placeholder="Optional notes about the fee arrangement"
              />
            </div>
            <Separator />
            <div className="flex justify-end">
              <Button
                onClick={() => saveFeeConfig.mutate(selectedTenant.id)}
                disabled={saveFeeConfig.isPending}
              >
                {saveFeeConfig.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
                Save Fee Config
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default TenantManagement;
