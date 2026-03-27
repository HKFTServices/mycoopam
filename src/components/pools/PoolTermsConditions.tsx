import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/contexts/TenantContext";
import { resolveTermsMergeFields } from "@/lib/resolveTermsMergeFields";

interface PoolTermsConditionsProps {
  tenantId: string;
  poolIds: string[];
  lang?: string;
  label?: string;
}

const PoolTermsConditions = ({ tenantId, poolIds, lang = "en", label = "Terms & Conditions" }: PoolTermsConditionsProps) => {
  const { currentTenant, branding } = useTenant();
  const { data: terms = [] } = useQuery({
    queryKey: ["pool_terms_conditions", tenantId, lang],
    queryFn: async () => {
      // Try to get T&C in the member's language first
      let query = (supabase as any)
        .from("terms_conditions")
        .select("*")
        .eq("tenant_id", tenantId)
        .eq("condition_type", "pool")
        .eq("is_active", true)
        .eq("language_code", lang)
        .order("effective_from", { ascending: false })
        .limit(1);
      
      let { data, error } = await query;
      if (error) throw error;
      
      // Fallback to English if no T&C in member's language
      if (!data || data.length === 0) {
        const fallback = await (supabase as any)
          .from("terms_conditions")
          .select("*")
          .eq("tenant_id", tenantId)
          .eq("condition_type", "pool")
          .eq("is_active", true)
          .eq("language_code", "en")
          .order("effective_from", { ascending: false })
          .limit(1);
        if (fallback.error) throw fallback.error;
        data = fallback.data;
      }
      
      return data ?? [];
    },
    enabled: !!tenantId && poolIds.length > 0,
  });

  if (terms.length === 0) return null;

  const tc = terms[0];
  const resolved = resolveTermsMergeFields(tc.content, {
    tenantName: currentTenant?.name,
    legalEntityName: branding.legalEntityName,
    tenantSlug: currentTenant?.slug,
  });

  return (
    <div className="mt-1">
      <p className="text-xs font-medium text-muted-foreground mb-1">{label}</p>
      <div
        className="prose prose-xs max-w-none dark:prose-invert text-muted-foreground text-xs leading-relaxed"
        dangerouslySetInnerHTML={{ __html: resolved }}
      />
    </div>
  );
};

export default PoolTermsConditions;
