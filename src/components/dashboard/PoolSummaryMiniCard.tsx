import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { Wallet, Users, ArrowUpRight } from "lucide-react";
import { PoolIcon } from "@/components/pools/PoolIcon";
import { formatCurrency } from "@/lib/formatCurrency";
import { getTierBadgeStyle, getTierColor, getTierKey } from "@/lib/tierColors";

export const PoolSummaryMiniCard = ({ pool, investorPct }: { pool: any; investorPct?: number | null }) => {
  const tierKey = getTierKey(pool?.name);
  const tierDot = getTierColor(pool?.name);
  const tierStyle = getTierBadgeStyle(pool?.name);

  const renderPoolName = () => {
    const name = String(pool?.name ?? "");
    if (!tierKey || !tierStyle) return <span className="truncate">{name}</span>;
    const re = new RegExp(`(${tierKey})`, "i");
    const parts = name.split(re);
    return (
      <span className="truncate">
        {parts.map((part, idx) => {
          const isTier = part.toLowerCase() === tierKey;
          return (
            <span
              key={`${part}-${idx}`}
              style={isTier ? { color: tierStyle.color } : undefined}
              className={isTier ? "font-semibold" : undefined}
            >
              {part}
            </span>
          );
        })}
      </span>
    );
  };

  return (
    <Card className="hover:bg-muted/30 transition-colors">
      <CardContent className="p-3 sm:p-4">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <PoolIcon name={pool.name} iconUrl={pool.iconUrl} size="sm" className="rounded-md" />
          <div className="min-w-0 flex-1">
            <p className="text-xs sm:text-sm font-semibold truncate flex items-center gap-1.5 sm:gap-2">
              {tierDot ? <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: tierDot }} /> : null}
              {renderPoolName()}
            </p>
            <div className="flex flex-wrap items-center gap-1 sm:gap-2">
              <Badge variant="outline" className="text-[9px] sm:text-[10px] gap-1 sm:gap-1.5 border-emerald-500/30 text-emerald-700 dark:text-emerald-300">
                <span className="relative flex h-1.5 w-1.5 sm:h-2 sm:w-2">
                  <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-75 animate-ping" />
                  <span className="relative inline-flex h-1.5 w-1.5 sm:h-2 sm:w-2 rounded-full bg-emerald-500" />
                </span>
                Live
              </Badge>
              <p className="text-[10px] sm:text-xs text-muted-foreground font-mono">{formatCurrency(pool.unitPrice, "R", 4)}/u</p>
            </div>
          </div>
        </div>

        <div className="mt-2 sm:mt-3 flex items-end justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[10px] sm:text-[11px] text-muted-foreground">Total value</p>
            <p className="text-xs sm:text-sm font-mono truncate">{formatCurrency(pool.totalValue)}</p>
          </div>
          <div className="flex flex-col items-end gap-1 shrink-0">
            <Badge variant="secondary" className="text-[9px] sm:text-[10px]">
              {Number(pool.totalUnits).toLocaleString("en-ZA", { maximumFractionDigits: 0 })} units
            </Badge>
            {typeof investorPct === "number" ? (
              <Badge variant="outline" className="text-[9px] sm:text-[10px] gap-1">
                <Users className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
                {Math.round(investorPct)}%
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
