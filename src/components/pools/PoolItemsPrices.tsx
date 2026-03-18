import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency } from "@/lib/formatCurrency";

interface PoolItemsPricesProps {
  tenantId: string;
  poolIds: string[];
  effectiveDate: string;
  currencySymbol: string;
}

const PoolItemsPrices = ({ tenantId, poolIds, effectiveDate, currencySymbol }: PoolItemsPricesProps) => {
  const { data: items = [] } = useQuery({
    queryKey: ["pool_items", tenantId, poolIds],
    queryFn: async () => {
      if (poolIds.length === 0) return [];
      const { data, error } = await (supabase as any)
        .from("items")
        .select("id, item_code, description, pool_id, is_stock_item, pools (name)")
        .eq("tenant_id", tenantId)
        .eq("is_active", true)
        .eq("is_deleted", false)
        .eq("is_stock_item", true)
        .in("pool_id", poolIds)
        .order("description");
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!tenantId && poolIds.length > 0,
  });

  const itemIds = items.map((i: any) => i.id);
  const { data: stockPrices = [] } = useQuery({
    queryKey: ["item_stock_prices", tenantId, effectiveDate, itemIds],
    queryFn: async () => {
      if (itemIds.length === 0) return [];
      const { data, error } = await (supabase as any)
        .from("daily_stock_prices")
        .select("item_id, cost_incl_vat, price_date")
        .eq("tenant_id", tenantId)
        .eq("price_date", effectiveDate)
        .in("item_id", itemIds);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!tenantId && !!effectiveDate && itemIds.length > 0,
  });

  if (items.length === 0) return null;

  const priceByItem: Record<string, number> = {};
  for (const sp of stockPrices) {
    priceByItem[sp.item_id] = Number(sp.cost_incl_vat);
  }

  return (
    <div className="text-sm text-muted-foreground">
      <span className="font-medium text-foreground mr-2">Stock Prices:</span>
      {items.map((item: any, idx: number) => {
        const price = priceByItem[item.id];
        return (
          <span key={item.id}>
            {item.description}{" "}
            <span className="font-mono">{price != null ? formatCurrency(price, currencySymbol) : "—"}</span>
            {idx < items.length - 1 && <span className="mx-2">·</span>}
          </span>
        );
      })}
    </div>
  );
};

export default PoolItemsPrices;
