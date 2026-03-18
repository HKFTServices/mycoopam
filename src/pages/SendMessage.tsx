import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/contexts/TenantContext";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { toast } from "@/hooks/use-toast";
import { Send, TestTube, Loader2, Search, Users, FileText, Paperclip, CalendarIcon, Check, ChevronsUpDown } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";

const AUDIENCE_TYPES = [
  { value: "all_active_users", label: "All Active Users" },
  { value: "all_active_members", label: "All Active Members" },
  { value: "members_with_units", label: "All Active Members with Units" },
  { value: "members_in_pools", label: "Members exposed to selected Pool(s)" },
  { value: "members_linked_to_user", label: "Members linked to a User" },
  { value: "specific_user", label: "Specific User" },
  { value: "specific_member", label: "Specific Member" },
];

interface Recipient {
  id: string;
  email: string;
  name: string;
  userId?: string;
  entityId?: string;
  entityAccountId?: string;
  selected: boolean;
}

export default function SendMessage() {
  const { currentTenant } = useTenant();
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [campaignName, setCampaignName] = useState("");
  const [audienceType, setAudienceType] = useState("");
  const [selectedPoolIds, setSelectedPoolIds] = useState<string[]>([]);
  const [linkedUserId, setLinkedUserId] = useState("");
  const [specificUserId, setSpecificUserId] = useState("");
  const [specificMemberId, setSpecificMemberId] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [recipientSearch, setRecipientSearch] = useState("");
  const [attachmentType, setAttachmentType] = useState<string>("");
  const [isSending, setIsSending] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [valuationDate, setValuationDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [agmVenue, setAgmVenue] = useState("");
  const [agmDate, setAgmDate] = useState("");
  const [agmTime, setAgmTime] = useState("");
  const tenantId = currentTenant?.id;

  // Fetch pools for pool-based audience
  const { data: pools = [] } = useQuery({
    queryKey: ["pools_for_campaign", tenantId],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("pools")
        .select("id, name")
        .eq("tenant_id", tenantId)
        .eq("is_active", true)
        .order("name");
      return data || [];
    },
    enabled: !!tenantId,
  });

  // Fetch users for user-based audience
  const { data: allUsers = [] } = useQuery({
    queryKey: ["users_for_campaign", tenantId],
    queryFn: async () => {
      // First get user_ids that belong to this tenant via user_roles
      const { data: roles } = await (supabase as any)
        .from("user_roles")
        .select("user_id")
        .eq("tenant_id", tenantId);
      if (!roles || roles.length === 0) return [];
      const userIds = [...new Set(roles.map((r: any) => r.user_id))];
      const { data } = await (supabase as any)
        .from("profiles")
        .select("user_id, first_name, last_name, email")
        .in("user_id", userIds)
        .order("last_name");
      return data || [];
    },
    enabled: !!tenantId,
  });

  // Fetch templates - only manual custom templates (not system defaults)
  const { data: templates = [] } = useQuery({
    queryKey: ["templates_for_campaign", tenantId],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("communication_templates")
        .select("id, name, application_event, language_code, subject, body_html")
        .eq("tenant_id", tenantId)
        .eq("is_active", true)
        .eq("is_email_active", true)
        .eq("is_system_default", false)
        .eq("application_event", "none")
        .order("name");
      return data || [];
    },
    enabled: !!tenantId,
  });

  // Fetch active entity accounts (members) with entity details for merge fields
  const { data: entityAccounts = [] } = useQuery({
    queryKey: ["entity_accounts_for_campaign", tenantId],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("entity_accounts")
        .select("id, account_number, entity_id, entity_account_type_id, entities!entity_accounts_entity_id_fkey(id, name, last_name, email_address, contact_number, title_id)")
        .eq("tenant_id", tenantId)
        .eq("is_active", true);
      if (!data) return [];
      // Fetch titles separately to resolve title names
      const titleIds = [...new Set(data.map((ea: any) => ea.entities?.title_id).filter(Boolean))];
      let titleMap: Record<string, string> = {};
      if (titleIds.length > 0) {
        const { data: titles } = await (supabase as any)
          .from("titles")
          .select("id, name")
          .in("id", titleIds);
        if (titles) {
          titleMap = Object.fromEntries(titles.map((t: any) => [t.id, t.name]));
        }
      }
      // Attach title name to each entity
      return data.map((ea: any) => ({
        ...ea,
        entities: ea.entities ? {
          ...ea.entities,
          titles: ea.entities.title_id ? { name: titleMap[ea.entities.title_id] || "" } : null,
        } : null,
      }));
    },
    enabled: !!tenantId,
  });

  // Fetch unit transactions to calculate pool exposure at valuation date
  const { data: unitHoldings = [] } = useQuery({
    queryKey: ["unit_holdings_for_campaign", tenantId, valuationDate],
    queryFn: async () => {
      // Get unit transactions up to valuation date
      const { data: unitTxns } = await (supabase as any)
        .from("unit_transactions")
        .select("entity_account_id, pool_id, debit, credit")
        .eq("tenant_id", tenantId)
        .lte("transaction_date", valuationDate);

      if (!unitTxns) return [];

      // Aggregate units per entity_account + pool
      const map = new Map<string, { entity_account_id: string; pool_id: string; total_units: number }>();
      for (const ut of unitTxns) {
        const key = `${ut.entity_account_id}_${ut.pool_id}`;
        const existing = map.get(key);
        const units = (Number(ut.debit) || 0) - (Number(ut.credit) || 0);
        if (existing) {
          existing.total_units += units;
        } else {
          map.set(key, { entity_account_id: ut.entity_account_id, pool_id: ut.pool_id, total_units: units });
        }
      }
      return Array.from(map.values());
    },
    enabled: !!tenantId && (audienceType === "members_with_units" || audienceType === "members_in_pools"),
  });

  // Fetch pool unit prices at valuation date
  const { data: poolPricesAtDate = [] } = useQuery({
    queryKey: ["pool_prices_at_date", tenantId, valuationDate],
    queryFn: async () => {
      // Get latest price for each pool on or before valuation date
      const { data } = await (supabase as any)
        .from("daily_pool_prices")
        .select("pool_id, unit_price_sell, totals_date")
        .eq("tenant_id", tenantId)
        .lte("totals_date", valuationDate)
        .order("totals_date", { ascending: false });
      if (!data) return [];
      // Keep only latest per pool
      const seen = new Set<string>();
      return data.filter((d: any) => {
        if (seen.has(d.pool_id)) return false;
        seen.add(d.pool_id);
        return true;
      });
    },
    enabled: !!tenantId && (audienceType === "members_with_units" || audienceType === "members_in_pools"),
  });

  // Fetch user-entity relationships
  const { data: userEntityRels = [] } = useQuery({
    queryKey: ["user_entity_rels_for_campaign", tenantId],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("user_entity_relationships")
        .select("user_id, entity_id")
        .eq("tenant_id", tenantId)
        .eq("is_active", true);
      return data || [];
    },
    enabled: !!tenantId,
  });

  // Fetch entities linked to selected user (including those without active accounts)
  const { data: allLinkedEntities = [] } = useQuery({
    queryKey: ["linked_entities_for_campaign", tenantId, linkedUserId],
    queryFn: async () => {
      const entityIds = userEntityRels
        .filter((r: any) => r.user_id === linkedUserId)
        .map((r: any) => r.entity_id);
      if (entityIds.length === 0) return [];
      const { data } = await (supabase as any)
        .from("entities")
        .select("id, name, last_name, email_address")
        .in("id", entityIds)
        .eq("tenant_id", tenantId)
        .eq("is_active", true);
      return data || [];
    },
    enabled: !!tenantId && !!linkedUserId && audienceType === "members_linked_to_user" && userEntityRels.length > 0,
  });

  // Build recipient list when audience changes
  useEffect(() => {
    if (!tenantId || !audienceType) {
      setRecipients([]);
      return;
    }

    let result: Recipient[] = [];

    if (audienceType === "all_active_users") {
      result = allUsers.map((u: any) => ({
        id: u.user_id,
        email: u.email,
        name: [u.first_name, u.last_name].filter(Boolean).join(" ") || u.email,
        userId: u.user_id,
        selected: true,
      }));
    } else if (audienceType === "all_active_members") {
      result = entityAccounts
        .filter((ea: any) => ea.entities?.email_address)
        .map((ea: any) => ({
          id: ea.id,
          email: ea.entities.email_address,
          name: [ea.entities.name, ea.entities.last_name].filter(Boolean).join(" "),
          entityId: ea.entities.id,
          entityAccountId: ea.id,
          selected: true,
        }));
    } else if (audienceType === "members_with_units") {
      // Members with positive unit value at valuation date
      const priceMap = new Map<string, number>(poolPricesAtDate.map((p: any) => [p.pool_id, Number(p.unit_price_sell) || 0] as [string, number]));
      // Aggregate total value per entity_account
      const accountValues = new Map<string, number>();
      unitHoldings.forEach((h: any) => {
        if (h.total_units > 0) {
          const up = priceMap.get(h.pool_id) || 0;
          const val = Number(h.total_units) * up;
          accountValues.set(h.entity_account_id, (accountValues.get(h.entity_account_id) || 0) + val);
        }
      });
      const accountsWithUnits = new Set(
        Array.from(accountValues.entries()).filter(([, val]) => val > 0).map(([id]) => id)
      );
      result = entityAccounts
        .filter((ea: any) => accountsWithUnits.has(ea.id) && ea.entities?.email_address)
        .map((ea: any) => ({
          id: ea.id,
          email: ea.entities.email_address,
          name: [ea.entities.name, ea.entities.last_name].filter(Boolean).join(" "),
          entityId: ea.entities.id,
          entityAccountId: ea.id,
          selected: true,
        }));
    } else if (audienceType === "members_in_pools" && selectedPoolIds.length > 0) {
      // Members with units in selected pools at valuation date
      const accountsInPools = new Set(
        unitHoldings
          .filter((h: any) => selectedPoolIds.includes(h.pool_id) && h.total_units > 0)
          .map((h: any) => h.entity_account_id)
      );
      result = entityAccounts
        .filter((ea: any) => accountsInPools.has(ea.id) && ea.entities?.email_address)
        .map((ea: any) => ({
          id: ea.id,
          email: ea.entities.email_address,
          name: [ea.entities.name, ea.entities.last_name].filter(Boolean).join(" "),
          entityId: ea.entities.id,
          entityAccountId: ea.id,
          selected: true,
        }));
    } else if (audienceType === "members_linked_to_user" && linkedUserId) {
      const linkedEntityIds = new Set(
        userEntityRels.filter((r: any) => r.user_id === linkedUserId).map((r: any) => r.entity_id)
      );
      const seenRecipientIds = new Set<string>();
      entityAccounts.forEach((ea: any) => {
        const entity = ea.entities;
        if (linkedEntityIds.has(ea.entity_id) && entity?.email_address && !seenRecipientIds.has(ea.id)) {
          seenRecipientIds.add(ea.id);
          result.push({
            id: ea.id,
            email: entity.email_address,
            name: [entity.name, entity.last_name].filter(Boolean).join(" ") + (ea.account_number ? ` (${ea.account_number})` : ""),
            entityId: entity.id,
            entityAccountId: ea.id,
            selected: true,
          });
        }
      });
      // Also include linked entities without active accounts
      allLinkedEntities.forEach((entity: any) => {
        if (linkedEntityIds.has(entity.id) && entity.email_address && !seenRecipientIds.has(entity.id)) {
          seenRecipientIds.add(entity.id);
          result.push({
            id: entity.id,
            email: entity.email_address,
            name: [entity.name, entity.last_name].filter(Boolean).join(" "),
            entityId: entity.id,
            selected: true,
          });
        }
      });
    } else if (audienceType === "specific_user" && specificUserId) {
      const u = allUsers.find((u: any) => u.user_id === specificUserId);
      if (u) {
        result = [{
          id: u.user_id,
          email: u.email,
          name: [u.first_name, u.last_name].filter(Boolean).join(" ") || u.email,
          userId: u.user_id,
          selected: true,
        }];
      }
    } else if (audienceType === "specific_member" && specificMemberId) {
      const ea = entityAccounts.find((ea: any) => ea.id === specificMemberId);
      if (ea?.entities?.email_address) {
        result = [{
          id: ea.id,
          email: ea.entities.email_address,
          name: [ea.entities.name, ea.entities.last_name].filter(Boolean).join(" "),
          entityId: ea.entities.id,
          entityAccountId: ea.id,
          selected: true,
        }];
      }
    }

    setRecipients(result);
  }, [audienceType, selectedPoolIds, linkedUserId, specificUserId, specificMemberId, allUsers, entityAccounts, unitHoldings, poolPricesAtDate, userEntityRels, allLinkedEntities, tenantId, valuationDate]);

  const toggleRecipient = (id: string) => {
    setRecipients((prev) => prev.map((r) => (r.id === id ? { ...r, selected: !r.selected } : r)));
  };

  const toggleAll = (checked: boolean) => {
    setRecipients((prev) => prev.map((r) => ({ ...r, selected: checked })));
  };

  const filteredRecipients = useMemo(() => {
    if (!recipientSearch) return recipients;
    const s = recipientSearch.toLowerCase();
    return recipients.filter((r) => r.name.toLowerCase().includes(s) || r.email.toLowerCase().includes(s));
  }, [recipients, recipientSearch]);

  const selectedCount = recipients.filter((r) => r.selected).length;

  // Template preview with full merge data from first recipient
  // Deduplicate templates by name — show only one entry per unified template
  const uniqueTemplates = useMemo(() => {
    const seen = new Map<string, any>();
    for (const t of templates) {
      if (!seen.has(t.name)) {
        seen.set(t.name, t);
      }
    }
    return Array.from(seen.values());
  }, [templates]);

  const selectedTemplate = templates.find((t: any) => t.id === templateId);
  const templateHasAgmFields = useMemo(() => {
    if (!selectedTemplate) return false;
    const combined = (selectedTemplate.subject || "") + (selectedTemplate.body_html || "");
    return combined.includes("{{agm_venue}}") || combined.includes("{{agm_date}}") || combined.includes("{{agm_time}}");
  }, [selectedTemplate]);
  const firstRecipient = recipients.find((r) => r.selected);

  // Resolve full merge data for preview
  const previewMergeData = useMemo(() => {
    if (!firstRecipient) return {};
    // Find the entity account and entity for this recipient
    const ea = entityAccounts.find((ea: any) => ea.id === firstRecipient.entityAccountId);
    const entity = ea?.entities;
    // Resolve user profile for user_name/user_surname
    const linkedUser = firstRecipient.userId
      ? allUsers.find((u: any) => u.user_id === firstRecipient.userId)
      : null;
    // If no direct userId, try to find via user_entity_relationships
    const linkedUserViaEntity = !linkedUser && entity
      ? (() => {
          const rel = userEntityRels.find((r: any) => r.entity_id === entity.id);
          return rel ? allUsers.find((u: any) => u.user_id === rel.user_id) : null;
        })()
      : null;
    const resolvedUser = linkedUser || linkedUserViaEntity;
    const entityName = entity ? [entity.name, entity.last_name].filter(Boolean).join(" ") : firstRecipient.name.replace(/\s*\(.*\)$/, "");
    return {
      entity_name: entityName,
      user_name: resolvedUser?.first_name || "",
      user_surname: resolvedUser?.last_name || "",
      email_address: firstRecipient.email || "",
      tenant_name: currentTenant?.name || "",
      legal_entity_name: currentTenant?.name || "",
      title: entity?.titles?.name || "",
      phone_number: entity?.contact_number || "",
      account_number: ea?.account_number || "",
      entity_account_name: entityName,
      email_signature: "",
    };
  }, [firstRecipient, entityAccounts, currentTenant, allUsers, userEntityRels]);

  const previewHtml = useMemo(() => {
    if (!selectedTemplate?.body_html || !firstRecipient) return "";
    let html = selectedTemplate.body_html;
    const replacements: Record<string, string> = {
      "{{entity_name}}": previewMergeData.entity_name || "",
      "{{legal_entity_name}}": previewMergeData.legal_entity_name || "",
      "{{user_name}}": previewMergeData.user_name || "",
      "{{user_surname}}": previewMergeData.user_surname || "",
      "{{first_name}}": previewMergeData.entity_name || "",
      "{{last_name}}": "",
      "{{email_address}}": previewMergeData.email_address || "",
      "{{tenant_name}}": previewMergeData.tenant_name || "",
      "{{title}}": previewMergeData.title || "",
      "{{phone_number}}": previewMergeData.phone_number || "",
      "{{account_number}}": previewMergeData.account_number || "",
      "{{entity_account_name}}": previewMergeData.entity_account_name || "",
      "{{email_signature}}": previewMergeData.email_signature || "",
      "{{agm_venue}}": agmVenue || "",
      "{{agm_date}}": agmDate || "",
      "{{agm_time}}": agmTime || "",
    };
    for (const [key, val] of Object.entries(replacements)) {
      html = html.replaceAll(key, val);
    }
    return html;
  }, [selectedTemplate, firstRecipient, previewMergeData, agmVenue, agmDate, agmTime]);

  const previewSubject = useMemo(() => {
    if (!selectedTemplate?.subject) return "";
    let subject = selectedTemplate.subject;
    const allReplacements: Record<string, string> = {
      ...Object.fromEntries(Object.entries(previewMergeData).map(([k, v]) => [`{{${k}}}`, v || ""])),
      "{{agm_venue}}": agmVenue || "",
      "{{agm_date}}": agmDate || "",
      "{{agm_time}}": agmTime || "",
    };
    for (const [key, val] of Object.entries(allReplacements)) {
      subject = subject.replaceAll(key, val);
    }
    return subject;
  }, [selectedTemplate, previewMergeData, agmVenue, agmDate, agmTime]);

  // Send test email
  const handleTestEmail = async () => {
    if (!templateId || !tenantId) return;
    setIsTesting(true);
    try {
      const { error } = await supabase.functions.invoke("send-campaign-batch", {
        body: {
          action: "test",
          tenant_id: tenantId,
          template_id: templateId,
          test_user_id: user?.id,
          custom_fields: { agm_venue: agmVenue, agm_date: agmDate, agm_time: agmTime },
        },
      });
      if (error) throw error;
      toast({ title: "Test email sent", description: "Check your inbox." });
    } catch (err: any) {
      toast({ title: "Test email failed", description: err.message, variant: "destructive" });
    } finally {
      setIsTesting(false);
    }
  };

  // Send campaign
  const handleSendCampaign = async () => {
    if (!templateId || !tenantId || selectedCount === 0) {
      toast({ title: "Please select a template and recipients", variant: "destructive" });
      return;
    }
    setIsSending(true);
    try {
      const selectedRecipients = recipients.filter((r) => r.selected).map((r) => ({
        email: r.email,
        name: r.name,
        user_id: r.userId || null,
        entity_id: r.entityId || null,
        entity_account_id: r.entityAccountId || null,
      }));

      const { data, error } = await supabase.functions.invoke("send-campaign-batch", {
        body: {
          action: "create",
          tenant_id: tenantId,
          template_id: templateId,
          campaign_name: campaignName || `Campaign ${new Date().toLocaleDateString()}`,
          audience_type: audienceType,
          recipients: selectedRecipients,
          attachment_type: attachmentType || null,
          created_by: user?.id,
          custom_fields: { agm_venue: agmVenue, agm_date: agmDate, agm_time: agmTime },
        },
      });
      if (error) throw error;
      toast({ title: "Campaign started!", description: `Sending to ${selectedCount} recipients.` });
      navigate("/dashboard/message-history");
    } catch (err: any) {
      toast({ title: "Failed to start campaign", description: err.message, variant: "destructive" });
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Send Message</h1>
        <p className="text-muted-foreground">Compose and send bulk email campaigns to your members.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Configuration */}
        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-lg">Campaign Details</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Campaign Name</Label>
                <Input
                  value={campaignName}
                  onChange={(e) => setCampaignName(e.target.value)}
                  placeholder="e.g. Monthly Newsletter March 2026"
                />
              </div>

              <div className="space-y-2">
                <Label>Audience</Label>
                <Select value={audienceType} onValueChange={setAudienceType}>
                  <SelectTrigger><SelectValue placeholder="Select audience..." /></SelectTrigger>
                  <SelectContent>
                    {AUDIENCE_TYPES.map((a) => (
                      <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {(audienceType === "members_with_units" || audienceType === "members_in_pools") && (
                <div className="space-y-2">
                  <Label>Valuation Date</Label>
                  <Input
                    type="date"
                    value={valuationDate}
                    onChange={(e) => setValuationDate(e.target.value)}
                    max={new Date().toISOString().split("T")[0]}
                  />
                  <p className="text-xs text-muted-foreground">
                    Units and pool prices will be calculated as at this date.
                  </p>
                </div>
              )}

              {audienceType === "members_in_pools" && (
                <div className="space-y-2">
                  <Label>Select Pool(s)</Label>
                  <div className="border rounded-md p-2 max-h-32 overflow-y-auto space-y-1">
                    {pools.map((p: any) => (
                      <label key={p.id} className="flex items-center gap-2 text-sm cursor-pointer">
                        <Checkbox
                          checked={selectedPoolIds.includes(p.id)}
                          onCheckedChange={(checked) => {
                            setSelectedPoolIds((prev) =>
                              checked ? [...prev, p.id] : prev.filter((id) => id !== p.id)
                            );
                          }}
                        />
                        {p.name}
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {audienceType === "members_linked_to_user" && (
                <div className="space-y-2">
                  <Label>Select User</Label>
                  <SearchableUserSelect
                    users={allUsers}
                    value={linkedUserId}
                    onValueChange={setLinkedUserId}
                    placeholder="Search user by name or email..."
                  />
                </div>
              )}

              {audienceType === "specific_user" && (
                <div className="space-y-2">
                  <Label>Select User</Label>
                  <Select value={specificUserId} onValueChange={setSpecificUserId}>
                    <SelectTrigger><SelectValue placeholder="Select user..." /></SelectTrigger>
                    <SelectContent>
                      {allUsers.map((u: any) => (
                        <SelectItem key={u.user_id} value={u.user_id}>
                          {[u.first_name, u.last_name].filter(Boolean).join(" ") || u.email}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {audienceType === "specific_member" && (
                <div className="space-y-2">
                  <Label>Select Member Account</Label>
                  <Select value={specificMemberId} onValueChange={setSpecificMemberId}>
                    <SelectTrigger><SelectValue placeholder="Select member..." /></SelectTrigger>
                    <SelectContent>
                      {entityAccounts.map((ea: any) => (
                        <SelectItem key={ea.id} value={ea.id}>
                          {ea.account_number} — {[ea.entities?.name, ea.entities?.last_name].filter(Boolean).join(" ")}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Users className="h-4 w-4" /> Recipients
                <Badge variant="secondary" className="ml-auto">{selectedCount} / {recipients.length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {recipients.length > 0 && (
                <>
                  <div className="flex items-center gap-2">
                    <div className="relative flex-1">
                      <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                      <Input
                        value={recipientSearch}
                        onChange={(e) => setRecipientSearch(e.target.value)}
                        placeholder="Search recipients..."
                        className="pl-8"
                      />
                    </div>
                    <Button variant="outline" size="sm" onClick={() => toggleAll(true)}>All</Button>
                    <Button variant="outline" size="sm" onClick={() => toggleAll(false)}>None</Button>
                  </div>
                  <div className="border rounded-md max-h-60 overflow-y-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-10"></TableHead>
                          <TableHead>Name</TableHead>
                          <TableHead>Email</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredRecipients.map((r) => (
                          <TableRow key={r.id} className="cursor-pointer" onClick={() => toggleRecipient(r.id)}>
                            <TableCell><Checkbox checked={r.selected} /></TableCell>
                            <TableCell className="text-sm">{r.name}</TableCell>
                            <TableCell className="text-sm text-muted-foreground">{r.email}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </>
              )}
              {recipients.length === 0 && audienceType && (
                <p className="text-sm text-muted-foreground text-center py-4">No recipients found for this audience.</p>
              )}
              {!audienceType && (
                <p className="text-sm text-muted-foreground text-center py-4">Select an audience type above.</p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right: Template & Preview */}
        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-lg">Template & Attachments</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Message Template</Label>
                <Select value={templateId} onValueChange={setTemplateId}>
                  <SelectTrigger><SelectValue placeholder="Select template..." /></SelectTrigger>
                  <SelectContent>
                    {uniqueTemplates.map((t: any) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Each recipient will receive the template in their preferred language (EN/AF).
                </p>
              </div>

              <div className="space-y-2">
                <Label>Attachment (Optional)</Label>
                <Select value={attachmentType} onValueChange={setAttachmentType}>
                  <SelectTrigger><SelectValue placeholder="No attachment" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No attachment</SelectItem>
                    <SelectItem value="statement">Statement (coming soon)</SelectItem>
                    <SelectItem value="cgt_certificate">CGT Certificate (coming soon)</SelectItem>
                    <SelectItem value="file">Upload File (coming soon)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {templateHasAgmFields && (
            <Card>
              <CardHeader><CardTitle className="text-lg flex items-center gap-2"><CalendarIcon className="h-4 w-4" /> AGM Details</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-2">
                  <Label>Venue</Label>
                  <Input value={agmVenue} onChange={(e) => setAgmVenue(e.target.value)} placeholder="e.g. Town Hall, 123 Main St" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Date</Label>
                    <Input type="date" value={agmDate} onChange={(e) => setAgmDate(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>Time</Label>
                    <Input type="time" value={agmTime} onChange={(e) => setAgmTime(e.target.value)} />
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {selectedTemplate && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <FileText className="h-4 w-4" /> Preview
                  {firstRecipient && (
                    <span className="text-sm font-normal text-muted-foreground ml-2">
                      (for: {firstRecipient.name})
                    </span>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="border rounded-md p-1">
                  <div className="bg-muted/30 px-3 py-2 border-b">
                    <p className="text-xs text-muted-foreground">Subject</p>
                    <p className="text-sm font-medium">{previewSubject || selectedTemplate.subject}</p>
                  </div>
                  <div className="bg-muted/30 px-3 py-2 border-b">
                    <p className="text-xs text-muted-foreground">To</p>
                    <p className="text-sm">{firstRecipient ? `${firstRecipient.name} <${firstRecipient.email}>` : "—"}</p>
                  </div>
                  <iframe
                    srcDoc={`<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{font-family:Arial,sans-serif;font-size:14px;line-height:1.6;margin:16px;color:#333}table{border-collapse:collapse;width:100%}td{padding:8px;border:1px solid #ddd}</style></head><body>${previewHtml}</body></html>`}
                    className="w-full border-0"
                    style={{ minHeight: 400 }}
                    onLoad={(e) => {
                      const iframe = e.target as HTMLIFrameElement;
                      if (iframe.contentDocument) {
                        iframe.style.height = Math.max(400, iframe.contentDocument.body.scrollHeight + 40) + "px";
                      }
                    }}
                  />
                </div>
                {firstRecipient && Object.keys(previewMergeData).length > 0 && (
                  <div className="mt-3 border rounded-md p-3 bg-muted/20">
                    <p className="text-xs font-semibold text-muted-foreground mb-2">Merge Data (First Recipient)</p>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                      {Object.entries(previewMergeData)
                        .filter(([key]) => key !== "email_signature")
                        .map(([key, val]) => (
                        <div key={key} className="flex gap-1">
                          <span className="text-muted-foreground font-mono">{`{{${key}}}`}</span>
                          <span className="font-medium truncate">{val || <span className="italic text-muted-foreground">empty</span>}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Actions */}
          <div className="flex gap-3">
            <Button
              variant="outline"
              onClick={handleTestEmail}
              disabled={!templateId || isTesting}
            >
              {isTesting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <TestTube className="h-4 w-4 mr-2" />}
              Send Test Email
            </Button>
            <Button
              onClick={handleSendCampaign}
              disabled={!templateId || selectedCount === 0 || isSending}
              className="flex-1"
            >
              {isSending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Send className="h-4 w-4 mr-2" />}
              Send Campaign ({selectedCount} recipients)
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Searchable User Select Component
function SearchableUserSelect({
  users,
  value,
  onValueChange,
  placeholder = "Search user...",
}: {
  users: any[];
  value: string;
  onValueChange: (val: string) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const selectedUser = users.find((u: any) => u.user_id === value);
  const selectedLabel = selectedUser
    ? [selectedUser.first_name, selectedUser.last_name].filter(Boolean).join(" ") || selectedUser.email
    : "";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between font-normal"
        >
          {value ? selectedLabel : placeholder}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
        <Command>
          <CommandInput placeholder={placeholder} />
          <CommandList>
            <CommandEmpty>No user found.</CommandEmpty>
            <CommandGroup>
              {users.map((u: any) => {
                const label = [u.first_name, u.last_name].filter(Boolean).join(" ") || u.email;
                return (
                  <CommandItem
                    key={u.user_id}
                    value={`${u.first_name || ""} ${u.last_name || ""} ${u.email || ""}`}
                    onSelect={() => {
                      onValueChange(u.user_id);
                      setOpen(false);
                    }}
                  >
                    <Check className={cn("mr-2 h-4 w-4", value === u.user_id ? "opacity-100" : "opacity-0")} />
                    <div className="flex flex-col">
                      <span>{label}</span>
                      {(u.first_name || u.last_name) && (
                        <span className="text-xs text-muted-foreground">{u.email}</span>
                      )}
                    </div>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
