import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Terms & Conditions</CardTitle>
      </CardHeader>
      <CardContent>
        <Accordion type="single" collapsible className="w-full">
          {terms.map((tc: any, idx: number) => (
            <AccordionItem key={tc.id} value={tc.id}>
              <AccordionTrigger className="text-sm font-medium">
                Pool Terms & Conditions
                {tc.language_code && tc.language_code !== "en" && (
                  <span className="ml-2 text-xs text-muted-foreground uppercase">({tc.language_code})</span>
                )}
              </AccordionTrigger>
              <AccordionContent>
                <div
                  className="prose prose-sm max-w-none dark:prose-invert text-muted-foreground"
                  dangerouslySetInnerHTML={{ __html: tc.content }}
                />
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </CardContent>
    </Card>
  );
};

export default PoolTermsConditions;
