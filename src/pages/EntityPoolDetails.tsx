import { useQuery } from "@tanstack/react-query";
import { useSearchParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useTenant } from "@/contexts/TenantContext";
import { formatCurrency } from "@/lib/formatCurrency";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Separator } from "@/components/ui/separator";
import { Loader2, ArrowLeft, CalendarIcon, ChevronDown, FileText, Wallet, HandCoins, Sigma } from "lucide-react";
import MemberStatementDialog from "@/components/statements/MemberStatementDialog";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { useEffect, useMemo, useState } from "react";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from "recharts";
import PoolUnitPrices from "@/components/pools/PoolUnitPrices";
import PoolItemsPrices from "@/components/pools/PoolItemsPrices";
import PoolTermsConditions from "@/components/pools/PoolTermsConditions";
import { useIsMobile } from "@/hooks/use-mobile";

const FALLBACK_COLORS = [
  "hsl(200, 70%, 50%)",
  "hsl(152, 68%, 36%)",
  "hsl(280, 60%, 55%)",
  "hsl(350, 65%, 55%)",
  "hsl(170, 55%, 45%)",
  "hsl(25, 75%, 55%)",
  "hsl(220, 65%, 55%)",
];

const POOL_COLOR_MAP: Record<string, string> = {
  gold: "hsl(43, 80%, 50%)",
  silver: "hsl(210, 10%, 70%)",
  platinum: "hsl(220, 7%, 55%)",
  member: "hsl(152, 68%, 36%)",
  reserve: "hsl(200, 70%, 50%)",
  admin: "hsl(280, 60%, 55%)",
};

const getPoolColor = (poolName: string, idx: number): string => {
  const lower = poolName.toLowerCase();
  for (const [key, color] of Object.entries(POOL_COLOR_MAP)) {
    if (lower.includes(key)) return color;
  }
  return FALLBACK_COLORS[idx % FALLBACK_COLORS.length];
};

const translations = {
  en: {
    membership: "Membership",
    selectDate: "Select date",
    noHoldings: "No pool holdings found for this entity.",
    poolAllocation: "Pool Allocation",
    totalValue: "Total Value",
    osLoan: "O/s Loan",
    netValue: "Net Value",
    poolBreakdown: "Pool Breakdown",
    pool: "Pool",
    units: "Units",
    unitPrice: "Unit Price",
    value: "Value",
    total: "Total",
    notes: "Notes",
    unitPrices: "Unit Prices",
    stockPrices: "Stock Prices",
    termsConditions: "Terms & Conditions",
    on: "on",
  },
  af: {
    membership: "Lidmaatskap",
    selectDate: "Kies datum",
    noHoldings: "Geen poelbesit gevind vir hierdie entiteit nie.",
    poolAllocation: "Poeltoewysing",
    totalValue: "Totale Waarde",
    osLoan: "Uitst. Lening",
    netValue: "Netto Waarde",
    poolBreakdown: "Poelopsomming",
    pool: "Poel",
    units: "Eenhede",
    unitPrice: "Eenheidprys",
    value: "Waarde",
    total: "Totaal",
    notes: "Notas",
    unitPrices: "Eenheidpryse",
    stockPrices: "Voorraadpryse",
    termsConditions: "Bepalings & Voorwaardes",
    on: "op",
  },
} as const;

type Lang = keyof typeof translations;
const t = (lang: Lang, key: keyof typeof translations.en) => translations[lang]?.[key] ?? translations.en[key];

// Translate well-known pool names and statement descriptions
const POOL_NAME_AF: Record<string, string> = {
  "gold": "Goud",
  "silver": "Silwer",
  "platinum": "Platinum",
  "member account": "Lidrekening",
  "reserve": "Reserwe",
  "admin": "Admin",
};

const translatePoolName = (name: string, lang: Lang): string => {
  if (lang !== "af") return name;
  const lower = name.toLowerCase().trim();
  // Check exact match first
  if (POOL_NAME_AF[lower]) return POOL_NAME_AF[lower];
  // Check if name contains a known term (e.g. "Gold Pool" → "Goud Poel")
  for (const [en, af] of Object.entries(POOL_NAME_AF)) {
    if (lower.includes(en)) return name.replace(new RegExp(en, "i"), af);
  }
  return name;
};

