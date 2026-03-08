import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Upload, CheckCircle2 } from "lucide-react";
import type { StepProps } from "./types";

interface BankProps extends StepProps {
  bankProofRequired: boolean;
}

const BankDetailsStep = ({ data, update, tenantId, bankProofRequired }: BankProps) => {
  const { data: countries = [] } = useQuery({
    queryKey: ["countries_active"],
    queryFn: async () => {
      const { data } = await supabase.from("countries").select("*").eq("is_active", true).order("name");
      return data ?? [];
    },
  });

  const { data: banks = [] } = useQuery({
    queryKey: ["banks_by_country", data.bankCountry],
    queryFn: async () => {
      if (!data.bankCountry) return [];
      const { data: d } = await supabase.from("banks").select("*").eq("country_id", data.bankCountry).eq("is_active", true).order("name");
      return d ?? [];
    },
    enabled: !!data.bankCountry,
  });

  const { data: bankAccountTypes = [] } = useQuery({
    queryKey: ["bank_account_types"],
    queryFn: async () => {
      const { data: d } = await supabase.from("bank_account_types").select("*").eq("is_active", true).order("name");
      return d ?? [];
    },
  });

  useEffect(() => {
    update({ skipBank: !bankProofRequired });
  }, [bankProofRequired]);

  const selectedBank = banks.find((b: any) => b.id === data.bankId);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Bank Details</CardTitle>
        <CardDescription>
          {bankProofRequired ? "Enter banking information and upload proof of bank account" : "Bank details are optional at this stage"}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!bankProofRequired && (
          <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/30 p-4">
            <Switch checked={data.skipBank} onCheckedChange={(v) => update({ skipBank: v })} />
            <Label className="text-sm">Skip bank details for now</Label>
          </div>
        )}
        {!data.skipBank && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Country *</Label>
                <Select value={data.bankCountry} onValueChange={(v) => update({ bankCountry: v, bankId: "" })}>
                  <SelectTrigger><SelectValue placeholder="Select country" /></SelectTrigger>
                  <SelectContent>{countries.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Bank *</Label>
                <Select value={data.bankId} onValueChange={(v) => update({ bankId: v })} disabled={!data.bankCountry}>
                  <SelectTrigger><SelectValue placeholder={data.bankCountry ? "Select bank" : "Select country first"} /></SelectTrigger>
                  <SelectContent>{banks.map((b: any) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>

            {selectedBank && (
              <div className="rounded-lg border border-border bg-muted/30 p-3 text-sm space-y-1">
                <div className="flex gap-4">
                  {selectedBank.branch_code && <span><span className="text-muted-foreground">Branch Code:</span> {selectedBank.branch_code}</span>}
                  {selectedBank.swift_code && <span><span className="text-muted-foreground">SWIFT:</span> {selectedBank.swift_code}</span>}
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Account Name *</Label>
                <Input value={data.accountName} onChange={(e) => update({ accountName: e.target.value })} placeholder="Account holder name" />
              </div>
              <div className="space-y-2">
                <Label>Account Type *</Label>
                <Select value={data.bankAccountTypeId} onValueChange={(v) => update({ bankAccountTypeId: v })}>
                  <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                  <SelectContent>{bankAccountTypes.map((t: any) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Account Number *</Label>
                <Input value={data.accountNumber} onChange={(e) => update({ accountNumber: e.target.value })} placeholder="Account number" />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Proof of Bank Account{bankProofRequired ? " *" : ""}</Label>
              <div className="flex items-center gap-3 border border-border rounded-lg p-4">
                <div className="flex-1">
                  {data.proofFile ? (
                    <p className="text-sm flex items-center gap-1"><CheckCircle2 className="h-3.5 w-3.5 text-primary" />{data.proofFile.name}</p>
                  ) : (
                    <p className="text-sm text-muted-foreground">Upload bank statement or confirmation letter</p>
                  )}
                </div>
                <label className="cursor-pointer">
                  <input type="file" className="hidden" accept=".pdf,.jpg,.jpeg,.png" onChange={(e) => { const f = e.target.files?.[0]; if (f) update({ proofFile: f }); }} />
                  <Button variant={data.proofFile ? "outline" : "default"} size="sm" asChild>
                    <span><Upload className="h-3.5 w-3.5 mr-1.5" />{data.proofFile ? "Replace" : "Upload"}</span>
                  </Button>
                </label>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
};

export default BankDetailsStep;
