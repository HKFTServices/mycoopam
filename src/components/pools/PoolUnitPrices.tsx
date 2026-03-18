import { formatCurrency } from "@/lib/formatCurrency";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

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
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Unit Prices</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Pool</TableHead>
              <TableHead className="text-right">Buy Price</TableHead>
              <TableHead className="text-right">Sell Price</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((pp) => (
              <TableRow key={pp.pool_id}>
                <TableCell>
                  <div className="flex items-center gap-2">
                    {pp.pools?.icon_url && (
                      <img src={pp.pools.icon_url} alt={pp.pools?.name ?? ""} className="h-5 w-5 rounded object-cover shrink-0" />
                    )}
                    <span className="font-medium">{pp.pools?.name ?? "Unknown"}</span>
                  </div>
                </TableCell>
                <TableCell className="text-right font-mono text-sm">
                  {formatCurrency(Number(pp.unit_price_buy), currencySymbol)}
                </TableCell>
                <TableCell className="text-right font-mono text-sm">
                  {formatCurrency(Number(pp.unit_price_sell), currencySymbol)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
};

export default PoolUnitPrices;
