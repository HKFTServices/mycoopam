import { useState, useMemo, useCallback, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useTenant } from "@/contexts/TenantContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { CalendarIcon, FileText, Loader2, Mail, Download, Eye, Search, Users, Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { format, subDays, subMonths, subQuarters, startOfQuarter, endOfQuarter } from "date-fns";
import { toast } from "@/hooks/use-toast";
import { generateMemberStatement, type StatementData } from "@/lib/generateMemberStatement";

type PresetKey = "custom" | "since_inception" | "last_2_weeks" | "last_30_days" | "last_12_months" | "prev_quarter" | "prev_fin_year";

const PRESETS: { value: PresetKey; label: string }[] = [
  { value: "since_inception", label: "Since Inception" },
  { value: "last_2_weeks", label: "Last Two Weeks" },
  { value: "last_30_days", label: "Last 30 Days" },
  { value: "last_12_months", label: "Last 12 Months" },
  { value: "prev_quarter", label: "Previous Calendar Quarter" },
  { value: "prev_fin_year", label: "Previous Financial Year (ending Feb)" },
  { value: "custom", label: "Custom Date Range" },
];

const AUDIENCE_TYPES = [
  { value: "all_active_members", label: "All Active Members" },
  { value: "members_with_units", label: "All Active Members with Units" },
  { value: "members_in_pools", label: "Members exposed to selected Pool(s)" },
  { value: "members_linked_to_user", label: "Members linked to a User" },
  { value: "specific_member", label: "Specific Member" },
];

const getPresetDates = (key: PresetKey, inceptionDate?: string): { from: Date; to: Date } => {
  const now = new Date();
  switch (key) {
    case "since_inception":
      return { from: inceptionDate ? new Date(inceptionDate + "T00:00:00") : new Date(2000, 0, 1), to: now };
    case "last_2_weeks":
      return { from: subDays(now, 14), to: now };
    case "last_30_days":
      return { from: subDays(now, 30), to: now };
    case "last_12_months":
      return { from: subMonths(now, 12), to: now };
    case "prev_quarter": {
      const pq = subQuarters(now, 1);
      return { from: startOfQuarter(pq), to: endOfQuarter(pq) };
    }
    case "prev_fin_year": {
      const year = now.getFullYear();
      const month = now.getMonth();
      const endYear = month <= 1 ? year - 1 : year;
      return { from: new Date(endYear - 1, 2, 1), to: new Date(endYear, 1, 28) };
    }
    default:
      return { from: subDays(now, 30), to: now };
  }
};

interface TargetEntity {
  id: string;
  name: string;
  email?: string;
  selected: boolean;
}

type DocType = "statement" | "cgt";

