import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency } from "@/lib/formatCurrency";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

interface PoolItemsPricesProps {
  tenantId: string;
  poolIds: string[];
  effectiveDate: string;
  currencySymbol: string;
}

const PoolItemsPrices = ({ tenantId, poolIds, effectiveDate, currencySymbol }: PoolItemsPricesProps) => {
  // Fetch items for the pools the member has exposure to
  const { data: items = [] } = useQuery({
    queryKey: ["pool_items", tenantId, poolIds],
    queryFn: async () => {
      if (poolIds.length === 0) return [];
      const { data, error } = await (supabase as any)
        .from("items")
        .select("id, item_code, description, pool_id, margin_percentage, sell_margin_percentage, is_stock_item, use_fixed_price, pools (name, icon_url)")
        .eq("tenant_id", tenantId)
        .eq("is_active", true)
        .eq("is_deleted", false)
        .in("pool_id", poolIds)
        .order("description");
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!tenantId && poolIds.length > 0,
  });

  // Fetch latest stock prices for items on the selected date
  const itemIds = items.map((i: any) => i.id);
  const { data: stockPrices = [] } = useQuery({
    queryKey: ["item_stock_prices", tenantId, effectiveDate, itemIds],
    queryFn: async () => {
      if (itemIds.length === 0) return [];
      const { data, error } = await (supabase as any)
        .from("daily_stock_prices")
        .select("item_id, buy_price_incl_vat, cost_incl_vat, price_date")
        .eq("tenant_id", tenantId)
        .eq("price_date", effectiveDate)
        .in("item_id", itemIds);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!tenantId && !!effectiveDate && itemIds.length > 0,
  });

  if (items.length === 0) return null;

  const priceByItem: Record<string, { buy: number; sell: number }> = {};
  for (const sp of stockPrices) {
    priceByItem[sp.item_id] = {
      buy: Number(sp.buy_price_incl_vat),
      sell: Number(sp.cost_incl_vat),
    };
  }

  // Group items by pool
  const poolGroups: Record<string, { poolName: string; iconUrl: string | null; items: any[] }> = {};
  for (const item of items) {
    const pid = item.pool_id;
    if (!poolGroups[pid]) {
      poolGroups[pid] = {
        poolName: item.pools?.name ?? "Unknown",
        iconUrl: item.pools?.icon_url ?? null,
        items: [],
      };
    }
    poolGroups[pid].items.push(item);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Items & Prices</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Item</TableHead>
              <TableHead>Pool</TableHead>
              <TableHead className="text-right">Buy Price</TableHead>
              <TableHead className="text-right">Sell Price</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {Object.entries(poolGroups).map(([poolId, group]) =>
              group.items.map((item: any) => {
                const price = priceByItem[item.id];
                return (
                  <TableRow key={item.id}>
                    <TableCell>
                      <div>
                        <span className="font-medium">{item.description}</span>
                        <span className="ml-2 text-xs text-muted-foreground">({item.item_code})</span>
                      </div>
                      {item.is_stock_item && (
                        <Badge variant="outline" className="mt-1 text-xs">Stock</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        {group.iconUrl && (
                          <img src={group.iconUrl} alt={group.poolName} className="h-5 w-5 rounded object-cover shrink-0" />
                        )}
                        <span className="text-sm">{group.poolName}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {price ? formatCurrency(price.buy, currencySymbol) : "—"}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {price ? formatCurrency(price.sell, currencySymbol) : "—"}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
};

export default PoolItemsPrices;
