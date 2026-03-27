import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Cookie, X } from "lucide-react";

const COOKIE_CONSENT_KEY = "mycoop_cookie_consent";

type ConsentValue = "accepted" | "rejected" | null;

export function getCookieConsent(): ConsentValue {
  return localStorage.getItem(COOKIE_CONSENT_KEY) as ConsentValue;
}

const CookieConsent = () => {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const consent = getCookieConsent();
    if (!consent) {
      const timer = setTimeout(() => setVisible(true), 1500);
      return () => clearTimeout(timer);
    }
  }, []);

  const handleAccept = () => {
    localStorage.setItem(COOKIE_CONSENT_KEY, "accepted");
    setVisible(false);
  };

  const handleReject = () => {
    localStorage.setItem(COOKIE_CONSENT_KEY, "rejected");
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-[9999] p-4 animate-in slide-in-from-bottom-4 duration-500">
      <div className="mx-auto max-w-4xl rounded-xl border bg-card shadow-2xl p-5 md:p-6">
        <div className="flex items-start gap-4">
          <div className="hidden sm:flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10">
            <Cookie className="h-5 w-5 text-primary" />
          </div>
          <div className="flex-1 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-foreground">Cookie Notice</h3>
              <button onClick={handleReject} className="text-muted-foreground hover:text-foreground transition-colors sm:hidden">
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">
              We use cookies to enhance your experience, analyse site traffic, and for security purposes. 
              By clicking "Accept All", you consent to our use of cookies. You can manage your preferences 
              or learn more in our{" "}
              <Link to="/cookie-policy" className="text-primary underline underline-offset-2 hover:text-primary/80">
                Cookie Policy
              </Link>.
            </p>
            <div className="flex flex-col sm:flex-row gap-2 pt-1">
              <Button onClick={handleAccept} size="sm" className="min-w-[120px]">
                Accept All
              </Button>
              <Button onClick={handleReject} variant="outline" size="sm" className="min-w-[120px]">
                Reject Non-Essential
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CookieConsent;