const translateStatementDesc = (desc: string, poolName: string, lang: Lang): string => {
  if (lang !== "af") return desc || poolName;
  if (!desc) return translatePoolName(poolName, lang);
  // Simple keyword replacements for common statement description terms
  return desc
    .replace(/\bExposure to the\b/gi, "Blootstelling aan die")
    .replace(/\bExposure to\b/gi, "Blootstelling aan")
    .replace(/\bPool\b/gi, "Poel")
    .replace(/\bGold\b/gi, "Goud")
    .replace(/\bSilver\b/gi, "Silwer")
    .replace(/\bPlatinum\b/gi, "Platinum")
    .replace(/\bReserve\b/gi, "Reserwe")
    .replace(/\bMember\b/gi, "Lidmaatskap")
    .replace(/\bAccount\b/gi, "Rekening");
};

const EntityPoolDetails = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { currentTenant } = useTenant();
  const entityId = searchParams.get("entityId");
  const isMobile = useIsMobile();

  // Fetch all entities linked to the current user
  const { data: userLinkedEntities = [] } = useQuery({
    queryKey: ["user_linked_entities_pool", user?.id, currentTenant?.id],
    queryFn: async () => {
      if (!user || !currentTenant) return [];
      const { data, error } = await (supabase as any)
        .from("user_entity_relationships")
        .select("entity_id, entities (id, name, last_name, entity_categories (name))")
        .eq("user_id", user.id)
        .eq("tenant_id", currentTenant.id);
      if (error) throw error;
      return (data ?? []).map((r: any) => r.entities).filter(Boolean);
    },
    enabled: !!user && !!currentTenant,
  });

  // If user navigates without an entityId, default to the first linked entity.
  useEffect(() => {
    if (entityId) return;
    const first = userLinkedEntities?.[0]?.id;
    if (!first) return;
    setSearchParams({ entityId: first }, { replace: true });
  }, [entityId, setSearchParams, userLinkedEntities]);

  // Fetch entity info
  const { data: entity } = useQuery({
    queryKey: ["entity_detail", entityId],
    queryFn: async () => {
      if (!entityId) return null;
      const { data, error } = await (supabase as any)
        .from("entities")
        .select("id, name, last_name, identity_number, registration_number, language_code, entity_categories (name)")
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
        .select("id, account_number, entity_account_types (name, account_type)")
        .eq("entity_id", entityId)
        .eq("tenant_id", currentTenant.id);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!entityId && !!currentTenant,
  });

  // Date picker — default to latest available date
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [statementOpen, setStatementOpen] = useState(false);

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
        .select("pool_id, unit_price_buy, unit_price_sell, total_units, total_stock, cash_control, vat_control, loan_control, pools (name, icon_url, pool_statement_display_type, pool_statement_description)")
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

  // Fetch loan outstanding using the RPC that includes legacy data
  const { data: loanData } = useQuery({
    queryKey: ["entity_loan_outstanding", entityId, currentTenant?.id],
    queryFn: async () => {
      if (!entityId || !currentTenant) return null;
      const { data, error } = await (supabase as any).rpc("get_loan_outstanding", {
        p_tenant_id: currentTenant.id,
      });
      if (error) throw error;
      const row = (data ?? []).find((r: any) => r.entity_id === entityId);
      return row ?? null;
    },
    enabled: !!entityId && !!currentTenant,
  });

  const loanOutstanding = Number(loanData?.outstanding ?? 0);

  // Build pool value data for this entity's accounts
  const entityAccountIds = new Set(entityAccounts.map((a: any) => a.id));

  const poolData = useMemo(() => {
    const priceByPool: Record<string, { buy: number; sell: number; name: string; iconUrl: string | null; displayType: string; statementDesc: string }> = {};
    for (const pp of poolPrices) {
      const displayType = pp.pools?.pool_statement_display_type ?? "display_in_summary";
      priceByPool[pp.pool_id] = {
        buy: Number(pp.unit_price_buy),
        sell: Number(pp.unit_price_sell),
        name: pp.pools?.name ?? "Unknown Pool",
        iconUrl: pp.pools?.icon_url ?? null,
        displayType,
        statementDesc: pp.pools?.pool_statement_description ?? "",
      };
    }

    const poolMap: Record<string, { poolName: string; units: number; value: number; iconUrl: string | null; displayType: string; statementDesc: string }> = {};
    for (const row of accountPoolUnits) {
      if (!entityAccountIds.has(row.entity_account_id)) continue;
      const poolId = row.pool_id;
      const units = Number(row.total_units);
      const price = priceByPool[poolId];
      if (!price) continue;
      if (price.displayType === "do_not_display") continue;
      if (!poolMap[poolId]) {
        poolMap[poolId] = { poolName: price.name, units: 0, value: 0, iconUrl: price.iconUrl, displayType: price.displayType, statementDesc: price.statementDesc };
      }
      poolMap[poolId].units += units;
      poolMap[poolId].value += units * price.sell;
    }
    return Object.entries(poolMap).map(([poolId, v]) => ({ poolId, ...v }));
  }, [accountPoolUnits, poolPrices, entityAccountIds]);

  const summaryPools = poolData.filter((p) => p.displayType === "display_in_summary");
  const belowSummaryPools = poolData.filter((p) => p.displayType === "display_below_summary");

  const totalValue = summaryPools.reduce((s, p) => s + p.value, 0);
  const netValue = totalValue - loanOutstanding;

  const entityFullName = entity ? [entity.name, entity.last_name].filter(Boolean).join(" ") : "";
  const regOrId = entity?.registration_number || entity?.identity_number || "";
  const categoryName = entity?.entity_categories?.name || "";
  const lang: Lang = (entity?.language_code === "af" ? "af" : "en");

  const pieData = summaryPools.map((p) => ({
    name: translatePoolName(p.poolName, lang),
    value: Math.round(p.value * 100) / 100,
  }));

  const membershipAccount = entityAccounts.find((a: any) => a.entity_account_types?.account_type === 1);

  return (
    <div className="space-y-4 sm:space-y-6 animate-fade-in px-1 sm:px-0">
      {/* Header — centered, back button pinned left */}
      <div className="relative flex flex-col items-center gap-1.5 sm:gap-2 text-center">
        <Button
          variant="ghost"
          size="icon"
          className="absolute left-0 top-0"
          onClick={() => navigate(-1)}
          aria-label="Back"
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>

        {/* Entity name dropdown */}
        {userLinkedEntities.length > 1 ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="text-2xl font-bold tracking-tight gap-1 h-auto py-1">
                {entityFullName}
                <ChevronDown className="h-5 w-5 text-muted-foreground" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="center">
              {userLinkedEntities.map((e: any) => {
                const name = [e.name, e.last_name].filter(Boolean).join(" ");
                return (
                  <DropdownMenuItem
                    key={e.id}
                    className={cn(e.id === entityId && "bg-accent")}
                    onClick={() => setSearchParams({ entityId: e.id })}
                  >
                    <span>{name}</span>
                    {e.entity_categories?.name && (
                      <span className="ml-2 text-xs text-muted-foreground">({e.entity_categories.name})</span>
                    )}
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <h1 className="text-2xl font-bold tracking-tight">{entityFullName}</h1>
        )}

        <p className="text-muted-foreground text-sm">
          {categoryName && <span className="font-medium text-foreground">{categoryName} </span>}
          {regOrId && <>({regOrId})</>}
        </p>

        {/* Membership number */}
        {membershipAccount && (
          <div className="inline-flex items-center gap-1.5 rounded-lg border bg-card px-3 py-1.5 text-sm">
            <span className="text-muted-foreground">{t(lang, "membership")}:</span>
            <code className="font-mono font-medium">{membershipAccount.account_number ?? "N/A"}</code>
          </div>
        )}

        <div className="w-full flex flex-col sm:flex-row sm:items-center sm:justify-center gap-2 pt-1">
          {/* Date Picker */}
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={cn(
                  "w-full sm:w-[220px] justify-start text-left font-normal",
                  !effectiveDate && "text-muted-foreground"
                )}
              >
                <CalendarIcon className="h-4 w-4 mr-2" />
                {effectiveDate ? format(new Date(effectiveDate + "T00:00:00"), "dd MMM yyyy") : t(lang, "selectDate")}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="center">
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

          {/* Statement download button */}
          {entityId && currentTenant && entityAccounts.length > 0 && (
            <Button variant="outline" className="w-full sm:w-auto" onClick={() => setStatementOpen(true)}>
              <FileText className="h-4 w-4 mr-2" />
              Statement
            </Button>
          )}
        </div>
      </div>

      {loadingPrices ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : poolData.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            {t(lang, "noHoldings")}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:gap-6 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader className="pb-2 sm:pb-6">
              <div className="flex items-center justify-between gap-3">
                <CardTitle className="text-base sm:text-lg">{t(lang, "poolAllocation")}</CardTitle>
                <div className="hidden sm:flex items-center gap-2">
                  <Badge variant="secondary">{summaryPools.length} pools</Badge>
                  <Badge variant="outline">{entityAccounts.length} accounts</Badge>
                </div>
              </div>
            </CardHeader>
            <CardContent className="px-2 sm:px-6">
              <ResponsiveContainer width="100%" height={isMobile ? 260 : 340}>
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={isMobile ? 40 : 55}
                    outerRadius={isMobile ? 80 : 100}
                    paddingAngle={2}
                    dataKey="value"
                  >
                    {pieData.map((entry, idx) => (
                      <Cell key={idx} fill={getPoolColor(entry.name, idx)} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value: number) => formatCurrency(value, sym)} />
                  <Legend wrapperStyle={{ fontSize: isMobile ? "11px" : "12px" }} />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">{t(lang, "totalValue")}</p>
                    <p className="text-xl sm:text-2xl font-bold tracking-tight">{formatCurrency(totalValue, sym)}</p>
                  </div>
                  <div className="h-9 w-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                    <Wallet className="h-4 w-4" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">{t(lang, "osLoan")}</p>
                    <p className={cn("text-xl sm:text-2xl font-bold tracking-tight", loanOutstanding > 0 ? "text-destructive" : "")}>
                      {formatCurrency(loanOutstanding, sym)}
                    </p>
                  </div>
                  <div className="h-9 w-9 rounded-lg bg-destructive/10 text-destructive flex items-center justify-center shrink-0">
                    <HandCoins className="h-4 w-4" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className={cn(netValue < 0 ? "border-destructive/40" : "border-primary/20")}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">{t(lang, "netValue")}</p>
                    <p className={cn("text-xl sm:text-2xl font-bold tracking-tight", netValue < 0 ? "text-destructive" : "")}>
                      {formatCurrency(netValue, sym)}
                    </p>
                  </div>
                  <div
                    className={cn(
                      "h-9 w-9 rounded-lg flex items-center justify-center shrink-0",
                      netValue < 0 ? "bg-destructive/10 text-destructive" : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                    )}
                  >
                    <Sigma className="h-4 w-4" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* Detailed Pool Breakdown */}
      {summaryPools.length > 0 && (
        <Card>
          <CardHeader className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <CardTitle className="text-base sm:text-lg">{t(lang, "poolBreakdown")}</CardTitle>
              {effectiveDate && (
                <Badge variant="outline" className="font-normal">
                  {t(lang, "on")} {format(new Date(effectiveDate + "T00:00:00"), "dd MMM yyyy")}
                </Badge>
              )}
            </div>
            <Separator />
          </CardHeader>

          {isMobile ? (
            <CardContent className="p-4 space-y-3">
              {summaryPools.map((p, idx) => {
                const price = poolPrices.find((pp: any) => pp.pool_id === p.poolId);
                const unitPrice = price ? Number(price.unit_price_sell) : 0;
                return (
                  <div key={p.poolId} className="rounded-lg border bg-card p-4">
                    <div className="flex items-center gap-3">
                      <div className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: getPoolColor(p.poolName, idx) }} />
                      {p.iconUrl ? (
                        <img src={p.iconUrl} alt={p.poolName} className="h-7 w-7 rounded object-cover shrink-0" />
                      ) : null}
                      <div className="min-w-0 flex-1">
                        <p className="font-medium truncate">{translatePoolName(p.poolName, lang)}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {p.units.toLocaleString("en", { minimumFractionDigits: 2, maximumFractionDigits: 4 })} units • {formatCurrency(unitPrice, sym)} / unit
                        </p>
                      </div>
                      <p className="font-mono text-sm font-semibold">{formatCurrency(p.value, sym)}</p>
                    </div>
                  </div>
                );
              })}

              <div className="flex items-center justify-between rounded-lg border bg-muted/20 px-4 py-3">
                <span className="text-sm font-semibold">{t(lang, "total")}</span>
                <span className="font-mono font-semibold">{formatCurrency(totalValue, sym)}</span>
              </div>
            </CardContent>
          ) : (
            <CardContent className="p-0 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t(lang, "pool")}</TableHead>
                    <TableHead className="text-right">{t(lang, "units")}</TableHead>
                    <TableHead className="text-right">{t(lang, "unitPrice")}</TableHead>
                    <TableHead className="text-right">{t(lang, "value")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {summaryPools.map((p, idx) => {
                    const price = poolPrices.find((pp: any) => pp.pool_id === p.poolId);
                    return (
                      <TableRow key={p.poolId}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: getPoolColor(p.poolName, idx) }} />
                            {p.iconUrl ? (
                              <img src={p.iconUrl} alt={p.poolName} className="h-6 w-6 rounded object-cover shrink-0" />
                            ) : null}
                            <span className="font-medium">{translatePoolName(p.poolName, lang)}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">{p.units.toLocaleString("en", { minimumFractionDigits: 2, maximumFractionDigits: 4 })}</TableCell>
                        <TableCell className="text-right font-mono text-sm">{formatCurrency(price ? Number(price.unit_price_sell) : 0, sym)}</TableCell>
                        <TableCell className="text-right font-mono text-sm font-semibold">{formatCurrency(p.value, sym)}</TableCell>
                      </TableRow>
                    );
                  })}
                  <TableRow className="bg-muted/30 font-bold">
                    <TableCell>{t(lang, "total")}</TableCell>
                    <TableCell className="text-right font-mono">{summaryPools.reduce((s, p) => s + p.units, 0).toLocaleString("en", { minimumFractionDigits: 2, maximumFractionDigits: 4 })}</TableCell>
                    <TableCell />
                    <TableCell className="text-right font-mono">{formatCurrency(totalValue, sym)}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </CardContent>
          )}
        </Card>
      )}

      {/* Notes section — compact inline prices & T&C */}
      {poolData.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base sm:text-lg">{t(lang, "notes")}</CardTitle>
          </CardHeader>
          <CardContent>
            <Accordion type="multiple" className="w-full">
              {belowSummaryPools.length > 0 && (
                <AccordionItem value="additional">
                  <AccordionTrigger>Additional notes</AccordionTrigger>
                  <AccordionContent>
                    <div className="space-y-2">
                      {belowSummaryPools.map((p) => (
                        <div key={p.poolId} className="flex items-start justify-between gap-3 text-sm">
                          <span className="text-muted-foreground">
                            <span className="font-medium text-foreground mr-2">
                              {translateStatementDesc(p.statementDesc, p.poolName, lang)}:
                            </span>
                          </span>
                          <span className="font-mono">{formatCurrency(p.value, sym)}</span>
                        </div>
                      ))}
                    </div>
                  </AccordionContent>
                </AccordionItem>
              )}

              <AccordionItem value="unit-prices">
                <AccordionTrigger>{t(lang, "unitPrices")}</AccordionTrigger>
                <AccordionContent>
                  <PoolUnitPrices
                    poolPrices={poolPrices}
                    exposedPoolIds={poolData.map((p) => p.poolId)}
                    currencySymbol={sym}
                    label={t(lang, "unitPrices")}
                  />
                </AccordionContent>
              </AccordionItem>

              {effectiveDate && currentTenant && (
                <AccordionItem value="stock-prices">
                  <AccordionTrigger>{t(lang, "stockPrices")}</AccordionTrigger>
                  <AccordionContent>
                    <PoolItemsPrices
                      tenantId={currentTenant.id}
                      poolIds={poolData.map((p) => p.poolId)}
                      effectiveDate={effectiveDate}
                      currencySymbol={sym}
                      label={t(lang, "stockPrices")}
                    />
                  </AccordionContent>
                </AccordionItem>
              )}

              {currentTenant && (
                <AccordionItem value="terms">
                  <AccordionTrigger>{t(lang, "termsConditions")}</AccordionTrigger>
                  <AccordionContent>
                    <PoolTermsConditions
                      tenantId={currentTenant.id}
                      poolIds={poolData.map((p) => p.poolId)}
                      lang={lang}
                      label={t(lang, "termsConditions")}
                    />
                  </AccordionContent>
                </AccordionItem>
              )}
            </Accordion>
          </CardContent>
        </Card>
      )}
      {/* Statement Dialog */}
      {entityId && currentTenant && (
        <MemberStatementDialog
          open={statementOpen}
          onOpenChange={setStatementOpen}
          entityId={entityId}
          entityAccountIds={entityAccounts.map((a: any) => a.id)}
          tenantId={currentTenant.id}
          currencySymbol={sym}
        />
      )}
    </div>
  );
};

export default EntityPoolDetails;
