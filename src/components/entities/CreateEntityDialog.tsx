import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/contexts/TenantContext";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type EntityType = "natural_person" | "legal_entity";

const CreateEntityDialog = ({ open, onOpenChange }: Props) => {
  const { currentTenant } = useTenant();
  const queryClient = useQueryClient();

  const [entityType, setEntityType] = useState<EntityType>("natural_person");
  const [categoryId, setCategoryId] = useState("");
  const [accountTypeId, setAccountTypeId] = useState("");

  // Natural person fields
  const [titleId, setTitleId] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [idNumber, setIdNumber] = useState("");
  const [passportNumber, setPassportNumber] = useState("");

  // Legal entity fields
  const [companyName, setCompanyName] = useState("");
  const [registrationNumber, setRegistrationNumber] = useState("");

  // Shared fields
  const [contactNumber, setContactNumber] = useState("");
  const [emailAddress, setEmailAddress] = useState("");

  // Fetch entity categories
  const { data: categories = [] } = useQuery({
    queryKey: ["entity_categories", entityType],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("entity_categories")
        .select("id, name, entity_type")
        .eq("entity_type", entityType)
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
    enabled: open,
  });

  // Fetch titles (for natural persons)
  const { data: titles = [] } = useQuery({
    queryKey: ["titles"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("titles")
        .select("id, description")
        .eq("is_active", true)
        .order("description");
      if (error) throw error;
      return data ?? [];
    },
    enabled: open && entityType === "natural_person",
  });

  // Fetch account types (Customer, Supplier, etc.)
  const { data: accountTypes = [] } = useQuery({
    queryKey: ["entity_account_types_for_create", currentTenant?.id],
    queryFn: async () => {
      if (!currentTenant) return [];
      const { data, error } = await (supabase as any)
        .from("entity_account_types")
        .select("id, name, prefix, number_count, account_type")
        .eq("tenant_id", currentTenant.id)
        .eq("is_active", true)
        .in("account_type", [2, 3, 4, 5]) // Customer, Supplier, Associated, Referral House
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!currentTenant && open,
  });

  const resetForm = () => {
    setEntityType("natural_person");
    setCategoryId("");
    setAccountTypeId("");
    setTitleId("");
    setFirstName("");
    setLastName("");
    setIdNumber("");
    setPassportNumber("");
    setCompanyName("");
    setRegistrationNumber("");
    setContactNumber("");
    setEmailAddress("");
  };

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!currentTenant) throw new Error("No tenant");

      const entityName = entityType === "natural_person" ? firstName.trim() : companyName.trim();
      if (!entityName) throw new Error("Name is required");

      // 1. Create the entity
      const entityPayload: any = {
        tenant_id: currentTenant.id,
        name: entityName,
        entity_category_id: categoryId || null,
        contact_number: contactNumber.trim() || null,
        email_address: emailAddress.trim() || null,
        is_active: true,
        is_registration_complete: true,
      };

      if (entityType === "natural_person") {
        entityPayload.last_name = lastName.trim() || null;
        entityPayload.title_id = titleId || null;
        entityPayload.identity_number = idNumber.trim() || null;
        entityPayload.passport_number = passportNumber.trim() || null;
      } else {
        entityPayload.registration_number = registrationNumber.trim() || null;
      }

      const { data: entity, error: entityError } = await (supabase as any)
        .from("entities")
        .insert(entityPayload)
        .select()
        .single();

      if (entityError) throw entityError;

      // 2. Create entity account if account type selected
      if (accountTypeId) {
        const selectedType = accountTypes.find((t: any) => t.id === accountTypeId);
        if (selectedType) {
          // Get next account number
          const prefix = selectedType.prefix || "C";
          const numCount = selectedType.number_count || 5;

          const { data: existingAccounts } = await (supabase as any)
            .from("entity_accounts")
            .select("account_number")
            .eq("tenant_id", currentTenant.id)
            .eq("entity_account_type_id", accountTypeId)
            .order("account_number", { ascending: false })
            .limit(1);

          let nextNum = 1;
          if (existingAccounts?.length > 0) {
            const lastNum = existingAccounts[0].account_number?.replace(prefix, "");
            const parsed = parseInt(lastNum, 10);
            if (!isNaN(parsed)) nextNum = parsed + 1;
          }

          const accountNumber = `${prefix}${String(nextNum).padStart(numCount, "0")}`;

          const { error: acctError } = await (supabase as any)
            .from("entity_accounts")
            .insert({
              tenant_id: currentTenant.id,
              entity_id: entity.id,
              entity_account_type_id: accountTypeId,
              account_number: accountNumber,
              is_active: true,
              is_approved: true,
              status: "active",
            });

          if (acctError) {
            console.warn("Account creation warning:", acctError.message);
            toast.warning("Entity created but account number could not be assigned.");
          }
        }
      }

      return entity;
    },
    onSuccess: () => {
      toast.success("Entity created successfully!");
      queryClient.invalidateQueries({ queryKey: ["entities"] });
      queryClient.invalidateQueries({ queryKey: ["all_entities"] });
      resetForm();
      onOpenChange(false);
    },
    onError: (err: any) => {
      toast.error(err.message || "Failed to create entity");
    },
  });

  const isNatural = entityType === "natural_person";
  const canSubmit = isNatural ? firstName.trim().length > 0 : companyName.trim().length > 0;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) resetForm(); onOpenChange(v); }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create Entity</DialogTitle>
          <DialogDescription>
            Add a new supplier, customer, or other entity to the system.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Entity Type */}
          <div className="space-y-1.5">
            <Label>Entity Type</Label>
            <Select value={entityType} onValueChange={(v) => { setEntityType(v as EntityType); setCategoryId(""); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="natural_person">Natural Person</SelectItem>
                <SelectItem value="legal_entity">Legal Entity</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Category */}
          {categories.length > 0 && (
            <div className="space-y-1.5">
              <Label>Category</Label>
              <Select value={categoryId} onValueChange={setCategoryId}>
                <SelectTrigger><SelectValue placeholder="Select category…" /></SelectTrigger>
                <SelectContent>
                  {categories.map((c: any) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Account Type */}
          {accountTypes.length > 0 && (
            <div className="space-y-1.5">
              <Label>Account Type <span className="text-xs text-muted-foreground">(optional)</span></Label>
              <Select value={accountTypeId} onValueChange={setAccountTypeId}>
                <SelectTrigger><SelectValue placeholder="Assign account type…" /></SelectTrigger>
                <SelectContent>
                  {accountTypes.map((t: any) => (
                    <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <hr className="border-border" />

          {/* Natural Person Fields */}
          {isNatural ? (
            <>
              {titles.length > 0 && (
                <div className="space-y-1.5">
                  <Label>Title</Label>
                  <Select value={titleId} onValueChange={setTitleId}>
                    <SelectTrigger><SelectValue placeholder="Select title…" /></SelectTrigger>
                    <SelectContent>
                      {titles.map((t: any) => (
                        <SelectItem key={t.id} value={t.id}>{t.description}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>First Name *</Label>
                  <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="First name" />
                </div>
                <div className="space-y-1.5">
                  <Label>Last Name</Label>
                  <Input value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Last name" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>ID Number</Label>
                  <Input value={idNumber} onChange={(e) => setIdNumber(e.target.value)} placeholder="ID number" />
                </div>
                <div className="space-y-1.5">
                  <Label>Passport Number</Label>
                  <Input value={passportNumber} onChange={(e) => setPassportNumber(e.target.value)} placeholder="Passport" />
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="space-y-1.5">
                <Label>Company / Entity Name *</Label>
                <Input value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="Company name" />
              </div>
              <div className="space-y-1.5">
                <Label>Registration Number</Label>
                <Input value={registrationNumber} onChange={(e) => setRegistrationNumber(e.target.value)} placeholder="Reg. number" />
              </div>
            </>
          )}

          {/* Shared Fields */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Contact Number</Label>
              <Input value={contactNumber} onChange={(e) => setContactNumber(e.target.value)} placeholder="Phone" />
            </div>
            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input type="email" value={emailAddress} onChange={(e) => setEmailAddress(e.target.value)} placeholder="Email" />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => { resetForm(); onOpenChange(false); }}>
            Cancel
          </Button>
          <Button onClick={() => createMutation.mutate()} disabled={!canSubmit || createMutation.isPending}>
            {createMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Create Entity
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default CreateEntityDialog;
