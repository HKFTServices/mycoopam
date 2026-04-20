import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { Loader2, Save, Sparkles, Image as ImageIcon } from "lucide-react";

type Tenant = { id: string; name: string; slug: string };

type SeoRow = {
  id?: string;
  tenant_id: string;
  title: string | null;
  description: string | null;
  og_image_url: string | null;
  keywords: string | null;
  generated_by_ai: boolean;
  generated_at: string | null;
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tenant: Tenant | null;
  allowAiGeneration?: boolean;
}

export default function TenantSeoDialog({
  open,
  onOpenChange,
  tenant,
  allowAiGeneration = true,
}: Props) {
  const qc = useQueryClient();
  const [form, setForm] = useState<Partial<SeoRow>>({});

  const { data: seo, isLoading } = useQuery({
    queryKey: ["tenant_seo", tenant?.id],
    enabled: open && !!tenant?.id,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("tenant_seo")
        .select("*")
        .eq("tenant_id", tenant!.id)
        .maybeSingle();
      if (error) throw error;
      return data as SeoRow | null;
    },
  });

  useEffect(() => {
    if (seo) setForm(seo);
    else if (tenant) {
      setForm({
        tenant_id: tenant.id,
        title: tenant.name,
        description: `Sign in or apply for membership at ${tenant.name}. Pooled investments, member accounts, and financial administration.`,
        og_image_url: null,
        keywords: null,
      });
    }
  }, [seo, tenant]);

  const save = useMutation({
    mutationFn: async () => {
      if (!tenant) return;
      const payload = {
        tenant_id: tenant.id,
        title: form.title ?? null,
        description: form.description ?? null,
        og_image_url: form.og_image_url ?? null,
        keywords: form.keywords ?? null,
      };
      const { error } = await (supabase as any)
        .from("tenant_seo")
        .upsert(payload, { onConflict: "tenant_id" });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("SEO saved");
      qc.invalidateQueries({ queryKey: ["tenant_seo", tenant?.id] });
    },
    onError: (e: any) => toast.error(e.message || "Failed to save"),
  });

  const generate = useMutation({
    mutationFn: async () => {
      if (!tenant) return null;
      const { data, error } = await supabase.functions.invoke("generate-tenant-seo", {
        body: { tenant_id: tenant.id },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      return data;
    },
    onSuccess: (data: any) => {
      toast.success("AI SEO generated");
      if (data?.seo) {
        setForm((prev) => ({
          ...prev,
          title: data.seo.title,
          description: data.seo.description,
          keywords: data.seo.keywords,
          og_image_url: data.seo.og_image_url,
        }));
      }
      qc.invalidateQueries({ queryKey: ["tenant_seo", tenant?.id] });
    },
    onError: (e: any) => toast.error(e.message || "AI generation failed"),
  });

  const titleLen = (form.title ?? "").length;
  const descLen = (form.description ?? "").length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>SEO &amp; Link Preview — {tenant?.name}</DialogTitle>
          <DialogDescription>
            Controls what appears when {tenant?.slug}.myco-op.co.za is shared on WhatsApp, Slack, LinkedIn, Facebook, and other platforms.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 flex-wrap">
                {seo?.generated_by_ai && <Badge variant="secondary">AI generated</Badge>}
                {seo?.generated_at && (
                  <span className="text-xs text-muted-foreground">
                    {new Date(seo.generated_at).toLocaleString()}
                  </span>
                )}
                {!allowAiGeneration && (
                  <Badge variant="outline">Manual SEO only</Badge>
                )}
              </div>
              {allowAiGeneration && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => generate.mutate()}
                  disabled={generate.isPending}
                >
                  {generate.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <Sparkles className="h-4 w-4 mr-2" />
                  )}
                  Generate with AI
                </Button>
              )}
            </div>

            <Separator />

            <div className="space-y-1.5">
              <div className="flex justify-between">
                <Label>Title</Label>
                <span className={`text-xs ${titleLen > 60 ? "text-destructive" : "text-muted-foreground"}`}>
                  {titleLen}/60
                </span>
              </div>
              <Input
                value={form.title ?? ""}
                onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
                placeholder="e.g. AEM Cooperative — Pooled Investments"
              />
            </div>

            <div className="space-y-1.5">
              <div className="flex justify-between">
                <Label>Description</Label>
                <span className={`text-xs ${descLen > 160 ? "text-destructive" : "text-muted-foreground"}`}>
                  {descLen}/160
                </span>
              </div>
              <Textarea
                rows={3}
                value={form.description ?? ""}
                onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
                placeholder="Short, click-worthy summary shown under the title in link previews."
              />
            </div>

            <div className="space-y-1.5">
              <Label>Keywords</Label>
              <Input
                value={form.keywords ?? ""}
                onChange={(e) => setForm((p) => ({ ...p, keywords: e.target.value }))}
                placeholder="cooperative, investment club, pooled investments, ..."
              />
            </div>

            <div className="space-y-1.5">
              <Label>OG Image URL (1200×630 recommended)</Label>
              <Input
                value={form.og_image_url ?? ""}
                onChange={(e) => setForm((p) => ({ ...p, og_image_url: e.target.value }))}
                placeholder="https://..."
              />
              {form.og_image_url ? (
                <img
                  src={form.og_image_url}
                  alt="OG preview"
                  className="mt-2 rounded-md border max-h-40 object-contain bg-muted"
                />
              ) : (
                <div className="mt-2 flex h-32 items-center justify-center rounded-md border border-dashed text-muted-foreground text-sm">
                  <ImageIcon className="h-4 w-4 mr-2" /> No image set — falls back to tenant logo
                </div>
              )}
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
            Save SEO
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
