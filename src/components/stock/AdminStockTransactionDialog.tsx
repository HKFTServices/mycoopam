import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Checkbox } from "@/components/ui/checkbox";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import {
  CalendarIcon, ShoppingCart, TrendingDown, SlidersHorizontal,
  Package, Plus, Minus, ChevronRight, ChevronLeft, Loader2,
  AlertTriangle, Info, Check, Building2, User2, ChevronsUpDown,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/contexts/TenantContext";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

type TxnType = "STOCK_PURCHASES" | "STOCK_SALES" | "STOCK_ADJUSTMENTS";
type AdjustmentType = "write_on" | "write_off";

interface LineItem {
  itemId: string;
  itemCode: string;
  description: string;
  poolId: string;
  poolName: string;
  quantity: number;
  unitPriceExclVat: number;
  vatRate: number;
  hasVat: boolean;
  // derived
  unitPriceInclVat: number;
  lineTotalExclVat: number;
  lineVat: number;
  lineTotalInclVat: number;
  adjustmentType?: AdjustmentType;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

const TXN_TYPE_OPTIONS = [
  {
    code: "STOCK_PURCHASES" as TxnType,
    label: "Stock Purchase",
    sub: "Buy physical stock from a supplier",
    icon: ShoppingCart,
    color: "text-green-600",
  },
  {
    code: "STOCK_SALES" as TxnType,
    label: "Stock Sale",
    sub: "Sell physical stock to a buyer",
    icon: TrendingDown,
    color: "text-blue-600",
  },
  {
    code: "STOCK_ADJUSTMENTS" as TxnType,
    label: "Stock Adjustment",
    sub: "Write-on or write-off stock quantities",
    icon: SlidersHorizontal,
    color: "text-amber-600",
  },
];

const formatCcy = (v: number) =>
  `R ${Number(v).toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const AdminStockTransactionDialog = ({ open, onOpenChange }: Props) => {
  const { currentTenant } = useTenant();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // ─── State ───
  const [step, setStep] = useState<"type" | "items" | "review">("type");
  const [txnType, setTxnType] = useState<TxnType | null>(null);
  const [txnDate, setTxnDate] = useState<Date>(new Date());
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<LineItem[]>([]);
  const [vatRegistered, setVatRegistered] = useState(false);
  const [globalVatRate, setGlobalVatRate] = useState(0);
  const [counterpartyAccountId, setCounterpartyAccountId] = useState<string | null>(null);
  const [counterpartyEntityId, setCounterpartyEntityId] = useState<string | null>(null);
  const [counterpartyLabel, setCounterpartyLabel] = useState("");
  const [counterpartySearch, setCounterpartySearch] = useState("");
  const [counterpartyOpen, setCounterpartyOpen] = useState(false);

  // ─── Counterparty entity accounts (suppliers for purchases, customers for sales) ───
  // account_type: 2 = Customer, 3 = Supplier
  const counterpartyAccountType = txnType === "STOCK_PURCHASES" ? 3 : txnType === "STOCK_SALES" ? 2 : null;

  const { data: counterpartyAccounts = [], isLoading: loadingCounterparties } = useQuery({
    queryKey: ["counterparty_accounts", currentTenant?.id, counterpartyAccountType],
    queryFn: async () => {
      if (!currentTenant || !counterpartyAccountType) return [];
      const { data, error } = await (supabase as any)
        .from("entity_accounts")
        .select("id, account_number, entity_id, entities(id, name, last_name, registration_number)")
        .eq("tenant_id", currentTenant.id)
        .eq("is_active", true)
        .in("entity_account_type_id",
          // sub-select entity_account_types where account_type = counterpartyAccountType
          (await (supabase as any)
            .from("entity_account_types")
            .select("id")
            .eq("account_type", counterpartyAccountType)
            .then((r: any) => (r.data ?? []).map((t: any) => t.id)))
        )
        .order("account_number");
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!currentTenant && open && !!counterpartyAccountType,
  });

  // ─── Fetch items (all stock items with pool info + VAT from tax_types) ───
  const { data: stockItems = [], isLoading: loadingItems } = useQuery({
    queryKey: ["admin_stock_items", currentTenant?.id],
    queryFn: async () => {
      if (!currentTenant) return [];
      const { data, error } = await (supabase as any)
        .from("items")
        .select("id, description, item_code, pool_id, tax_type_id, pools(id, name), tax_types(id, percentage, name)")
        .eq("tenant_id", currentTenant.id)
        .eq("is_stock_item", true)
        .eq("is_active", true)
        .eq("is_deleted", false)
        .order("description");
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!currentTenant && open,
  });

  // ─── Fetch cash control balances per pool ───
  const { data: poolCashBalances = [] } = useQuery({
    queryKey: ["pool_cash_balances", currentTenant?.id],
    queryFn: async () => {
      if (!currentTenant) return [];
      // Get control accounts of type 'cash' with their pool_id
      const { data: controlAccounts, error: caErr } = await (supabase as any)
        .from("control_accounts")
        .select("id, pool_id, name")
        .eq("tenant_id", currentTenant.id)
        .eq("account_type", "cash")
        .eq("is_active", true);
      if (caErr) throw caErr;
      if (!controlAccounts?.length) return [];

      // Get balances via RPC
      const { data: balances, error: bErr } = await (supabase as any)
        .rpc("get_cft_control_balances", { p_tenant_id: currentTenant.id });
      if (bErr) throw bErr;

      // Aggregate balances by pool_id (the RPC may return multiple rows per control_account_id for legacy)
      const balanceMap = new Map<string, number>();
      for (const b of (balances ?? [])) {
        const ca = controlAccounts.find((c: any) => c.id === b.control_account_id);
        if (ca?.pool_id) {
          balanceMap.set(ca.pool_id, (balanceMap.get(ca.pool_id) ?? 0) + Number(b.balance));
        }
      }

      return Array.from(balanceMap.entries()).map(([poolId, balance]) => ({ poolId, balance }));
    },
    enabled: !!currentTenant && open,
  });

  // Helper: get cash balance for a pool
  const getPoolCashBalance = (poolId: string): number | null => {
    const entry = poolCashBalances.find((p: any) => p.poolId === poolId);
    return entry ? entry.balance : null;
  };

  // ─── Fetch daily stock prices for the selected date ───
  const { data: dailyPrices = [] } = useQuery({
    queryKey: ["daily_stock_prices_for_date", currentTenant?.id, format(txnDate, "yyyy-MM-dd")],
    queryFn: async () => {
      if (!currentTenant) return [];
      const dateStr = format(txnDate, "yyyy-MM-dd");
      const { data, error } = await (supabase as any)
        .from("daily_stock_prices")
        .select("item_id, cost_excl_vat, cost_incl_vat, buy_price_excl_vat, buy_price_incl_vat, price_date")
        .eq("tenant_id", currentTenant.id)
        .lte("price_date", dateStr)
        .order("price_date", { ascending: false });
      if (error) throw error;
      // Keep only the latest price per item (most recent on or before txnDate)
      const latestByItem = new Map<string, any>();
      for (const row of (data ?? [])) {
        if (!latestByItem.has(row.item_id)) {
          latestByItem.set(row.item_id, row);
        }
      }
      return Array.from(latestByItem.values());
    },
    enabled: !!currentTenant && open,
  });

  // Helper: get the price for a given item from daily prices
  const getDailyPrice = (itemId: string) =>
    dailyPrices.find((p: any) => p.item_id === itemId);

  // Fetch VAT config
  useQuery({
    queryKey: ["tenant_vat_config", currentTenant?.id],
    queryFn: async () => {
      if (!currentTenant) return null;
      const { data } = await (supabase as any)
        .from("tenant_configuration")
        .select("is_vat_registered")
        .eq("tenant_id", currentTenant.id)
        .maybeSingle();
      const isVatReg = data?.is_vat_registered ?? false;
      setVatRegistered(isVatReg);

      if (isVatReg) {
        const { data: taxData } = await (supabase as any)
          .from("tax_types")
          .select("percentage")
          .eq("tenant_id", currentTenant.id)
          .eq("is_active", true)
          .gt("percentage", 0)
          .order("percentage", { ascending: false })
          .limit(1);
        setGlobalVatRate(taxData?.[0] ? Number(taxData[0].percentage) : 0);
      }
      return data;
    },
    enabled: !!currentTenant && open,
  });

  // ─── Line item helpers ───
  const calcLine = (
    qty: number,
    unitExcl: number,
    vatRate: number,
    hasVat: boolean,
  ): Pick<LineItem, "unitPriceInclVat" | "lineTotalExclVat" | "lineVat" | "lineTotalInclVat"> => {
    const rate = hasVat && vatRegistered ? vatRate / 100 : 0;
    const unitIncl = unitExcl * (1 + rate);
    const totalExcl = qty * unitExcl;
    const vat = totalExcl * rate;
    return {
      unitPriceInclVat: unitIncl,
      lineTotalExclVat: totalExcl,
      lineVat: vat,
      lineTotalInclVat: totalExcl + vat,
    };
  };

  const getLine = (itemId: string) => lines.find((l) => l.itemId === itemId);

  const setLineQty = (item: any, qty: number) => {
    if (qty < 0) qty = 0;
    const existing = getLine(item.id);
    // VAT rate: use item's linked tax_type percentage explicitly.
    // If the item has a tax_type_id, use that type's rate (could be 0% for Exempt).
    // Only fall back to globalVatRate if the item has NO tax_type at all.
    const itemVatRate = item.tax_type_id
      ? (item.tax_types?.percentage != null ? Number(item.tax_types.percentage) : globalVatRate)
      : 0;
    const hasVat = itemVatRate > 0;

    // Auto-populate price from daily_stock_prices on first add
    let unitExcl = existing?.unitPriceExclVat ?? 0;
    if (!existing && qty > 0) {
      const dailyPrice = getDailyPrice(item.id);
      if (dailyPrice) {
        // For purchases/sales use cost_excl_vat; for adjustments price is irrelevant
        unitExcl = Number(dailyPrice.cost_excl_vat) || Number(dailyPrice.buy_price_excl_vat) || 0;
      }
    }

    const calc = calcLine(qty, unitExcl, itemVatRate, hasVat);

    if (qty === 0) {
      setLines((prev) => prev.filter((l) => l.itemId !== item.id));
      return;
    }

    const newLine: LineItem = {
      itemId: item.id,
      itemCode: item.item_code,
      description: item.description,
      poolId: item.pool_id,
      poolName: item.pools?.name ?? "—",
      quantity: qty,
      unitPriceExclVat: unitExcl,
      vatRate: itemVatRate,
      hasVat,
      adjustmentType: existing?.adjustmentType ?? "write_on",
      ...calc,
    };

    if (existing) {
      setLines((prev) => prev.map((l) => (l.itemId === item.id ? newLine : l)));
    } else {
      setLines((prev) => [...prev, newLine]);
    }
  };

  const setLinePrice = (itemId: string, unitExcl: number) => {
    setLines((prev) =>
      prev.map((l) => {
        if (l.itemId !== itemId) return l;
        const calc = calcLine(l.quantity, unitExcl, l.vatRate, l.hasVat);
        return { ...l, unitPriceExclVat: unitExcl, ...calc };
      })
    );
  };

  const setLineAdjType = (itemId: string, adjType: AdjustmentType) => {
    setLines((prev) =>
      prev.map((l) => (l.itemId !== itemId ? l : { ...l, adjustmentType: adjType }))
    );
  };

  // ─── Totals ───
  const totalExcl = lines.reduce((s, l) => s + l.lineTotalExclVat, 0);
  const totalVat = lines.reduce((s, l) => s + l.lineVat, 0);
  const totalIncl = lines.reduce((s, l) => s + l.lineTotalInclVat, 0);

  // Group lines by pool for breakdown display
  const byPool = lines.reduce<Record<string, LineItem[]>>((acc, l) => {
    if (!acc[l.poolId]) acc[l.poolId] = [];
    acc[l.poolId].push(l);
    return acc;
  }, {});

  // ─── Submit ───
  const submitMutation = useMutation({
    mutationFn: async () => {
      if (!currentTenant || !user) throw new Error("No tenant/user");
      if (!txnType) throw new Error("No transaction type selected");
      if (lines.length === 0) throw new Error("No items added");

      // Insert header
      const { data: header, error: hErr } = await (supabase as any)
        .from("admin_stock_transactions")
        .insert({
          tenant_id: currentTenant.id,
          transaction_type_code: txnType,
          status: "pending",
          transaction_date: format(txnDate, "yyyy-MM-dd"),
          reference: reference || null,
          notes: notes || null,
          total_invoice_amount: totalIncl,
          total_excl_vat: totalExcl,
          total_vat: totalVat,
          created_by: user.id,
          counterparty_entity_account_id: counterpartyAccountId || null,
          counterparty_entity_id: counterpartyEntityId || null,
        })
        .select("id")
        .single();
      if (hErr) throw new Error(hErr.message);

      // Insert lines
      const lineInserts = lines.map((l) => ({
        admin_stock_transaction_id: header.id,
        tenant_id: currentTenant.id,
        item_id: l.itemId,
        pool_id: l.poolId,
        quantity: l.quantity,
        unit_price_excl_vat: l.unitPriceExclVat,
        unit_price_incl_vat: l.unitPriceInclVat,
        vat_rate: l.vatRate,
        line_total_excl_vat: l.lineTotalExclVat,
        line_total_incl_vat: l.lineTotalInclVat,
        line_vat: l.lineVat,
        adjustment_type: txnType === "STOCK_ADJUSTMENTS" ? (l.adjustmentType ?? "write_on") : null,
      }));

      const { error: lErr } = await (supabase as any)
        .from("admin_stock_transaction_lines")
        .insert(lineInserts);
      if (lErr) throw new Error(lErr.message);
    },
    onSuccess: () => {
      toast.success("Stock transaction submitted — awaiting vault confirmation & approval");
      queryClient.invalidateQueries({ queryKey: ["admin_stock_transactions"] });
      queryClient.invalidateQueries({ queryKey: ["pending_approvals_count"] });
      handleClose();
    },
    onError: (err: any) => toast.error(err.message || "Failed to submit"),
  });

  const handleClose = () => {
    setStep("type");
    setTxnType(null);
    setTxnDate(new Date());
    setReference("");
    setNotes("");
    setLines([]);
    setCounterpartyAccountId(null);
    setCounterpartyEntityId(null);
    setCounterpartyLabel("");
    setCounterpartySearch("");
    setCounterpartyOpen(false);
    onOpenChange(false);
  };

  // ─── Render steps ───
  const renderTypeStep = () => (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">Select the type of stock transaction to record.</p>
      <div className="grid grid-cols-3 gap-3">
        {TXN_TYPE_OPTIONS.map((opt) => {
          const Icon = opt.icon;
          const selected = txnType === opt.code;
          return (
            <button
              key={opt.code}
              onClick={() => setTxnType(opt.code)}
              className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 text-center transition-all ${
                selected
                  ? "border-primary bg-primary/5 shadow-sm"
                  : "border-border hover:border-primary/30 opacity-70 hover:opacity-100"
              }`}
            >
              <Icon className={`h-6 w-6 ${selected ? "text-primary" : opt.color}`} />
              <div>
                <p className="text-sm font-semibold">{opt.label}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">{opt.sub}</p>
              </div>
            </button>
          );
        })}
      </div>

      {/* Date & Reference */}
      {txnType && (
        <div className="grid grid-cols-2 gap-3 pt-2">
          <div className="space-y-1.5">
            <Label className="text-xs flex items-center gap-1.5"><CalendarIcon className="h-3 w-3" />Transaction Date</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className={cn("w-full justify-start text-left font-normal h-9 text-sm", !txnDate && "text-muted-foreground")}>
                  <CalendarIcon className="mr-2 h-3.5 w-3.5" />
                  {txnDate ? format(txnDate, "PPP") : "Pick a date"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={txnDate} onSelect={(d) => d && setTxnDate(d)} disabled={(d) => d > new Date()} initialFocus className="p-3 pointer-events-auto" />
              </PopoverContent>
            </Popover>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Reference / Invoice #</Label>
            <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="INV-0001" className="h-9 text-sm" />
          </div>
        </div>
      )}

      {/* Counterparty selector for purchases & sales */}
      {txnType && txnType !== "STOCK_ADJUSTMENTS" && (
        <div className="space-y-1.5">
          <Label className="text-xs flex items-center gap-1.5">
            <User2 className="h-3 w-3" />
            {txnType === "STOCK_PURCHASES" ? "Supplier" : "Customer"}
            <span className="text-muted-foreground font-normal">(optional)</span>
          </Label>
          <Popover open={counterpartyOpen} onOpenChange={setCounterpartyOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                role="combobox"
                aria-expanded={counterpartyOpen}
                className="w-full justify-between h-9 text-sm font-normal"
              >
                {counterpartyLabel || (
                  <span className="text-muted-foreground">
                    Search {txnType === "STOCK_PURCHASES" ? "supplier" : "customer"}...
                  </span>
                )}
                <ChevronsUpDown className="h-3.5 w-3.5 ml-2 opacity-50 shrink-0" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[420px] p-0" align="start">
              <Command>
                <CommandInput
                  placeholder={`Search ${txnType === "STOCK_PURCHASES" ? "suppliers" : "customers"}...`}
                  value={counterpartySearch}
                  onValueChange={setCounterpartySearch}
                />
                <CommandList>
                  {loadingCounterparties ? (
                    <div className="flex items-center justify-center py-4">
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    </div>
                  ) : (
                    <>
                      <CommandEmpty>No {txnType === "STOCK_PURCHASES" ? "suppliers" : "customers"} found.</CommandEmpty>
                      {counterpartyAccountId && (
                        <CommandGroup heading="Current">
                          <CommandItem
                            onSelect={() => {
                              setCounterpartyAccountId(null);
                              setCounterpartyEntityId(null);
                              setCounterpartyLabel("");
                              setCounterpartyOpen(false);
                            }}
                          >
                            <span className="text-muted-foreground text-xs">✕ Clear selection</span>
                          </CommandItem>
                        </CommandGroup>
                      )}
                      <CommandGroup heading={txnType === "STOCK_PURCHASES" ? "Suppliers" : "Customers"}>
                        {counterpartyAccounts
                          .filter((a: any) => {
                            const entity = a.entities;
                            const fullName = [entity?.name, entity?.last_name].filter(Boolean).join(" ");
                            const search = counterpartySearch.toLowerCase();
                            return (
                              !search ||
                              fullName.toLowerCase().includes(search) ||
                              (a.account_number ?? "").toLowerCase().includes(search) ||
                              (entity?.registration_number ?? "").toLowerCase().includes(search)
                            );
                          })
                          .map((a: any) => {
                            const entity = a.entities;
                            const fullName = [entity?.name, entity?.last_name].filter(Boolean).join(" ");
                            return (
                              <CommandItem
                                key={a.id}
                                value={`${a.id}-${fullName}`}
                                onSelect={() => {
                                  setCounterpartyAccountId(a.id);
                                  setCounterpartyEntityId(entity?.id ?? null);
                                  setCounterpartyLabel(`${fullName} (${a.account_number ?? "—"})`);
                                  setCounterpartyOpen(false);
                                }}
                              >
                                <Check
                                  className={cn("mr-2 h-3.5 w-3.5", counterpartyAccountId === a.id ? "opacity-100" : "opacity-0")}
                                />
                                <div>
                                  <p className="text-sm font-medium">{fullName}</p>
                                  <p className="text-[10px] text-muted-foreground">
                                    {a.account_number ?? "No account #"}
                                    {entity?.registration_number ? ` · Reg: ${entity.registration_number}` : ""}
                                  </p>
                                </div>
                              </CommandItem>
                            );
                          })}
                      </CommandGroup>
                    </>
                  )}
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        </div>
      )}

      <div className="flex justify-end pt-2">
        <Button onClick={() => setStep("items")} disabled={!txnType}>
          Next: Select Items <ChevronRight className="h-4 w-4 ml-1.5" />
        </Button>
      </div>
    </div>
  );

  const renderItemsStep = () => {
    if (loadingItems) {
      return <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
    }

    const isAdjustment = txnType === "STOCK_ADJUSTMENTS";

    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2 rounded-lg bg-primary/5 border border-primary/20 px-3 py-2">
          <Info className="h-4 w-4 text-primary shrink-0" />
          <p className="text-xs text-muted-foreground">
            {isAdjustment
              ? "Enter quantity to adjust. Items are grouped by pool — the system posts per-pool stock control entries."
              : `Items from different pools are supported. A single bank entry will be created for the total invoice; per-pool entries are generated automatically.`}
          </p>
        </div>

        {stockItems.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Package className="h-8 w-8 mx-auto mb-2 opacity-40" />
            <p className="text-sm">No stock items found</p>
          </div>
        ) : (
          <div className="space-y-2 max-h-[380px] overflow-y-auto pr-1">
            {stockItems.map((item: any) => {
              const line = getLine(item.id);
              const qty = line?.quantity ?? 0;
              // VAT: use item's tax_type rate explicitly (0% Exempt = no VAT badge)
              const itemVatRate = item.tax_type_id
                ? (item.tax_types?.percentage != null ? Number(item.tax_types.percentage) : globalVatRate)
                : 0;
              const hasVat = itemVatRate > 0;
              const selected = qty > 0;
              const dailyPrice = getDailyPrice(item.id);
              const dailyCostExcl = dailyPrice ? Number(dailyPrice.cost_excl_vat) || Number(dailyPrice.buy_price_excl_vat) : null;

              return (
                <div key={item.id} className={`rounded-xl border-2 p-3 transition-all ${selected ? "border-primary/50 bg-primary/5" : "border-border bg-muted/10"}`}>
                  <div className="flex items-center gap-3">
                    {/* Item info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold truncate">{item.description}</p>
                        {hasVat && vatRegistered && (
                          <Badge variant="outline" className="text-[9px] px-1 py-0">
                            VAT {itemVatRate}%
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        <span className="text-[10px] text-muted-foreground font-mono bg-muted px-1.5 py-0.5 rounded">{item.item_code}</span>
                        <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                          <Building2 className="h-2.5 w-2.5" />{item.pools?.name ?? "—"}
                        </span>
                        {dailyCostExcl !== null && dailyCostExcl > 0 ? (
                          <span className="text-[10px] text-primary font-mono font-semibold">
                            {formatCcy(dailyCostExcl)} excl. VAT
                          </span>
                        ) : (
                          <span className="text-[10px] text-amber-600">No price for date</span>
                        )}
                      </div>
                    </div>
                    {/* Qty controls */}
                    <div className="flex items-center gap-1.5 shrink-0">
                      <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => setLineQty(item, qty - 1)} disabled={qty === 0}>
                        <Minus className="h-3 w-3" />
                      </Button>
                      <Input
                        type="number"
                        min={0}
                        value={qty || ""}
                        placeholder="0"
                        onChange={(e) => setLineQty(item, Math.max(0, parseInt(e.target.value) || 0))}
                        className="w-14 text-center h-7 font-bold text-xs"
                      />
                      <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => setLineQty(item, qty + 1)}>
                        <Plus className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>

                  {/* Expanded: price & adjustment type */}
                  {selected && (
                    <div className="mt-2.5 pt-2.5 border-t border-border space-y-2">
                      {!isAdjustment && (
                        <div className="flex items-center gap-2">
                          <Label className="text-[11px] text-muted-foreground whitespace-nowrap">Unit price (excl. VAT)</Label>
                          <Input
                            type="number"
                            min={0}
                            step={0.01}
                            value={line?.unitPriceExclVat ?? ""}
                            placeholder="0.00"
                            onChange={(e) => setLinePrice(item.id, parseFloat(e.target.value) || 0)}
                            className="h-7 text-xs w-28"
                          />
                          {hasVat && vatRegistered && (
                            <span className="text-[10px] text-muted-foreground">
                              Incl. VAT: {formatCcy((line?.unitPriceExclVat ?? 0) * (1 + itemVatRate / 100))}
                            </span>
                          )}
                          {line && line.lineTotalInclVat > 0 && (
                            <span className="ml-auto text-xs font-bold text-primary">= {formatCcy(line.lineTotalInclVat)}</span>
                          )}
                        </div>
                      )}

                      {isAdjustment && (
                        <div className="flex items-center gap-3">
                          <Label className="text-[11px] text-muted-foreground">Adjustment type</Label>
                          <div className="flex items-center gap-3">
                            {(["write_on", "write_off"] as AdjustmentType[]).map((at) => (
                              <button
                                key={at}
                                onClick={() => setLineAdjType(item.id, at)}
                                className={`flex items-center gap-1 px-2.5 py-1 rounded-lg border text-xs font-medium transition-all ${
                                  line?.adjustmentType === at
                                    ? at === "write_on"
                                      ? "border-green-500 bg-green-500/10 text-green-700"
                                      : "border-destructive bg-destructive/10 text-destructive"
                                    : "border-border text-muted-foreground"
                                }`}
                              >
                                {at === "write_on" ? <Plus className="h-3 w-3" /> : <Minus className="h-3 w-3" />}
                                {at === "write_on" ? "Write-on" : "Write-off"}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Notes */}
        <div className="space-y-1.5">
          <Label className="text-xs">Notes (optional)</Label>
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Supplier name, invoice notes..." className="resize-none text-sm" />
        </div>

        <div className="flex items-center justify-between pt-1">
          <Button variant="outline" onClick={() => setStep("type")}>
            <ChevronLeft className="h-4 w-4 mr-1" /> Back
          </Button>
          <Button onClick={() => setStep("review")} disabled={lines.length === 0}>
            Review Transaction <ChevronRight className="h-4 w-4 ml-1.5" />
          </Button>
        </div>
      </div>
    );
  };

  const renderReviewStep = () => {
    const typeCfg = TXN_TYPE_OPTIONS.find((o) => o.code === txnType)!;
    const Icon = typeCfg.icon;
    const isAdjustment = txnType === "STOCK_ADJUSTMENTS";
    const isPurchase = txnType === "STOCK_PURCHASES";
    const isSale = txnType === "STOCK_SALES";

    return (
      <div className="space-y-4">
        {/* Header info */}
        <div className="flex items-center gap-2 rounded-lg bg-primary/5 border border-primary/20 px-3 py-2.5">
          <Icon className={`h-4 w-4 ${typeCfg.color} shrink-0`} />
          <div className="flex-1">
            <p className="text-sm font-semibold">{typeCfg.label}</p>
            <p className="text-[10px] text-muted-foreground">
              {format(txnDate, "PPP")}{reference ? ` · Ref: ${reference}` : ""}
            </p>
            {counterpartyLabel && (
              <p className="text-[10px] text-primary font-medium flex items-center gap-1 mt-0.5">
                <User2 className="h-2.5 w-2.5" />
                {txnType === "STOCK_PURCHASES" ? "Supplier" : "Customer"}: {counterpartyLabel}
              </p>
            )}
          </div>
        </div>

        {/* Ledger preview */}
        {!isAdjustment && (
          <div className="rounded-xl border-2 border-border bg-muted/20 p-4 space-y-2.5">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Ledger Entries Preview</p>

            {/* Bank entry */}
            <div className="space-y-1">
              <div className="flex justify-between text-sm font-semibold">
                <span className="flex items-center gap-1.5">
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${isPurchase ? "bg-destructive/10 text-destructive" : "bg-green-500/10 text-green-700"}`}>
                    {isPurchase ? "CR" : "DR"}
                  </span>
                  Bank GL (is_bank = true)
                </span>
                <span>{formatCcy(totalIncl)}</span>
              </div>
              <p className="text-[10px] text-muted-foreground pl-9">{isPurchase ? "Payment to supplier — money leaves bank" : "Receipt from buyer — money enters bank"}</p>
            </div>

            <Separator />

            {/* Per-pool entries */}
            {Object.entries(byPool).map(([poolId, poolLines]) => {
              const poolName = poolLines[0].poolName;
              const poolTotalExcl = poolLines.reduce((s, l) => s + l.lineTotalExclVat, 0);
              const poolVat = poolLines.reduce((s, l) => s + l.lineVat, 0);
              return (
                <div key={poolId} className="space-y-1.5">
                  <p className="text-[11px] font-bold text-muted-foreground flex items-center gap-1.5">
                    <Building2 className="h-3 w-3" />{poolName}
                  </p>
                  {poolLines.map((l) => (
                    <div key={l.itemId} className="flex justify-between text-xs text-muted-foreground pl-4">
                      <span>{l.quantity} × {l.description}</span>
                      <span>{formatCcy(l.lineTotalExclVat)}</span>
                    </div>
                  ))}
                  <div className="flex justify-between text-xs pl-4">
                    <span className="flex items-center gap-1">
                      <span className={`text-[10px] font-bold px-1 py-0.5 rounded ${isPurchase ? "bg-primary/10 text-primary" : "bg-green-500/10 text-green-700"}`}>
                        {isPurchase ? "DR" : "CR"}
                      </span>
                      Cash Control — {poolName}
                    </span>
                    <span className="font-semibold">{formatCcy(poolTotalExcl)}</span>
                  </div>
                  <div className="flex justify-between text-xs pl-4">
                    <span className="flex items-center gap-1">
                      <span className={`text-[10px] font-bold px-1 py-0.5 rounded ${isPurchase ? "bg-primary/10 text-primary" : "bg-green-500/10 text-green-700"}`}>
                        {isPurchase ? "DR" : "CR"}
                      </span>
                      Stock Control GL
                    </span>
                    <span className="font-semibold">{formatCcy(poolTotalExcl)}</span>
                  </div>
                  {poolVat > 0 && vatRegistered && (
                    <div className="flex justify-between text-xs pl-4 text-amber-600">
                      <span className="flex items-center gap-1">
                        <span className="text-[10px] font-bold px-1 py-0.5 rounded bg-amber-500/10">DR</span>
                        VAT Control GL ({poolLines[0].vatRate}%)
                      </span>
                      <span className="font-semibold">{formatCcy(poolVat)}</span>
                    </div>
                  )}
                </div>
              );
            })}

            <Separator />
            <div className="flex justify-between text-sm font-bold text-primary">
              <span>Total Invoice</span>
              <span>{formatCcy(totalIncl)}</span>
            </div>
            {totalVat > 0 && vatRegistered && (
              <div className="flex justify-between text-xs text-muted-foreground italic">
                <span>↳ Total VAT included</span>
                <span>{formatCcy(totalVat)}</span>
              </div>
            )}
          </div>
        )}

        {/* Adjustment preview */}
        {isAdjustment && (
          <div className="rounded-xl border-2 border-border bg-muted/20 p-4 space-y-2">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Adjustment Summary</p>
            {lines.map((l) => (
              <div key={l.itemId} className="flex justify-between text-sm">
                <span className="flex items-center gap-1.5">
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${l.adjustmentType === "write_on" ? "bg-green-500/10 text-green-700" : "bg-destructive/10 text-destructive"}`}>
                    {l.adjustmentType === "write_on" ? "+" : "−"}
                  </span>
                  {l.description} ({l.poolName})
                </span>
                <span className="font-mono font-semibold">{l.quantity} units</span>
              </div>
            ))}
            <div className="pt-1 text-xs text-muted-foreground flex items-center gap-1.5">
              <Info className="h-3 w-3" />No bank or cash control entries — stock control GL only.
            </div>
          </div>
        )}

        {/* Vault notice */}
        {!isAdjustment && txnType === "STOCK_PURCHASES" && (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2.5 flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
            <div>
              <p className="text-xs font-semibold text-amber-700">Vault Confirmation Required</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">After submission, an admin must confirm physical stock receipt in the Approvals page before ledger entries are posted.</p>
            </div>
          </div>
        )}

        <div className="flex items-center justify-between pt-1">
          <Button variant="outline" onClick={() => setStep("items")}>
            <ChevronLeft className="h-4 w-4 mr-1" /> Back
          </Button>
          <Button
            onClick={() => submitMutation.mutate()}
            disabled={submitMutation.isPending}
          >
            {submitMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}
            <Check className="h-4 w-4 mr-1.5" />
            Submit for Approval
          </Button>
        </div>
      </div>
    );
  };

  const stepLabels: Record<string, string> = {
    type: "1. Transaction Type",
    items: "2. Select Items",
    review: "3. Review & Submit",
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="h-5 w-5 text-primary" />
            New Stock Transaction
          </DialogTitle>
          {/* Step indicator */}
          <div className="flex items-center gap-1 pt-1">
            {(["type", "items", "review"] as const).map((s, i) => (
              <div key={s} className="flex items-center gap-1">
                {i > 0 && <ChevronRight className="h-3 w-3 text-muted-foreground" />}
                <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${step === s ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}>
                  {stepLabels[s]}
                </span>
              </div>
            ))}
          </div>
        </DialogHeader>

        <div className="mt-2">
          {step === "type" && renderTypeStep()}
          {step === "items" && renderItemsStep()}
          {step === "review" && renderReviewStep()}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default AdminStockTransactionDialog;
