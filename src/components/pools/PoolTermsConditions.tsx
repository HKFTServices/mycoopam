import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface PoolTermsConditionsProps {
  tenantId: string;
  poolIds: string[];
}

const PoolTermsConditions = ({ tenantId, poolIds }: PoolTermsConditionsProps) => {
  const { data: terms = [] } = useQuery({
    queryKey: ["pool_terms_conditions", tenantId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("terms_conditions")
        .select("*")
        .eq("tenant_id", tenantId)
        .eq("condition_type", "pool")
        .eq("is_active", true)
        .order("effective_from", { ascending: false })
        .limit(1);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!tenantId && poolIds.length > 0,
  });

  if (terms.length === 0) return null;

  const tc = terms[0];

  return (
    <div className="mt-1">
      <p className="text-xs font-medium text-muted-foreground mb-1">Terms & Conditions</p>
      <div
        className="prose prose-xs max-w-none dark:prose-invert text-muted-foreground text-xs leading-relaxed"
        dangerouslySetInnerHTML={{ __html: tc.content }}
      />
    </div>
  );
};

export default PoolTermsConditions;
