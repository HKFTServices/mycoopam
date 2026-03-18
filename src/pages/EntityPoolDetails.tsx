import { useQuery } from "@tanstack/react-query";
import { useSearchParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/contexts/TenantContext";
import { formatCurrency } from "@/lib/formatCurrency";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, ArrowLeft, CalendarIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { useState, useMemo } from "react";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from "recharts";

const COLORS = [
  "hsl(152, 68%, 36%)",
  "hsl(200, 70%, 50%)",
  "hsl(45, 85%, 55%)",
  "hsl(280, 60%, 55%)",
  "hsl(350, 65%, 55%)",
  "hsl(170, 55%, 45%)",
  "hsl(25, 75%, 55%)",
  "hsl(220, 65%, 55%)",
];

const EntityPoolDetails = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { currentTenant } = useTenant();
  const entityId = searchParams.get("entityId");

  // Fetch entity info
  const { data: entity } = useQuery({
    queryKey: ["entity_detail", entityId],
    queryFn: async () => {
      if (!entityId) return null;
      const { data, error } = await (supabase as any)
        .from("entities")
        .select("id, name, last_name, identity_number, registration_number, entity_categories (name)")
        .eq("id", entityId)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!entityId,
  });

  // Fetch entity accounts
  const { data: entityAccounts = [] } = useQuery({
    queryKey: ["entity_accounts_detail", entityId, currentTenant?.id],
    queryFn: async () => {
      if (!entityId || !currentTenant) return [];
      const { data, error } = await (supabase as any)
        .from("entity_accounts")
        .select("id, account_number, entity_account_types (name)")
        .eq("entity_id", entityId)
        .eq("tenant_id", currentTenant.id);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!entityId && !!currentTenant,
  });

  // Date picker — default to latest available date
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);

  // Fetch available dates
  const { data: availableDates = [] } = useQuery({
    queryKey: ["pool_price_dates", currentTenant?.id],
    queryFn: async () => {
      if (!currentTenant) return [];
      const { data, error } = await (supabase as any)
        .from("daily_pool_prices")
        .select("totals_date")
        .eq("tenant_id", currentTenant.id)
        .order("totals_date", { ascending: false })
        .limit(90);
      if (error) throw error;
      const unique = [...new Set((data ?? []).map((d: any) => d.totals_date))];
      return unique as string[];
    },
    enabled: !!currentTenant,
  });

  // Auto-select latest date
  const effectiveDate = selectedDate
    ? format(selectedDate, "yyyy-MM-dd")
    : availableDates[0] ?? null;

  // Fetch pool prices for the selected date
  const { data: poolPrices = [], isLoading: loadingPrices } = useQuery({
    queryKey: ["pool_prices_for_date", currentTenant?.id, effectiveDate],
    queryFn: async () => {
      if (!currentTenant || !effectiveDate) return [];
      const { data, error } = await (supabase as any)
        .from("daily_pool_prices")
        .select("pool_id, unit_price_buy, unit_price_sell, total_units, total_stock, cash_control, vat_control, loan_control, pools (name, icon_url)")
        .eq("tenant_id", currentTenant.id)
        .eq("totals_date", effectiveDate);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!currentTenant && !!effectiveDate,
  });

  // Fetch unit holdings per account per pool
  const { data: accountPoolUnits = [] } = useQuery({
    queryKey: ["account_pool_units_detail", currentTenant?.id, effectiveDate],
    queryFn: async () => {
      if (!currentTenant || !effectiveDate) return [];
      const { data, error } = await (supabase as any)
        .rpc("get_account_pool_units", { p_tenant_id: currentTenant.id, p_up_to_date: effectiveDate });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!currentTenant && !!effectiveDate,
  });

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

  // Build pool value data for this entity's accounts
  const entityAccountIds = new Set(entityAccounts.map((a: any) => a.id));

  const poolData = useMemo(() => {
    const priceByPool: Record<string, { buy: number; sell: number; name: string; iconUrl: string | null }> = {};
    for (const pp of poolPrices) {
      priceByPool[pp.pool_id] = {
        buy: Number(pp.unit_price_buy),
        sell: Number(pp.unit_price_sell),
        name: pp.pools?.name ?? "Unknown Pool",
        iconUrl: pp.pools?.icon_url ?? null,
      };
    }

    const poolMap: Record<string, { poolName: string; units: number; buyValue: number; sellValue: number; iconUrl: string | null }> = {};
    for (const row of accountPoolUnits) {
      if (!entityAccountIds.has(row.entity_account_id)) continue;
      const poolId = row.pool_id;
      const units = Number(row.total_units);
      const price = priceByPool[poolId];
      if (!price) continue;
      if (!poolMap[poolId]) {
        poolMap[poolId] = { poolName: price.name, units: 0, buyValue: 0, sellValue: 0, iconUrl: price.iconUrl };
      }
      poolMap[poolId].units += units;
      poolMap[poolId].buyValue += units * price.buy;
      poolMap[poolId].sellValue += units * price.sell;
    }
    return Object.entries(poolMap).map(([poolId, v]) => ({ poolId, ...v }));
  }, [accountPoolUnits, poolPrices, entityAccountIds]);

  const totalBuyValue = poolData.reduce((s, p) => s + p.buyValue, 0);
  const totalSellValue = poolData.reduce((s, p) => s + p.sellValue, 0);

  const pieData = poolData.map((p) => ({
    name: p.poolName,
    value: Math.round(p.buyValue * 100) / 100,
  }));

  const entityFullName = entity ? [entity.name, entity.last_name].filter(Boolean).join(" ") : "";
  const regOrId = entity?.registration_number || entity?.identity_number || "";
  const categoryName = entity?.entity_categories?.name || "";

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold tracking-tight">{entityFullName}</h1>
          <p className="text-muted-foreground text-sm">
            {categoryName && <span className="font-medium text-foreground">{categoryName} </span>}
            {regOrId && <>({regOrId})</>}
          </p>
        </div>
        {/* Date Picker */}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" className={cn("w-[200px] justify-start text-left font-normal", !effectiveDate && "text-muted-foreground")}>
              <CalendarIcon className="h-4 w-4 mr-2" />
              {effectiveDate ? format(new Date(effectiveDate + "T00:00:00"), "dd MMM yyyy") : "Select date"}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="end">
            <Calendar
              mode="single"
              selected={selectedDate ?? (availableDates[0] ? new Date(availableDates[0] + "T00:00:00") : undefined)}
              onSelect={setSelectedDate}
              disabled={(date) => {
                const ds = format(date, "yyyy-MM-dd");
                return !availableDates.includes(ds);
              }}
              className={cn("p-3 pointer-events-auto")}
              initialFocus
            />
          </PopoverContent>
        </Popover>
      </div>

      {/* Account Numbers */}
      <div className="flex flex-wrap gap-2">
        {entityAccounts.map((a: any) => (
          <div key={a.id} className="inline-flex items-center gap-1.5 rounded-lg border bg-card px-3 py-1.5 text-sm">
            <span className="text-muted-foreground">{a.entity_account_types?.name}:</span>
            <code className="font-mono font-medium">{a.account_number ?? "N/A"}</code>
          </div>
        ))}
      </div>

      {loadingPrices ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : poolData.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No pool holdings found for this entity.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Pie Chart */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Pool Allocation</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={110}
                    paddingAngle={3}
                    dataKey="value"
                    label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                    labelLine={false}
                  >
                    {pieData.map((_, idx) => (
                      <Cell key={idx} fill={COLORS[idx % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value: number) => formatCurrency(value, sym)} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Summary Cards */}
          <div className="space-y-4">
            <Card className="border-primary/30 bg-primary/5">
              <CardContent className="py-6 flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Total Buy Value</p>
                  <p className="text-3xl font-bold tracking-tight">{formatCurrency(totalBuyValue, sym)}</p>
                </div>
              </CardContent>
            </Card>
            <Card className="border-secondary/30 bg-secondary/20">
              <CardContent className="py-6 flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Total Sell Value</p>
                  <p className="text-3xl font-bold tracking-tight">{formatCurrency(totalSellValue, sym)}</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* Detailed Pool Breakdown */}
      {poolData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Pool Breakdown</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Pool</TableHead>
                  <TableHead className="text-right">Units</TableHead>
                  <TableHead className="text-right">Buy Price</TableHead>
                  <TableHead className="text-right">Buy Value</TableHead>
                  <TableHead className="text-right">Sell Price</TableHead>
                  <TableHead className="text-right">Sell Value</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {poolData.map((p, idx) => {
                  const price = poolPrices.find((pp: any) => pp.pool_id === p.poolId);
                  return (
                    <TableRow key={p.poolId}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: COLORS[idx % COLORS.length] }} />
                          {p.iconUrl ? (
                            <img src={p.iconUrl} alt={p.poolName} className="h-6 w-6 rounded object-cover shrink-0" />
                          ) : null}
                          <span className="font-medium">{p.poolName}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">{p.units.toLocaleString("en", { minimumFractionDigits: 2, maximumFractionDigits: 4 })}</TableCell>
                      <TableCell className="text-right font-mono text-sm">{formatCurrency(price ? Number(price.unit_price_buy) : 0, sym)}</TableCell>
                      <TableCell className="text-right font-mono text-sm font-semibold">{formatCurrency(p.buyValue, sym)}</TableCell>
                      <TableCell className="text-right font-mono text-sm">{formatCurrency(price ? Number(price.unit_price_sell) : 0, sym)}</TableCell>
                      <TableCell className="text-right font-mono text-sm font-semibold">{formatCurrency(p.sellValue, sym)}</TableCell>
                    </TableRow>
                  );
                })}
                <TableRow className="bg-muted/30 font-bold">
                  <TableCell>Total</TableCell>
                  <TableCell className="text-right font-mono">{poolData.reduce((s, p) => s + p.units, 0).toLocaleString("en", { minimumFractionDigits: 2, maximumFractionDigits: 4 })}</TableCell>
                  <TableCell />
                  <TableCell className="text-right font-mono">{formatCurrency(totalBuyValue, sym)}</TableCell>
                  <TableCell />
                  <TableCell className="text-right font-mono">{formatCurrency(totalSellValue, sym)}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default EntityPoolDetails;
