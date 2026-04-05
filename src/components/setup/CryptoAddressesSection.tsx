import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/contexts/TenantContext";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Loader2, Plus, Trash2, Bitcoin } from "lucide-react";
import { toast } from "sonner";

interface CryptoAddress {
  id: string;
  crypto_name: string;
  crypto_symbol: string;
  wallet_address: string;
  destination_tag: string | null;
  is_active: boolean;
  display_order: number;
}

const CryptoAddressesSection = () => {
  const { currentTenant } = useTenant();
  const queryClient = useQueryClient();
  const [newEntry, setNewEntry] = useState({ crypto_name: "", crypto_symbol: "", wallet_address: "", destination_tag: "" });

  const { data: addresses, isLoading } = useQuery({
    queryKey: ["tenant_crypto_addresses", currentTenant?.id],
    queryFn: async () => {
      if (!currentTenant) return [];
      const { data, error } = await (supabase as any)
        .from("tenant_crypto_addresses")
        .select("*")
        .eq("tenant_id", currentTenant.id)
        .order("display_order");
      if (error) throw error;
      return (data || []) as CryptoAddress[];
    },
    enabled: !!currentTenant,
  });

  const addMutation = useMutation({
    mutationFn: async () => {
      if (!currentTenant) throw new Error("No tenant");
      const { error } = await (supabase as any)
        .from("tenant_crypto_addresses")
        .insert({
          tenant_id: currentTenant.id,
          crypto_name: newEntry.crypto_name.trim(),
          crypto_symbol: newEntry.crypto_symbol.trim().toUpperCase(),
          wallet_address: newEntry.wallet_address.trim(),
          destination_tag: newEntry.destination_tag.trim() || null,
          display_order: (addresses?.length || 0) + 1,
        });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tenant_crypto_addresses"] });
      setNewEntry({ crypto_name: "", crypto_symbol: "", wallet_address: "", destination_tag: "" });
      toast.success("Crypto address added");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await (supabase as any)
        .from("tenant_crypto_addresses")
        .update({ is_active })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tenant_crypto_addresses"] });
      toast.success("Updated");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any)
        .from("tenant_crypto_addresses")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tenant_crypto_addresses"] });
      toast.success("Address removed");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const canAdd = newEntry.crypto_name.trim() && newEntry.crypto_symbol.trim() && newEntry.wallet_address.trim();

  if (isLoading) {
    return (
      <div className="flex justify-center py-4">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4 mt-4 rounded-lg border p-4 bg-muted/30">
      <div className="flex items-center gap-2">
        <Bitcoin className="h-4 w-4 text-orange-500" />
        <h4 className="text-sm font-bold">Crypto Wallet Addresses</h4>
      </div>
      <p className="text-xs text-muted-foreground">
        Add crypto addresses that members can send deposits to. These will be shown when a member selects crypto as their payment method.
      </p>

      {addresses && addresses.length > 0 && (
        <div className="space-y-2">
          {addresses.map((addr) => (
            <div key={addr.id} className="flex items-center gap-3 rounded-md border bg-background p-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold">{addr.crypto_name}</span>
                  <Badge variant="secondary" className="text-[10px] font-mono">{addr.crypto_symbol}</Badge>
                  {addr.is_active && (
                    <Badge variant="outline" className="text-[10px] text-emerald-600 border-emerald-300">Active</Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground font-mono truncate mt-0.5">{addr.wallet_address}</p>
                {addr.destination_tag && (
                  <p className="text-[10px] text-muted-foreground mt-0.5">Tag: {addr.destination_tag}</p>
                )}
              </div>
              <Switch
                checked={addr.is_active}
                onCheckedChange={(v) => toggleMutation.mutate({ id: addr.id, is_active: v })}
              />
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-destructive hover:text-destructive"
                onClick={() => deleteMutation.mutate(addr.id)}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label className="text-xs">Crypto Name</Label>
          <Input
            placeholder="e.g. Bitcoin"
            value={newEntry.crypto_name}
            onChange={(e) => setNewEntry((p) => ({ ...p, crypto_name: e.target.value }))}
            className="h-8 text-sm"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Symbol</Label>
          <Input
            placeholder="e.g. BTC"
            value={newEntry.crypto_symbol}
            onChange={(e) => setNewEntry((p) => ({ ...p, crypto_symbol: e.target.value.toUpperCase() }))}
            className="h-8 text-sm font-mono"
            maxLength={10}
          />
        </div>
        <div className="col-span-2 space-y-1">
          <Label className="text-xs">Wallet Address</Label>
          <Input
            placeholder="Wallet address"
            value={newEntry.wallet_address}
            onChange={(e) => setNewEntry((p) => ({ ...p, wallet_address: e.target.value }))}
            className="h-8 text-sm font-mono"
          />
        </div>
        <div className="col-span-2 space-y-1">
          <Label className="text-xs">Destination Tag / Memo (optional)</Label>
          <Input
            placeholder="e.g. memo or tag"
            value={newEntry.destination_tag}
            onChange={(e) => setNewEntry((p) => ({ ...p, destination_tag: e.target.value }))}
            className="h-8 text-sm"
          />
        </div>
      </div>
      <Button
        size="sm"
        onClick={() => addMutation.mutate()}
        disabled={!canAdd || addMutation.isPending}
        className="gap-1.5"
      >
        {addMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
        Add Address
      </Button>
    </div>
  );
};

export default CryptoAddressesSection;