// Searchable user select (reused from SendMessage pattern)
function SearchableUserSelect({ users, value, onValueChange, placeholder }: {
  users: any[]; value: string; onValueChange: (v: string) => void; placeholder: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = users.find((u: any) => u.user_id === value);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" role="combobox" className="w-full justify-between font-normal">
          {selected ? `${[selected.first_name, selected.last_name].filter(Boolean).join(" ")} (${selected.email})` : placeholder}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-full p-0 pointer-events-auto" align="start">
        <Command>
          <CommandInput placeholder="Search..." />
          <CommandList>
            <CommandEmpty>No user found.</CommandEmpty>
            <CommandGroup>
              {users.map((u: any) => (
                <CommandItem key={u.user_id} value={`${u.first_name} ${u.last_name} ${u.email}`}
                  onSelect={() => { onValueChange(u.user_id); setOpen(false); }}>
                  <Check className={cn("mr-2 h-4 w-4", value === u.user_id ? "opacity-100" : "opacity-0")} />
                  {[u.first_name, u.last_name].filter(Boolean).join(" ")} ({u.email})
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export default function Statements() {
  const { user } = useAuth();
  const { currentTenant } = useTenant();
  const tenantId = currentTenant?.id;

  const [docType, setDocType] = useState<DocType>("statement");
  const [preset, setPreset] = useState<PresetKey>("last_30_days");
  const [customFrom, setCustomFrom] = useState<Date | undefined>();
  const [customTo, setCustomTo] = useState<Date | undefined>();
  const [loading, setLoading] = useState(false);
  const [emailing, setEmailing] = useState(false);
  const [downloading, setDownloading] = useState(false);

  // Admin audience state
  const [audienceType, setAudienceType] = useState("");
  const [selectedPoolIds, setSelectedPoolIds] = useState<string[]>([]);
  const [linkedUserId, setLinkedUserId] = useState("");
  const [specificMemberId, setSpecificMemberId] = useState("");
  const [valuationDate, setValuationDate] = useState(() => new Date().toISOString().split("T")[0]);

  // Email delivery options (admin only)
  const [ccAdmin, setCcAdmin] = useState(false);
  const [emailDelivery, setEmailDelivery] = useState<"members" | "single">("members");
  const [singleEmailAddress, setSingleEmailAddress] = useState("");

  // Target entities (built from audience for admin, or from linked entities for member)
  const [targetEntities, setTargetEntities] = useState<TargetEntity[]>([]);
  const [recipientSearch, setRecipientSearch] = useState("");

  // Check admin status
  const { data: isAdmin = false } = useQuery({
    queryKey: ["is_admin_statements", user?.id, tenantId],
    queryFn: async () => {
      if (!user) return false;
      const { data: roles } = await (supabase as any)
        .from("user_roles").select("role").eq("user_id", user.id);
      return (roles ?? []).some((r: any) => r.role === "super_admin" || r.role === "tenant_admin");
    },
    enabled: !!user,
  });

  // Fetch all entities linked to this user (for non-admin)
  const { data: linkedEntities = [] } = useQuery({
    queryKey: ["user_linked_entities", user?.id, tenantId],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("user_entity_relationships")
        .select("entity_id, entities!inner(id, name, last_name, email_address, entity_categories(entity_type))")
        .eq("user_id", user!.id)
        .eq("tenant_id", tenantId!)
        .eq("is_active", true);
      return (data ?? []).map((r: any) => ({
        id: r.entities.id,
        name: r.entities.name + (r.entities.last_name ? " " + r.entities.last_name : ""),
        email: r.entities.email_address || "",
      }));
    },
    enabled: !!user && !!tenantId && !isAdmin,
  });

  // ===== Admin data queries =====
  const { data: pools = [] } = useQuery({
    queryKey: ["pools_for_statements", tenantId],
    queryFn: async () => {
      const { data } = await (supabase as any).from("pools").select("id, name").eq("tenant_id", tenantId).eq("is_active", true).order("name");
      return data || [];
    },
    enabled: !!tenantId && isAdmin,
  });

  const { data: allUsers = [] } = useQuery({
    queryKey: ["users_for_statements", tenantId],
    queryFn: async () => {
      const { data: roles } = await (supabase as any).from("user_roles").select("user_id").eq("tenant_id", tenantId);
      if (!roles || roles.length === 0) return [];
      const userIds = [...new Set(roles.map((r: any) => r.user_id))];
      const { data } = await (supabase as any).from("profiles").select("user_id, first_name, last_name, email").in("user_id", userIds).order("last_name");
      return data || [];
    },
    enabled: !!tenantId && isAdmin,
  });

  const { data: entityAccounts = [] } = useQuery({
    queryKey: ["entity_accounts_for_statements", tenantId],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("entity_accounts")
        .select("id, account_number, entity_id, entity_account_type_id, entities(id, name, last_name, email_address)")
        .eq("tenant_id", tenantId).eq("is_active", true).eq("is_approved", true);
      return data || [];
    },
    enabled: !!tenantId && isAdmin,
  });

  const { data: unitHoldings = [] } = useQuery({
    queryKey: ["unit_holdings_statements", tenantId, valuationDate],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("get_account_pool_units", {
        p_tenant_id: tenantId,
        p_up_to_date: valuationDate,
      });
      if (error) { console.error("get_account_pool_units error:", error); return []; }
      return (data || []).map((r: any) => ({
        entity_account_id: r.entity_account_id,
        pool_id: r.pool_id,
        total_units: Number(r.total_units) || 0,
      }));
    },
    enabled: !!tenantId && isAdmin && (audienceType === "members_with_units" || audienceType === "members_in_pools"),
  });

  const { data: poolPricesAtDate = [] } = useQuery({
    queryKey: ["pool_prices_statements", tenantId, valuationDate],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("daily_pool_prices").select("pool_id, unit_price_sell, totals_date")
        .eq("tenant_id", tenantId).lte("totals_date", valuationDate)
        .order("totals_date", { ascending: false });
      if (!data) return [];
      const seen = new Set<string>();
      return data.filter((d: any) => { if (seen.has(d.pool_id)) return false; seen.add(d.pool_id); return true; });
    },
    enabled: !!tenantId && isAdmin && (audienceType === "members_with_units" || audienceType === "members_in_pools"),
  });

  const { data: userEntityRels = [] } = useQuery({
    queryKey: ["user_entity_rels_statements", tenantId],
    queryFn: async () => {
      const { data } = await (supabase as any).from("user_entity_relationships").select("user_id, entity_id").eq("tenant_id", tenantId).eq("is_active", true);
      return data || [];
    },
    enabled: !!tenantId && isAdmin,
  });

  const { data: allLinkedEntities = [] } = useQuery({
    queryKey: ["linked_entities_statements", tenantId, linkedUserId],
    queryFn: async () => {
      const entityIds = userEntityRels.filter((r: any) => r.user_id === linkedUserId).map((r: any) => r.entity_id);
      if (entityIds.length === 0) return [];
      const { data } = await (supabase as any).from("entities").select("id, name, last_name, email_address").in("id", entityIds).eq("tenant_id", tenantId).eq("is_active", true);
      return data || [];
    },
    enabled: !!tenantId && !!linkedUserId && audienceType === "members_linked_to_user" && userEntityRels.length > 0 && isAdmin,
  });

  // Build target entities for admin based on audience selection
  useEffect(() => {
    if (!isAdmin) return;
    if (!tenantId || !audienceType) { setTargetEntities([]); return; }

    let result: TargetEntity[] = [];
    const addEntity = (entityId: string, name: string, email?: string) => {
      if (!result.some(r => r.id === entityId)) {
        result.push({ id: entityId, name, email, selected: true });
      }
    };

    if (audienceType === "all_active_members") {
      entityAccounts.forEach((ea: any) => {
        const e = ea.entities;
        if (e) addEntity(e.id, [e.name, e.last_name].filter(Boolean).join(" "), e.email_address);
      });
    } else if (audienceType === "members_with_units") {
      const priceMap = new Map<string, number>(poolPricesAtDate.map((p: any) => [p.pool_id, Number(p.unit_price_sell) || 0]));
      const accountValues = new Map<string, number>();
      unitHoldings.forEach((h: any) => {
        if (h.total_units > 0) {
          const val = Number(h.total_units) * (priceMap.get(h.pool_id) || 0);
          accountValues.set(h.entity_account_id, (accountValues.get(h.entity_account_id) || 0) + val);
        }
      });
      const accountsWithUnits = new Set(Array.from(accountValues.entries()).filter(([, val]) => val > 0).map(([id]) => id));
      entityAccounts.forEach((ea: any) => {
        const e = ea.entities;
        if (accountsWithUnits.has(ea.id) && e) addEntity(e.id, [e.name, e.last_name].filter(Boolean).join(" "), e.email_address);
      });
    } else if (audienceType === "members_in_pools" && selectedPoolIds.length > 0) {
      const accountsInPools = new Set(
        unitHoldings.filter((h: any) => selectedPoolIds.includes(h.pool_id) && h.total_units > 0).map((h: any) => h.entity_account_id)
      );
      entityAccounts.forEach((ea: any) => {
        const e = ea.entities;
        if (accountsInPools.has(ea.id) && e) addEntity(e.id, [e.name, e.last_name].filter(Boolean).join(" "), e.email_address);
      });
    } else if (audienceType === "members_linked_to_user" && linkedUserId) {
      const linkedEntityIds = new Set(userEntityRels.filter((r: any) => r.user_id === linkedUserId).map((r: any) => r.entity_id));
      entityAccounts.forEach((ea: any) => {
        const e = ea.entities;
        if (linkedEntityIds.has(ea.entity_id) && e) addEntity(e.id, [e.name, e.last_name].filter(Boolean).join(" "), e.email_address);
      });
      allLinkedEntities.forEach((e: any) => {
        if (linkedEntityIds.has(e.id)) addEntity(e.id, [e.name, e.last_name].filter(Boolean).join(" "), e.email_address);
      });
    } else if (audienceType === "specific_member" && specificMemberId) {
      const ea = entityAccounts.find((ea: any) => ea.id === specificMemberId);
      if (ea?.entities) {
        const e = ea.entities;
        addEntity(e.id, [e.name, e.last_name].filter(Boolean).join(" "), e.email_address);
      }
    }

    setTargetEntities(result);
  }, [isAdmin, audienceType, selectedPoolIds, linkedUserId, specificMemberId, entityAccounts, unitHoldings, poolPricesAtDate, userEntityRels, allLinkedEntities, tenantId, valuationDate]);

  // For non-admin: set target entities from linked entities
  useEffect(() => {
    if (isAdmin) return;
    // Don't reset if already set by user interaction
  }, [isAdmin, linkedEntities]);

  // Non-admin: selectedEntityIds state
  const [selectedEntityIds, setSelectedEntityIds] = useState<string[]>([]);

  const toggleEntity = useCallback((entityId: string) => {
    if (isAdmin) {
      setTargetEntities(prev => prev.map(e => e.id === entityId ? { ...e, selected: !e.selected } : e));
    } else {
      setSelectedEntityIds(prev => prev.includes(entityId) ? prev.filter(id => id !== entityId) : [...prev, entityId]);
    }
  }, [isAdmin]);

  const toggleAllEntities = useCallback(() => {
    if (isAdmin) {
      setTargetEntities(prev => {
        const allSelected = prev.every(e => e.selected);
        return prev.map(e => ({ ...e, selected: !allSelected }));
      });
    } else {
      setSelectedEntityIds(prev => prev.length === linkedEntities.length ? [] : linkedEntities.map((e: any) => e.id));
    }
  }, [isAdmin, linkedEntities]);

  // Effective selected entity IDs
  const effectiveEntityIds = useMemo(() => {
    if (isAdmin) return targetEntities.filter(e => e.selected).map(e => e.id);
    return selectedEntityIds;
  }, [isAdmin, targetEntities, selectedEntityIds]);

  const effectiveEntities = useMemo(() => {
    if (isAdmin) return targetEntities;
    return linkedEntities.map((e: any) => ({ id: e.id, name: e.name, email: e.email, selected: selectedEntityIds.includes(e.id) }));
  }, [isAdmin, targetEntities, linkedEntities, selectedEntityIds]);

  // Fetch tenant currency
  const { data: tenantConfig } = useQuery({
    queryKey: ["tenant_config_currency", tenantId],
    queryFn: async () => {
      const { data } = await (supabase as any).from("tenant_configuration").select("currency_symbol").eq("tenant_id", tenantId!).maybeSingle();
      return data;
    },
    enabled: !!tenantId,
  });

  // Fetch inception date for selected entities
  const { data: inceptionDate } = useQuery({
    queryKey: ["inception_date", effectiveEntityIds, tenantId],
    queryFn: async () => {
      const { data: accts } = await (supabase as any)
        .from("entity_accounts").select("id").in("entity_id", effectiveEntityIds).eq("tenant_id", tenantId!).eq("is_approved", true);
      const acctIds = (accts ?? []).map((a: any) => a.id);
      if (acctIds.length === 0) return null;
      const [unitRes, cftRes] = await Promise.all([
        (supabase as any).from("unit_transactions").select("transaction_date").eq("tenant_id", tenantId!).in("entity_account_id", acctIds).eq("is_active", true).order("transaction_date", { ascending: true }).limit(1),
        (supabase as any).from("cashflow_transactions").select("transaction_date").eq("tenant_id", tenantId!).in("entity_account_id", acctIds).eq("is_active", true).order("transaction_date", { ascending: true }).limit(1),
      ]);
      const ds = [unitRes.data?.[0]?.transaction_date, cftRes.data?.[0]?.transaction_date].filter(Boolean).sort();
      return ds[0] || null;
    },
    enabled: effectiveEntityIds.length > 0 && !!tenantId,
  });

  const currencySymbol = tenantConfig?.currency_symbol || "R";
  const dates = preset === "custom"
    ? { from: customFrom ?? new Date(), to: customTo ?? new Date() }
    : getPresetDates(preset, inceptionDate ?? undefined);
  const fromStr = format(dates.from, "yyyy-MM-dd");
  const toStr = format(dates.to, "yyyy-MM-dd");
  const busy = loading || emailing || downloading;

  const filteredEntities = useMemo(() => {
    if (!recipientSearch) return effectiveEntities;
    const s = recipientSearch.toLowerCase();
    return effectiveEntities.filter((e: any) => e.name.toLowerCase().includes(s) || (e.email || "").toLowerCase().includes(s));
  }, [effectiveEntities, recipientSearch]);

  const selectedCount = effectiveEntityIds.length;

  // Generate statement for a single entity
  const generateForEntity = async (entityId: string): Promise<string> => {
    const { data: accts } = await (supabase as any)
      .from("entity_accounts").select("id, account_number, entity_account_types(name, account_type)")
      .eq("entity_id", entityId).eq("tenant_id", tenantId!).eq("is_approved", true);
    const acctIds = (accts ?? []).map((a: any) => a.id);
    if (acctIds.length === 0) return "";

    const [
      entityRes, tenantConfigRes, unitTxRes, cashflowTxRes, stockTxRes,
      loanRes, poolPricesStartRes, poolPricesEndRes, legacyCftRes,
    ] = await Promise.all([
      (supabase as any).from("entities").select("id, name, last_name, identity_number, registration_number, contact_number, email_address, entity_categories (name)").eq("id", entityId).single(),
      (supabase as any).from("tenant_configuration").select("logo_url, directors, vat_number, registration_date, currency_symbol, legal_entity_id, entities:legal_entity_id (name, registration_number, contact_number, email_address)").eq("tenant_id", tenantId).maybeSingle(),
      (supabase as any).from("unit_transactions").select("id, transaction_date, transaction_type, pool_id, debit, credit, unit_price, value, notes, pools (name)").eq("tenant_id", tenantId).in("entity_account_id", acctIds).gte("transaction_date", fromStr).lte("transaction_date", toStr).eq("is_active", true).order("transaction_date", { ascending: true }),
      (supabase as any).from("cashflow_transactions").select("id, transaction_date, entry_type, description, debit, credit, notes, pools (name)").eq("tenant_id", tenantId).in("entity_account_id", acctIds).gte("transaction_date", fromStr).lte("transaction_date", toStr).eq("is_active", true).eq("is_bank", true).order("transaction_date", { ascending: true }),
      (supabase as any).from("stock_transactions").select("id, transaction_date, transaction_type, stock_transaction_type, debit, credit, cost_price, total_value, notes, items (description), pools (name)").eq("tenant_id", tenantId).in("entity_account_id", acctIds).gte("transaction_date", fromStr).lte("transaction_date", toStr).eq("is_active", true).order("transaction_date", { ascending: true }),
      (supabase as any).rpc("get_loan_outstanding", { p_tenant_id: tenantId }),
      (supabase as any).from("daily_pool_prices").select("pool_id, unit_price_sell, totals_date, pools (name)").eq("tenant_id", tenantId).lte("totals_date", fromStr).order("totals_date", { ascending: false }).limit(50),
      (supabase as any).from("daily_pool_prices").select("pool_id, unit_price_sell, totals_date, pools (name)").eq("tenant_id", tenantId).lte("totals_date", toStr).order("totals_date", { ascending: false }).limit(50),
      (supabase as any).rpc("get_legacy_cft_for_entity", { p_tenant_id: tenantId, p_entity_id: entityId, p_from_date: fromStr, p_to_date: toStr }),
    ]);

    const loanRow = (loanRes.data ?? []).find((r: any) => r.entity_id === entityId);
    const legacyEntityId = loanRow?.legacy_entity_id || loanRow?.client_acct_id;
    const [loanTxLegacyRes, loanTxCftRes] = await Promise.all([
      legacyEntityId ? (supabase as any).rpc("get_loan_transactions", { p_tenant_id: tenantId, p_legacy_entity_id: legacyEntityId }) : Promise.resolve({ data: [] }),
      (supabase as any).from("cashflow_transactions").select("id, transaction_date, entry_type, description, debit, credit, notes, pools (name)")
        .eq("tenant_id", tenantId).in("entity_account_id", acctIds).eq("is_active", true).like("entry_type", "loan_%").order("transaction_date", { ascending: true }),
    ]);

    const legalEntityId = tenantConfigRes.data?.legal_entity_id;
    let legalAddress: any = null;
    if (legalEntityId) {
      const { data: addrData } = await (supabase as any).from("addresses").select("street_address, suburb, city, province, postal_code").eq("entity_id", legalEntityId).eq("tenant_id", tenantId).eq("is_primary", true).maybeSingle();
      legalAddress = addrData;
    }
    const { data: memberAddr } = await (supabase as any).from("addresses").select("street_address, suburb, city, province, postal_code").eq("entity_id", entityId).eq("tenant_id", tenantId).eq("is_primary", true).maybeSingle();
    const { data: openingUnitsData } = await (supabase as any).rpc("get_account_pool_units", { p_tenant_id: tenantId, p_up_to_date: format(new Date(dates.from.getTime() - 86400000), "yyyy-MM-dd") });
    const { data: closingUnitsData } = await (supabase as any).rpc("get_account_pool_units", { p_tenant_id: tenantId, p_up_to_date: toStr });

    const accountSet = new Set(acctIds);
    const openingUnits = (openingUnitsData ?? []).filter((r: any) => accountSet.has(r.entity_account_id));
    const closingUnits = (closingUnitsData ?? []).filter((r: any) => accountSet.has(r.entity_account_id));
    const dedup = (rows: any[]) => { const map: Record<string, any> = {}; for (const r of rows ?? []) { if (!map[r.pool_id]) map[r.pool_id] = r; } return map; };

    const filteredUnitTx = (unitTxRes.data ?? []).filter((tx: any) => { const d = Number(tx.debit || 0), c = Number(tx.credit || 0), v = Number(tx.value || 0); return d !== 0 || c !== 0 || v !== 0; });
    const currentCft = (cashflowTxRes.data ?? []).map((tx: any) => ({ transaction_date: tx.transaction_date, entry_type: tx.entry_type || "", description: tx.description || "", pool_name: tx.pools?.name || "", debit: Number(tx.debit || 0), credit: Number(tx.credit || 0) }));
    const legacyCft = (legacyCftRes.data ?? []).map((tx: any) => ({ transaction_date: tx.transaction_date ? tx.transaction_date.substring(0, 10) : "", entry_type: tx.entry_type || "", description: tx.description || "", pool_name: tx.pool_name || "", debit: Number(tx.debit || 0), credit: Number(tx.credit || 0) }));
    const allCashflows = [...currentCft, ...legacyCft].filter((tx) => tx.debit !== 0 || tx.credit !== 0).sort((a, b) => a.transaction_date.localeCompare(b.transaction_date));

    const legacyLoanTx = (loanTxLegacyRes.data ?? []).map((tx: any) => ({ transaction_date: tx.transaction_date ? tx.transaction_date.substring(0, 10) : "", entry_type: tx.entry_type_id || "", entry_type_name: tx.entry_type_name || "", debit: Number(tx.debit || 0), credit: Number(tx.credit || 0) }));
    const modernLoanTx = (loanTxCftRes.data ?? []).map((tx: any) => ({ transaction_date: tx.transaction_date, entry_type: tx.entry_type || "", entry_type_name: "", debit: Number(tx.debit || 0), credit: Number(tx.credit || 0) }));
    const allLoanTx = [...legacyLoanTx, ...modernLoanTx].filter((tx) => tx.debit !== 0 || tx.credit !== 0).sort((a, b) => a.transaction_date.localeCompare(b.transaction_date));
    const periodLoanTx = allLoanTx.filter((tx) => tx.transaction_date >= fromStr && tx.transaction_date <= toStr);

    return generateMemberStatement({
      fromDate: fromStr, toDate: toStr, currencySymbol,
      entity: entityRes.data, entityAccounts: accts ?? [], memberAddress: memberAddr,
      tenantConfig: tenantConfigRes.data, legalEntity: tenantConfigRes.data?.entities, legalAddress,
      unitTransactions: filteredUnitTx, cashflowTransactions: allCashflows, stockTransactions: stockTxRes.data ?? [],
      loanOutstanding: Number(loanRow?.outstanding ?? 0), loanPayout: Number(loanRow?.total_payout ?? 0), loanRepaid: Number(loanRow?.total_repaid ?? 0),
      loanTransactions: periodLoanTx,
      openingUnits, closingUnits, poolPricesStart: dedup(poolPricesStartRes.data), poolPricesEnd: dedup(poolPricesEndRes.data),
    });
  };

  const handleViewStatement = async () => {
    if (effectiveEntityIds.length === 0 || !tenantId) return;
    setLoading(true);
    try {
      for (const entityId of effectiveEntityIds) {
        const html = await generateForEntity(entityId);
        if (html) { const win = window.open("", "_blank"); if (win) { win.document.write(html); win.document.close(); } }
      }
    } catch (err: any) {
      console.error("Statement error:", err);
      toast({ title: "Error", description: err.message || "Failed to generate statement", variant: "destructive" });
    } finally { setLoading(false); }
  };

  const handleDownloadPdf = async () => {
    if (effectiveEntityIds.length === 0 || !tenantId) return;
    setDownloading(true);
    try {
      for (const entityId of effectiveEntityIds) {
        const { data, error } = await supabase.functions.invoke("send-member-statement", {
          body: { tenant_id: tenantId, entity_id: entityId, from_date: fromStr, to_date: toStr, mode: "download" },
        });
        if (error) throw error;
        if (!data?.pdf_base64) throw new Error("No PDF returned");
        const byteChars = atob(data.pdf_base64);
        const byteArray = new Uint8Array(byteChars.length);
        for (let i = 0; i < byteChars.length; i++) byteArray[i] = byteChars.charCodeAt(i);
        const blob = new Blob([byteArray], { type: "application/pdf" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a"); a.href = url; a.download = data.filename || "statement.pdf";
        document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
      }
      toast({ title: "PDF Downloaded" });
    } catch (err: any) {
      console.error("Download PDF error:", err);
      toast({ title: "Error", description: err.message || "Failed to download PDF", variant: "destructive" });
    } finally { setDownloading(false); }
  };

  const handleEmailPdf = async () => {
    if (effectiveEntityIds.length === 0 || !tenantId) return;
    setEmailing(true);
    try {
      const adminEmail = isAdmin && ccAdmin ? user?.email : undefined;
      const overrideEmail = isAdmin && emailDelivery === "single" && singleEmailAddress ? singleEmailAddress : undefined;
      for (const entityId of effectiveEntityIds) {
        const { error } = await supabase.functions.invoke("send-member-statement", {
          body: {
            tenant_id: tenantId, entity_id: entityId, from_date: fromStr, to_date: toStr,
            ...(adminEmail ? { cc_email: adminEmail } : {}),
            ...(overrideEmail ? { override_recipient_email: overrideEmail } : {}),
          },
        });
        if (error) throw error;
      }
      toast({ title: "Statements Emailed", description: `${effectiveEntityIds.length} statement(s) sent successfully.` });
    } catch (err: any) {
      console.error("Email statement error:", err);
      toast({ title: "Error", description: err.message || "Failed to email statement", variant: "destructive" });
    } finally { setEmailing(false); }
  };

  const allSelected = effectiveEntities.length > 0 && effectiveEntities.every((e: any) => e.selected);
  const someSelected = effectiveEntities.some((e: any) => e.selected) && !allSelected;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Statements & Certificates</h1>
        <p className="text-muted-foreground">Generate member statements or CGT certificates{isAdmin ? " for any member." : " for your linked entities."}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Generate Document</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Document type */}
          <div>
            <label className="text-sm font-medium mb-1.5 block">Document Type</label>
            <Select value={docType} onValueChange={(v) => setDocType(v as DocType)}>
              <SelectTrigger className="max-w-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="statement">Member Statement</SelectItem>
                <SelectItem value="cgt">CGT Certificate</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* ADMIN: Audience targeting */}
          {isAdmin ? (
            <div className="space-y-4">
              <div>
                <Label>Target Audience</Label>
                <Select value={audienceType} onValueChange={(v) => { setAudienceType(v); setSelectedPoolIds([]); setLinkedUserId(""); setSpecificMemberId(""); }}>
                  <SelectTrigger className="max-w-sm"><SelectValue placeholder="Select audience..." /></SelectTrigger>
                  <SelectContent>
                    {AUDIENCE_TYPES.map((a) => (
                      <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {(audienceType === "members_with_units" || audienceType === "members_in_pools") && (
                <div>
                  <Label>Valuation Date</Label>
                  <Input type="date" value={valuationDate} onChange={(e) => setValuationDate(e.target.value)}
                    max={new Date().toISOString().split("T")[0]} className="max-w-sm" />
                  <p className="text-xs text-muted-foreground mt-1">Units and pool prices calculated as at this date.</p>
                </div>
              )}

              {audienceType === "members_in_pools" && (
                <div>
                  <Label>Select Pool(s)</Label>
                  <div className="border rounded-md p-2 max-h-32 overflow-y-auto space-y-1 max-w-sm">
                    {pools.map((p: any) => (
                      <label key={p.id} className="flex items-center gap-2 text-sm cursor-pointer">
                        <Checkbox checked={selectedPoolIds.includes(p.id)}
                          onCheckedChange={(checked) => setSelectedPoolIds(prev => checked ? [...prev, p.id] : prev.filter(id => id !== p.id))} />
                        {p.name}
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {audienceType === "members_linked_to_user" && (
                <div>
                  <Label>Select User</Label>
                  <div className="max-w-sm">
                    <SearchableUserSelect users={allUsers} value={linkedUserId} onValueChange={setLinkedUserId} placeholder="Search user by name or email..." />
                  </div>
                </div>
              )}

              {audienceType === "specific_member" && (
                <div>
                  <Label>Select Member Account</Label>
                  <Select value={specificMemberId} onValueChange={setSpecificMemberId}>
                    <SelectTrigger className="max-w-sm"><SelectValue placeholder="Select member..." /></SelectTrigger>
                    <SelectContent>
                      {entityAccounts.map((ea: any) => (
                        <SelectItem key={ea.id} value={ea.id}>
                          {ea.account_number} — {[ea.entities?.name, ea.entities?.last_name].filter(Boolean).join(" ")}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Recipients list */}
              {targetEntities.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <Label className="flex items-center gap-2">
                      <Users className="h-4 w-4" /> Selected Members
                    </Label>
                    <Badge variant="secondary" className="ml-auto">{selectedCount} / {targetEntities.length}</Badge>
                  </div>
                  <div className="flex items-center gap-2 mb-2">
                    <div className="relative flex-1 max-w-sm">
                      <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                      <Input value={recipientSearch} onChange={(e) => setRecipientSearch(e.target.value)} placeholder="Search..." className="pl-8" />
                    </div>
                    <Button variant="outline" size="sm" onClick={toggleAllEntities}>
                      {allSelected ? "Deselect All" : "Select All"}
                    </Button>
                  </div>
                  <div className="border rounded-md max-h-48 overflow-y-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-10"></TableHead>
                          <TableHead>Name</TableHead>
                          <TableHead>Email</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredEntities.map((e: any) => (
                          <TableRow key={e.id} className="cursor-pointer" onClick={() => toggleEntity(e.id)}>
                            <TableCell><Checkbox checked={e.selected} onCheckedChange={() => toggleEntity(e.id)} /></TableCell>
                            <TableCell className="text-sm">{e.name}</TableCell>
                            <TableCell className="text-sm text-muted-foreground">{e.email || "—"}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* NON-ADMIN: Simple entity checkboxes */
            <div>
              <label className="text-sm font-medium mb-1.5 block">Select Member(s) / Entity(ies)</label>
              {linkedEntities.length === 0 ? (
                <p className="text-xs text-muted-foreground">No entities linked to your account.</p>
              ) : (
                <div className="border rounded-md max-w-sm max-h-48 overflow-y-auto">
                  <div className="flex items-center gap-2 px-3 py-2 border-b bg-muted/30 cursor-pointer hover:bg-muted/50" onClick={toggleAllEntities}>
                    <Checkbox checked={allSelected ? true : someSelected ? "indeterminate" : false} onCheckedChange={toggleAllEntities} />
                    <span className="text-sm font-medium">Select All</span>
                    <span className="text-xs text-muted-foreground ml-auto">{selectedEntityIds.length}/{linkedEntities.length}</span>
                  </div>
                  {linkedEntities.map((e: any) => (
                    <div key={e.id} className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-muted/30" onClick={() => toggleEntity(e.id)}>
                      <Checkbox checked={selectedEntityIds.includes(e.id)} onCheckedChange={() => toggleEntity(e.id)} />
                      <span className="text-sm">{e.name}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Date range */}
          <div>
            <label className="text-sm font-medium mb-1.5 block">Period</label>
            <Select value={preset} onValueChange={(v) => setPreset(v as PresetKey)}>
              <SelectTrigger className="max-w-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                {PRESETS.map((p) => (
                  <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {preset === "custom" && (
            <div className="grid grid-cols-2 gap-3 max-w-sm">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">From</label>
                <Popover modal={false}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className={cn("w-full justify-start text-left font-normal text-sm", !customFrom && "text-muted-foreground")}>
                      <CalendarIcon className="h-3.5 w-3.5 mr-1.5" />
                      {customFrom ? format(customFrom, "dd MMM yyyy") : "Start date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={customFrom} onSelect={setCustomFrom} className="p-3 pointer-events-auto" initialFocus />
                  </PopoverContent>
                </Popover>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">To</label>
                <Popover modal={false}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className={cn("w-full justify-start text-left font-normal text-sm", !customTo && "text-muted-foreground")}>
                      <CalendarIcon className="h-3.5 w-3.5 mr-1.5" />
                      {customTo ? format(customTo, "dd MMM yyyy") : "End date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={customTo} onSelect={setCustomTo} className="p-3 pointer-events-auto" initialFocus />
                  </PopoverContent>
                </Popover>
              </div>
            </div>
          )}

          {preset !== "custom" && (
            <p className="text-sm text-muted-foreground">
              {preset === "since_inception" && !inceptionDate
                ? "Select entity(ies) to determine inception date"
                : `${format(dates.from, "dd MMM yyyy")} — ${format(dates.to, "dd MMM yyyy")}`}
            </p>
          )}

          {/* Actions */}
          <div className="flex flex-wrap gap-2 pt-2">
            {docType === "statement" && (
              <>
                <Button onClick={handleViewStatement} disabled={busy || selectedCount === 0}>
                  {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Eye className="h-4 w-4 mr-2" />}
                  View HTML {selectedCount > 1 ? `(${selectedCount})` : ""}
                </Button>
                <Button variant="secondary" onClick={handleDownloadPdf} disabled={busy || selectedCount === 0}>
                  {downloading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Download className="h-4 w-4 mr-2" />}
                  Download PDF {selectedCount > 1 ? `(${selectedCount})` : ""}
                </Button>
                <Button variant="secondary" onClick={handleEmailPdf} disabled={busy || selectedCount === 0}>
                  {emailing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Mail className="h-4 w-4 mr-2" />}
                  Email PDF {selectedCount > 1 ? `(${selectedCount})` : ""}
                </Button>
              </>
            )}
            {docType === "cgt" && (
              <Button disabled={busy || selectedCount === 0} onClick={() => toast({ title: "Coming Soon", description: "CGT Certificate generation is under development." })}>
                <FileText className="h-4 w-4 mr-2" />
                Generate CGT Certificate
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
