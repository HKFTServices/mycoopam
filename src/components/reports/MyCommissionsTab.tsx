import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useTenant } from "@/contexts/TenantContext";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Building2, Download, Loader2, ShieldCheck, ShieldX, User } from "lucide-react";
import { formatCurrency } from "@/lib/formatCurrency";

type CommissionRecord = {
  id: string;
  transaction_date: string;
  commission_percentage: number;
  gross_amount: number;
  commission_amount: number;
  commission_vat: number;
  status: string;
  entity_account_id: string;
  referrer_entity_id: string | null;
  referral_house_entity_id: string | null;
  referral_house_account_id: string | null;
  transaction_id: string | null;
  payment_date: string | null;
  payment_reference: string | null;
  depositor_entity?: { name: string; last_name: string | null } | null;
  referrer?: { name: string; last_name: string | null } | null;
  referral_house?: { name: string; last_name: string | null; is_vat_registered: boolean } | null;
};

const COMM_SELECT = `
  id, transaction_date, commission_percentage, gross_amount, commission_amount, commission_vat,
  status, entity_account_id, referrer_entity_id, referral_house_entity_id, referral_house_account_id,
  transaction_id, payment_date, payment_reference,
  referrer:entities!commissions_referrer_entity_id_fkey(name, last_name),
  referral_house:entities!commissions_referral_house_entity_id_fkey(name, last_name, is_vat_registered)
`;

const MyCommissionsTab = () => {
  const { user } = useAuth();
  const { currentTenant } = useTenant();
  const tenantId = currentTenant?.id;

  // Find user's linked entity IDs
  const { data: myEntityIds = [] } = useQuery({
    queryKey: ["my_entity_ids", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data } = await (supabase as any)
        .from("user_entity_relationships")
        .select("entity_id")
        .eq("user_id", user.id);
      return (data ?? []).map((r: any) => r.entity_id as string);
    },
    enabled: !!user,
  });

  // Find which of user's entities are referral houses (have referrers under them)
  const { data: houseEntityIds = [] } = useQuery({
    queryKey: ["my_house_entity_ids", myEntityIds],
    queryFn: async () => {
      if (myEntityIds.length === 0) return [];
      const { data } = await (supabase as any)
        .from("referrers")
        .select("referral_house_entity_id")
        .in("referral_house_entity_id", myEntityIds);
      const ids = [...new Set((data ?? []).map((r: any) => r.referral_house_entity_id as string))];
      return ids;
    },
    enabled: myEntityIds.length > 0,
  });

  // Find which of user's entities are referrer entities
  const { data: referrerEntityIds = [] } = useQuery({
    queryKey: ["my_referrer_entity_ids", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data } = await (supabase as any)
        .from("referrers")
        .select("entity_id")
        .eq("user_id", user.id)
        .eq("is_active", true);
      return (data ?? []).map((r: any) => r.entity_id as string);
    },
    enabled: !!user,
  });

  // ── My Referrer Commissions (where I am the referrer) ──
  const { data: referrerCommissions = [], isLoading: refLoading } = useQuery({
    queryKey: ["my_referrer_commissions", tenantId, referrerEntityIds],
    queryFn: async () => {
      if (!tenantId || referrerEntityIds.length === 0) return [];
      const { data } = await (supabase as any)
        .from("commissions")
        .select(COMM_SELECT)
        .eq("tenant_id", tenantId)
        .in("referrer_entity_id", referrerEntityIds)
        .order("transaction_date", { ascending: false })
        .limit(500);
      return await enrichWithDepositors(data ?? []);
    },
    enabled: !!tenantId && referrerEntityIds.length > 0,
  });

  // ── My House Commissions (all referrers under my house) ──
  const { data: houseCommissions = [], isLoading: houseLoading } = useQuery({
    queryKey: ["my_house_commissions", tenantId, houseEntityIds],
    queryFn: async () => {
      if (!tenantId || houseEntityIds.length === 0) return [];
      const { data } = await (supabase as any)
        .from("commissions")
        .select(COMM_SELECT)
        .eq("tenant_id", tenantId)
        .in("referral_house_entity_id", houseEntityIds)
        .order("transaction_date", { ascending: false })
        .limit(500);
      return await enrichWithDepositors(data ?? []);
    },
    enabled: !!tenantId && houseEntityIds.length > 0,
  });

  // VAT rate
  const { data: vatRate = 0 } = useQuery({
    queryKey: ["vat_rate_comm"],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("tax_types").select("percentage").eq("is_active", true).order("percentage", { ascending: false }).limit(1);
      return data?.[0]?.percentage || 0;
    },
  });

  const hasReferrerTab = referrerEntityIds.length > 0;
  const hasHouseTab = houseEntityIds.length > 0;
  const defaultTab = hasReferrerTab ? "referrer" : "house";

  if (!hasReferrerTab && !hasHouseTab) {
    return (
      <Card><CardContent className="py-8 text-center text-muted-foreground">
        No commission records found for your account.
      </CardContent></Card>
    );
  }

  return (
    <Tabs defaultValue={defaultTab}>
      <TabsList>
        {hasReferrerTab && (
          <TabsTrigger value="referrer">
            <User className="h-4 w-4 mr-1.5" /> My Referrer Commissions ({referrerCommissions.length})
          </TabsTrigger>
        )}
        {hasHouseTab && (
          <TabsTrigger value="house">
            <Building2 className="h-4 w-4 mr-1.5" /> My House Commissions ({houseCommissions.length})
          </TabsTrigger>
        )}
      </TabsList>

      {hasReferrerTab && (
        <TabsContent value="referrer">
          <CommissionList
            commissions={referrerCommissions}
            isLoading={refLoading}
            vatRate={vatRate}
            perspective="referrer"
          />
        </TabsContent>
      )}

      {hasHouseTab && (
        <TabsContent value="house">
          <CommissionList
            commissions={houseCommissions}
            isLoading={houseLoading}
            vatRate={vatRate}
            perspective="house"
          />
        </TabsContent>
      )}
    </Tabs>
  );
};

