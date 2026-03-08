import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { StepProps } from "./types";

type Suggestion = { description: string; place_id: string };

const AddressStep = ({ data, update }: StepProps) => {
  const [addressSearch, setAddressSearch] = useState("");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [searchTimeout, setSearchTimeout] = useState<ReturnType<typeof setTimeout> | null>(null);

  const { data: countries = [] } = useQuery({
    queryKey: ["countries"],
    queryFn: async () => {
      const { data } = await supabase.from("countries").select("*").eq("is_active", true).order("name");
      return data ?? [];
    },
  });

  const searchAddress = async (input: string) => {
    if (input.length < 3) { setSuggestions([]); return; }
    try {
      const res = await supabase.functions.invoke("google-places", { body: { input, type: "autocomplete" } });
      if (res.data?.predictions) {
        setSuggestions(res.data.predictions.map((p: any) => ({ description: p.description, place_id: p.place_id })));
      }
    } catch { setSuggestions([]); }
  };

  const selectAddress = async (suggestion: Suggestion) => {
    setSuggestions([]);
    setAddressSearch(suggestion.description);
    try {
      const res = await supabase.functions.invoke("google-places", { body: { input: suggestion.place_id, type: "details" } });
      if (res.data?.result) {
        const components = res.data.result.address_components ?? [];
        const get = (type: string) => components.find((c: any) => c.types.includes(type))?.long_name ?? "";
        update({
          streetAddress: [get("street_number"), get("route")].filter(Boolean).join(" "),
          suburb: get("sublocality") || get("sublocality_level_1") || get("neighborhood"),
          city: get("locality") || get("administrative_area_level_2"),
          province: get("administrative_area_level_1"),
          postalCode: get("postal_code"),
          country: get("country") || "South Africa",
        });
      }
    } catch { /* keep manual entry */ }
  };

  const handleSearchChange = (value: string) => {
    setAddressSearch(value);
    if (searchTimeout) clearTimeout(searchTimeout);
    setSearchTimeout(setTimeout(() => searchAddress(value), 400));
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Address Information</CardTitle>
        <CardDescription>Search or manually enter the address</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2 relative">
          <Label>Search Address</Label>
          <Input value={addressSearch} onChange={(e) => handleSearchChange(e.target.value)} placeholder="Start typing the address..." />
          {suggestions.length > 0 && (
            <div className="absolute z-10 top-full left-0 right-0 mt-1 bg-card border border-border rounded-lg shadow-lg max-h-48 overflow-y-auto">
              {suggestions.map((s) => (
                <button key={s.place_id} className="w-full text-left px-3 py-2 text-sm hover:bg-muted transition-colors" onClick={() => selectAddress(s)}>
                  {s.description}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-2">
          <Label>Street Address *</Label>
          <Input value={data.streetAddress} onChange={(e) => update({ streetAddress: e.target.value })} placeholder="Street number and name" />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2"><Label>Suburb</Label><Input value={data.suburb} onChange={(e) => update({ suburb: e.target.value })} placeholder="Suburb" /></div>
          <div className="space-y-2"><Label>City *</Label><Input value={data.city} onChange={(e) => update({ city: e.target.value })} placeholder="City" /></div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="space-y-2"><Label>Province</Label><Input value={data.province} onChange={(e) => update({ province: e.target.value })} placeholder="Province" /></div>
          <div className="space-y-2"><Label>Postal Code</Label><Input value={data.postalCode} onChange={(e) => update({ postalCode: e.target.value })} placeholder="Postal code" /></div>
          <div className="space-y-2">
            <Label>Country</Label>
            <Select value={data.country} onValueChange={(v) => update({ country: v })}>
              <SelectTrigger><SelectValue placeholder="Select country" /></SelectTrigger>
              <SelectContent>
                {countries.map((c: any) => (
                  <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default AddressStep;
