import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/contexts/TenantContext";
import { useAuth } from "@/contexts/AuthContext";
import { formatCurrency } from "@/lib/formatCurrency";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Loader2, CreditCard, Eye, Pencil, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useState } from "react";
import { toast } from "sonner";
import DebitOrderSignUpDialog from "@/components/debit-orders/DebitOrderSignUpDialog";

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
  const queryClient = useQueryClient();
  const [viewOrder, setViewOrder] = useState<any>(null);
  const [editOrder, setEditOrder] = useState<any>(null);
  const [signUpOpen, setSignUpOpen] = useState(false);
  const [entitySelectOpen, setEntitySelectOpen] = useState(false);
  const [selectedEntityId, setSelectedEntityId] = useState<string>("");

  const { data: userRoles = [] } = useQuery({
    queryKey: ["user_roles_do", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data } = await supabase.from("user_roles").select("role").eq("user_id", user.id);
      return (data ?? []).map((r: any) => r.role as string);
    },
    enabled: !!user,
  });

  const isAdmin = userRoles.some(r => ["super_admin", "tenant_admin", "manager"].includes(r));

  // Fetch user's linked entities with their entity accounts
  const { data: userEntities = [] } = useQuery({
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

  const selectedEntity = userEntities.find((e: any) => e.entityId === selectedEntityId);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <CreditCard className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold">Debit Orders</h1>
        </div>
        {!isAdmin && (
          <Button onClick={handleSignUpClick} className="gap-2">
            <Plus className="h-4 w-4" />
            Sign Up for Debit Order
          </Button>
        )}
      </div>

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
        <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5" />
              Debit Order Details
            </DialogTitle>
          </DialogHeader>
          {viewOrder && (() => {
            const pools = Array.isArray(viewOrder.pool_allocations) ? viewOrder.pool_allocations : [];
            const notes = parseNotes(viewOrder.notes);
            return (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div><span className="text-muted-foreground">Member:</span> <strong>{[viewOrder.entities?.name, viewOrder.entities?.last_name].filter(Boolean).join(" ")}</strong></div>
                  <div><span className="text-muted-foreground">Account:</span> <strong className="font-mono">{viewOrder.entity_accounts?.account_number || "—"}</strong></div>
                  <div><span className="text-muted-foreground">Amount:</span> <strong className="font-mono">{formatCurrency(viewOrder.monthly_amount, sym)}</strong></div>
                  <div><span className="text-muted-foreground">Frequency:</span> <strong className="capitalize">{viewOrder.frequency}</strong></div>
                  <div><span className="text-muted-foreground">Debit Day:</span> <strong>{viewOrder.debit_day}</strong></div>
                  <div><span className="text-muted-foreground">Start Date:</span> <strong>{viewOrder.start_date}</strong></div>
                  <div><span className="text-muted-foreground">Status:</span> <Badge variant={statusColor(viewOrder.status)}>{viewOrder.status}</Badge></div>
                  <div><span className="text-muted-foreground">Active:</span> <Badge variant={viewOrder.is_active ? "default" : "outline"}>{viewOrder.is_active ? "Active" : "Inactive"}</Badge></div>
                  <div><span className="text-muted-foreground">Bank:</span> <strong>{viewOrder.bank_name} ({viewOrder.account_type})</strong></div>
                  <div><span className="text-muted-foreground">Account Name:</span> <strong>{viewOrder.account_name}</strong></div>
                  <div><span className="text-muted-foreground">Account No:</span> <strong className="font-mono">{viewOrder.account_number}</strong></div>
                </div>

                {/* Composition breakdown */}
                <div className="border rounded-md p-4 space-y-2 bg-muted/30">
                  <h3 className="font-semibold text-sm">Deduction Breakdown</h3>
                  <div className="text-sm space-y-1">
                    <div className="flex justify-between">
                      <span>Gross Amount</span>
                      <span className="font-mono">{formatCurrency(viewOrder.monthly_amount, sym)}</span>
                    </div>
                    {notes?.loan_instalment > 0 && (
                      <div className="flex justify-between text-destructive">
                        <span>Less: Loan Instalment</span>
                        <span className="font-mono">- {formatCurrency(notes.loan_instalment, sym)}</span>
                      </div>
                    )}
                    {notes?.admin_fees > 0 && (
                      <div className="flex justify-between text-muted-foreground">
                        <span>Less: Admin Fees</span>
                        <span className="font-mono">- {formatCurrency(notes.admin_fees, sym)}</span>
                      </div>
                    )}
                    <div className="flex justify-between font-semibold border-t pt-1">
                      <span>Net to Pools</span>
                      <span className="font-mono">{formatCurrency(notes?.net_to_pools ?? 0, sym)}</span>
                    </div>
                  </div>
                </div>

                {/* Pool Allocations */}
                {pools.length > 0 && (
                  <div className="border rounded-md p-4 space-y-2">
                    <h3 className="font-semibold text-sm">Pool Allocations</h3>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Pool</TableHead>
                          <TableHead className="text-right">%</TableHead>
                          <TableHead className="text-right">Amount</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {pools.map((p: any, i: number) => (
                          <TableRow key={i}>
                            <TableCell>{p.pool_name}</TableCell>
                            <TableCell className="text-right font-mono">{p.percentage}%</TableCell>
                            <TableCell className="text-right font-mono">{formatCurrency(p.amount, sym)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}

                {/* Signature */}
                {viewOrder.signature_data && (
                  <div className="border rounded-md p-4 space-y-2">
                    <h3 className="font-semibold text-sm">Signature</h3>
                    <img src={viewOrder.signature_data} alt="Signature" className="max-h-24 border rounded bg-white p-2" />
                    {viewOrder.signed_at && (
                      <p className="text-xs text-muted-foreground">Signed: {new Date(viewOrder.signed_at).toLocaleString()}</p>
                    )}
                  </div>
                )}

                {notes?.user_notes && (
                  <div className="text-sm">
                    <span className="text-muted-foreground">Notes:</span> {notes.user_notes}
                  </div>
                )}
              </div>
            );
          })()}
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
      {signUpOpen && selectedEntity && (
        <DebitOrderSignUpDialog
          open={signUpOpen}
          onOpenChange={(o) => {
            if (!o) {
              setSignUpOpen(false);
              setSelectedEntityId("");
            }
          }}
          entityId={selectedEntity.entityId}
          entityName={selectedEntity.entityName}
          entityAccountId={selectedEntity.entityAccountId}
          accountNumber={selectedEntity.accountNumber}
        />
      )}
    </div>
  );
};

export default DebitOrders;