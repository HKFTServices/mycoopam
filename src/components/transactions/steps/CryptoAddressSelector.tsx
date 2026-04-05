import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Bitcoin, Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface CryptoAddress {
  id: string;
  crypto_name: string;
  crypto_symbol: string;
  wallet_address: string;
  destination_tag: string | null;
}

const CryptoAddressSelector = ({ tenantId }: { tenantId?: string }) => {
  const [selectedId, setSelectedId] = useState<string>("");
  const [copied, setCopied] = useState<string | null>(null);

  const { data: addresses } = useQuery({
    queryKey: ["tenant_crypto_addresses_active", tenantId],
    queryFn: async () => {
      if (!tenantId) return [];
      const { data, error } = await (supabase as any)
        .from("tenant_crypto_addresses")
        .select("id, crypto_name, crypto_symbol, wallet_address, destination_tag")
        .eq("tenant_id", tenantId)
        .eq("is_active", true)
        .order("display_order");
      if (error) throw error;
      return (data || []) as CryptoAddress[];
    },
    enabled: !!tenantId,
  });

  if (!addresses || addresses.length === 0) {
    return (
      <div className="text-xs text-muted-foreground bg-muted/50 rounded-lg px-3 py-2">
        No crypto addresses configured. Contact your administrator.
      </div>
    );
  }

  const selected = addresses.find((a) => a.id === selectedId);

  const handleCopy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopied(label);
    toast.success(`${label} copied`);
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <div className="space-y-3 rounded-xl border-2 border-orange-500/30 bg-orange-500/5 p-4">
      <div className="flex items-center gap-2">
        <Bitcoin className="h-4 w-4 text-orange-500" />
        <span className="text-sm font-semibold">Select Cryptocurrency</span>
      </div>

      <Select value={selectedId} onValueChange={setSelectedId}>
        <SelectTrigger className="h-9 text-sm">
          <SelectValue placeholder="Choose crypto to deposit..." />
        </SelectTrigger>
        <SelectContent>
          {addresses.map((a) => (
            <SelectItem key={a.id} value={a.id}>
              <span className="flex items-center gap-2">
                <span className="font-mono text-xs font-bold">{a.crypto_symbol}</span>
                <span>{a.crypto_name}</span>
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {selected && (
        <div className="space-y-2 animate-fade-in">
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="font-mono text-xs">{selected.crypto_symbol}</Badge>
            <span className="text-sm font-medium">{selected.crypto_name}</span>
          </div>

          <div className="space-y-1">
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Wallet Address</span>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-xs font-mono bg-background border rounded-md px-2 py-1.5 break-all select-all">
                {selected.wallet_address}
              </code>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-8 w-8 shrink-0"
                onClick={() => handleCopy(selected.wallet_address, "Address")}
              >
                {copied === "Address" ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
              </Button>
            </div>
          </div>

          {selected.destination_tag && (
            <div className="space-y-1">
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Destination Tag / Memo</span>
              <div className="flex items-center gap-2">
                <code className="flex-1 text-xs font-mono bg-background border rounded-md px-2 py-1.5 break-all select-all">
                  {selected.destination_tag}
                </code>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-8 w-8 shrink-0"
                  onClick={() => handleCopy(selected.destination_tag!, "Tag")}
                >
                  {copied === "Tag" ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                </Button>
              </div>
            </div>
          )}

          <p className="text-[10px] text-muted-foreground">
            Send your deposit to this address. Include the exact tag/memo if shown. Confirmation details will be sent via email.
          </p>
        </div>
      )}
    </div>
  );
};

export default CryptoAddressSelector;
