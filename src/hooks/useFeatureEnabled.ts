import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/contexts/TenantContext";

/**
 * Returns whether a given tenant feature module is enabled.
 * Defaults to `true` when no row exists in tenant_features for the feature.
 */
export const useFeatureEnabled = (featureKey: string) => {
  const { currentTenant } = useTenant();

  const { data, isLoading } = useQuery({
    queryKey: ["tenant_feature", currentTenant?.id, featureKey],
    queryFn: async () => {
      if (!currentTenant) return true;
      const { data, error } = await (supabase as any)
        .from("tenant_features")
        .select("is_enabled")
        .eq("tenant_id", currentTenant.id)
        .eq("feature_key", featureKey)
        .maybeSingle();
      if (error) return true;
      // default enabled if no row
      return data ? !!data.is_enabled : true;
    },
    enabled: !!currentTenant,
    staleTime: 5 * 60 * 1000,
  });

  return { isEnabled: data ?? true, isLoading };
};

export const useLoansEnabled = () => {
  const { isEnabled, isLoading } = useFeatureEnabled("loans");
  return { isLoansEnabled: isEnabled, isLoading };
};
