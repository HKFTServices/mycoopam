import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { Wallet, Users, ArrowUpRight } from "lucide-react";
import { PoolIcon } from "@/components/pools/PoolIcon";
import { formatCurrency } from "@/lib/formatCurrency";

export const PoolSummaryMiniCard = ({ pool, investorPct }: { pool: any; investorPct?: number | null }) => {
  return (
    <Card className="hover:bg-muted/30 transition-colors">
      <CardContent className="p-4">
        <div className="flex items-center gap-3 min-w-0">
          <PoolIcon name={pool.name} iconUrl={pool.iconUrl} size="sm" className="rounded-md" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold truncate">{pool.name}</p>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="text-[10px] gap-1.5 border-emerald-500/30 text-emerald-700 dark:text-emerald-300">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-75 animate-ping" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                </span>
                Live unit totals
              </Badge>
              <p className="text-xs text-muted-foreground font-mono">{formatCurrency(pool.unitPrice, "R", 4)}/unit</p>
              {pool.latestDate ? <Badge variant="outline" className="text-[10px]">{pool.latestDate}</Badge> : null}
            </div>
          </div>
        </div>

        <div className="mt-3 flex items-end justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] text-muted-foreground">Total value</p>
            <p className="text-sm font-mono truncate">{formatCurrency(pool.totalValue)}</p>
          </div>
          <div className="flex flex-col items-end gap-1 shrink-0">
            <Badge variant="secondary" className="text-[10px]">
              {Number(pool.totalUnits).toLocaleString("en-ZA", { maximumFractionDigits: 0 })} units
            </Badge>
            {typeof investorPct === "number" ? (
              <Badge variant="outline" className="text-[10px] gap-1">
                <Users className="h-3 w-3" />
                {Math.round(investorPct)}% investors
              </Badge>
            ) : null}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export const PoolSummariesCard = ({ pools }: { pools: any[] }) => {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <div>
          <div className="flex items-center gap-2">
            <Wallet className="h-4 w-4 text-primary" />
            <CardTitle className="text-sm">Pool summaries</CardTitle>
          </div>
          <CardDescription className="text-xs">Unit prices and total values</CardDescription>
        </div>
        <Button variant="outline" size="sm" asChild className="gap-2">
          <Link to="/dashboard/pools">
            View pools
            <ArrowUpRight className="h-4 w-4" />
          </Link>
        </Button>
      </CardHeader>
      <CardContent>
        {pools?.length ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {pools.slice(0, 6).map((p: any) => (
              <PoolSummaryMiniCard key={p.id} pool={p} />
            ))}
          </div>
        ) : (
          <div className="py-10 text-center text-sm text-muted-foreground">No pool data available.</div>
        )}
      </CardContent>
    </Card>
  );
};

export default PoolSummaryMiniCard;
