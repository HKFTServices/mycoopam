import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Upload, CheckCircle2, FileText, Eye, X, AlertTriangle } from "lucide-react";
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
import type { StepProps } from "./types";

interface DocumentsStepProps extends StepProps {
  entityId?: string;
}

const DocumentsStep = ({ data, update, tenantId, entityId }: DocumentsStepProps) => {
  const [pendingFile, setPendingFile] = useState<{ docTypeId: string; file: File } | null>(null);

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

  // Fetch ALL document types for the tenant
  const { data: allDocTypes = [] } = useQuery({
    queryKey: ["all_document_types", tenantId],
    queryFn: async () => {
      const { data: types } = await supabase
        .from("document_types")
        .select("id, name")
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

    return (
      <div
        key={docTypeId}
        className={`border rounded-lg p-4 space-y-2 ${
          isOutstanding ? "border-red-300 bg-red-50/50 dark:border-red-800 dark:bg-red-950/20" : "border-border"
        }`}
      >
        <div className="flex items-center justify-between">
          <div className="flex-1 flex items-center gap-2">
            {isOutstanding && <AlertTriangle className="h-3.5 w-3.5 text-red-500 shrink-0" />}
            <p className={`text-sm font-medium ${isOutstanding ? "text-red-700 dark:text-red-400" : ""}`}>
              {docTypeName}
            </p>
          </div>
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
            <Button variant={uploaded.length > 0 || existing.length > 0 ? "outline" : "default"} size="sm" asChild>
              <span><Upload className="h-3.5 w-3.5 mr-1.5" />Upload</span>
            </Button>
          </label>
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
                ? "Some required documents are still outstanding"
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

      {/* Other Documents Section */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Other Documents</CardTitle>
          <CardDescription>
            Optional — upload documents for future use or reference
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {otherDocTypes.length > 0 ? (
            otherDocTypes.map((dt: any) => renderDocTypeRow(dt.id, dt.name, false))
          ) : allDocTypes.length === 0 ? (
            <div className="text-center py-6">
              <FileText className="h-8 w-8 mx-auto mb-2 text-muted-foreground opacity-40" />
              <p className="text-muted-foreground text-sm">No document types configured.</p>
            </div>
          ) : (
            <p className="text-muted-foreground text-sm py-2">All document types are required — no optional types available.</p>
          )}

          {/* Untyped existing docs */}
          {untypedDocs.length > 0 && (
            <div className="space-y-2 pt-2">
              <p className="text-xs font-medium text-muted-foreground">Unclassified Documents</p>
              {untypedDocs.map((doc: any) => (
                <div key={doc.id} className="flex items-center gap-2 text-xs border border-border rounded-lg p-3">
                  <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <div className="flex-1 min-w-0">
                    <p className="truncate font-medium">{doc.file_name}</p>
                    <p className="text-muted-foreground">
                      {doc.document_types?.name || "No type"}
                      {doc.file_size ? ` · ${(doc.file_size / 1024).toFixed(0)} KB` : ""}
                    </p>
                  </div>
                  <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => handleViewDocument(doc.file_path)}>
                    <Eye className="h-3.5 w-3.5 mr-1" /> View
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

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
