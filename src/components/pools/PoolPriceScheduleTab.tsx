import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/contexts/TenantContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Clock } from "lucide-react";
import { toast } from "sonner";

type Schedule = {
  id: string;
  update_time: string;
  is_active: boolean;
};

export const PoolPriceScheduleTab = ({ poolId }: { poolId: string }) => {
  const { currentTenant } = useTenant();
  const queryClient = useQueryClient();
  const [newTime, setNewTime] = useState("08:00");

  const { data: schedules = [], isLoading } = useQuery({
    queryKey: ["pool_price_schedules", poolId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("pool_price_schedules")
        .select("id, update_time, is_active")
        .eq("pool_id", poolId)
        .order("update_time");
      if (error) throw error;
      return data as Schedule[];
    },
    enabled: !!poolId,
  });

  const addMutation = useMutation({
    mutationFn: async (time: string) => {
      if (!currentTenant) throw new Error("No tenant");
      const { error } = await (supabase as any)
        .from("pool_price_schedules")
        .insert({ tenant_id: currentTenant.id, pool_id: poolId, update_time: time });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pool_price_schedules", poolId] });
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
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["pool_price_schedules", poolId] }),
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
      queryClient.invalidateQueries({ queryKey: ["pool_price_schedules", poolId] });
      toast.success("Schedule removed");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-4 py-2">
      <p className="text-sm text-muted-foreground">
        Configure daily times (South African time) when stock and pool prices should be updated automatically.
      </p>

      <div className="flex items-center gap-2">
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
        <p className="text-sm text-muted-foreground">No schedules configured.</p>
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
    </div>
  );
};
