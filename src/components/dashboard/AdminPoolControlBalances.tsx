import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/formatCurrency";
import { isAdminPool } from "@/lib/pools";
import { Landmark } from "lucide-react";

interface Props {
  tenantId: string;
  currencySymbol?: string;
}

const AdminPoolControlBalances = ({ tenantId, currencySymbol = "R" }: Props) => {
  const { data, isLoading } = useQuery({
    queryKey: ["admin_pool_control_balances", tenantId],
    queryFn: async () => {
      // Get the admin pool(s)
      const { data: pools } = await (supabase as any)
        .from("pools")
        .select("id, name")
        .eq("tenant_id", tenantId)
        .eq("is_active", true)
        .eq("is_deleted", false);

      const adminPools = (pools ?? []).filter((p: any) => isAdminPool(p));
      if (adminPools.length === 0) return null;

      const adminPoolIds = adminPools.map((p: any) => p.id);

      // Get control accounts for admin pool(s)
      const { data: controlAccounts } = await (supabase as any)
        .from("control_accounts")
        .select("id, name, account_type, pool_id")
        .eq("tenant_id", tenantId)
        .eq("is_active", true)
        .in("pool_id", adminPoolIds);

      if (!controlAccounts?.length) return null;

      const caIds = controlAccounts.map((ca: any) => ca.id);

      // Get balances via CFT aggregation
      const { data: balances } = await (supabase as any).rpc("get_cft_control_balances", {
        p_tenant_id: tenantId,
      });

      const balMap = new Map<string, number>();
      for (const b of balances ?? []) {
        const prev = balMap.get(b.control_account_id) ?? 0;
        balMap.set(b.control_account_id, prev + Number(b.balance));
      }

      const items = controlAccounts.map((ca: any) => ({
        id: ca.id,
        name: ca.name,
        type: ca.account_type,
        balance: balMap.get(ca.id) ?? 0,
      }));

      const totalBalance = items.reduce((s: number, i: any) => s + i.balance, 0);

      return { items, totalBalance, poolName: adminPools[0]?.name ?? "Admin Pool" };
    },
    enabled: !!tenantId,
  });

  if (isLoading || !data || data.items.length === 0) return null;

  const typeIcon = (type: string) => {
    switch (type) {
      case "cash": return "💵";
      case "vat": return "🧾";
      case "loan": return "🏦";
      default: return "📊";
    }
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <Landmark className="h-4 w-4 text-muted-foreground" />
            {data.poolName} — Control Accounts
          </CardTitle>
          <Badge variant={data.totalBalance === 0 ? "default" : "outline"} className="text-xs font-mono">
            Net: {formatCurrency(data.totalBalance, currencySymbol)}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="grid gap-2 sm:grid-cols-3">
          {data.items.map((item: any) => (
            <div
              key={item.id}
              className="flex items-center justify-between rounded-lg border border-border bg-muted/30 px-3 py-2"
            >
              <div className="flex items-center gap-2">
                <span className="text-sm">{typeIcon(item.type)}</span>
                <span className="text-xs font-medium capitalize">{item.type}</span>
              </div>
              <span className={`text-xs font-mono ${item.balance < 0 ? "text-destructive" : "text-foreground"}`}>
                {formatCurrency(item.balance, currencySymbol)}
              </span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};

export default AdminPoolControlBalances;
