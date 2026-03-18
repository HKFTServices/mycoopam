import { formatCurrency } from "@/lib/formatCurrency";

interface PoolPrice {
  pool_id: string;
  unit_price_buy: number;
  unit_price_sell: number;
  pools?: { name?: string; icon_url?: string | null } | null;
}

interface PoolUnitPricesProps {
  poolPrices: PoolPrice[];
  exposedPoolIds: string[];
  currencySymbol: string;
}

const PoolUnitPrices = ({ poolPrices, exposedPoolIds, currencySymbol }: PoolUnitPricesProps) => {
  const filtered = poolPrices.filter((pp) => exposedPoolIds.includes(pp.pool_id));

  if (filtered.length === 0) return null;

  return (
    <div className="text-sm text-muted-foreground">
      <span className="font-medium text-foreground mr-2">Unit Prices:</span>
      {filtered.map((pp, idx) => (
        <span key={pp.pool_id}>
          {pp.pools?.name ?? "Unknown"}{" "}
          <span className="font-mono">{formatCurrency(Number(pp.unit_price_sell), currencySymbol)}</span>
          {idx < filtered.length - 1 && <span className="mx-2">·</span>}
        </span>
      ))}
    </div>
  );
};

export default PoolUnitPrices;
