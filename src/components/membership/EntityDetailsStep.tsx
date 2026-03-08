import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import type { StepProps } from "./types";

const formatToInternational = (val: string) => {
  const digits = val.replace(/[^0-9+]/g, "");
  if (digits.startsWith("0")) return "+27" + digits.slice(1);
  if (digits.startsWith("27") && !digits.startsWith("+")) return "+" + digits;
  return digits;
};

const EntityDetailsStep = ({ data, update, tenantId }: StepProps) => {
  const { data: categories = [] } = useQuery({
    queryKey: ["entity_categories_le"],
    queryFn: async () => {
      const { data } = await supabase
        .from("entity_categories")
        .select("id, name, entity_type")
        .eq("entity_type", "legal_entity")
        .eq("is_active", true)
        .order("name");
      return data ?? [];
    },
  });

  const { data: relationshipTypes = [] } = useQuery({
    queryKey: ["relationship_types_for", data.entityCategoryId],
    queryFn: async () => {
      if (!data.entityCategoryId) return [];
      const { data: d } = await supabase
        .from("relationship_types")
        .select("id, name")
        .eq("entity_category_id", data.entityCategoryId)
        .eq("is_active", true)
        .order("name");
      return d ?? [];
    },
    enabled: !!data.entityCategoryId,
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Entity Details</CardTitle>
        <CardDescription>Enter the details of the entity you're registering</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Entity Category *</Label>
            <Select value={data.entityCategoryId} onValueChange={(v) => update({ entityCategoryId: v, relationshipTypeId: "" })}>
              <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
              <SelectContent>
                {categories.map((c: any) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Your Relationship to Entity *</Label>
            <Select value={data.relationshipTypeId} onValueChange={(v) => update({ relationshipTypeId: v })} disabled={!data.entityCategoryId}>
              <SelectTrigger><SelectValue placeholder="Select relationship" /></SelectTrigger>
              <SelectContent>
                {relationshipTypes.map((r: any) => (
                  <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Preferred Language *</Label>
            <Select value={data.languageCode} onValueChange={(v) => update({ languageCode: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="en">English</SelectItem>
                <SelectItem value="af">Afrikaans</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Name of Entity *</Label>
            <Input value={data.entityName} onChange={(e) => update({ entityName: e.target.value })} placeholder="Company, Trust, etc. name" />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Registration Number *</Label>
            <Input value={data.registrationNumber} onChange={(e) => update({ registrationNumber: e.target.value })} placeholder="If not applicable, enter entity name" />
          </div>
          <div className="space-y-2">
            <Label>VAT Registered? *</Label>
            <RadioGroup value={data.isVatRegistered ? "yes" : "no"} onValueChange={(v) => update({ isVatRegistered: v === "yes", vatNumber: v === "no" ? "" : data.vatNumber })} className="flex gap-4 pt-2">
              <div className="flex items-center gap-2"><RadioGroupItem value="yes" id="vat_yes" /><Label htmlFor="vat_yes">Yes</Label></div>
              <div className="flex items-center gap-2"><RadioGroupItem value="no" id="vat_no" /><Label htmlFor="vat_no">No</Label></div>
            </RadioGroup>
            {data.isVatRegistered && (
              <Input value={data.vatNumber} onChange={(e) => update({ vatNumber: e.target.value })} placeholder="VAT Registration Number" className="mt-2" />
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Contact Number *</Label>
            <Input value={data.contactNumber} onChange={(e) => update({ contactNumber: e.target.value })} onBlur={() => update({ contactNumber: formatToInternational(data.contactNumber) })} placeholder="+27831234567" />
          </div>
          <div className="space-y-2">
            <Label>Alternative Contact Number</Label>
            <Input value={data.altContactNumber} onChange={(e) => update({ altContactNumber: e.target.value })} onBlur={() => { if (data.altContactNumber.trim()) update({ altContactNumber: formatToInternational(data.altContactNumber) }); }} placeholder="+27831234567" />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Email Address *</Label>
            <Input type="email" value={data.emailAddress} onChange={(e) => update({ emailAddress: e.target.value })} placeholder="email@example.com" />
          </div>
          <div className="space-y-2">
            <Label>CC Email Address</Label>
            <Input type="email" value={data.ccEmail} onChange={(e) => update({ ccEmail: e.target.value })} placeholder="Secondary email" />
          </div>
        </div>

        <div className="space-y-2">
          <Label>Website</Label>
          <Input value={data.website} onChange={(e) => update({ website: e.target.value })} placeholder="https://..." />
        </div>
      </CardContent>
    </Card>
  );
};

export default EntityDetailsStep;
