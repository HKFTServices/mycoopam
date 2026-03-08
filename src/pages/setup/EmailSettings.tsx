import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { Loader2, Eye, EyeOff, Save, Mail, Send } from "lucide-react";

const SMTP_KEYS = [
  { key: "GLOBAL_SMTP_HOST", label: "SMTP Host", placeholder: "e.g. smtp.gmail.com", is_secret: false, description: "The hostname of your outgoing mail server." },
  { key: "GLOBAL_SMTP_PORT", label: "SMTP Port", placeholder: "e.g. 587", is_secret: false, description: "Port used for SMTP (typically 587 for TLS, 465 for SSL, 25 for plain)." },
  { key: "GLOBAL_SMTP_USERNAME", label: "SMTP Username", placeholder: "e.g. noreply@yourdomain.com", is_secret: false, description: "Username or email used to authenticate with the mail server." },
  { key: "GLOBAL_SMTP_PASSWORD", label: "SMTP Password", placeholder: "Enter SMTP password", is_secret: true, description: "Password or app-specific password for SMTP authentication." },
  { key: "GLOBAL_SMTP_FROM_EMAIL", label: "From Email", placeholder: "e.g. noreply@yourdomain.com", is_secret: false, description: "The email address that will appear in the From field." },
  { key: "GLOBAL_SMTP_FROM_NAME", label: "From Name", placeholder: "e.g. MyApp Notifications", is_secret: false, description: "The display name that will appear alongside the From address." },
];

const EmailSettings = () => {
  const queryClient = useQueryClient();
  const [visibleKeys, setVisibleKeys] = useState<Record<string, boolean>>({});
  const [editValues, setEditValues] = useState<Record<string, string>>({});
  const [testEmail, setTestEmail] = useState("");
  const [testLoading, setTestLoading] = useState(false);

  const { data: settings = [], isLoading } = useQuery({
    queryKey: ["system_settings_email"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("system_settings")
        .select("*")
        .in("key", SMTP_KEYS.map((k) => k.key))
        .order("key");
      if (error) throw error;
      return data ?? [];
    },
  });

  const upsertSetting = useMutation({
    mutationFn: async ({ key, value }: { key: string; value: string }) => {
      const existing = settings.find((s: any) => s.key === key);
      if (existing) {
        const { error } = await (supabase as any)
          .from("system_settings")
          .update({ value })
          .eq("id", existing.id);
        if (error) throw error;
      } else {
        const smtpDef = SMTP_KEYS.find((k) => k.key === key);
        const { error } = await (supabase as any)
          .from("system_settings")
          .insert({ key, value, is_secret: smtpDef?.is_secret ?? false, description: smtpDef?.description ?? "" });
        if (error) throw error;
      }
    },
    onSuccess: (_, { key }) => {
      queryClient.invalidateQueries({ queryKey: ["system_settings_email"] });
      toast.success(`${SMTP_KEYS.find((k) => k.key === key)?.label ?? key} saved`);
      setEditValues((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    },
    onError: (err: any) => toast.error(err.message || "Failed to save setting"),
  });

  const getValue = (key: string) => {
    if (editValues[key] !== undefined) return editValues[key];
    return settings.find((s: any) => s.key === key)?.value ?? "";
  };

  const maskValue = (val: string) => {
    if (!val) return "";
    if (val.length <= 8) return "••••••••";
    return val.slice(0, 4) + "••••••••" + val.slice(-4);
  };

  const handleSave = (key: string) => {
    const value = editValues[key];
    if (value === undefined) return;
    upsertSetting.mutate({ key, value });
  };

  const handleTestEmail = async () => {
    if (!testEmail) { toast.error("Enter a recipient email address"); return; }
    const getVal = (key: string) => settings.find((s: any) => s.key === key)?.value ?? "";
    const host = getVal("GLOBAL_SMTP_HOST");
    if (!host) { toast.error("Please configure SMTP Host first"); return; }
    setTestLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("test-smtp", {
        body: {
          smtp_host: host,
          smtp_port: parseInt(getVal("GLOBAL_SMTP_PORT") || "587", 10),
          smtp_username: getVal("GLOBAL_SMTP_USERNAME"),
          smtp_password: getVal("GLOBAL_SMTP_PASSWORD"),
          smtp_from_email: getVal("GLOBAL_SMTP_FROM_EMAIL") || getVal("GLOBAL_SMTP_USERNAME"),
          smtp_from_name: getVal("GLOBAL_SMTP_FROM_NAME"),
          to_email: testEmail,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success(`Test email sent to ${testEmail}`);
    } catch (err: any) {
      toast.error(err.message || "Failed to send test email");
    } finally {
      setTestLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Email Settings</h1>
        <p className="text-muted-foreground">Configure the global SMTP server used to send system emails.</p>
      </div>

      <div className="grid gap-4">
        {SMTP_KEYS.map((def) => {
          const isEditing = editValues[def.key] !== undefined;
          const isVisible = visibleKeys[def.key];
          const currentVal = settings.find((s: any) => s.key === def.key)?.value ?? "";

          return (
            <Card key={def.key}>
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                  <CardTitle className="text-base">{def.label}</CardTitle>
                </div>
                <CardDescription>{def.description}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2">
                  <div className="flex-1">
                    <Label className="sr-only">{def.label}</Label>
                    {def.is_secret && !isVisible && !isEditing && currentVal ? (
                      <Input value={maskValue(currentVal)} disabled className="bg-muted font-mono text-sm" />
                    ) : (
                      <Input
                        type={def.is_secret && !isVisible ? "password" : "text"}
                        value={getValue(def.key)}
                        onChange={(e) => setEditValues((prev) => ({ ...prev, [def.key]: e.target.value }))}
                        placeholder={def.placeholder}
                        className="font-mono text-sm"
                      />
                    )}
                  </div>
                  {def.is_secret && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setVisibleKeys((prev) => ({ ...prev, [def.key]: !prev[def.key] }))}
                      title={isVisible ? "Hide" : "Show"}
                    >
                      {isVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                  )}
                  <Button
                    size="sm"
                    onClick={() => handleSave(def.key)}
                    disabled={!isEditing || upsertSetting.isPending}
                  >
                    {upsertSetting.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Save className="h-4 w-4" />
                    )}
                    Save
                  </Button>
                </div>
                {!currentVal && (
                  <p className="text-xs text-destructive mt-2">Not configured yet</p>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Separator />

      {/* Test Email */}
      <div className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Send className="h-5 w-5 text-primary" />
            Send Test Email
          </h2>
          <p className="text-muted-foreground text-sm mt-1">
            Verify your SMTP settings by sending a test email.
          </p>
        </div>
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-end gap-4">
              <div className="flex-1 space-y-1.5">
                <Label htmlFor="test-email">Recipient Email</Label>
                <Input
                  id="test-email"
                  type="email"
                  placeholder="you@example.com"
                  value={testEmail}
                  onChange={(e) => setTestEmail(e.target.value)}
                />
              </div>
              <Button onClick={handleTestEmail} disabled={testLoading}>
                {testLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Send className="h-4 w-4 mr-2" />}
                Send Test
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default EmailSettings;
