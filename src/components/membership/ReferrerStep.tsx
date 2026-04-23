import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import type { StepProps } from "./types";

const ReferrerStep = ({ data, update, tenantId }: StepProps) => {
  const [autoApplied, setAutoApplied] = useState(false);

  // Fetch the tenant's single active referral plan (commission % source of truth)
  const { data: activePlan } = useQuery({
    queryKey: ["active_referral_plan", tenantId],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("referral_plans")
        .select("id, commission_percentage")
        .eq("tenant_id", tenantId)
        .eq("is_active", true)
        .maybeSingle();
      return data as { id: string; commission_percentage: number } | null;
    },
    enabled: !!tenantId,
  });

  const activePct = activePlan ? Number(activePlan.commission_percentage) : null;

  // Fetch registered referrers with their referral house info
  const { data: referrers = [], isLoading } = useQuery({
    queryKey: ["referrers_list", tenantId],
    queryFn: async () => {
      const { data: refs } = await (supabase as any)
        .from("referrers")
        .select("id, referrer_number, entity_id, referral_house_entity_id, is_active, referral_code")
        .eq("tenant_id", tenantId)
        .eq("is_active", true);

      if (!refs || refs.length === 0) return [];

      const allEntityIds: string[] = Array.from(new Set(
        refs.flatMap((r: any) => [r.entity_id, r.referral_house_entity_id].filter(Boolean))
      ));

      let entityMap = new Map<string, { name: string; last_name: string | null }>();
      if (allEntityIds.length > 0) {
        const { data: entities } = await supabase
          .from("entities")
          .select("id, name, last_name")
          .in("id", allEntityIds);
        (entities ?? []).forEach((e) => entityMap.set(e.id, e));
      }

      return refs.map((r: any) => {
        const referrerEntity = entityMap.get(r.entity_id);
        const houseEntity = entityMap.get(r.referral_house_entity_id);
        const referrerName = referrerEntity
          ? [referrerEntity.name, referrerEntity.last_name].filter(Boolean).join(" ")
          : "Unknown";
        const houseName = houseEntity
          ? [houseEntity.name, houseEntity.last_name].filter(Boolean).join(" ")
          : "";
        const label = houseName
          ? `${referrerName} (${r.referrer_number}) — ${houseName}`
          : `${referrerName} (${r.referrer_number})`;
        return { id: r.id as string, label, referralCode: r.referral_code };
      });
    },
    enabled: !!tenantId,
  });

  // Always sync commission % to the active plan whenever a referrer is selected
  useEffect(() => {
    if (!data.hasReferrer || activePct === null) return;
    const target = activePct.toFixed(2);
    if (data.commissionPercentage !== target) {
      update({ commissionPercentage: target });
    }
  }, [data.hasReferrer, data.referrerId, activePct, data.commissionPercentage, update]);

  // Auto-apply referrer from referral link (stored in localStorage)
  useEffect(() => {
    if (autoApplied || isLoading || referrers.length === 0) return;
    const storedCode = localStorage.getItem("referralCode");
    if (!storedCode) return;

    const matchingReferrer = referrers.find((r) => r.referralCode === storedCode);
    if (matchingReferrer) {
      const commPct = activePct !== null ? activePct.toFixed(2) : (data.commissionPercentage || "0");
      update({ hasReferrer: true, referrerId: matchingReferrer.id, commissionPercentage: commPct });
      setAutoApplied(true);
    }
  }, [referrers, isLoading, autoApplied, activePct, data.commissionPercentage, update]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Referrer & Commission</CardTitle>
        <CardDescription>Were you referred by an existing member?</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-3 flex-wrap">
          <Switch checked={data.hasReferrer} onCheckedChange={(v) => update({ hasReferrer: v, referrerId: "" })} />
          <Label>I was referred by an existing member</Label>
          {autoApplied && <Badge variant="secondary" className="text-xs">Auto-applied from referral link</Badge>}
        </div>
        {data.hasReferrer && (
          <div className="space-y-4 border-t border-border pt-4">
            <div className="space-y-2">
              <Label>Select Referrer *</Label>
              <Select value={data.referrerId ?? ""} onValueChange={(v) => update({ referrerId: v })}>
                <SelectTrigger>
                  <SelectValue placeholder={isLoading ? "Loading referrers…" : "Select a referrer"} />
                </SelectTrigger>
                <SelectContent>
                  {referrers.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.label}
                    </SelectItem>
                  ))}
                  {!isLoading && referrers.length === 0 && (
                    <div className="px-3 py-2 text-sm text-muted-foreground">No referrers registered yet</div>
                  )}
                </SelectContent>
              </Select>
            </div>
            <div className="rounded-md bg-muted/50 p-3 text-sm">
              <span className="text-muted-foreground">Commission rate (set by cooperative): </span>
              <span className="font-semibold">
                {activePct !== null ? `${activePct.toFixed(2)}%` : "Not configured"}
              </span>
              {activePct === null && (
                <p className="text-xs text-muted-foreground mt-1">
                  No active referral plan. The cooperative admin needs to activate one.
                </p>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default ReferrerStep;
