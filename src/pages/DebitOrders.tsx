import { useQuery } from "@tanstack/react-query";
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
import { Loader2, CreditCard, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState } from "react";

const statusColor = (s: string) => {
  switch (s) {
    case "approved": return "default";
    case "pending": return "secondary";
    case "declined": return "destructive";
    default: return "outline";
  }
};

const DebitOrders = () => {
  const { currentTenant } = useTenant();
  const { user } = useAuth();
  const [viewOrder, setViewOrder] = useState<any>(null);

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

  const { data: debitOrders = [], isLoading } = useQuery({
    queryKey: ["debit_orders_list", currentTenant?.id, user?.id, isAdmin],
    queryFn: async () => {
      if (!currentTenant) return [];
      let q = (supabase as any)
        .from("debit_orders")
        .select("*, entities(name, last_name), entity_accounts(account_number)")
        .eq("tenant_id", currentTenant.id)
        .order("created_at", { ascending: false });

      // Non-admins only see their own via entity link
      if (!isAdmin) {
        // Get user's entity IDs
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

  const sym = currentTenant?.currency_symbol || "R";

  const parseNotes = (notesStr: string | null) => {
    if (!notesStr) return null;
    try { return JSON.parse(notesStr); } catch { return null; }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <CreditCard className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold">Debit Orders</h1>
      </div>

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
                <TableHead>Pool Allocations</TableHead>
                <TableHead className="w-[80px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {debitOrders.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                    No debit orders found
                  </TableCell>
                </TableRow>
              ) : (
                debitOrders.map((d: any) => {
                  const pools = Array.isArray(d.pool_allocations) ? d.pool_allocations : [];
                  const notes = parseNotes(d.notes);
                  return (
                    <TableRow key={d.id}>
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
                        <Button variant="ghost" size="icon" onClick={() => setViewOrder(d)}>
                          <Eye className="h-4 w-4" />
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
    </div>
  );
};

export default DebitOrders;
