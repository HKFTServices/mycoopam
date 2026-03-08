import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertCircle, CheckCircle2, Phone, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { validateRsaId } from "@/lib/rsaIdValidation";
import type { StepProps } from "./types";

interface PersonDetailsStepProps extends StepProps {
  isEditing?: boolean;
}

const toSentenceCase = (val: string) =>
  val.replace(/\b\w/g, (c) => c.toUpperCase()).replace(/(?<=\w)\w*/g, (c) => c.toLowerCase());

const deriveInitials = (fullName: string) =>
  fullName.trim().split(/\s+/).map((w) => w.charAt(0).toUpperCase()).join("");

const formatToInternational = (val: string) => {
  const digits = val.replace(/[^0-9+]/g, "");
  if (digits.startsWith("0")) return "+27" + digits.slice(1);
  if (digits.startsWith("27") && !digits.startsWith("+")) return "+" + digits;
  return digits;
};

const PersonDetailsStep = ({ data, update, tenantId, isEditing = false }: PersonDetailsStepProps) => {
  const { profile } = useAuth();
  const phoneVerified = (profile as any)?.phone_verified ?? false;
  const profileEmailVerified = (profile as any)?.email_verified ?? false;

  // Phone OTP state
  const [otpSent, setOtpSent] = useState(false);
  const [otpCode, setOtpCode] = useState("");
  const [sendingOtp, setSendingOtp] = useState(false);
  const [verifyingOtp, setVerifyingOtp] = useState(false);
  const [localPhoneVerified, setLocalPhoneVerified] = useState(false);

  // Email is verified only if it matches the profile's verified email
  const emailVerified = profileEmailVerified && data.emailAddress.toLowerCase().trim() === (profile?.email || "").toLowerCase().trim();

  // Non-RSA numbers (not starting with +27) are auto-verified
  const formattedPhone = formatToInternational(data.contactNumber.trim());
  const isNonRsaNumber = formattedPhone.length > 3 && !formattedPhone.startsWith("+27");

  // Use local override if just verified in this session
  const isPhoneVerified = isNonRsaNumber || localPhoneVerified || (phoneVerified && formatToInternational(data.contactNumber) === formatToInternational(profile?.phone || ""));

  const sendOtp = async () => {
    setSendingOtp(true);
    try {
      const formatted = formatToInternational(data.contactNumber.trim());
      const { data: res, error } = await supabase.functions.invoke("send-otp", {
        body: { phone: formatted, action: "send" },
      });
      if (error) throw error;
      setOtpSent(true);
      toast.success(res?.message || "Verification code sent to your phone");
    } catch (err: any) {
      toast.error(err.message || "Failed to send code");
    } finally {
      setSendingOtp(false);
    }
  };

  const verifyOtp = async () => {
    setVerifyingOtp(true);
    try {
      const formatted = formatToInternational(data.contactNumber.trim());
      const { data: res, error } = await supabase.functions.invoke("send-otp", {
        body: { phone: formatted, action: "verify", code: otpCode },
      });
      if (error) throw error;
      if (res?.verified) {
        setLocalPhoneVerified(true);
        // Also update profile
        await supabase.from("profiles").update({ phone: formatted, phone_verified: true } as any).eq("user_id", profile?.user_id);
        toast.success("Phone number verified!");
      } else {
        toast.error(res?.error || "Invalid code, please try again");
      }
    } catch (err: any) {
      toast.error(err.message || "Verification failed");
    } finally {
      setVerifyingOtp(false);
    }
  };

  const handleContactNumberChange = (val: string) => {
    update({ contactNumber: val });
    // Reset verification if number changed
    setLocalPhoneVerified(false);
    setOtpSent(false);
    setOtpCode("");
  };
  const { data: categories = [] } = useQuery({
    queryKey: ["entity_categories_np"],
    queryFn: async () => {
      const { data } = await supabase
        .from("entity_categories")
        .select("id, name, entity_type")
        .eq("entity_type", "natural_person")
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

  const { data: titles = [] } = useQuery({
    queryKey: ["titles"],
    queryFn: async () => {
      const { data } = await supabase.from("titles").select("*").eq("is_active", true).order("description");
      return data ?? [];
    },
  });

  const idError = data.idType === "rsa_id" && data.idNumber.length > 0 && data.idNumber.length < 13
    ? "ID must be 13 digits"
    : data.idType === "rsa_id" && data.idNumber.length === 13 && !validateRsaId(data.idNumber).valid
    ? validateRsaId(data.idNumber).error || "Invalid ID"
    : "";

  return (
    <Card>
      <CardHeader>
        <CardTitle>Personal Details</CardTitle>
        <CardDescription>Enter the details of the person you're registering</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Entity Category *</Label>
            <Select value={data.entityCategoryId} onValueChange={(v) => update({ entityCategoryId: v, relationshipTypeId: "" })} disabled={isEditing}>
              <SelectTrigger className={isEditing ? "bg-muted" : ""}><SelectValue placeholder="Select category" /></SelectTrigger>
              <SelectContent>
                {categories.map((c: any) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Relationship to Entity *</Label>
            <Select value={data.relationshipTypeId} onValueChange={(v) => update({ relationshipTypeId: v })} disabled={!data.entityCategoryId || isEditing}>
              <SelectTrigger className={isEditing ? "bg-muted" : ""}><SelectValue placeholder="Select relationship" /></SelectTrigger>
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
            <Select value={data.languageCode} onValueChange={(v) => update({ languageCode: v })} disabled={isEditing}>
              <SelectTrigger className={isEditing ? "bg-muted" : ""}><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="en">English</SelectItem>
                <SelectItem value="af">Afrikaans</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Known As</Label>
            <Input value={data.knownAs} onChange={(e) => update({ knownAs: e.target.value })} onBlur={() => update({ knownAs: toSentenceCase(data.knownAs) })} placeholder="Nickname" disabled={isEditing} className={isEditing ? "bg-muted" : ""} />
          </div>
        </div>

        <div className="grid grid-cols-[100px_1fr_80px] gap-3">
          <div className="space-y-2">
            <Label>Title *</Label>
            <Select value={data.titleId} onValueChange={(v) => update({ titleId: v })}>
              <SelectTrigger><SelectValue placeholder="Title" /></SelectTrigger>
              <SelectContent>
                {titles.map((t: any) => (
                  <SelectItem key={t.id} value={t.id}>{t.description}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Full Names *</Label>
            <Input
              value={data.firstName}
              onChange={(e) => update({ firstName: e.target.value })}
              onBlur={() => {
                const formatted = toSentenceCase(data.firstName);
                update({ firstName: formatted, initials: deriveInitials(formatted) });
              }}
              placeholder="Full names"
              disabled={isEditing}
              className={isEditing ? "bg-muted" : ""}
            />
          </div>
          <div className="space-y-2">
            <Label>Initials</Label>
            <Input value={data.initials} onChange={(e) => update({ initials: e.target.value })} placeholder="WP" disabled={isEditing} className={isEditing ? "bg-muted" : ""} />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label>Last Name *</Label>
            <Input value={data.lastName} onChange={(e) => update({ lastName: e.target.value })} onBlur={() => update({ lastName: toSentenceCase(data.lastName) })} placeholder="Last name" disabled={isEditing} className={isEditing ? "bg-muted" : ""} />
          </div>
        </div>

        <div className="space-y-2">
          <Label>ID Type</Label>
          <RadioGroup value={data.idType} onValueChange={(v) => update({ idType: v as "rsa_id" | "passport", idNumber: "", gender: "", dateOfBirth: "" })} className="flex gap-4" disabled={isEditing}>
            <div className="flex items-center gap-2"><RadioGroupItem value="rsa_id" id="apply_rsa_id" disabled={isEditing} /><Label htmlFor="apply_rsa_id" className={isEditing ? "text-muted-foreground" : ""}>RSA ID Number</Label></div>
            <div className="flex items-center gap-2"><RadioGroupItem value="passport" id="apply_passport" disabled={isEditing} /><Label htmlFor="apply_passport" className={isEditing ? "text-muted-foreground" : ""}>Passport</Label></div>
          </RadioGroup>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label>{data.idType === "rsa_id" ? "RSA ID Number" : "Passport Number"} *</Label>
            <Input
              value={data.idNumber}
              onChange={(e) => {
                const val = e.target.value;
                update({ idNumber: val });
                if (data.idType === "rsa_id" && val.length === 13) {
                  const result = validateRsaId(val);
                  if (result.valid) {
                    update({ idNumber: val, gender: result.gender!, dateOfBirth: result.dateOfBirth! });
                    toast.success(`ID valid — ${result.gender === "male" ? "Male" : "Female"}, DOB: ${result.dateOfBirth}`);
                  }
                }
              }}
              placeholder={data.idType === "rsa_id" ? "13-digit ID" : "Passport number"}
              maxLength={data.idType === "rsa_id" ? 13 : undefined}
              className={isEditing ? "bg-muted" : idError ? "border-destructive" : ""}
              disabled={isEditing}
            />
            {idError && <p className="text-xs text-destructive flex items-center gap-1"><AlertCircle className="h-3 w-3" /> {idError}</p>}
            {data.idType === "rsa_id" && data.idNumber.length === 13 && !idError && (
              <p className="text-xs text-primary flex items-center gap-1"><CheckCircle2 className="h-3 w-3" /> Valid RSA ID</p>
            )}
          </div>
          <div className="space-y-2">
            <Label>Gender *</Label>
            <Select value={data.gender} onValueChange={(v) => update({ gender: v })} disabled={isEditing || (data.idType === "rsa_id" && data.idNumber.length === 13 && !idError)}>
              <SelectTrigger className={isEditing || (data.idType === "rsa_id" && data.idNumber.length === 13 && !idError) ? "bg-muted" : ""}>
                <SelectValue placeholder="Select gender" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="male">Male</SelectItem>
                <SelectItem value="female">Female</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Date of Birth *</Label>
            <Input type="date" value={data.dateOfBirth} onChange={(e) => update({ dateOfBirth: e.target.value })} disabled={isEditing || (data.idType === "rsa_id" && data.idNumber.length === 13 && !idError)} className={isEditing || (data.idType === "rsa_id" && data.idNumber.length === 13 && !idError) ? "bg-muted" : ""} />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Label>Contact Number *</Label>
              {isPhoneVerified ? (
                <Badge variant="default" className="text-xs gap-1">
                  <CheckCircle2 className="h-3 w-3" /> Verified
                </Badge>
              ) : (
                <Badge variant="destructive" className="text-xs gap-1">
                  <AlertCircle className="h-3 w-3" /> Please verify
                </Badge>
              )}
            </div>
            <div className="flex gap-2">
              <Input
                value={data.contactNumber}
                onChange={(e) => handleContactNumberChange(e.target.value)}
                onBlur={() => update({ contactNumber: formatToInternational(data.contactNumber) })}
                placeholder="+27831234567"
                className="flex-1"
              />
              {!isPhoneVerified && data.contactNumber.trim() && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={sendingOtp}
                  onClick={sendOtp}
                >
                  {sendingOtp ? <Loader2 className="h-4 w-4 animate-spin" /> : <Phone className="h-4 w-4" />}
                  {otpSent ? "Resend" : "Verify"}
                </Button>
              )}
            </div>
            {otpSent && !isPhoneVerified && (
              <div className="flex gap-2 mt-2">
                <Input
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder="Enter 6-digit code"
                  maxLength={6}
                  className="flex-1"
                />
                <Button
                  type="button"
                  size="sm"
                  disabled={otpCode.length !== 6 || verifyingOtp}
                  onClick={verifyOtp}
                >
                  {verifyingOtp ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirm"}
                </Button>
              </div>
            )}
          </div>
          <div className="space-y-2">
            <Label>Alternative Contact Number</Label>
            <Input value={data.altContactNumber} onChange={(e) => update({ altContactNumber: e.target.value })} onBlur={() => { if (data.altContactNumber.trim()) update({ altContactNumber: formatToInternational(data.altContactNumber) }); }} placeholder="+27831234567" />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Label>Email Address *</Label>
              {emailVerified ? (
                <Badge variant="default" className="text-xs gap-1">
                  <CheckCircle2 className="h-3 w-3" /> Verified
                </Badge>
              ) : (
                <Badge variant="destructive" className="text-xs gap-1">
                  <AlertCircle className="h-3 w-3" /> Please verify via activation email
                </Badge>
              )}
            </div>
            <Input type="email" value={data.emailAddress} onChange={(e) => update({ emailAddress: e.target.value })} placeholder="email@example.com" />
          </div>
          <div className="space-y-2">
            <Label>CC Email Address</Label>
            <Input type="email" value={data.ccEmail} onChange={(e) => update({ ccEmail: e.target.value })} placeholder="Secondary email" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default PersonDetailsStep;
