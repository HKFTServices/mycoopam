import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ArrowLeftRight, Plus, Clock, CheckCircle, XCircle, Loader2, MoreHorizontal, RotateCcw, Trash2, Package, ShoppingCart, TrendingDown, SlidersHorizontal, AlertTriangle, Monitor } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useIsMobile } from "@/hooks/use-mobile";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useTenant } from "@/contexts/TenantContext";
import { formatCurrency } from "@/lib/formatCurrency";
import { format } from "date-fns";
import { toast } from "sonner";
import NewTransactionDialog from "@/components/transactions/NewTransactionDialog";
import AdminStockTransactionDialog from "@/components/stock/AdminStockTransactionDialog";
import StockDocumentActions from "@/components/stock/StockDocumentActions";

const statusConfig: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline"; icon: any }> = {
  pending: { label: "Pending Approval", variant: "outline", icon: Clock },
  first_approved: { label: "Awaiting Payout", variant: "secondary", icon: Clock },
  payout_confirmed: { label: "Paid Out", variant: "default", icon: CheckCircle },
  approved: { label: "Approved", variant: "default", icon: CheckCircle },
  declined: { label: "Declined", variant: "destructive", icon: XCircle },
};

type ConfirmAction = {
  type: "rollback" | "delete";
  txn: any;
};