// ── Shared enrichment helper ──
async function enrichWithDepositors(records: any[]): Promise<CommissionRecord[]> {
  const accountIds = [...new Set(records.map((c: any) => c.entity_account_id).filter(Boolean))];
  let accountEntityMap: Record<string, { name: string; last_name: string | null }> = {};
  if (accountIds.length > 0) {
    const { data: accounts } = await (supabase as any)
      .from("entity_accounts")
      .select("id, entities(name, last_name)")
      .in("id", accountIds);
    for (const a of accounts ?? []) {
      if (a.entities) accountEntityMap[a.id] = a.entities;
    }
  }
  return records.map((c: any) => ({
    ...c,
    depositor_entity: accountEntityMap[c.entity_account_id] || null,
  }));
}

// ── Shared commission list component ──
function CommissionList({
  commissions,
  isLoading,
  vatRate,
  perspective,
}: {
  commissions: CommissionRecord[];
  isLoading: boolean;
  vatRate: number;
  perspective: "referrer" | "house";
}) {
  if (isLoading) {
    return <Card><CardContent className="py-8 text-center"><Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" /></CardContent></Card>;
  }

  if (commissions.length === 0) {
    return (
      <Card><CardContent className="py-8 text-center text-muted-foreground">
        No commission records found.
      </CardContent></Card>
    );
  }

  // Group by referral house
  const grouped = commissions.reduce((acc: Record<string, CommissionRecord[]>, c) => {
    const key = c.referral_house_entity_id || "unknown";
    if (!acc[key]) acc[key] = [];
    acc[key].push(c);
    return acc;
  }, {});

  // For house perspective, also group by referrer within each house
  const fmtAmt = (v: number) => formatCurrency(v);
  const entityName = (e: { name: string; last_name: string | null } | null | undefined) =>
    e ? `${e.name}${e.last_name ? " " + e.last_name : ""}` : "—";

  const downloadCSV = () => {
    const headers = ["Date", "Depositor", "Referrer", "Referral House", "Gross Deposit", "Comm %", "Commission (excl VAT)", "VAT", "Total (incl VAT)", "Status", "Payment Date", "Payment Reference"];
    const rows = commissions.map((c) => {
      const isHouseVat = c.referral_house?.is_vat_registered || false;
      const commVat = isHouseVat ? Math.round(c.commission_amount * (vatRate / 100) * 100) / 100 : 0;
      return [
        c.transaction_date,
        `"${entityName(c.depositor_entity)}"`,
        `"${entityName(c.referrer)}"`,
        `"${entityName(c.referral_house)}"`,
        c.gross_amount.toFixed(2),
        `${c.commission_percentage}%`,
        c.commission_amount.toFixed(2),
        commVat.toFixed(2),
        (c.commission_amount + commVat).toFixed(2),
        c.status,
        c.payment_date || "",
        c.payment_reference || "",
      ].join(",");
    });
    const csv = [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `commissions-${perspective}-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={downloadCSV}>
          <Download className="h-4 w-4 mr-2" /> Download CSV
        </Button>
      </div>

      {Object.entries(grouped).map(([houseId, houseComms]) => {
        const house = houseComms[0]?.referral_house;
        const houseName = entityName(house);
        const isHouseVat = house?.is_vat_registered || false;

        // For house perspective, group by referrer within the house
        const byReferrer = perspective === "house"
          ? houseComms.reduce((acc: Record<string, CommissionRecord[]>, c) => {
              const rKey = c.referrer_entity_id || "unknown";
              if (!acc[rKey]) acc[rKey] = [];
              acc[rKey].push(c);
              return acc;
            }, {})
          : null;

        const totalExclVat = houseComms.reduce((s, c) => s + Number(c.commission_amount), 0);
        const totalVat = isHouseVat ? Math.round(totalExclVat * (vatRate / 100) * 100) / 100 : 0;
        const totalInclVat = totalExclVat + totalVat;

        const pendingCount = houseComms.filter(c => c.status === "pending").length;
        const paidCount = houseComms.filter(c => c.status === "paid").length;

        return (
          <Card key={houseId} className="overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 bg-muted/40 border-b">
              <div className="flex items-center gap-2">
                <Building2 className="h-4 w-4 text-primary" />
                <span className="font-semibold text-sm">{houseName}</span>
                {isHouseVat ? (
                  <Badge variant="outline" className="text-[10px] h-5 gap-1 text-emerald-600 border-emerald-500/40 bg-emerald-500/10">
                    <ShieldCheck className="h-3 w-3" /> VAT Registered
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-[10px] h-5 gap-1 text-muted-foreground border-border">
                    <ShieldX className="h-3 w-3" /> Not VAT Registered
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-2 text-xs">
                {pendingCount > 0 && <Badge variant="outline" className="text-warning border-warning/50 bg-warning/10">{pendingCount} Pending</Badge>}
                {paidCount > 0 && <Badge variant="outline" className="text-emerald-600 border-emerald-500/40 bg-emerald-500/10">{paidCount} Paid</Badge>}
              </div>
            </div>

            <CardContent className="p-0">
              {perspective === "house" && byReferrer ? (
                // House view: show referrer sub-groups
                Object.entries(byReferrer).map(([refId, refComms]) => {
                  const referrer = refComms[0]?.referrer;
                  const refName = entityName(referrer);
                  const refTotal = refComms.reduce((s, c) => s + Number(c.commission_amount), 0);

                    return (
                    <div key={refId}>
                      <div className="px-4 py-2 bg-muted/20 border-b flex items-center gap-2">
                        <User className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="text-xs font-semibold">Referrer: {refName}</span>
                      </div>
                      <CommissionTable commissions={refComms} fmtAmt={fmtAmt} entityName={entityName} showReferrer={true} />
                      {/* Referrer subtotal */}
                      <Table>
                        <TableBody>
                          <TableRow className="bg-accent/30 border-t">
                            <TableCell colSpan={5} className="text-right text-xs font-bold uppercase tracking-wider text-muted-foreground">
                              Subtotal — {refName}
                            </TableCell>
                            <TableCell className="text-right text-sm font-bold">{fmtAmt(refTotal)}</TableCell>
                            <TableCell colSpan={2} />
                          </TableRow>
                        </TableBody>
                      </Table>
                    </div>
                  );
                })
              ) : (
                // Referrer view: flat list
                <CommissionTable commissions={houseComms} fmtAmt={fmtAmt} entityName={entityName} showReferrer={true} />
              )}

              {/* House totals */}
              <Table>
                <TableBody>
                  <TableRow className="bg-muted/30 border-t-2">
                    <TableCell colSpan={6} className="text-right text-xs font-bold uppercase tracking-wider text-muted-foreground">
                      House Total (excl VAT)
                    </TableCell>
                    <TableCell className="text-right text-sm font-bold">{fmtAmt(totalExclVat)}</TableCell>
                    <TableCell />
                  </TableRow>
                  <TableRow className="bg-muted/30">
                    <TableCell colSpan={6} className="text-right text-xs text-muted-foreground">
                      VAT {isHouseVat ? `(${vatRate}%)` : ""}
                    </TableCell>
                    <TableCell className="text-right text-sm text-muted-foreground">{fmtAmt(totalVat)}</TableCell>
                    <TableCell />
                  </TableRow>
                  <TableRow className="bg-muted/30 border-t">
                    <TableCell colSpan={6} className="text-right text-xs font-bold uppercase tracking-wider">
                      Total Payable (incl VAT)
                    </TableCell>
                    <TableCell className="text-right text-sm font-bold text-primary">{fmtAmt(totalInclVat)}</TableCell>
                    <TableCell />
                  </TableRow>
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

// ── Commission table rows ──
function CommissionTable({
  commissions,
  fmtAmt,
  entityName,
  showReferrer,
}: {
  commissions: CommissionRecord[];
  fmtAmt: (v: number) => string;
  entityName: (e: { name: string; last_name: string | null } | null | undefined) => string;
  showReferrer: boolean;
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Date</TableHead>
          <TableHead>Depositor</TableHead>
          {showReferrer && <TableHead>Referrer</TableHead>}
          <TableHead className="text-right">Gross Deposit</TableHead>
          <TableHead className="text-right">Rate</TableHead>
          <TableHead className="text-right">Commission (excl VAT)</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Payment Ref</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {commissions.map((c) => (
          <TableRow key={c.id}>
            <TableCell className="text-sm">{c.transaction_date}</TableCell>
            <TableCell className="text-sm">{entityName(c.depositor_entity)}</TableCell>
            {showReferrer && <TableCell className="text-sm font-medium">{entityName(c.referrer)}</TableCell>}
            <TableCell className="text-right text-sm">{fmtAmt(c.gross_amount)}</TableCell>
            <TableCell className="text-right text-sm">{c.commission_percentage}%</TableCell>
            <TableCell className="text-right text-sm font-semibold">{fmtAmt(c.commission_amount)}</TableCell>
            <TableCell>
              <Badge
                variant="outline"
                className={c.status === "paid"
                  ? "text-emerald-600 border-emerald-500/40 bg-emerald-500/10"
                  : "text-warning border-warning/50 bg-warning/10"
                }
              >
                {c.status === "paid" ? "Paid" : "Pending"}
              </Badge>
            </TableCell>
            <TableCell className="text-xs text-muted-foreground">{c.payment_reference || "—"}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export default MyCommissionsTab;
