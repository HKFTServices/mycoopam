import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/contexts/TenantContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus, Trash2, Clock } from "lucide-react";
import { toast } from "sonner";

type Schedule = {
  id: string;
  update_time: string;
  is_active: boolean;
};

export const GlobalPriceScheduleCard = () => {
  const { currentTenant } = useTenant();
  const queryClient = useQueryClient();
  const [newTime, setNewTime] = useState("08:00");

  const { data: schedules = [], isLoading } = useQuery({
    queryKey: ["pool_price_schedules_global", currentTenant?.id],
    queryFn: async () => {
      if (!currentTenant) return [];
      const { data, error } = await (supabase as any)
        .from("pool_price_schedules")
        .select("id, update_time, is_active")
        .eq("tenant_id", currentTenant.id)
        .is("pool_id", null)
        .order("update_time");
      if (error) throw error;
      return data as Schedule[];
    },
    enabled: !!currentTenant,
  });

  const addMutation = useMutation({
    mutationFn: async (time: string) => {
      if (!currentTenant) throw new Error("No tenant");
      const { error } = await (supabase as any)
        .from("pool_price_schedules")
        .insert({ tenant_id: currentTenant.id, pool_id: null, update_time: time });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pool_price_schedules_global"] });
      toast.success("Schedule added");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await (supabase as any)
        .from("pool_price_schedules")
        .update({ is_active })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["pool_price_schedules_global"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any)
        .from("pool_price_schedules")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pool_price_schedules_global"] });
      toast.success("Schedule removed");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Clock className="h-4 w-4" />
          Price Update Schedule
          <Badge variant="secondary" className="ml-1 text-xs">{schedules.length} slots</Badge>
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Daily times when stock and pool prices are updated automatically for all pools.
        </p>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-2 mb-4">
          <Input
            type="time"
            value={newTime}
            onChange={(e) => setNewTime(e.target.value)}
            className="w-32"
          />
          <Button
            size="sm"
            onClick={() => addMutation.mutate(newTime)}
            disabled={addMutation.isPending}
          >
            <Plus className="h-4 w-4 mr-1" />Add
          </Button>
        </div>

        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : schedules.length === 0 ? (
          <p className="text-sm text-muted-foreground">No schedules configured yet.</p>
        ) : (
          <div className="space-y-2">
            {schedules.map((s) => (
              <div key={s.id} className="flex items-center gap-3 rounded-md border p-2">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <span className="font-mono text-sm font-medium">
                  {s.update_time.substring(0, 5)}
                </span>
                <Badge variant={s.is_active ? "default" : "secondary"} className="text-xs">
                  {s.is_active ? "Active" : "Inactive"}
                </Badge>
                <div className="ml-auto flex items-center gap-2">
                  <Switch
                    checked={s.is_active}
                    onCheckedChange={(v) => toggleMutation.mutate({ id: s.id, is_active: v })}
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-destructive"
                    onClick={() => deleteMutation.mutate(s.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
