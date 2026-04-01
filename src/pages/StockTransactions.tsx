import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Package, Plus, Loader2, ShoppingCart, TrendingDown, SlidersHorizontal } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { MobileTableHint } from "@/components/ui/mobile-table-hint";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useTenant } from "@/contexts/TenantContext";
import { formatCurrency } from "@/lib/formatCurrency";
import { format } from "date-fns";
import AdminStockTransactionDialog from "@/components/stock/AdminStockTransactionDialog";
import StockDocumentActions from "@/components/stock/StockDocumentActions";

const stockStatusConfig: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  pending: { label: "Pending", variant: "outline" },
  vault_confirmed: { label: "Vault Confirmed", variant: "secondary" },
  approved: { label: "Approved", variant: "default" },
  declined: { label: "Declined", variant: "destructive" },
};

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

const StockTransactions = () => {
  const isMobile = useIsMobile();
  const [stockDialogOpen, setStockDialogOpen] = useState(false);
  const { user } = useAuth();
  const { currentTenant } = useTenant();

  const { data: adminStockTxns = [], isLoading } = useQuery({
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
    enabled: !!currentTenant,
  });

  return (
    <div className="space-y-4 sm:space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3">
          <Package className="h-6 w-6 sm:h-8 sm:w-8 text-primary shrink-0" />
          <div>
            <h1 className="text-lg sm:text-2xl font-bold tracking-tight">Stock Transactions</h1>
            <p className="text-muted-foreground text-xs sm:text-sm mt-0.5">Manage stock purchases, sales and adjustments</p>
          </div>
        </div>
        <Button size={isMobile ? "sm" : "default"} onClick={() => setStockDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-1" />
          {isMobile ? "New Stock" : "New Stock Transaction"}
        </Button>
      </div>

      <MobileTableHint />

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : adminStockTxns.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Package className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p className="font-medium">No stock transactions yet</p>
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

      <AdminStockTransactionDialog open={stockDialogOpen} onOpenChange={setStockDialogOpen} />
    </div>
  );
};

export default StockTransactions;
