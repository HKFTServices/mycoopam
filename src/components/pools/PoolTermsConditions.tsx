import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";

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
        .order("effective_from", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!tenantId && poolIds.length > 0,
  });

  if (terms.length === 0) return null;

  return (
    <Accordion type="single" collapsible className="w-full">
      {terms.map((tc: any) => (
        <AccordionItem key={tc.id} value={tc.id} className="border-b-0">
          <AccordionTrigger className="text-xs font-medium text-muted-foreground py-1 hover:no-underline">
            Terms & Conditions
          </AccordionTrigger>
          <AccordionContent>
            <div
              className="prose prose-xs max-w-none dark:prose-invert text-muted-foreground text-xs leading-relaxed"
              dangerouslySetInnerHTML={{ __html: tc.content }}
            />
          </AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  );
};

export default PoolTermsConditions;