const Transactions = () => {
  const isMobile = useIsMobile();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [stockDialogOpen, setStockDialogOpen] = useState(false);
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null);
  const { user } = useAuth();
  const { currentTenant } = useTenant();
  const queryClient = useQueryClient();

  // ─── Role check ───
  const { data: userRoles = [] } = useQuery({
    queryKey: ["user_roles_txn", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data } = await supabase.from("user_roles").select("role").eq("user_id", user.id);
      return (data ?? []).map((r: any) => r.role as string);
    },
    enabled: !!user,
  });
  const isAdmin = userRoles.some((r) => ["super_admin", "tenant_admin"].includes(r));
  const canAccessStock = userRoles.some((r) => ["super_admin", "tenant_admin", "manager", "clerk"].includes(r));

  const { data: transactions = [], isLoading } = useQuery({
    queryKey: ["member_transactions", user?.id, currentTenant?.id],
    queryFn: async () => {
      if (!user || !currentTenant) return [];
      const { data } = await (supabase as any)
        .from("transactions")
        .select(`
          id, amount, fee_amount, net_amount, unit_price, units, payment_method,
          status, transaction_date, created_at, notes, declined_reason,
          pools!transactions_pool_id_fkey(name),
          transaction_types!transactions_transaction_type_id_fkey(name, code),
          entity_accounts!transactions_entity_account_id_fkey(account_number, entities!entity_accounts_entity_id_fkey(name, last_name))
        `)
        .eq("tenant_id", currentTenant.id)
        .order("created_at", { ascending: false })
        .limit(100);
      return data ?? [];
    },
    enabled: !!user && !!currentTenant,
  });

  // ─── Admin Stock Transactions ───
  const { data: adminStockTxns = [], isLoading: loadingStock } = useQuery({
    queryKey: ["admin_stock_transactions_list", currentTenant?.id],
    queryFn: async () => {
      if (!currentTenant) return [];
      const { data, error } = await (supabase as any)
        .from("admin_stock_transactions")
        .select("id, reference, transaction_type_code, transaction_date, status, total_excl_vat, total_vat, total_invoice_amount, notes, created_at, counterparty_entity_account_id")
        .eq("tenant_id", currentTenant.id)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!currentTenant && canAccessStock,
  });

  // ─── Rollback approved transaction ───
  // Soft-deletes all linked CFT entries, unit transactions, and marks txn as rolled_back
  const rollbackMutation = useMutation({
    mutationFn: async (txn: any) => {
      if (!currentTenant || !user) throw new Error("No tenant/user");

      // Soft-delete linked cashflow_transactions
      await (supabase as any)
        .from("cashflow_transactions")
        .update({ is_active: false })
        .eq("transaction_id", txn.id)
        .eq("tenant_id", currentTenant.id);

      // Soft-delete linked unit_transactions
      await (supabase as any)
        .from("unit_transactions")
        .update({ is_active: false, pending: true })
        .eq("transaction_id", txn.id)
        .eq("tenant_id", currentTenant.id);

      // Soft-delete linked stock_transactions by direct transaction_id match
      await (supabase as any)
        .from("stock_transactions")
        .update({ is_active: false })
        .eq("transaction_id", txn.id)
        .eq("tenant_id", currentTenant.id);

      // Stock deposits link stock_transactions to the root CFT id, not the transaction id directly.
      // Fetch the root CFT id(s) for this transaction and soft-delete stock_transactions via that link too.
      const { data: linkedCfts } = await (supabase as any)
        .from("cashflow_transactions")
        .select("id")
        .eq("transaction_id", txn.id)
        .eq("tenant_id", currentTenant.id)
        .is("parent_id", null); // root CFT entries only

      if (linkedCfts?.length) {
        const rootCftIds = linkedCfts.map((c: any) => c.id);
        await (supabase as any)
          .from("stock_transactions")
          .update({ is_active: false })
          .in("transaction_id", rootCftIds)
          .eq("tenant_id", currentTenant.id);
      }

      // Mark transaction as rolled_back
      const { error } = await (supabase as any)
        .from("transactions")
        .update({
          status: "rolled_back",
          notes: JSON.stringify({
            ...(() => { try { return JSON.parse(txn.notes || "{}"); } catch { return {}; } })(),
            rolled_back_by: user.id,
            rolled_back_at: new Date().toISOString(),
          }),
        })
        .eq("id", txn.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Transaction rolled back — all ledger entries deactivated");
      queryClient.invalidateQueries({ queryKey: ["member_transactions"] });
      queryClient.invalidateQueries({ queryKey: ["member_pool_holdings"] });
      setConfirmAction(null);
    },
    onError: (err: any) => toast.error(err.message || "Rollback failed"),
  });

  // ─── Delete pending transaction ───
  const deleteMutation = useMutation({
    mutationFn: async (txn: any) => {
      if (!currentTenant) throw new Error("No tenant");

      // Clean up orphan ledger records that have no FK cascade
      // For rolled-back txns these are already is_active=false, but we hard-delete them here
      await (supabase as any)
        .from("unit_transactions")
        .delete()
        .eq("transaction_id", txn.id)
        .eq("tenant_id", currentTenant.id);

      await (supabase as any)
        .from("stock_transactions")
        .delete()
        .eq("transaction_id", txn.id)
        .eq("tenant_id", currentTenant.id);

      // Stock deposits link stock_transactions to root CFT id — fetch & delete those too
      const { data: linkedCfts } = await (supabase as any)
        .from("cashflow_transactions")
        .select("id")
        .eq("transaction_id", txn.id)
        .eq("tenant_id", currentTenant.id);
      if (linkedCfts?.length) {
        const cftIds = linkedCfts.map((c: any) => c.id);
        await (supabase as any)
          .from("stock_transactions")
          .delete()
          .in("transaction_id", cftIds)
          .eq("tenant_id", currentTenant.id);
      }

      // Delete commissions linked to this transaction
      await (supabase as any)
        .from("commissions")
        .delete()
        .eq("transaction_id", txn.id)
        .eq("tenant_id", currentTenant.id);

      // Delete cashflow_transactions (FK has no cascade)
      await (supabase as any)
        .from("cashflow_transactions")
        .delete()
        .eq("transaction_id", txn.id)
        .eq("tenant_id", currentTenant.id);

      // Finally delete the transaction itself
      const { error } = await (supabase as any)
        .from("transactions")
        .delete()
        .eq("id", txn.id)
        .eq("tenant_id", currentTenant.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Transaction deleted");
      queryClient.invalidateQueries({ queryKey: ["member_transactions"] });
      setConfirmAction(null);
    },
    onError: (err: any) => toast.error(err.message || "Delete failed"),
  });

  const handleConfirm = () => {
    if (!confirmAction) return;
    if (confirmAction.type === "rollback") rollbackMutation.mutate(confirmAction.txn);
    else deleteMutation.mutate(confirmAction.txn);
  };

  const isPending = rollbackMutation.isPending || deleteMutation.isPending;

  const getStatusBadge = (status: string) => {
    if (status === "rolled_back") {
      return (
        <Badge variant="destructive" className="gap-1 text-[10px]">
          <RotateCcw className="h-3 w-3" />
          Rolled Back
        </Badge>
      );
    }
    const cfg = statusConfig[status] || statusConfig.pending;
    const Icon = cfg.icon;
    return (
      <Badge variant={cfg.variant} className="gap-1 text-[10px]">
        <Icon className="h-3 w-3" />
        {cfg.label}
      </Badge>
    );
  };

  const canRollback = (status: string) =>
    ["approved", "first_approved", "payout_confirmed"].includes(status);
  const canDelete = (status: string) =>
    ["pending", "declined", "rolled_back"].includes(status);

  // ─── Group sibling transactions (same account + type + date, created within 10s) ───
  const groupedTransactions = (() => {
    const groups: Map<string, string> = new Map(); // txn.id → groupKey
    const sorted = [...transactions].sort((a, b) =>
      new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );

    let groupIndex = 0;
    let currentGroupKey = `g-${groupIndex}`;
    let prevTime: number | null = null;
    let prevAccountId: string | null = null;
    let prevTypeCode: string | null = null;
    let prevDate: string | null = null;

    for (const tx of sorted) {
      const txTime = new Date(tx.created_at).getTime();
      const accountId = tx.entity_accounts?.account_number || "";
      const typeCode = tx.transaction_types?.code || "";
      const date = tx.transaction_date || "";

      const isSibling =
        prevTime !== null &&
        Math.abs(txTime - prevTime) < 10_000 &&
        accountId === prevAccountId &&
        typeCode === prevTypeCode &&
        date === prevDate;

      if (!isSibling) {
        groupIndex++;
        currentGroupKey = `g-${groupIndex}`;
      }

      groups.set(tx.id, currentGroupKey);
      prevTime = txTime;
      prevAccountId = accountId;
      prevTypeCode = typeCode;
      prevDate = date;
    }

    // Count members per group to identify actual multi-row groups
    const groupCount: Record<string, number> = {};
    for (const key of groups.values()) groupCount[key] = (groupCount[key] || 0) + 1;

    // Build alternating shade map for multi-row groups only
    const shadeMap: Record<string, boolean> = {};
    let shade = false;
    let lastKey = "";
    for (const tx of [...transactions].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())) {
      const key = groups.get(tx.id) || "";
      if (key !== lastKey) { if (groupCount[key] > 1) { shade = !shade; } lastKey = key; }
      if (groupCount[key] > 1) shadeMap[tx.id] = shade;
    }

    return { groups, groupCount, shadeMap };
  })();

  return (
    <div className="space-y-4 sm:space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3">
          <ArrowLeftRight className="h-6 w-6 sm:h-8 sm:w-8 text-primary" />
          <div>
            <h1 className="text-lg sm:text-2xl font-bold tracking-tight">Transactions</h1>
            <p className="text-muted-foreground text-xs sm:text-sm mt-0.5">View and manage your investment transactions</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {canAccessStock && (
            <Button variant="outline" size={isMobile ? "sm" : "default"} onClick={() => setStockDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-1" />
              {isMobile ? "Stock" : "New Stock Transaction"}
            </Button>
          )}
          <Button size={isMobile ? "sm" : "default"} onClick={() => setDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-1" />
            {isMobile ? "New Txn" : "New Member Transaction"}
          </Button>
        </div>
      </div>

      {/* Mobile hint */}
      {isMobile && (
        <Alert className="border-primary/20 bg-primary/5">
          <Monitor className="h-4 w-4 text-primary" />
          <AlertDescription className="text-xs text-muted-foreground">
            This view is optimised for desktop. Scroll horizontally to see all columns.
          </AlertDescription>
        </Alert>
      )}

      <Tabs defaultValue="member">
        <TabsList>
          <TabsTrigger value="member" className="gap-1.5">
            <ArrowLeftRight className="h-3.5 w-3.5" />
            Member Transactions
            {transactions.length > 0 && <Badge variant="secondary" className="ml-1 h-5 min-w-5 text-[10px]">{transactions.length}</Badge>}
          </TabsTrigger>
          {canAccessStock && (
            <TabsTrigger value="stock" className="gap-1.5">
              <Package className="h-3.5 w-3.5" />
              Admin Stock
              {adminStockTxns.length > 0 && <Badge variant="secondary" className="ml-1 h-5 min-w-5 text-[10px]">{adminStockTxns.length}</Badge>}
            </TabsTrigger>
          )}
        </TabsList>

        {/* ─── Member Transactions Tab ─── */}
        <TabsContent value="member">
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : transactions.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <ArrowLeftRight className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p className="font-medium">No transactions yet</p>
          <p className="text-sm mt-1">Submit a new transaction to get started</p>
        </div>
      ) : (
        <div className="rounded-xl border bg-card overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30">
                <TableHead className="text-xs">Date</TableHead>
                <TableHead className="text-xs">Type</TableHead>
                <TableHead className="text-xs">Account</TableHead>
                <TableHead className="text-xs">Pool</TableHead>
                <TableHead className="text-xs text-right">Amount</TableHead>
                <TableHead className="text-xs text-right">Fees</TableHead>
                <TableHead className="text-xs text-right">Net</TableHead>
                <TableHead className="text-xs text-right">UP</TableHead>
                <TableHead className="text-xs text-right">Units</TableHead>
                <TableHead className="text-xs">Method</TableHead>
                <TableHead className="text-xs">Status</TableHead>
                {isAdmin && <TableHead className="text-xs w-10" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {transactions.map((tx: any) => {
                const entityName = tx.entity_accounts?.entities
                  ? `${tx.entity_accounts.entities.name}${tx.entity_accounts.entities.last_name ? ' ' + tx.entity_accounts.entities.last_name : ''}`
                  : "";
                const accountLabel = tx.entity_accounts?.account_number
                  ? `${entityName} (${tx.entity_accounts.account_number})`
                  : entityName;

                const isShaded = groupedTransactions.shadeMap[tx.id];
                const groupKey = groupedTransactions.groups.get(tx.id) || "";
                const isMultiRow = (groupedTransactions.groupCount[groupKey] || 1) > 1;

                return (
                  <TableRow
                    key={tx.id}
                    className={`text-sm ${tx.status === "rolled_back" ? "opacity-50" : ""} ${isShaded ? "bg-primary/5" : ""}`}
                  >
                    <TableCell className="text-xs font-mono">
                      {tx.transaction_date ? format(new Date(tx.transaction_date), "dd MMM yyyy") : format(new Date(tx.created_at), "dd MMM yyyy")}
                    </TableCell>
                    <TableCell className="text-xs font-medium">
                      {tx.transaction_types?.name || "—"}
                    </TableCell>
                    <TableCell className="text-xs max-w-[140px] truncate" title={accountLabel}>
                      {accountLabel || "—"}
                    </TableCell>
                    <TableCell className={`text-xs ${isMultiRow ? "border-l-2 border-primary/40 pl-2" : ""}`}>
                      {tx.pools?.name || "—"}
                    </TableCell>
                    <TableCell className="text-xs text-right font-mono">
                      {Number(tx.amount) > 0 ? formatCurrency(Number(tx.amount)) : "—"}
                    </TableCell>
                    <TableCell className="text-xs text-right font-mono text-muted-foreground">
                      {Number(tx.fee_amount) > 0 ? formatCurrency(Number(tx.fee_amount)) : "—"}
                    </TableCell>
                    <TableCell className="text-xs text-right font-mono font-semibold">
                      {formatCurrency(Number(tx.net_amount))}
                    </TableCell>
                    <TableCell className="text-xs text-right font-mono">
                      {formatCurrency(Number(tx.unit_price))}
                    </TableCell>
                    <TableCell className="text-xs text-right font-mono">
                      {Number(tx.units).toFixed(4)}
                    </TableCell>
                    <TableCell className="text-xs capitalize">
                      {(tx.payment_method || "").replace(/_/g, " ")}
                    </TableCell>
                    <TableCell>
                      {getStatusBadge(tx.status)}
                      {tx.status === "declined" && tx.declined_reason && (
                        <p className="text-[10px] text-destructive mt-0.5 max-w-[120px] truncate" title={tx.declined_reason}>
                          {tx.declined_reason}
                        </p>
                      )}
                    </TableCell>
                    {isAdmin && (
                      <TableCell className="p-1">
                        {(canRollback(tx.status) || canDelete(tx.status)) && (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-7 w-7">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-48">
                              {canRollback(tx.status) && (
                                <DropdownMenuItem
                                  className="text-warning focus:text-warning gap-2"
                                  onClick={() => setConfirmAction({ type: "rollback", txn: tx })}
                                >
                                  <RotateCcw className="h-3.5 w-3.5" />
                                  Roll Back Transaction
                                </DropdownMenuItem>
                              )}
                              {canRollback(tx.status) && canDelete(tx.status) && <DropdownMenuSeparator />}
                              {canDelete(tx.status) && (
                                <DropdownMenuItem
                                  className="text-destructive focus:text-destructive gap-2"
                                  onClick={() => setConfirmAction({ type: "delete", txn: tx })}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                  Delete Transaction
                                </DropdownMenuItem>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
        </TabsContent>

        {/* ─── Admin Stock Transactions Tab ─── */}
        <TabsContent value="stock">
          {loadingStock ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : adminStockTxns.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <Package className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p className="font-medium">No admin stock transactions yet</p>
              <p className="text-sm mt-1">Use "New Stock Transaction" to record a purchase, sale or adjustment</p>
            </div>
          ) : (
            <div className="rounded-xl border bg-card overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/30">
                    <TableHead className="text-xs">Date</TableHead>
                    <TableHead className="text-xs">Type</TableHead>
                    <TableHead className="text-xs">Reference</TableHead>
                    <TableHead className="text-xs text-right">Excl. VAT</TableHead>
                    <TableHead className="text-xs text-right">VAT</TableHead>
                    <TableHead className="text-xs text-right">Total Invoice</TableHead>
                    <TableHead className="text-xs">Status</TableHead>
                    <TableHead className="text-xs w-36">Documents</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {adminStockTxns.map((tx: any) => {
                    const typeIcons: Record<string, any> = {
                      STOCK_PURCHASES: ShoppingCart,
                      STOCK_SALES: TrendingDown,
                      STOCK_ADJUSTMENTS: SlidersHorizontal,
                    };
                    const typeLabels: Record<string, string> = {
                      STOCK_PURCHASES: "Stock Purchase",
                      STOCK_SALES: "Stock Sale",
                      STOCK_ADJUSTMENTS: "Stock Adjustment",
                    };
                    const stockStatusConfig: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
                      pending: { label: "Pending", variant: "outline" },
                      vault_confirmed: { label: "Vault Confirmed", variant: "secondary" },
                      approved: { label: "Approved", variant: "default" },
                      declined: { label: "Declined", variant: "destructive" },
                    };
                    const Icon = typeIcons[tx.transaction_type_code] ?? Package;
                    const statusCfg = stockStatusConfig[tx.status] ?? stockStatusConfig.pending;
                    const isAdj = tx.transaction_type_code === "STOCK_ADJUSTMENTS";
                    return (
                      <TableRow key={tx.id} className="text-sm">
                        <TableCell className="text-xs font-mono">
                          {format(new Date(tx.transaction_date), "dd MMM yyyy")}
                        </TableCell>
                        <TableCell className="text-xs font-medium">
                          <span className="flex items-center gap-1.5">
                            <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                            {typeLabels[tx.transaction_type_code] ?? tx.transaction_type_code}
                          </span>
                        </TableCell>
                        <TableCell className="text-xs font-mono text-muted-foreground">
                          {tx.reference || "—"}
                        </TableCell>
                        <TableCell className="text-xs text-right font-mono">
                          {isAdj ? "—" : formatCurrency(Number(tx.total_excl_vat))}
                        </TableCell>
                        <TableCell className="text-xs text-right font-mono text-muted-foreground">
                          {isAdj ? "—" : (Number(tx.total_vat) > 0 ? formatCurrency(Number(tx.total_vat)) : "—")}
                        </TableCell>
                        <TableCell className="text-xs text-right font-mono font-semibold">
                          {isAdj ? "—" : formatCurrency(Number(tx.total_invoice_amount))}
                        </TableCell>
                        <TableCell>
                          <Badge variant={statusCfg.variant} className="text-[10px]">
                            {statusCfg.label}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {(tx.status === "approved" || tx.status === "vault_confirmed") &&
                            tx.transaction_type_code !== "STOCK_ADJUSTMENTS" && (
                            <StockDocumentActions txn={tx} compact />
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>
      </Tabs>

      <NewTransactionDialog open={dialogOpen} onOpenChange={setDialogOpen} />
      <AdminStockTransactionDialog open={stockDialogOpen} onOpenChange={setStockDialogOpen} />

      {/* Confirmation Dialog */}
      <AlertDialog open={!!confirmAction} onOpenChange={(open) => !open && setConfirmAction(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmAction?.type === "rollback" ? "Roll Back Transaction?" : "Delete Transaction?"}
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              {confirmAction?.type === "rollback" ? (
                <>
                  <span className="block">
                    This will <strong>deactivate all ledger entries</strong> (cashflow transactions, unit transactions, stock transactions) linked to this transaction. The transaction will be marked as <strong>Rolled Back</strong>.
                  </span>
                  <span className="block text-destructive font-medium">
                    <span className="inline-flex items-center gap-1.5">
                      <AlertTriangle className="h-4 w-4" />
                      This does not reverse member pool holdings automatically. Please verify balances after rollback.
                    </span>
                  </span>
                </>
              ) : (
                <span>
                  This will <strong>permanently delete</strong> this pending transaction. This action cannot be undone.
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirm}
              disabled={isPending}
              className={confirmAction?.type === "rollback" ? "bg-primary hover:bg-primary/90" : "bg-destructive hover:bg-destructive/90"}
            >
              {isPending && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}
              {confirmAction?.type === "rollback" ? "Yes, Roll Back" : "Yes, Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Transactions;
