import { useState, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Phone, CheckCircle2, AlertCircle } from "lucide-react";

interface EditProfileDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const formatToInternational = (val: string): string => {
  const digits = val.replace(/[^0-9+]/g, "");
  if (digits.startsWith("0")) return "+27" + digits.slice(1);
  if (digits.startsWith("27") && !digits.startsWith("+")) return "+" + digits;
  return digits;
};

const EditProfileDialog = ({ open, onOpenChange }: EditProfileDialogProps) => {
  const { profile, refreshProfile } = useAuth();
  const { toast } = useToast();
  const [form, setForm] = useState({
    first_name: "",
    last_name: "",
    phone: "",
    known_as: "",
  });

  // Phone verification
  const [phoneVerified, setPhoneVerified] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  const [otpCode, setOtpCode] = useState("");
  const [sendingOtp, setSendingOtp] = useState(false);
  const [verifyingOtp, setVerifyingOtp] = useState(false);
  const [originalPhone, setOriginalPhone] = useState("");

  // Email verification status
  const emailVerified = (profile as any)?.email_verified ?? false;

  useEffect(() => {
    if (profile && open) {
      setForm({
        first_name: profile.first_name || "",
        last_name: profile.last_name || "",
        phone: profile.phone || "",
        known_as: profile.known_as || "",
      });
      setPhoneVerified((profile as any)?.phone_verified ?? false);
      setOriginalPhone(profile.phone || "");
      setOtpSent(false);
      setOtpCode("");
    }
  }, [profile, open]);

  const handlePhoneChange = (val: string) => {
    setForm({ ...form, phone: val });
    // If phone changed from the verified one, reset verification
    const formatted = formatToInternational(val);
    if (formatted !== formatToInternational(originalPhone)) {
      setPhoneVerified(false);
      setOtpSent(false);
      setOtpCode("");
    }
  };

  const sendOtp = async () => {
    setSendingOtp(true);
    try {
      const formatted = formatToInternational(form.phone.trim());
      const { data, error } = await supabase.functions.invoke("send-otp", {
        body: { phone: formatted, action: "send" },
      });
      if (error) throw error;
      setOtpSent(true);
      toast({ title: "Code sent", description: data?.message || "Verification code sent to your phone" });
    } catch (err: any) {
      toast({ title: "Error", description: err.message || "Failed to send code", variant: "destructive" });
    } finally {
      setSendingOtp(false);
    }
  };

  const verifyOtp = async () => {
    setVerifyingOtp(true);
    try {
      const formatted = formatToInternational(form.phone.trim());
      const { data, error } = await supabase.functions.invoke("send-otp", {
        body: { phone: formatted, action: "verify", code: otpCode },
      });
      if (error) throw error;
      if (data?.verified) {
        setPhoneVerified(true);
        toast({ title: "Verified", description: "Phone number verified!" });
      } else {
        toast({ title: "Invalid code", description: data?.error || "Please try again", variant: "destructive" });
      }
    } catch (err: any) {
      toast({ title: "Error", description: err.message || "Verification failed", variant: "destructive" });
    } finally {
      setVerifyingOtp(false);
    }
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!profile) throw new Error("No profile");
      const { error } = await supabase
        .from("profiles")
        .update({
          first_name: form.first_name || null,
          last_name: form.last_name || null,
          phone: form.phone ? formatToInternational(form.phone.trim()) : null,
          known_as: form.known_as || null,
          phone_verified: phoneVerified,
        } as any)
        .eq("user_id", profile.user_id);
      if (error) throw error;
    },
    onSuccess: async () => {
      await refreshProfile();
      toast({ title: "Profile updated" });
      onOpenChange(false);
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Profile</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>First Name</Label>
              <Input value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Last Name</Label>
              <Input value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Known As</Label>
            <Input value={form.known_as} onChange={(e) => setForm({ ...form, known_as: e.target.value })} placeholder="Nickname" />
          </div>

          {/* Phone with verification */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Label>Phone</Label>
              {phoneVerified ? (
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
                value={form.phone}
                onChange={(e) => handlePhoneChange(e.target.value)}
                onBlur={() => {
                  if (form.phone.trim()) {
                    setForm({ ...form, phone: formatToInternational(form.phone.trim()) });
                  }
                }}
                placeholder="+27831234567"
                className="flex-1"
              />
              {!phoneVerified && form.phone.trim() && (
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
            {otpSent && !phoneVerified && (
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

          {/* Email with verification status */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Label>Email</Label>
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
            <Input value={profile?.email || ""} disabled className="bg-muted" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
            {saveMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default EditProfileDialog;