import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Upload, CheckCircle2, FileText, Eye, X, AlertTriangle, Download, FileDown, ChevronDown, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { generateAndOpenDocument, templateOptions, type EntityContext } from "@/lib/documentTemplates";
import { useTenant } from "@/contexts/TenantContext";
import type { StepProps } from "./types";

interface DocumentsStepProps extends StepProps {
  entityId?: string;
}

type DocCategory =
  | "Identity"
  | "Address"
  | "Banking"
  | "Tax"
  | "Employment & Income"
  | "Business"
  | "Legal"
  | "Other";

const CATEGORY_ORDER: DocCategory[] = [
  "Identity",
  "Address",
  "Banking",
  "Tax",
  "Employment & Income",
  "Business",
  "Legal",
  "Other",
];

function categorizeDocType(name: string): DocCategory {
  const n = name.toLowerCase();

  // Identity
  if (n.includes("passport") || n.includes("identity") || /\bid\b/.test(n) || n.includes("id card")) return "Identity";

  // Address
  if (
    (n.includes("proof") && n.includes("address")) ||
    (n.includes("proof") && n.includes("residence")) ||
    n.includes("utility") ||
    (n.includes("municipal") && n.includes("account"))
  ) return "Address";

  // Banking
  if (
    n.includes("bank") ||
    n.includes("account confirmation") ||
    n.includes("statement") ||
    n.includes("debit order") ||
    n.includes("mandate")
  ) return "Banking";

  // Tax
  if (n.includes("tax") || n.includes("sars") || n.includes("vat") || n.includes("tax clearance")) return "Tax";

  // Employment & Income
  if (
    n.includes("payslip") ||
    n.includes("pay slip") ||
    n.includes("salary") ||
    n.includes("income") ||
    n.includes("employment") ||
    n.includes("contract of employment")
  ) return "Employment & Income";

  // Business
  if (
    n.includes("cipc") ||
    n.includes("registration") ||
    n.includes("company") ||
    n.includes("ck") ||
    n.includes("founding") ||
    n.includes("directors")
  ) return "Business";

  // Legal
  if (
    n.includes("resolution") ||
    n.includes("agreement") ||
    n.includes("consent") ||
    n.includes("terms") ||
    n.includes("policy") ||
    n.includes("authority")
  ) return "Legal";

  return "Other";
}

