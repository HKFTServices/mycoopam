import { useState, useMemo, useEffect, Fragment } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/contexts/TenantContext";
import { format } from "date-fns";
import { CalendarIcon, Loader2, Save, RefreshCw, ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/formatCurrency";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { MobileTableHint } from "@/components/ui/mobile-table-hint";

type Pool = {
  id: string;
  name: string;
  is_active: boolean;
  fixed_unit_price: number;
  open_unit_price: number;
  icon_url: string | null;
  cash_control_account_id: string | null;
  vat_control_account_id: string | null;
  loan_control_account_id: string | null;
};

type StockItemDetail = {
  itemId: string;
  itemCode: string;
  description: string;
  quantity: number;
  costPrice: number;
  buyPrice: number;
  sellPrice: number;
  totalCost: number;
  totalBuy: number;
  totalSell: number;
};

type PoolRow = {
  pool: Pool;
  totalStockCost: number;
  totalStockBuy: number;
  totalStockSell: number;
  cashControl: number;
  vatControl: number;
  loanControl: number;
  memberInterestSell: number;
  memberInterestBuy: number;
  totalUnits: number;
  unitPriceSell: number;
  unitPriceBuy: number;
  stockItems: StockItemDetail[];
};

const DailyPoolPrices = () => {
  const { currentTenant } = useTenant();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const initialDate = searchParams.get("date");
  const [priceDate, setPriceDate] = useState<Date>(
    initialDate ? new Date(initialDate + "T00:00:00") : new Date()
  );
  const [isSaving, setIsSaving] = useState(false);
  const [expandedPools, setExpandedPools] = useState<Record<string, boolean>>({});
  const dateStr = format(priceDate, "yyyy-MM-dd");

  const togglePool = (poolId: string) => {
    setExpandedPools((prev) => ({ ...prev, [poolId]: !prev[poolId] }));
  };

  // Fetch tenant config for currency symbol
  const { data: tenantConfig } = useQuery({
    queryKey: ["tenant_configuration", currentTenant?.id],
    queryFn: async () => {
      if (!currentTenant) return null;
      const { data, error } = await (supabase as any)
        .from("tenant_configuration")
        .select("currency_symbol")
        .eq("tenant_id", currentTenant.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!currentTenant,
  });
  const sym = tenantConfig?.currency_symbol ?? "R";

  // Fetch active pools
  const { data: pools = [], isLoading: poolsLoading } = useQuery({
    queryKey: ["pools_full", currentTenant?.id],
    queryFn: async () => {
      if (!currentTenant) return [];
      const { data, error } = await (supabase as any)
        .from("pools")
        .select("id, name, is_active, fixed_unit_price, open_unit_price, icon_url, cash_control_account_id, vat_control_account_id, loan_control_account_id")
        .eq("tenant_id", currentTenant.id)
        .eq("is_deleted", false)
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return data as Pool[];
    },
    enabled: !!currentTenant,
  });

  // Fetch daily stock prices for the selected date
  const { data: stockPrices = [] } = useQuery({
    queryKey: ["daily_stock_prices_pool", currentTenant?.id, dateStr],
    queryFn: async () => {
      if (!currentTenant) return [];
      const { data, error } = await (supabase as any)
        .from("daily_stock_prices")
        .select("item_id, cost_excl_vat, buy_price_excl_vat")
        .eq("tenant_id", currentTenant.id)
        .eq("price_date", dateStr);
      if (error) throw error;
      return data as { item_id: string; cost_excl_vat: number; buy_price_excl_vat: number }[];
    },
    enabled: !!currentTenant,
  });

  // Fetch items with details to map item_id -> pool_id and show in expansion
  const { data: items = [] } = useQuery({
    queryKey: ["items_pool_map_detail", currentTenant?.id],
    queryFn: async () => {
      if (!currentTenant) return [];
      const { data, error } = await (supabase as any)
        .from("items")
        .select("id, pool_id, item_code, description, sell_margin_percentage")
        .eq("tenant_id", currentTenant.id)
        .eq("is_deleted", false)
        .eq("is_active", true)
        .eq("is_stock_item", true)
        .order("item_code");
      if (error) throw error;
      return data as { id: string; pool_id: string; item_code: string; description: string; sell_margin_percentage: number }[];
    },
    enabled: !!currentTenant,
  });

  // Fetch stock quantities per item via server-side aggregation (filtered by selected date)
  const { data: stockQuantities = {} } = useQuery({
    queryKey: ["stock_quantities", currentTenant?.id, dateStr],
    queryFn: async () => {
      if (!currentTenant) return {};
      const { data, error } = await (supabase as any)
        .rpc("get_stock_quantities", { p_tenant_id: currentTenant.id, p_up_to_date: dateStr });
      if (error) throw error;
      const qtys: Record<string, number> = {};
      for (const row of data || []) {
        if (row.item_id) qtys[row.item_id] = Number(row.total_quantity);
      }
      return qtys;
    },
    enabled: !!currentTenant,
  });

  // Fetch control account balances from CFT records (filtered by selected date)
  const { data: journalBalances = {} } = useQuery({
    queryKey: ["cft_control_balances", currentTenant?.id, dateStr],
    queryFn: async () => {
      if (!currentTenant) return {};
      const { data, error } = await (supabase as any)
        .rpc("get_cft_control_balances", { p_tenant_id: currentTenant.id, p_up_to_date: dateStr });
      if (error) throw error;
      const balances: Record<string, number> = {};
      for (const row of data || []) {
        if (row.control_account_id) {
          balances[row.control_account_id] = (balances[row.control_account_id] || 0) + Number(row.balance);
        }
      }
      return balances;
    },
    enabled: !!currentTenant,
  });

  // Fetch total units per pool via server-side aggregation (avoids row limits)
  const { data: unitsByPool = {} } = useQuery({
    queryKey: ["pool_units", currentTenant?.id, dateStr],
    queryFn: async () => {
      if (!currentTenant) return {};
      const { data, error } = await (supabase as any)
        .rpc("get_pool_units", { p_tenant_id: currentTenant.id, p_up_to_date: dateStr });
      if (error) throw error;

      const units: Record<string, number> = {};
      for (const row of data || []) {
        if (row.pool_id) {
          units[row.pool_id] = Number(row.total_units);
        }
      }
      return units;
    },
    enabled: !!currentTenant,
  });

  // Existing pool prices for the date
  const { data: existingPoolPrices = [] } = useQuery({
    queryKey: ["daily_pool_prices", currentTenant?.id, dateStr],
    queryFn: async () => {
      if (!currentTenant) return [];
      const { data, error } = await (supabase as any)
        .from("daily_pool_prices")
        .select("*")
        .eq("tenant_id", currentTenant.id)
        .eq("totals_date", dateStr);
      if (error) throw error;
      return data as any[];
    },
    enabled: !!currentTenant,
  });

  const existingMap = Object.fromEntries(
    existingPoolPrices.map((p: any) => [p.pool_id, p])
  );

  // Determine if we have saved data for this date
  const hasSavedPoolPrices = existingPoolPrices.length > 0;

  // Build pool rows - use saved data when available, otherwise calculate live
  const poolRows: PoolRow[] = useMemo(() => {
    const itemPoolMap: Record<string, string> = {};
    const itemDetailsMap: Record<string, { item_code: string; description: string; sell_margin_percentage: number }> = {};
    items.forEach((i) => {
      itemPoolMap[i.id] = i.pool_id;
      itemDetailsMap[i.id] = { item_code: i.item_code, description: i.description, sell_margin_percentage: i.sell_margin_percentage ?? 0 };
    });

    // Build stock price lookup
    const stockPriceMap: Record<string, { cost: number; buy: number }> = {};
    stockPrices.forEach((sp) => {
      stockPriceMap[sp.item_id] = { cost: Number(sp.cost_excl_vat), buy: Number(sp.buy_price_excl_vat) };
    });

    // Group items by pool
    const itemsByPool: Record<string, string[]> = {};
    items.forEach((i) => {
      if (!itemsByPool[i.pool_id]) itemsByPool[i.pool_id] = [];
      itemsByPool[i.pool_id].push(i.id);
    });

    const balances = journalBalances as Record<string, number>;
    const qtys = stockQuantities as Record<string, number>;

    return pools.map((pool) => {
      const poolItemIds = itemsByPool[pool.id] || [];
      const stockItems: StockItemDetail[] = poolItemIds.map((itemId) => {
        const details = itemDetailsMap[itemId] || { item_code: "?", description: "?", sell_margin_percentage: 0 };
        const prices = stockPriceMap[itemId] || { cost: 0, buy: 0 };
        const quantity = qtys[itemId] || 0;
        const sellPrice = prices.cost * (1 - details.sell_margin_percentage / 100);
        return {
          itemId,
          itemCode: details.item_code,
          description: details.description,
          quantity,
          costPrice: prices.cost,
          buyPrice: prices.buy,
          sellPrice,
          totalCost: prices.cost * quantity,
          totalBuy: prices.buy * quantity,
          totalSell: sellPrice * quantity,
        };
      });

      // Always calculate control balances live from CFT data
      const cashControl = pool.cash_control_account_id ? (balances[pool.cash_control_account_id] || 0) : 0;
      const vatControl = pool.vat_control_account_id ? (balances[pool.vat_control_account_id] || 0) : 0;
      const loanControl = pool.loan_control_account_id ? (balances[pool.loan_control_account_id] || 0) : 0;

      // If saved data exists for this pool+date, use saved stock/unit values but live control balances
      const saved = existingMap[pool.id];
      if (saved) {
        const totalStockCost = stockItems.reduce((s, i) => s + i.totalCost, 0);
        const totalStockBuy = stockItems.reduce((s, i) => s + i.totalBuy, 0);
        const totalStockSell = stockItems.reduce((s, i) => s + i.totalSell, 0);
        const totalUnits = (unitsByPool as Record<string, number>)[pool.id] || 0;
        const memberInterestSell = totalStockSell + cashControl + vatControl + loanControl;
        const memberInterestBuy = totalStockBuy + cashControl + vatControl + loanControl;
        const isFixedPrice = pool.fixed_unit_price != null && pool.fixed_unit_price > 0;
        const openPrice = Number(pool.open_unit_price) || 1;
        const unitPriceSell = isFixedPrice ? pool.fixed_unit_price : (totalUnits > 0 ? memberInterestSell / totalUnits : openPrice);
        const unitPriceBuy = isFixedPrice ? pool.fixed_unit_price : (totalUnits > 0 ? memberInterestBuy / totalUnits : openPrice);
        return {
          pool,
          totalStockCost,
          totalStockBuy,
          totalStockSell,
          cashControl,
          vatControl,
          loanControl,
          memberInterestSell,
          memberInterestBuy,
          totalUnits,
          unitPriceSell,
          unitPriceBuy,
          stockItems,
        };
      }

      const totalStockCost = stockItems.reduce((s, i) => s + i.totalCost, 0);
      const totalStockBuy = stockItems.reduce((s, i) => s + i.totalBuy, 0);
      const totalStockSell = stockItems.reduce((s, i) => s + i.totalSell, 0);
      const memberInterestSell = totalStockSell + cashControl + vatControl + loanControl;
      const memberInterestBuy = totalStockBuy + cashControl + vatControl + loanControl;
      const totalUnits = (unitsByPool as Record<string, number>)[pool.id] || 0;
      const isFixedPrice = pool.fixed_unit_price != null && pool.fixed_unit_price > 0;
      const openPrice = Number(pool.open_unit_price) || 1;
      const unitPriceSell = isFixedPrice ? pool.fixed_unit_price : (totalUnits > 0 ? memberInterestSell / totalUnits : openPrice);
      const unitPriceBuy = isFixedPrice ? pool.fixed_unit_price : (totalUnits > 0 ? memberInterestBuy / totalUnits : openPrice);

      return {
        pool,
        totalStockCost,
        totalStockBuy,
        totalStockSell,
        cashControl,
        vatControl,
        loanControl,
        memberInterestSell,
        memberInterestBuy,
        totalUnits,
        unitPriceSell,
        unitPriceBuy,
        stockItems,
      };
    });
  }, [pools, stockPrices, items, journalBalances, unitsByPool, stockQuantities, existingMap]);

  // Pool color map
  const poolColorMap: Record<string, string> = useMemo(() => {
    const colors: Record<string, string> = {};
    const palette = [
      { keywords: ["gold"], color: "hsl(43 96% 56% / 0.10)" },
      { keywords: ["silver"], color: "hsl(210 9% 72% / 0.12)" },
      { keywords: ["platinum"], color: "hsl(220 7% 55% / 0.10)" },
      { keywords: ["crypto"], color: "rgba(99, 102, 241, 0.08)" },
      { keywords: ["health"], color: "rgba(34, 197, 94, 0.08)" },
      { keywords: ["funeral"], color: "rgba(168, 85, 247, 0.08)" },
      { keywords: ["reserve"], color: "rgba(14, 165, 233, 0.08)" },
      { keywords: ["admin"], color: "rgba(251, 146, 60, 0.08)" },
      { keywords: ["asset"], color: "rgba(234, 179, 8, 0.08)" },
      { keywords: ["member"], color: "rgba(20, 184, 166, 0.08)" },
    ];
    pools.forEach((p) => {
      const name = p.name.toLowerCase();
      const match = palette.find((c) => c.keywords.some((k) => name.includes(k)));
      if (match) colors[p.id] = match.color;
    });
    return colors;
  }, [pools]);

  const handleSave = async () => {
    if (!currentTenant || poolRows.length === 0) return;
    setIsSaving(true);
    try {
      const records = poolRows.map((row) => ({
        tenant_id: currentTenant.id,
        pool_id: row.pool.id,
        totals_date: dateStr,
        total_stock: row.totalStockCost,
        total_units: row.totalUnits,
        cash_control: row.cashControl,
        vat_control: row.vatControl,
        loan_control: row.loanControl,
        member_interest_sell: row.memberInterestSell,
        member_interest_buy: row.memberInterestBuy,
        unit_price_sell: Math.round(row.unitPriceSell * 100) / 100,
        unit_price_buy: Math.round(row.unitPriceBuy * 100) / 100,
      }));

      // Delete existing for this date, then insert
      await (supabase as any)
        .from("daily_pool_prices")
        .delete()
        .eq("tenant_id", currentTenant.id)
        .eq("totals_date", dateStr);

      const { error } = await (supabase as any)
        .from("daily_pool_prices")
        .insert(records);

      if (error) throw error;

      toast.success(`Pool prices saved for ${dateStr}`);
      queryClient.invalidateQueries({ queryKey: ["daily_pool_prices", currentTenant.id, dateStr] });
    } catch (err: any) {
      console.error("Error saving pool prices:", err);
      toast.error("Failed to save: " + (err.message || "Unknown error"));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-4 sm:space-y-6 animate-fade-in">
      <div>
        <h1 className="text-lg sm:text-2xl font-bold tracking-tight">Pool Price Updates</h1>
        <p className="text-muted-foreground text-xs sm:text-sm mt-0.5">
          Daily pool valuations calculated from stock prices and control account balances.
        </p>
      </div>

      <MobileTableHint />

      {/* Date Picker */}
      <div className="flex items-center gap-3">
        <span className="text-sm font-medium">Price Date:</span>
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              className={cn(
                "w-[220px] justify-start text-left font-normal",
                !priceDate && "text-muted-foreground"
              )}
            >
              <CalendarIcon className="mr-2 h-4 w-4" />
              {format(priceDate, "PPP")}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              selected={priceDate}
              onSelect={(d) => d && setPriceDate(d)}
              initialFocus
              className={cn("p-3 pointer-events-auto")}
            />
          </PopoverContent>
        </Popover>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            Pool Valuations
            <Badge variant="secondary" className="ml-1">{poolRows.length}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Pool</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Stock Value</TableHead>
                  <TableHead className="text-right">Cash Control</TableHead>
                  <TableHead className="text-right">VAT Control</TableHead>
                  <TableHead className="text-right">Loan Control</TableHead>
                  <TableHead className="text-right font-semibold">Member Interest</TableHead>
                  <TableHead className="text-right">Total Units</TableHead>
                  <TableHead className="text-right font-semibold">Unit Price</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {poolsLoading ? (
                  <TableRow>
                    <TableCell colSpan={10} className="text-center py-8 text-muted-foreground">
                      <Loader2 className="h-5 w-5 animate-spin inline mr-2" />Loading…
                    </TableCell>
                  </TableRow>
                ) : poolRows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={10} className="text-center py-8 text-muted-foreground">
                      No active pools found.
                    </TableCell>
                  </TableRow>
                ) : (
                  poolRows.map((row) => {
                    const isAdmin = row.pool.name.toLowerCase().includes("admin");
                    return (
                    <Fragment key={row.pool.id}>
                      {/* Sell Row */}
                      <TableRow
                        className="cursor-pointer hover:bg-muted/50 border-b-0"
                        style={{ backgroundColor: poolColorMap[row.pool.id] || undefined }}
                        onClick={() => togglePool(row.pool.id)}
                      >
                        <TableCell className="font-medium" rowSpan={2}>
                          <span className="inline-flex items-center gap-2">
                            {expandedPools[row.pool.id] ? (
                              <ChevronDown className="h-4 w-4" />
                            ) : (
                              <ChevronRight className="h-4 w-4" />
                            )}
                            {row.pool.icon_url ? (
                              <img src={row.pool.icon_url} alt={row.pool.name} className="h-6 w-6 rounded object-cover" />
                            ) : null}
                            {row.pool.name}
                          </span>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs">Sell</Badge>
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {formatCurrency(row.totalStockSell, sym)}
                        </TableCell>
                        <TableCell className="text-right font-mono" rowSpan={2}>
                          {formatCurrency(row.cashControl, sym)}
                        </TableCell>
                        <TableCell className="text-right font-mono" rowSpan={2}>
                          {isAdmin ? "-" : formatCurrency(row.vatControl, sym)}
                        </TableCell>
                        <TableCell className="text-right font-mono" rowSpan={2}>
                          {isAdmin ? "-" : formatCurrency(row.loanControl, sym)}
                        </TableCell>
                        <TableCell className="text-right font-mono font-semibold">
                          {formatCurrency(row.memberInterestSell, sym)}
                        </TableCell>
                        <TableCell className="text-right font-mono" rowSpan={2}>
                          {row.totalUnits.toFixed(4)}
                        </TableCell>
                        <TableCell className="text-right font-mono font-semibold">
                          {formatCurrency(row.unitPriceSell, sym, 4)}
                        </TableCell>
                        <TableCell rowSpan={2}>
                          {existingMap[row.pool.id] ? (
                            <Badge variant="default" className="text-xs">Saved</Badge>
                          ) : (
                            <Badge variant="outline" className="text-xs text-muted-foreground">Pending</Badge>
                          )}
                        </TableCell>
                      </TableRow>
                      {/* Buy Row */}
                      <TableRow
                        className="cursor-pointer hover:bg-muted/50"
                        style={{ backgroundColor: poolColorMap[row.pool.id] || undefined }}
                        onClick={() => togglePool(row.pool.id)}
                      >
                        <TableCell>
                          <Badge variant="secondary" className="text-xs">Buy</Badge>
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {formatCurrency(row.totalStockBuy, sym)}
                        </TableCell>
                        <TableCell className="text-right font-mono font-semibold">
                          {formatCurrency(row.memberInterestBuy, sym)}
                        </TableCell>
                        <TableCell className="text-right font-mono font-semibold">
                          {formatCurrency(row.unitPriceBuy, sym, 4)}
                        </TableCell>
                      </TableRow>
                      {/* Expanded stock items */}
                      {expandedPools[row.pool.id] && row.stockItems.length > 0 && (
                        <>
                          <TableRow className="bg-muted/30">
                            <TableCell className="pl-10 text-xs font-semibold text-muted-foreground">Code</TableCell>
                            <TableCell className="text-xs font-semibold text-muted-foreground">Description</TableCell>
                            <TableCell className="text-right text-xs font-semibold text-muted-foreground">Qty</TableCell>
                            <TableCell className="text-right text-xs font-semibold text-muted-foreground">Cost Price</TableCell>
                            <TableCell className="text-right text-xs font-semibold text-muted-foreground">Buy Price</TableCell>
                            <TableCell className="text-right text-xs font-semibold text-muted-foreground">Sell Price</TableCell>
                            <TableCell className="text-right text-xs font-semibold text-muted-foreground">Total Buy</TableCell>
                            <TableCell className="text-right text-xs font-semibold text-muted-foreground">Total Sell</TableCell>
                            <TableCell colSpan={2} />
                          </TableRow>
                          {row.stockItems.map((si) => (
                            <TableRow key={si.itemId} className="bg-muted/20">
                              <TableCell className="pl-10 font-mono text-xs">{si.itemCode}</TableCell>
                              <TableCell className="text-xs">{si.description}</TableCell>
                              <TableCell className="text-right font-mono text-xs">{si.quantity.toFixed(4)}</TableCell>
                              <TableCell className="text-right font-mono text-xs">{formatCurrency(si.costPrice, sym)}</TableCell>
                              <TableCell className="text-right font-mono text-xs">{formatCurrency(si.buyPrice, sym)}</TableCell>
                              <TableCell className="text-right font-mono text-xs">{formatCurrency(si.sellPrice, sym)}</TableCell>
                              <TableCell className="text-right font-mono text-xs">{formatCurrency(si.totalBuy, sym)}</TableCell>
                              <TableCell className="text-right font-mono text-xs">{formatCurrency(si.totalSell, sym)}</TableCell>
                              <TableCell colSpan={2} />
                            </TableRow>
                          ))}
                          <TableRow className="bg-muted/30 border-b-2">
                            <TableCell className="pl-10 text-xs font-bold" colSpan={2}>Total Stock</TableCell>
                            <TableCell className="text-right font-mono text-xs font-bold">
                              {row.stockItems.reduce((s, i) => s + i.quantity, 0).toFixed(4)}
                            </TableCell>
                            <TableCell colSpan={2} />
                            <TableCell />
                            <TableCell className="text-right font-mono text-xs font-bold">{formatCurrency(row.totalStockBuy, sym)}</TableCell>
                            <TableCell className="text-right font-mono text-xs font-bold">{formatCurrency(row.totalStockSell, sym)}</TableCell>
                            <TableCell colSpan={2} />
                          </TableRow>
                        </>
                      )}
                    </Fragment>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button
          onClick={handleSave}
          disabled={isSaving || poolRows.length === 0}
          size="lg"
        >
          {isSaving ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Save className="mr-2 h-4 w-4" />
          )}
          {isSaving ? "Saving…" : "Update Pool Prices"}
        </Button>
      </div>
    </div>
  );
};

export default DailyPoolPrices;
