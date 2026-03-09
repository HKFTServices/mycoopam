import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, FileText, Download, CheckCircle, XCircle, Eye, AlertTriangle } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

interface DocumentReviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entityId: string;
  entityName: string;
  tenantId: string;
  onApprove: () => void;
  onDecline: (reason: string) => void;
  isApproving?: boolean;
  isDeclining?: boolean;
  approveLabel?: string;
}

const DocumentReviewDialog = ({
  open, onOpenChange, entityId, entityName, tenantId,
  onApprove, onDecline, isApproving, isDeclining, approveLabel = "Approve",
}: DocumentReviewDialogProps) => {
  const [declineReason, setDeclineReason] = useState("");
  const [showDecline, setShowDecline] = useState(false);
  const [viewingUrl, setViewingUrl] = useState<string | null>(null);

  // Fetch entity documents
  const { data: documents = [], isLoading } = useQuery({
    queryKey: ["entity_documents_review", entityId, tenantId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("entity_documents")
        .select("*, document_types(name)")
        .eq("entity_id", entityId)
        .eq("tenant_id", tenantId)
        .eq("is_deleted", false)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
    enabled: open && !!entityId,
  });

  // Fetch document requirements for the entity's relationship type
  const { data: requirements = [] } = useQuery({
    queryKey: ["doc_requirements_review", entityId, tenantId],
    queryFn: async () => {
      // Get the entity's relationship type via user_entity_relationships
      const { data: rels } = await (supabase as any)
        .from("user_entity_relationships")
        .select("relationship_type_id")
        .eq("entity_id", entityId)
        .eq("tenant_id", tenantId)
        .limit(1);
      const relTypeId = rels?.[0]?.relationship_type_id;
      if (!relTypeId) return [];

      const { data: reqs } = await supabase
        .from("document_entity_requirements")
        .select("document_type_id, document_types(name)")
        .eq("tenant_id", tenantId)
        .eq("relationship_type_id", relTypeId)
        .eq("is_active", true)
        .eq("is_required_for_registration", true);
      return reqs ?? [];
    },
    enabled: open && !!entityId,
  });

  // Fetch bank details for the entity
  const { data: bankDetails = [] } = useQuery({
    queryKey: ["entity_bank_review", entityId, tenantId],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("entity_bank_details")
        .select("*, banks(name, branch_code), bank_account_types(name)")
        .eq("entity_id", entityId)
        .eq("tenant_id", tenantId)
        .eq("is_deleted", false);
      return data ?? [];
    },
    enabled: open && !!entityId,
  });

  const handleViewDocument = async (filePath: string) => {
    const { data } = await supabase.storage
      .from("member-documents")
      .createSignedUrl(filePath, 300);
    if (data?.signedUrl) {
      window.open(data.signedUrl, "_blank");
    }
  };

  const handleDeclineSubmit = () => {
    onDecline(declineReason);
    setDeclineReason("");
    setShowDecline(false);
  };

  // Check which required docs are missing
  const requiredDocTypeIds = requirements.map((r: any) => r.document_type_id);
  const uploadedDocTypeIds = documents.map((d: any) => d.document_type_id).filter(Boolean);
  const missingRequired = requirements.filter(
    (r: any) => !uploadedDocTypeIds.includes(r.document_type_id)
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Review Application — {entityName}</DialogTitle>
          <DialogDescription>
            Review submitted documents and bank details before approving
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-6">
            {/* Bank Details Section */}
            {bankDetails.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold mb-2">Bank Details</h3>
                {bankDetails.map((b: any) => (
                  <div key={b.id} className="rounded-lg border border-border bg-muted/30 p-3 text-sm space-y-1">
                    <div className="flex justify-between">
                      <span className="font-medium">{b.banks?.name}</span>
                      <span className="text-muted-foreground">{b.bank_account_types?.name}</span>
                    </div>
                    <div className="flex gap-4 text-muted-foreground">
                      <span>Holder: {b.account_holder}</span>
                      <span>No: {b.account_number}</span>
                      {b.banks?.branch_code && <span>Branch: {b.banks.branch_code}</span>}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Missing Required Documents Warning */}
            {missingRequired.length > 0 && (
              <div className="rounded-lg border border-destructive/50 bg-destructive/5 p-3">
                <div className="flex items-center gap-2 text-sm font-medium text-destructive mb-1">
                  <AlertTriangle className="h-4 w-4" />
                  Missing Required Documents
                </div>
                <ul className="text-sm text-muted-foreground list-disc pl-5">
                  {missingRequired.map((r: any) => (
                    <li key={r.document_type_id}>{r.document_types?.name ?? "Unknown"}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Documents List */}
            <div>
              <h3 className="text-sm font-semibold mb-2">
                Submitted Documents ({documents.length})
              </h3>
              {documents.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">
                  No documents submitted
                </p>
              ) : (
                <div className="space-y-2">
                  {documents.map((doc: any) => {
                    const isRequired = requiredDocTypeIds.includes(doc.document_type_id);
                    return (
                      <div
                        key={doc.id}
                        className="flex items-center justify-between rounded-lg border border-border p-3"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate">
                              {doc.document_types?.name ?? doc.description ?? "Document"}
                            </p>
                            <p className="text-xs text-muted-foreground truncate">
                              {doc.file_name}
                              {doc.file_size && ` · ${(doc.file_size / 1024).toFixed(0)} KB`}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {isRequired && (
                            <Badge variant="outline" className="text-[10px]">Required</Badge>
                          )}
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleViewDocument(doc.file_path)}
                          >
                            <Eye className="h-3.5 w-3.5 mr-1" />
                            View
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Decline reason */}
            {showDecline && (
              <div className="space-y-2">
                <Label>Reason for declining</Label>
                <Textarea
                  value={declineReason}
                  onChange={(e) => setDeclineReason(e.target.value)}
                  placeholder="Provide a reason for declining this application..."
                  rows={3}
                />
              </div>
            )}
          </div>
        )}

        <DialogFooter className="flex gap-2 sm:gap-2">
          {showDecline ? (
            <>
              <Button variant="outline" onClick={() => setShowDecline(false)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={handleDeclineSubmit}
                disabled={isDeclining || !declineReason.trim()}
              >
                {isDeclining && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
                Confirm Decline
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="destructive"
                onClick={() => setShowDecline(true)}
              >
                <XCircle className="h-3.5 w-3.5 mr-1.5" />
                Decline
              </Button>
              <Button
                onClick={onApprove}
                disabled={isApproving}
              >
                {isApproving && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
                <CheckCircle className="h-3.5 w-3.5 mr-1.5" />
                {approveLabel}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default DocumentReviewDialog;
