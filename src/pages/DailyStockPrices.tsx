import { useState, useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/contexts/TenantContext";
import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { CalendarIcon, RefreshCw, Loader2, Save } from "lucide-react";
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

type Item = {
  id: string;
  item_code: string;
  description: string;
  pool_id: string;
  margin_percentage: number;
  use_fixed_price: number | null;
  api_code: string | null;
  api_link: string | null;
  calculate_price_with_item_id: string | null;
  calculate_price_with_factor: number | null;
  calculation_type: string | null;
  tax_type_id: string | null;
  is_stock_item: boolean;
  is_active: boolean;
};

type TaxType = { id: string; name: string; percentage: number };
type Pool = { id: string; name: string };

type FetchedPrice = {
  cost_excl_vat: number;
  cost_incl_vat: number;
  buy_price_excl_vat: number;
  buy_price_incl_vat: number;
  pricing_source: string;
  api_price_raw: number | null;
};

const DailyStockPrices = () => {
  const { currentTenant } = useTenant();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [priceDate, setPriceDate] = useState<Date>(new Date());
  const [fetchedPrices, setFetchedPrices] = useState<Record<string, FetchedPrice>>({});
  const [isFetchingPrices, setIsFetchingPrices] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Fetch active stock items
  const { data: items = [], isLoading } = useQuery({
    queryKey: ["stock_items", currentTenant?.id],
    queryFn: async () => {
      if (!currentTenant) return [];
      const { data, error } = await (supabase as any)
        .from("items")
        .select("*")
        .eq("tenant_id", currentTenant.id)
        .eq("is_deleted", false)
        .eq("is_active", true)
        .eq("is_stock_item", true)
        .order("item_code");
      if (error) throw error;
      return data as Item[];
    },
    enabled: !!currentTenant,
  });

  const { data: taxTypes = [] } = useQuery({
    queryKey: ["tax_types_active"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("tax_types")
        .select("id, name, percentage")
        .eq("is_active", true);
      if (error) throw error;
      return data as TaxType[];
    },
  });

  const { data: pools = [] } = useQuery({
    queryKey: ["pools_list", currentTenant?.id],
    queryFn: async () => {
      if (!currentTenant) return [];
      const { data, error } = await (supabase as any)
        .from("pools")
        .select("id, name, icon_url")
        .eq("tenant_id", currentTenant.id)
        .eq("is_deleted", false)
        .order("name");
      if (error) throw error;
      return data as Pool[];
    },
    enabled: !!currentTenant,
  });

  // Fetch existing prices for selected date
  const dateStr = format(priceDate, "yyyy-MM-dd");
  const { data: existingPrices = [] } = useQuery({
    queryKey: ["daily_stock_prices", currentTenant?.id, dateStr],
    queryFn: async () => {
      if (!currentTenant) return [];
      const { data, error } = await (supabase as any)
        .from("daily_stock_prices")
        .select("*")
        .eq("tenant_id", currentTenant.id)
        .eq("price_date", dateStr);
      if (error) throw error;
      return data as any[];
    },
    enabled: !!currentTenant,
  });

  const taxMap = Object.fromEntries(taxTypes.map((t) => [t.id, t]));
  const poolMap = Object.fromEntries(pools.map((p: any) => [p.id, p.name]));
  const poolIconMap = Object.fromEntries(pools.map((p: any) => [p.id, p.icon_url]));
  const priceMap = Object.fromEntries(existingPrices.map((p: any) => [p.item_id, p]));

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
  const currencySymbol = tenantConfig?.currency_symbol ?? "R";

  // Fetch API prices from edge function
  const fetchPricesFromApi = async () => {
    if (!currentTenant) return;
    setIsFetchingPrices(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      
      const res = await supabase.functions.invoke("fetch-stock-prices", {
        body: { tenant_id: currentTenant.id },
      });

      if (res.error) throw res.error;
      
      const { prices } = res.data;
      setFetchedPrices(prices || {});
      toast.success("Prices fetched successfully from APIs");
    } catch (err: any) {
      console.error("Error fetching prices:", err);
      toast.error("Failed to fetch prices: " + (err.message || "Unknown error"));
    } finally {
      setIsFetchingPrices(false);
    }
  };

  // Clear fetched prices when date changes so saved data can display
  useEffect(() => {
    setFetchedPrices({});
  }, [dateStr]);

  // Auto-fetch when items are loaded AND no meaningful saved prices exist for this date
  const hasNonZeroSavedPrices = existingPrices.some(
    (p: any) => Number(p.cost_excl_vat) > 0 || Number(p.buy_price_excl_vat) > 0
  );
  useEffect(() => {
    if (items.length > 0 && currentTenant && Object.keys(fetchedPrices).length === 0 && !hasNonZeroSavedPrices) {
      fetchPricesFromApi();
    }
  }, [items.length, currentTenant?.id, hasNonZeroSavedPrices]);

  // Calculate prices for each item
  const priceRows = useMemo(() => {
    return items.map((item) => {
      const existing = priceMap[item.id];
      const fetched = fetchedPrices[item.id];
      const tax = item.tax_type_id ? taxMap[item.tax_type_id] : null;
      const vatRate = tax ? tax.percentage / 100 : 0;

      let costExclVat = 0;
      let costInclVat = 0;
      let buyPriceExclVat = 0;
      let buyPriceInclVat = 0;
      let pricingSource = "Manual";

      if (fetched) {
        // Use live fetched prices
        costExclVat = fetched.cost_excl_vat;
        costInclVat = fetched.cost_incl_vat;
        buyPriceExclVat = fetched.buy_price_excl_vat;
        buyPriceInclVat = fetched.buy_price_incl_vat;
        pricingSource = fetched.pricing_source;
      } else if (existing) {
        costExclVat = Number(existing.cost_excl_vat || 0);
        costInclVat = Number(existing.cost_incl_vat || 0);
        buyPriceExclVat = Number(existing.buy_price_excl_vat || 0);
        buyPriceInclVat = Number(existing.buy_price_incl_vat || 0);
        pricingSource = item.api_link ? "API" : item.use_fixed_price != null ? "Fixed" : item.calculate_price_with_item_id ? "Formula" : "Manual";
      } else if (item.use_fixed_price != null) {
        costExclVat = item.use_fixed_price;
        costInclVat = costExclVat * (1 + vatRate);
        buyPriceExclVat = costExclVat * (1 + item.margin_percentage / 100);
        buyPriceInclVat = buyPriceExclVat * (1 + vatRate);
        pricingSource = "Fixed";
      }

      return {
        ...item,
        costExclVat,
        costInclVat,
        buyPriceExclVat,
        buyPriceInclVat,
        pricingSource,
        taxName: tax ? `${tax.name} (${tax.percentage}%)` : "—",
        poolName: poolMap[item.pool_id] ?? "—",
        hasExisting: !!existing,
        apiPriceRaw: fetched?.api_price_raw ?? null,
      };
    });
  }, [items, priceMap, fetchedPrices, taxMap, poolMap]);

  // Light tinted row backgrounds per pool name
  const poolColorMap: Record<string, string> = useMemo(() => {
    const colors: Record<string, string> = {};
    const palette = [
      { keywords: ["gold"], color: "rgba(255, 215, 0, 0.10)" },
      { keywords: ["silver"], color: "rgba(192, 192, 192, 0.15)" },
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

  const handleUpdatePrices = async () => {
    if (!currentTenant || priceRows.length === 0) return;
    setIsSaving(true);
    try {
      const records = priceRows
        .filter((row) => row.costExclVat > 0 || row.buyPriceExclVat > 0)
        .map((row) => ({
          tenant_id: currentTenant.id,
          item_id: row.id,
          price_date: dateStr,
          cost_excl_vat: row.costExclVat,
          cost_incl_vat: row.costInclVat,
          buy_price_excl_vat: row.buyPriceExclVat,
          buy_price_incl_vat: row.buyPriceInclVat,
        }));

      if (records.length === 0) {
        toast.warning("No prices to save");
        return;
      }

      // Delete existing prices for this date and tenant, then insert
      await (supabase as any)
        .from("daily_stock_prices")
        .delete()
        .eq("tenant_id", currentTenant.id)
        .eq("price_date", dateStr);

      const { error } = await (supabase as any)
        .from("daily_stock_prices")
        .insert(records);

      if (error) throw error;

      toast.success(`${records.length} stock prices saved for ${dateStr}`);
      queryClient.invalidateQueries({ queryKey: ["daily_stock_prices", currentTenant.id, dateStr] });
      // Navigate to pool update page with the date
      navigate(`/dashboard/daily-prices/pools?date=${dateStr}`);
    } catch (err: any) {
      console.error("Error saving prices:", err);
      toast.error("Failed to save prices: " + (err.message || "Unknown error"));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Stock Price Update</h1>
        <p className="text-muted-foreground text-sm mt-1">
          View and manage daily stock item prices. Prices are fetched automatically from configured APIs.
        </p>
      </div>

      {/* Date Picker & Refresh */}
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
              {priceDate ? format(priceDate, "PPP") : <span>Pick a date</span>}
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
        <Button
          variant="outline"
          size="sm"
          onClick={fetchPricesFromApi}
          disabled={isFetchingPrices}
        >
          {isFetchingPrices ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="mr-2 h-4 w-4" />
          )}
          {isFetchingPrices ? "Fetching…" : "Refresh Prices"}
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            Active Stock Items
            <Badge variant="secondary" className="ml-1">{priceRows.length}</Badge>
            {isFetchingPrices && (
              <Badge variant="outline" className="ml-1 text-xs">
                <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                Fetching API prices…
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Code</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Pool</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Margin %</TableHead>
                <TableHead>Tax</TableHead>
                <TableHead className="text-right">Cost Excl VAT</TableHead>
                <TableHead className="text-right">Cost Incl VAT</TableHead>
                <TableHead className="text-right">Buy Excl VAT</TableHead>
                <TableHead className="text-right">Buy Incl VAT</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={11} className="text-center py-8 text-muted-foreground">
                    Loading…
                  </TableCell>
                </TableRow>
              ) : priceRows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={11} className="text-center py-8 text-muted-foreground">
                    No active stock items found.
                  </TableCell>
                </TableRow>
              ) : (
                priceRows.map((row) => (
                  <TableRow key={row.id} style={{ backgroundColor: poolColorMap[row.pool_id] || undefined }}>
                    <TableCell className="font-mono font-medium">{row.item_code}</TableCell>
                    <TableCell>{row.description}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        {poolIconMap[row.pool_id] ? (
                          <img src={poolIconMap[row.pool_id]} alt={row.poolName} className="h-5 w-5 rounded object-cover shrink-0" />
                        ) : null}
                        <Badge variant="outline">{row.poolName}</Badge>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={row.pricingSource === "API" ? "default" : "secondary"}
                        className="text-xs"
                      >
                        {row.pricingSource}
                      </Badge>
                    </TableCell>
                    <TableCell>{row.margin_percentage}%</TableCell>
                    <TableCell className="text-xs">{row.taxName}</TableCell>
                    <TableCell className="text-right font-mono">
                      {formatCurrency(row.costExclVat, currencySymbol)}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {formatCurrency(row.costInclVat, currencySymbol)}
                    </TableCell>
                    <TableCell className="text-right font-mono font-medium">
                      {formatCurrency(row.buyPriceExclVat, currencySymbol)}
                    </TableCell>
                    <TableCell className="text-right font-mono font-medium">
                      {formatCurrency(row.buyPriceInclVat, currencySymbol)}
                    </TableCell>
                    <TableCell>
                      {row.hasExisting ? (
                        <Badge variant="default" className="text-xs">Saved</Badge>
                      ) : (
                        <Badge variant="outline" className="text-xs text-muted-foreground">Pending</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button
          onClick={handleUpdatePrices}
          disabled={isSaving || priceRows.length === 0 || Object.keys(fetchedPrices).length === 0}
          size="lg"
        >
          {isSaving ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Save className="mr-2 h-4 w-4" />
          )}
          {isSaving ? "Saving…" : "Update Stock Prices"}
        </Button>
      </div>
    </div>
  );
};

export default DailyStockPrices;
