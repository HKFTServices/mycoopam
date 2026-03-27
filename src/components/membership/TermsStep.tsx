import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useTenant } from "@/contexts/TenantContext";
import { resolveTermsMergeFields } from "@/lib/resolveTermsMergeFields";
import type { StepProps } from "./types";

const TermsStep = ({ data, update, tenantId }: StepProps) => {
  const { currentTenant, branding } = useTenant();
  const { data: membershipTerms = [] } = useQuery({
    queryKey: ["membership_terms", tenantId],
    queryFn: async () => {
      const { data: d } = await supabase
        .from("terms_conditions")
        .select("*")
        .eq("tenant_id", tenantId)
        .eq("is_active", true)
        .eq("condition_type", "membership")
        .eq("language_code", "en")
        .order("effective_from", { ascending: false });
      return d ?? [];
    },
    enabled: !!tenantId,
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Membership Terms & Conditions</CardTitle>
        <CardDescription>Please read and accept the membership terms to complete your application</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {membershipTerms.length === 0 ? (
          <p className="text-muted-foreground text-sm text-center py-4">No membership terms configured yet.</p>
        ) : (
          membershipTerms.map((term) => (
            <div key={term.id} className="space-y-3">
              <h3 className="text-sm font-semibold capitalize">{term.condition_type} Terms</h3>
              <div className="max-h-48 overflow-y-auto border border-border rounded-lg p-4 bg-muted/30">
                <div className="prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: resolveTermsMergeFields(term.content, { tenantName: currentTenant?.name, legalEntityName: branding.legalEntityName, tenantSlug: currentTenant?.slug }) }} />
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id={`accept-mem-${term.id}`}
                  checked={!!data.acceptedTerms[term.id]}
                  onCheckedChange={(checked) => update({ acceptedTerms: { ...data.acceptedTerms, [term.id]: !!checked } })}
                />
                <Label htmlFor={`accept-mem-${term.id}`} className="text-sm">
                  I have read and accept the membership terms and conditions
                </Label>
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
};

export default TermsStep;