const DocumentsStep = ({ data, update, tenantId, entityId }: DocumentsStepProps) => {
  const [pendingFile, setPendingFile] = useState<{ docTypeId: string; file: File } | null>(null);
  const { currentTenant } = useTenant();

  // Build entity context for document generation
  const { user, profile } = useAuth();

  // For entity applications, fetch the logged-in user's OWN "Myself" entity
  const { data: userPersonalEntity } = useQuery({
    queryKey: ["user_personal_entity", user?.id, tenantId],
    queryFn: async () => {
      if (!user) return null;
      // First find the "Myself" relationship type id
      const { data: relTypes } = await supabase
        .from("relationship_types")
        .select("id")
        .ilike("name", "Myself")
        .limit(1);
      if (!relTypes || relTypes.length === 0) return null;
      const myselfRelTypeId = relTypes[0].id;

      // Then find the entity linked via "Myself"
      const { data: rels } = await (supabase as any)
        .from("user_entity_relationships")
        .select("entities!inner(id, name, last_name, identity_number, passport_number, email_address)")
        .eq("user_id", user.id)
        .eq("tenant_id", tenantId)
        .eq("is_active", true)
        .eq("relationship_type_id", myselfRelTypeId);
      if (!rels || rels.length === 0) return null;
      return rels[0]?.entities || null;
    },
    enabled: !!user && data.type === "entity",
  });

  const entityCtx: EntityContext = {
    entityName: data.entityName || "",
    registrationNumber: data.registrationNumber || "",
    firstName: data.firstName || "",
    lastName: data.lastName || "",
    idNumber: data.idNumber || "",
    contactNumber: data.contactNumber || "",
    emailAddress: data.emailAddress || "",
    streetAddress: data.streetAddress || "",
    suburb: data.suburb || "",
    city: data.city || "",
    province: data.province || "",
    postalCode: data.postalCode || "",
    country: data.country || "",
    tenantName: currentTenant?.name || "",
    // For entity applications, use the "Myself" entity's details as the authorised representative
    userFirstName: data.type === "entity" ? (userPersonalEntity?.name || profile?.first_name || "") : "",
    userLastName: data.type === "entity" ? (userPersonalEntity?.last_name || profile?.last_name || "") : "",
    userIdNumber: data.type === "entity" ? (userPersonalEntity?.identity_number || userPersonalEntity?.passport_number || "") : "",
  };

  // Fetch required doc types for this relationship type
  const { data: requiredDocs = [] } = useQuery({
    queryKey: ["required_docs_for_rel", tenantId, data.relationshipTypeId],
    queryFn: async () => {
      if (!data.relationshipTypeId) return [];
      const { data: requirements } = await supabase
        .from("document_entity_requirements")
        .select("*, document_types!inner(id, name)")
        .eq("tenant_id", tenantId)
        .eq("relationship_type_id", data.relationshipTypeId)
        .eq("is_active", true)
        .eq("is_required_for_registration", true);
      return requirements ?? [];
    },
    enabled: !!tenantId && !!data.relationshipTypeId,
  });

  // Fetch ALL document types for the tenant (including template_key and template_file_url)
  const { data: allDocTypes = [] } = useQuery({
    queryKey: ["all_document_types_with_templates", tenantId],
    queryFn: async () => {
      const { data: types } = await (supabase as any)
        .from("document_types")
        .select("id, name, template_key, template_file_url")
        .eq("tenant_id", tenantId)
        .eq("is_active", true)
        .order("name");
      return types ?? [];
    },
    enabled: !!tenantId,
  });

  // Fetch existing entity documents
  const { data: existingDocs = [] } = useQuery({
    queryKey: ["entity_documents", tenantId, entityId],
    queryFn: async () => {
      if (!entityId) return [];
      const { data: docs } = await (supabase as any)
        .from("entity_documents")
        .select("*, document_types(id, name)")
        .eq("tenant_id", tenantId)
        .eq("entity_id", entityId)
        .eq("is_deleted", false)
        .eq("is_active", true)
        .order("created_at", { ascending: false });
      return docs ?? [];
    },
    enabled: !!tenantId && !!entityId,
  });

  // Build a lookup: docTypeId → template info
  const docTypeTemplateMap = new Map<string, { templateKey?: string; templateFileUrl?: string }>();
  for (const dt of allDocTypes) {
    if (dt.template_key || dt.template_file_url) {
      docTypeTemplateMap.set(dt.id, { templateKey: dt.template_key, templateFileUrl: dt.template_file_url });
    }
  }

  const handleFileSelect = (docTypeId: string, file: File) => {
    const rawUploads = data.uploadedDocs[docTypeId];
    const existingUploads = Array.isArray(rawUploads) ? rawUploads : rawUploads ? [rawUploads] : [];
    const existingForType = existingByType[docTypeId] || [];
    const hasFiles = existingUploads.length > 0 || existingForType.length > 0;

    if (hasFiles) {
      setPendingFile({ docTypeId, file });
    } else {
      addFile(docTypeId, file);
    }
  };

  const addFile = (docTypeId: string, file: File) => {
    const raw = data.uploadedDocs[docTypeId];
    const current = Array.isArray(raw) ? raw : raw ? [raw] : [];
    update({
      uploadedDocs: {
        ...data.uploadedDocs,
        [docTypeId]: [...current, { file, name: file.name }],
      },
    });
  };

  const replaceFiles = (docTypeId: string, file: File) => {
    update({
      uploadedDocs: {
        ...data.uploadedDocs,
        [docTypeId]: [{ file, name: file.name }],
      },
    });
  };

  const removeUploadedFile = (docTypeId: string, index: number) => {
    const raw = data.uploadedDocs[docTypeId];
    const current = Array.isArray(raw) ? raw : raw ? [raw] : [];
    const updated = current.filter((_, i) => i !== index);
    update({
      uploadedDocs: {
        ...data.uploadedDocs,
        [docTypeId]: updated,
      },
    });
  };

  const handleViewDocument = async (filePath: string) => {
    const { data: signedUrl } = await supabase.storage
      .from("member-documents")
      .createSignedUrl(filePath, 300);
    if (signedUrl?.signedUrl) {
      window.open(signedUrl.signedUrl, "_blank");
    }
  };

  const handleGenerateDocument = (templateKey: string) => {
    generateAndOpenDocument(templateKey, entityCtx);
  };

  const handleDownloadBlank = (templateKey: string) => {
    const tmpl = templateOptions.find((t) => t.key === templateKey);
    if (tmpl) {
      const a = document.createElement("a");
      a.href = tmpl.blankFile;
      a.download = tmpl.blankFile.split("/").pop() || "template";
      a.click();
    }
  };

  // Group existing docs by document_type_id
  const existingByType: Record<string, any[]> = {};
  for (const doc of existingDocs) {
    const typeId = doc.document_type_id || "untyped";
    if (!existingByType[typeId]) existingByType[typeId] = [];
    existingByType[typeId].push(doc);
  }

  // Build required doc type IDs set
  const requiredDocTypeIds = new Set(requiredDocs.map((r: any) => r.document_type_id));

  // Other (non-required) document types
  const otherDocTypes = allDocTypes.filter((dt: any) => !requiredDocTypeIds.has(dt.id));

  // Group other doc types into categories
  const otherDocTypesByCategory: Record<DocCategory, any[]> = CATEGORY_ORDER.reduce((acc, cat) => {
    acc[cat] = [];
    return acc;
  }, {} as Record<DocCategory, any[]>);

  for (const dt of otherDocTypes) {
    const cat = categorizeDocType(dt.name || "");
    otherDocTypesByCategory[cat].push(dt);
  }

  for (const cat of CATEGORY_ORDER) {
    otherDocTypesByCategory[cat].sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
  }

  // Check if any required doc is still outstanding
  const getUploaded = (docTypeId: string) => {
    const raw = data.uploadedDocs[docTypeId];
    return Array.isArray(raw) ? raw : raw ? [raw] : [];
  };

  const hasOutstandingRequired = requiredDocs.some((req: any) => {
    const uploaded = getUploaded(req.document_type_id);
    const existing = existingByType[req.document_type_id] || [];
    return uploaded.length === 0 && existing.length === 0;
  });

  // Render a document type row (shared between required and optional)
  const renderDocTypeRow = (docTypeId: string, docTypeName: string, isRequired: boolean) => {
    const uploaded = getUploaded(docTypeId);
    const existing = existingByType[docTypeId] || [];
    const isOutstanding = isRequired && uploaded.length === 0 && existing.length === 0;
    const templateInfo = docTypeTemplateMap.get(docTypeId);

    return (
      <div
        key={docTypeId}
        className={`border rounded-lg p-4 space-y-2 ${
          isOutstanding ? "border-red-300 bg-red-50/50 dark:border-red-800 dark:bg-red-950/20" : "border-border"
        }`}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex-1 flex items-center gap-2 min-w-0">
            {isOutstanding && <AlertTriangle className="h-3.5 w-3.5 text-red-500 shrink-0" />}
            <div className="min-w-0">
              <p className={`text-sm font-medium truncate ${isOutstanding ? "text-red-700 dark:text-red-400" : ""}`}>
                {docTypeName}
              </p>
              <p className="text-xs text-muted-foreground">Upload {docTypeName}</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {templateInfo?.templateKey && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 px-2 text-xs"
                      onClick={() => handleGenerateDocument(templateInfo.templateKey!)}
                    >
                      <FileDown className="h-3.5 w-3.5 mr-1" />
                      Generate
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Generate a pre-filled template here. Download, print, sign and upload it to complete your application.</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
            {templateInfo?.templateKey && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 px-2 text-xs"
                      onClick={() => handleDownloadBlank(templateInfo.templateKey!)}
                    >
                      <Download className="h-3.5 w-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Download blank template</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
            {templateInfo?.templateFileUrl && !templateInfo.templateKey && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 px-2 text-xs"
                      onClick={() => window.open(templateInfo.templateFileUrl!, "_blank")}
                    >
                      <Download className="h-3.5 w-3.5 mr-1" />
                      Template
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Download document template</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
            <label className="cursor-pointer">
              <input
                type="file"
                className="hidden"
                accept=".pdf,.jpg,.jpeg,.png"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFileSelect(docTypeId, f);
                }}
              />
              <Button variant={uploaded.length > 0 || existing.length > 0 ? "outline" : "default"} size="sm" className="h-8" asChild>
                <span><Upload className="h-3.5 w-3.5 mr-1.5" />Upload</span>
              </Button>
            </label>
          </div>
        </div>
        {uploaded.map((u, idx) => (
          <div key={`new-${idx}`} className="flex items-center gap-2 text-xs text-muted-foreground bg-primary/5 rounded p-2">
            <CheckCircle2 className="h-3.5 w-3.5 text-primary shrink-0" />
            <span className="truncate flex-1">{u.name} (new)</span>
            <Button variant="ghost" size="sm" className="h-6 px-1.5" onClick={() => removeUploadedFile(docTypeId, idx)}>
              <X className="h-3 w-3" />
            </Button>
          </div>
        ))}
        {existing.map((doc: any) => (
          <div key={doc.id} className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 rounded p-2">
            <FileText className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate flex-1">{doc.file_name}</span>
            {doc.file_size && <span className="shrink-0">{(doc.file_size / 1024).toFixed(0)} KB</span>}
            <Button variant="ghost" size="sm" className="h-6 px-2" onClick={() => handleViewDocument(doc.file_path)}>
              <Eye className="h-3 w-3" />
            </Button>
          </div>
        ))}
      </div>
    );
  };

  // Existing docs not matching any known doc type
  const allKnownDocTypeIds = new Set(allDocTypes.map((dt: any) => dt.id));
  const untypedDocs = existingDocs.filter((doc: any) => !doc.document_type_id || !allKnownDocTypeIds.has(doc.document_type_id));

  return (
    <>
      {/* Required Documents Section */}
      {requiredDocs.length > 0 && (
        <Card className={hasOutstandingRequired ? "border-red-300 dark:border-red-800" : ""}>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              {hasOutstandingRequired && <AlertTriangle className="h-4 w-4 text-red-500" />}
              <CardTitle className={`text-base ${hasOutstandingRequired ? "text-red-700 dark:text-red-400" : ""}`}>
                Required Documents
              </CardTitle>
            </div>
            <CardDescription>
              {hasOutstandingRequired
                ? "Some required documents are still outstanding. Use 'Generate' to create a pre-filled document with your details."
                : "All required documents have been provided"}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {requiredDocs.map((req: any) =>
              renderDocTypeRow(req.document_type_id, req.document_types?.name || "Unknown", true)
            )}
          </CardContent>
        </Card>
      )}

      {/* Uploaded / Unclassified Documents — shown prominently when present */}
      {untypedDocs.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-muted-foreground" />
              <CardTitle className="text-base">Uploaded Documents</CardTitle>
              <span className="text-xs text-muted-foreground">({untypedDocs.length})</span>
            </div>
            <CardDescription>
              These documents were uploaded but not linked to a specific document type.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {untypedDocs.map((doc: any) => (
              <div key={doc.id} className="flex items-center gap-2 text-xs border border-border rounded-lg p-3">
                <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="flex-1 min-w-0">
                  <p className="truncate font-medium">{doc.file_name}</p>
                  <p className="text-muted-foreground">
                    {doc.description || "No type"}
                    {doc.file_size ? ` · ${(doc.file_size / 1024).toFixed(0)} KB` : ""}
                  </p>
                </div>
                <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => handleViewDocument(doc.file_path)}>
                  <Eye className="h-3.5 w-3.5 mr-1" /> View
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Other Documents Section */}
      {otherDocTypes.length > 0 && (
        <Collapsible>
          <Card>
            <CollapsibleTrigger asChild>
              <CardHeader className="pb-3 cursor-pointer hover:bg-muted/50 transition-colors rounded-t-lg">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-base">Other Documents</CardTitle>
                    <CardDescription>
                      Optional — click to expand and upload additional documents
                    </CardDescription>
                  </div>
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                </div>
              </CardHeader>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <CardContent className="space-y-3 pt-0">
                {otherDocTypes.length > 0 ? (
                  <div className="space-y-6">
                    {CATEGORY_ORDER.map((cat) => {
                      const items = otherDocTypesByCategory[cat] || [];
                      if (items.length === 0) return null;
                      return (
                        <div key={cat} className="space-y-3">
                          <div className="flex items-center justify-between">
                            <p className="text-xs font-medium text-muted-foreground">{cat}</p>
                            <span className="text-[10px] text-muted-foreground">{items.length}</span>
                          </div>
                          <div className="space-y-3">
                            {items.map((dt: any) => renderDocTypeRow(dt.id, dt.name, false))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-muted-foreground text-sm py-2">All document types are required — no optional types available.</p>
                )}
              </CardContent>
            </CollapsibleContent>
          </Card>
        </Collapsible>
      )}

      <AlertDialog open={!!pendingFile} onOpenChange={(open) => { if (!open) setPendingFile(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>File already exists</AlertDialogTitle>
            <AlertDialogDescription>
              A document already exists for this type. Would you like to replace all existing uploads or add this as an additional file?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col sm:flex-row gap-2">
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="border border-input bg-background hover:bg-accent hover:text-accent-foreground"
              onClick={() => {
                if (pendingFile) addFile(pendingFile.docTypeId, pendingFile.file);
                setPendingFile(null);
              }}
            >
              Add as extra
            </AlertDialogAction>
            <AlertDialogAction
              onClick={() => {
                if (pendingFile) replaceFiles(pendingFile.docTypeId, pendingFile.file);
                setPendingFile(null);
              }}
            >
              Replace
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default DocumentsStep;
