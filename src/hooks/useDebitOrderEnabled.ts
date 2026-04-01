import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/contexts/TenantContext";

/**
 * Returns whether the "debit_order" payment method is enabled for the current tenant.
 * While loading, returns false to avoid flashing UI that should be hidden.
 */
export const useDebitOrderEnabled = () => {
  const { currentTenant } = useTenant();

  const { data: isEnabled = false, isLoading } = useQuery({
    queryKey: ["debit_order_enabled", currentTenant?.id],
    queryFn: async () => {
      if (!currentTenant) return false;
      const { data, error } = await (supabase as any)
        .from("tenant_payment_methods")
        .select("is_enabled")
        .eq("tenant_id", currentTenant.id)
        .eq("method_code", "debit_order")
        .maybeSingle();
      if (error) return false;
      return data?.is_enabled ?? false;
    },
    enabled: !!currentTenant,
    staleTime: 5 * 60 * 1000,
  });

  return { isDebitOrderEnabled: isEnabled, isLoading };
};
