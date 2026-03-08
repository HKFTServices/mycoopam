import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import type { StepProps } from "./types";

const ReferrerStep = ({ data, update, tenantId }: StepProps) => {
  const commissionOptions = useMemo(() => {
    const opts = [];
    for (let i = 0; i <= 20; i++) {
      const val = (i * 0.25).toFixed(2);
      opts.push({ value: val, label: `${(i * 0.25).toFixed(2)}%` });
    }
    return opts;
  }, []);

  // Fetch registered referrers with their referral house info
  const { data: referrers = [], isLoading } = useQuery({
    queryKey: ["referrers_list", tenantId],
    queryFn: async () => {
      // Fetch individual referrers with their linked entity and referral house entity
      const { data: refs } = await (supabase as any)
        .from("referrers")
        .select("id, referrer_number, entity_id, referral_house_entity_id, is_active")
        .eq("tenant_id", tenantId)
        .eq("is_active", true);

      if (!refs || refs.length === 0) return [];

      // Collect all entity IDs (referrer entities + house entities)
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
        return { id: r.id as string, label };
      });
    },
    enabled: !!tenantId,
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Referrer & Commission</CardTitle>
        <CardDescription>Were you referred by an existing member?</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-3">
          <Switch checked={data.hasReferrer} onCheckedChange={(v) => update({ hasReferrer: v, referrerId: "" })} />
          <Label>I was referred by an existing member</Label>
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
            <div className="space-y-2 max-w-xs">
              <Label>Agreed Commission Percentage *</Label>
              <Select value={data.commissionPercentage} onValueChange={(v) => update({ commissionPercentage: v })}>
                <SelectTrigger><SelectValue placeholder="Select %" /></SelectTrigger>
                <SelectContent>
                  {commissionOptions.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default ReferrerStep;
