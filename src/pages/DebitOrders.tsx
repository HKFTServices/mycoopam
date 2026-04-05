import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/contexts/TenantContext";
import { useAuth } from "@/contexts/AuthContext";
import { formatCurrency } from "@/lib/formatCurrency";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Loader2, CreditCard, Eye, Pencil, Plus, Landmark, Play, CalendarIcon } from "lucide-react";
import { MobileTableHint } from "@/components/ui/mobile-table-hint";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import DebitOrderSignUpDialog from "@/components/debit-orders/DebitOrderSignUpDialog";
import { useSearchParams } from "react-router-dom";

const statusColor = (s: string) => {
  switch (s) {
    case "loaded": return "default";
    case "pending": return "secondary";
    case "declined": return "destructive";
    default: return "outline";
  }
};

const DebitOrders = () => {
  const { currentTenant } = useTenant();
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const [viewOrder, setViewOrder] = useState<any>(null);
  const [editOrder, setEditOrder] = useState<any>(null);
  const [signUpOpen, setSignUpOpen] = useState(false);
  const [entitySelectOpen, setEntitySelectOpen] = useState(false);
  // Batch processing state
  const [selectedOrderIds, setSelectedOrderIds] = useState<Set<string>>(new Set());
  const [processingDate, setProcessingDate] = useState<Date | undefined>(undefined);
  const [showProcessConfirm, setShowProcessConfirm] = useState(false);
  const [selectedEntityId, setSelectedEntityId] = useState<string>("");
  const [adminAccountSelectOpen, setAdminAccountSelectOpen] = useState(false);
  const [adminAccountQuery, setAdminAccountQuery] = useState("");
  const [adminSelectedEntity, setAdminSelectedEntity] = useState<any>(null);

  const { data: userRoles = [], isLoading: userRolesLoading } = useQuery({
    queryKey: ["user_roles_do", user?.id, currentTenant?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data } = await supabase.from("user_roles").select("role, tenant_id").eq("user_id", user.id);
      return (data ?? [])
        .filter((r: any) => r.tenant_id === currentTenant?.id || r.tenant_id === null)
        .map((r: any) => r.role as string);
    },
    enabled: !!user,
  });

  const isAdmin = userRoles.some(r => ["super_admin", "tenant_admin", "manager"].includes(r));

  // Fetch user's linked entities with their entity accounts
  const { data: userEntities = [], isLoading: userEntitiesLoading } = useQuery({
    queryKey: ["user_entities_do", user?.id, currentTenant?.id],
    queryFn: async () => {
      if (!user || !currentTenant) return [];
      const { data: rels } = await (supabase as any)
        .from("user_entity_relationships")
        .select("entity_id, relationship_types(name), entities(id, name, last_name)")
        .eq("user_id", user.id)
        .eq("tenant_id", currentTenant.id);
      if (!rels) return [];

      // For each entity, get the entity account
      const results: any[] = [];
      for (const rel of rels) {
        if (!rel.entities) continue;
        const { data: accounts } = await (supabase as any)
          .from("entity_accounts")
          .select("id, account_number")
          .eq("entity_id", rel.entities.id)
          .eq("tenant_id", currentTenant.id)
          .eq("is_active", true)
          .limit(1);
        if (accounts?.[0]) {
          results.push({
            entityId: rel.entities.id,
            entityName: [rel.entities.name, rel.entities.last_name].filter(Boolean).join(" "),
            relationshipType: rel.relationship_types?.name || "",
            entityAccountId: accounts[0].id,
            accountNumber: accounts[0].account_number,
          });
        }
      }
      return results;
    },
    enabled: !!user && !!currentTenant && !isAdmin,
  });

  const { data: debitOrders = [], isLoading } = useQuery({
    queryKey: ["debit_orders_list", currentTenant?.id, user?.id, isAdmin],
    queryFn: async () => {
      if (!currentTenant) return [];
      let q = (supabase as any)
        .from("debit_orders")
        .select("*, entities(name, last_name), entity_accounts(account_number)")
        .eq("tenant_id", currentTenant.id)
        .order("created_at", { ascending: false });

      if (!isAdmin) {
        const { data: rels } = await (supabase as any)
          .from("user_entity_relationships")
          .select("entity_id")
          .eq("user_id", user?.id);
        const entityIds = (rels || []).map((r: any) => r.entity_id);
        if (entityIds.length === 0) return [];
        q = q.in("entity_id", entityIds);
      }

      const { data, error } = await q;
      if (error) throw error;
      return data || [];
    },
    enabled: !!currentTenant && !!user,
  });

  const { data: tenantConfig } = useQuery({
    queryKey: ["tenant_config_currency_do", currentTenant?.id],
    queryFn: async () => {
      const { data } = await (supabase as any).from("tenant_configuration").select("currency_symbol").eq("tenant_id", currentTenant!.id).maybeSingle();
      return data;
    },
    enabled: !!currentTenant,
  });
  const sym = tenantConfig?.currency_symbol ?? "R";

  const { data: tenantBanks = [] } = useQuery({
    queryKey: ["banks_for_logos", currentTenant?.id],
    queryFn: async () => {
      if (!currentTenant) return [];
      const { data, error } = await (supabase as any)
        .from("banks")
        .select("name, logo_url")
        .eq("tenant_id", currentTenant.id);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!currentTenant,
  });

  const bankLogoByName = useMemo(() => {
    const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
    const map = new Map<string, string>();
    for (const b of tenantBanks as any[]) {
      const name = String(b?.name ?? "").trim();
      const logo = String(b?.logo_url ?? "").trim();
      if (!name || !logo) continue;
      map.set(norm(name), logo);
    }
    return {
      get: (bankName: string | null | undefined) => {
        const k = String(bankName ?? "").trim();
        if (!k) return "";
        return map.get(norm(k)) ?? "";
      },
    };
  }, [tenantBanks]);

  const toggleActiveMutation = useMutation({
    mutationFn: async ({ id, newActive }: { id: string; newActive: boolean }) => {
      const { error } = await (supabase as any)
        .from("debit_orders")
        .update({ is_active: newActive })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_, { newActive }) => {
      toast.success(newActive ? "Debit order activated" : "Debit order deactivated");
      queryClient.invalidateQueries({ queryKey: ["debit_orders_list"] });
    },
    onError: (err: any) => toast.error(err.message),
  });

  const parseNotes = (notesStr: string | null) => {
    if (!notesStr) return null;
    try { return JSON.parse(notesStr); } catch { return null; }
  };

  const handleSignUpClick = () => {
    if (userEntities.length === 0) {
      toast.error("No linked entities with active accounts found");
      return;
    }
    if (userEntities.length === 1) {
      // Only one entity — go straight to sign-up
      setSelectedEntityId(userEntities[0].entityId);
      setSignUpOpen(true);
    } else {
      // Multiple entities — show selector first
      setSelectedEntityId("");
      setEntitySelectOpen(true);
    }
  };

  const handleEntitySelected = () => {
    if (!selectedEntityId) {
      toast.error("Please select an entity first");
      return;
    }
    setEntitySelectOpen(false);
    setSignUpOpen(true);
  };

  useEffect(() => {
    if (searchParams.get("new") !== "1") return;
    if (userRolesLoading) return;
    if (!user || !currentTenant) return;

    if (isAdmin) {
      setAdminAccountSelectOpen(true);
    } else {
      if (userEntitiesLoading) return;
      handleSignUpClick();
    }

    const next = new URLSearchParams(searchParams);
    next.delete("new");
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, userRolesLoading, isAdmin, userEntitiesLoading, user, currentTenant]);

  const selectedEntity = userEntities.find((e: any) => e.entityId === selectedEntityId);
  const signUpEntity = isAdmin ? adminSelectedEntity : selectedEntity;

  const { data: adminEntityAccounts = [], isLoading: loadingAdminEntityAccounts } = useQuery({
    queryKey: ["admin_entity_accounts_debit_order", currentTenant?.id, adminAccountSelectOpen],
    queryFn: async () => {
      if (!currentTenant) return [];
      const { data, error } = await (supabase as any)
        .from("entity_accounts")
        .select("id, account_number, entity_id, entities(name, last_name)")
        .eq("tenant_id", currentTenant.id)
        .eq("is_active", true)
        .eq("is_approved", true)
        .order("account_number", { ascending: true })
        .limit(300);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!currentTenant && isAdmin && adminAccountSelectOpen,
  });

  const filteredAdminEntityAccounts = useMemo(() => {
    const q = adminAccountQuery.trim().toLowerCase();
    if (!q) return adminEntityAccounts;
    return adminEntityAccounts.filter((a: any) => {
      const name = [a.entities?.name, a.entities?.last_name].filter(Boolean).join(" ").toLowerCase();
      const acct = String(a.account_number ?? "").toLowerCase();
      return name.includes(q) || acct.includes(q);
    });
  }, [adminEntityAccounts, adminAccountQuery]);

  // Processable debit orders = loaded + active
  const processableOrders = useMemo(
    () => debitOrders.filter((d: any) => d.status === "loaded" && d.is_active),
    [debitOrders],
  );

  const toggleSelectOrder = (id: string) => {
    setSelectedOrderIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedOrderIds.size === processableOrders.length) {
      setSelectedOrderIds(new Set());
    } else {
      setSelectedOrderIds(new Set(processableOrders.map((d: any) => d.id)));
    }
  };

  const createBatchMutation = useMutation({
    mutationFn: async () => {
      if (!currentTenant || !user || !processingDate) throw new Error("Missing context");
      const selected = debitOrders.filter((d: any) => selectedOrderIds.has(d.id));
      if (selected.length === 0) throw new Error("No debit orders selected");

      const totalAmount = selected.reduce((s: number, d: any) => s + Number(d.monthly_amount), 0);
      const dateStr = format(processingDate, "yyyy-MM-dd");

      // Create batch
      const { data: batch, error: batchErr } = await (supabase as any)
        .from("debit_order_batches")
        .insert({
          tenant_id: currentTenant.id,
          processing_date: dateStr,
          total_amount: totalAmount,
          item_count: selected.length,
          created_by: user.id,
          status: "pending",
        })
        .select("id")
        .single();
      if (batchErr) throw batchErr;

      // Create batch items
      for (const d of selected) {
        const notes = parseNotes(d.notes);
        const { error } = await (supabase as any)
          .from("debit_order_batch_items")
          .insert({
            batch_id: batch.id,
            debit_order_id: d.id,
            tenant_id: currentTenant.id,
            entity_id: d.entity_id,
            entity_account_id: d.entity_account_id,
            monthly_amount: d.monthly_amount,
            pool_allocations: d.pool_allocations || [],
            fee_metadata: notes ? { admin_fees: notes.admin_fees, loan_instalment: notes.loan_instalment, net_to_pools: notes.net_to_pools } : {},
          });
        if (error) throw error;
      }
      return batch;
    },
    onSuccess: () => {
      toast.success("Debit order batch created — awaiting approval");
      setSelectedOrderIds(new Set());
      setProcessingDate(undefined);
      setShowProcessConfirm(false);
      queryClient.invalidateQueries({ queryKey: ["debit_orders_list"] });
    },
    onError: (err: any) => toast.error(err.message),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3">
          <CreditCard className="h-5 w-5 sm:h-6 sm:w-6 text-primary shrink-0" />
          <h1 className="text-lg sm:text-2xl font-bold">Debit Orders</h1>
        </div>
        {isAdmin ? (
          <div className="flex items-center gap-2">
            {selectedOrderIds.size > 0 && (
              <Button
                onClick={() => setShowProcessConfirm(true)}
                className="gap-2"
                size="sm"
                variant="default"
              >
                <Play className="h-4 w-4" />
                <span className="hidden sm:inline">Process ({selectedOrderIds.size})</span>
                <span className="sm:hidden">Process ({selectedOrderIds.size})</span>
              </Button>
            )}
            <Button onClick={() => setAdminAccountSelectOpen(true)} className="gap-2" size="sm" variant="outline">
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">Create Debit Order</span>
              <span className="sm:hidden">New</span>
            </Button>
          </div>
        ) : (
          <Button onClick={handleSignUpClick} className="gap-2" size="sm">
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">Sign Up for Debit Order</span>
            <span className="sm:hidden">Sign Up</span>
          </Button>
        )}
      </div>

      <MobileTableHint />

      {debitOrders.length === 0 && !isAdmin ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 space-y-4">
            <CreditCard className="h-12 w-12 text-muted-foreground" />
            <div className="text-center space-y-1">
              <h3 className="text-lg font-semibold">No Debit Orders</h3>
              <p className="text-sm text-muted-foreground">
                You don't have any debit orders yet. Set up a recurring debit order to automate your contributions.
              </p>
            </div>
            <Button onClick={handleSignUpClick} className="gap-2">
              <Plus className="h-4 w-4" />
              Sign Up for Debit Order
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Member</TableHead>
                  <TableHead>Account</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Frequency</TableHead>
                  <TableHead>Start Date</TableHead>
                  <TableHead>Status</TableHead>
                  {isAdmin && <TableHead className="text-center">Active</TableHead>}
                  <TableHead>Pool Allocations</TableHead>
                  <TableHead className="w-[80px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {debitOrders.map((d: any) => {
                  const pools = Array.isArray(d.pool_allocations) ? d.pool_allocations : [];
                  const notes = parseNotes(d.notes);
                  const isLoaded = d.status === "loaded";
                  return (
                    <TableRow key={d.id} className={!d.is_active && isLoaded ? "opacity-50" : ""}>
                      <TableCell className="font-medium">
                        {[d.entities?.name, d.entities?.last_name].filter(Boolean).join(" ")}
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {d.entity_accounts?.account_number || "—"}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {formatCurrency(d.monthly_amount, sym)}
                      </TableCell>
                      <TableCell className="capitalize">{d.frequency}</TableCell>
                      <TableCell>{d.start_date}</TableCell>
                      <TableCell>
                        <Badge variant={statusColor(d.status)}>{d.status}</Badge>
                      </TableCell>
                      {isAdmin && (
                        <TableCell className="text-center">
                          {isLoaded ? (
                            <Switch
                              checked={d.is_active}
                              onCheckedChange={(checked) =>
                                toggleActiveMutation.mutate({ id: d.id, newActive: checked })
                              }
                            />
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                      )}
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {pools.map((p: any, i: number) => (
                            <Badge key={i} variant="outline" className="text-[10px]">
                              {p.pool_name}: {p.percentage}% ({formatCurrency(p.amount, sym)})
                            </Badge>
                          ))}
                          {notes?.loan_instalment > 0 && (
                            <Badge variant="outline" className="text-[10px] text-destructive border-destructive">
                              Loan: {formatCurrency(notes.loan_instalment, sym)}
                            </Badge>
                          )}
                          {notes?.admin_fees > 0 && (
                            <Badge variant="outline" className="text-[10px]">
                              Fees: {formatCurrency(notes.admin_fees, sym)}
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Button variant="ghost" size="icon" onClick={() => setViewOrder(d)}>
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => setEditOrder(d)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Entity selection dialog (when user has multiple entities) */}
      <Dialog open={entitySelectOpen} onOpenChange={setEntitySelectOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Select Entity</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              You have multiple linked entities. Please select which entity you want to set up a debit order for.
            </p>
            <div className="space-y-2">
              <Label>Entity</Label>
              <Select value={selectedEntityId} onValueChange={setSelectedEntityId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select an entity..." />
                </SelectTrigger>
                <SelectContent>
                  {userEntities.map((e: any) => (
                    <SelectItem key={e.entityId} value={e.entityId}>
                      {e.entityName} {e.relationshipType ? `(${e.relationshipType})` : ""} — {e.accountNumber || "No account"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setEntitySelectOpen(false)}>Cancel</Button>
              <Button onClick={handleEntitySelected} disabled={!selectedEntityId}>Continue</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* View detail dialog */}
      <Dialog open={!!viewOrder} onOpenChange={(o) => { if (!o) setViewOrder(null); }}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5" />
              Debit Order Details
            </DialogTitle>
          </DialogHeader>
          {viewOrder ? (() => {
            const pools = Array.isArray(viewOrder.pool_allocations) ? viewOrder.pool_allocations : [];
            const notes = parseNotes(viewOrder.notes);
            const memberName = [viewOrder.entities?.name, viewOrder.entities?.last_name].filter(Boolean).join(" ") || "—";
            const accountNumber = viewOrder.entity_accounts?.account_number || "—";
            const prettyStatus = String(viewOrder.status || "—")
              .replace(/_/g, " ")
              .replace(/\b\w/g, (c) => c.toUpperCase());

            const hasLoan = Number(notes?.loan_instalment ?? 0) > 0;
            const hasFees = Number(notes?.admin_fees ?? 0) > 0;

            return (
              <ScrollArea className="max-h-[75vh] pr-4">
                <div className="space-y-4 pb-2">
                  <Card>
                    <CardHeader className="pb-3">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0">
                          <CardTitle className="text-base truncate">{memberName}</CardTitle>
                          <CardDescription className="text-sm">
                            Account <span className="font-mono">{accountNumber}</span>
                          </CardDescription>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant={statusColor(viewOrder.status)} className="capitalize">
                            {prettyStatus}
                          </Badge>
                          <Badge variant={viewOrder.is_active ? "default" : "outline"}>
                            {viewOrder.is_active ? "Active" : "Inactive"}
                          </Badge>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="grid gap-4 sm:grid-cols-3">
                      <div className="space-y-1">
                        <p className="text-xs text-muted-foreground">Monthly amount</p>
                        <p className="font-mono text-sm">{formatCurrency(viewOrder.monthly_amount, sym)}</p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-xs text-muted-foreground">Frequency</p>
                        <p className="text-sm capitalize">{viewOrder.frequency || "—"}</p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-xs text-muted-foreground">Start date</p>
                        <p className="text-sm">{viewOrder.start_date || "—"}</p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-xs text-muted-foreground">Debit day</p>
                        <p className="text-sm">{viewOrder.debit_day || "—"}</p>
                      </div>
                      <div className="space-y-1 sm:col-span-2">
                        <p className="text-xs text-muted-foreground">Bank</p>
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant="secondary" className="gap-2 max-w-full">
                            {(() => {
                              const logoUrl = bankLogoByName.get(viewOrder.bank_name);
                              return logoUrl ? (
                                <img
                                  src={logoUrl}
                                  alt=""
                                  className="h-4 w-4 rounded-sm object-contain bg-background"
                                  loading="lazy"
                                />
                              ) : (
                                <Landmark className="h-3.5 w-3.5 text-muted-foreground" />
                              );
                            })()}
                            <span className="truncate max-w-[220px]">{viewOrder.bank_name || "—"}</span>
                          </Badge>
                          <Badge variant="outline" className="capitalize">{viewOrder.account_type || "—"}</Badge>
                        </div>
                      </div>
                      <div className="space-y-1 sm:col-span-3">
                        <p className="text-xs text-muted-foreground">Account details</p>
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant="outline">{viewOrder.account_name || "—"}</Badge>
                          <Badge variant="outline" className="font-mono">{viewOrder.account_number || "—"}</Badge>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm">Deduction Breakdown</CardTitle>
                      <CardDescription className="text-sm">How the monthly amount is allocated</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Gross amount</span>
                        <span className="font-mono">{formatCurrency(viewOrder.monthly_amount, sym)}</span>
                      </div>
                      {hasLoan ? (
                        <div className="flex items-center justify-between text-sm">
                          <span className="flex items-center gap-2">
                            <Badge variant="destructive" className="h-6">Loan instalment</Badge>
                          </span>
                          <span className="font-mono text-destructive">- {formatCurrency(notes.loan_instalment, sym)}</span>
                        </div>
                      ) : null}
                      {hasFees ? (
                        <div className="flex items-center justify-between text-sm">
                          <span className="flex items-center gap-2">
                            <Badge variant="secondary" className="h-6">Admin fees</Badge>
                          </span>
                          <span className="font-mono text-muted-foreground">- {formatCurrency(notes.admin_fees, sym)}</span>
                        </div>
                      ) : null}
                      <Separator />
                      <div className="flex items-center justify-between text-sm font-medium">
                        <span>Net to pools</span>
                        <span className="font-mono">{formatCurrency(notes?.net_to_pools ?? 0, sym)}</span>
                      </div>
                    </CardContent>
                  </Card>

                  {pools.length > 0 ? (
                    <Card>
                      <CardHeader className="pb-3">
                        <CardTitle className="text-sm">Pool Allocations</CardTitle>
                        <CardDescription className="text-sm">Pills show percentage and amount per pool</CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="flex flex-wrap gap-2">
                          {pools.map((p: any, i: number) => (
                            <Badge key={i} variant="secondary" className="gap-2">
                              <span className="truncate max-w-[220px]">{p.pool_name}</span>
                              <span className="font-mono text-[11px] text-muted-foreground">{p.percentage}%</span>
                              <span className="font-mono text-[11px]">{formatCurrency(p.amount, sym)}</span>
                            </Badge>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  ) : null}

                  {viewOrder.signature_data ? (
                    <Card>
                      <CardHeader className="pb-3">
                        <CardTitle className="text-sm">Signature</CardTitle>
                        {viewOrder.signed_at ? (
                          <CardDescription className="text-sm">
                            Signed {new Date(viewOrder.signed_at).toLocaleString()}
                          </CardDescription>
                        ) : null}
                      </CardHeader>
                      <CardContent>
                        <div className="rounded-lg border bg-background p-3">
                          <img
                            src={viewOrder.signature_data}
                            alt="Signature"
                            className="max-h-28 w-auto bg-white rounded-md"
                          />
                        </div>
                      </CardContent>
                    </Card>
                  ) : null}

                  {notes?.user_notes ? (
                    <Card>
                      <CardHeader className="pb-3">
                        <CardTitle className="text-sm">Notes</CardTitle>
                      </CardHeader>
                      <CardContent className="text-sm text-muted-foreground whitespace-pre-wrap">
                        {notes.user_notes}
                      </CardContent>
                    </Card>
                  ) : null}
                </div>
              </ScrollArea>
            );
          })() : null}
        </DialogContent>
      </Dialog>

      {/* Admin: select entity account to create debit order for */}
      <Dialog
        open={adminAccountSelectOpen}
        onOpenChange={(open) => {
          setAdminAccountSelectOpen(open);
          if (!open) setAdminAccountQuery("");
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Select Member Account</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              value={adminAccountQuery}
              onChange={(e) => setAdminAccountQuery(e.target.value)}
              placeholder="Search by member name or account number..."
            />
            <ScrollArea className="h-[360px] pr-3">
              {loadingAdminEntityAccounts ? (
                <div className="flex items-center justify-center py-10">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : filteredAdminEntityAccounts.length === 0 ? (
                <div className="py-10 text-center text-sm text-muted-foreground">
                  No matching accounts found.
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredAdminEntityAccounts.map((a: any) => {
                    const entityName = [a.entities?.name, a.entities?.last_name].filter(Boolean).join(" ") || "Entity";
                    return (
                      <button
                        key={a.id}
                        type="button"
                        onClick={() => {
                          setAdminSelectedEntity({
                            entityId: a.entity_id,
                            entityName,
                            entityAccountId: a.id,
                            accountNumber: a.account_number,
                          });
                          setAdminAccountSelectOpen(false);
                          setSignUpOpen(true);
                        }}
                        className="w-full flex items-center justify-between gap-3 rounded-lg border border-border bg-background px-3 py-2 text-left hover:bg-muted/40 transition-colors"
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{entityName}</p>
                          <p className="text-xs text-muted-foreground truncate">Account: {a.account_number ?? "—"}</p>
                        </div>
                        <Badge variant="outline" className="text-[10px] shrink-0">
                          Select
                        </Badge>
                      </button>
                    );
                  })}
                </div>
              )}
            </ScrollArea>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit dialog */}
      {editOrder && (
        <DebitOrderSignUpDialog
          open={!!editOrder}
          onOpenChange={(o) => { if (!o) setEditOrder(null); }}
          entityId={editOrder.entity_id}
          entityName={[editOrder.entities?.name, editOrder.entities?.last_name].filter(Boolean).join(" ")}
          entityAccountId={editOrder.entity_account_id}
          accountNumber={editOrder.entity_accounts?.account_number}
          existingOrder={editOrder}
        />
      )}

      {/* New sign-up dialog */}
      {signUpOpen && signUpEntity && (
        <DebitOrderSignUpDialog
          open={signUpOpen}
          onOpenChange={(o) => {
            if (!o) {
              setSignUpOpen(false);
              setSelectedEntityId("");
              setAdminSelectedEntity(null);
            }
          }}
          entityId={signUpEntity.entityId}
          entityName={signUpEntity.entityName}
          entityAccountId={signUpEntity.entityAccountId}
          accountNumber={signUpEntity.accountNumber}
        />
      )}
    </div>
  );
};

export default DebitOrders;
