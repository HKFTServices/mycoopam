import { useState, useEffect, forwardRef } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Shield, ChevronDown, ChevronUp } from "lucide-react";

const COOKIE_CONSENT_KEY = "mycoop_cookie_consent";

type ConsentValue = "accepted" | "rejected" | null;

export function getCookieConsent(): ConsentValue {
  return localStorage.getItem(COOKIE_CONSENT_KEY) as ConsentValue;
}

const CookieConsent = forwardRef<HTMLDivElement>((_, ref) => {
  const [visible, setVisible] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  useEffect(() => {
    const consent = getCookieConsent();
    if (!consent) {
      const timer = setTimeout(() => setVisible(true), 1200);
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
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-[9998] bg-black/40 backdrop-blur-[2px] animate-in fade-in duration-300" />

      {/* Banner */}
      <div className="fixed bottom-0 left-0 right-0 z-[9999] animate-in slide-in-from-bottom-6 duration-500">
        <div className="border-t border-border bg-card shadow-[0_-8px_30px_rgba(0,0,0,0.12)]">
          <div className="mx-auto max-w-6xl px-6 py-5 md:py-6">
            {/* Top row */}
            <div className="flex items-start gap-4">
              <div className="hidden md:flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-primary/10 mt-0.5">
                <Shield className="h-5 w-5 text-primary" />
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1.5">
                  <h3 className="text-sm font-semibold tracking-tight text-foreground uppercase">
                    Cookie Preferences
                  </h3>
                  <span className="hidden sm:inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary uppercase tracking-wider">
                    POPIA Compliant
                  </span>
                </div>
                <p className="text-sm text-muted-foreground leading-relaxed max-w-2xl">
                  We use strictly necessary cookies for authentication and security. Non-essential cookies help us
                  improve your experience.{" "}
                  <Link
                    to="/cookie-policy"
                    className="text-primary font-medium underline underline-offset-2 hover:text-primary/80 transition-colors"
                  >
                    View full cookie policy
                  </Link>
                </p>
              </div>

              {/* Action buttons — desktop inline */}
              <div className="hidden lg:flex items-center gap-2 shrink-0 pt-1">
                <Button
                  onClick={handleReject}
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground hover:text-foreground text-xs font-medium h-9 px-4"
                >
                  Essential Only
                </Button>
                <Button
                  onClick={handleAccept}
                  size="sm"
                  className="h-9 px-5 text-xs font-semibold tracking-wide"
                >
                  Accept All Cookies
                </Button>
              </div>
            </div>

            {/* Details toggle */}
            <button
              onClick={() => setShowDetails((v) => !v)}
              className="flex items-center gap-1 mt-3 text-xs text-muted-foreground hover:text-foreground transition-colors font-medium"
            >
              {showDetails ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
              {showDetails ? "Hide details" : "Show cookie details"}
            </button>

            {/* Details panel */}
            {showDetails && (
              <div className="mt-3 rounded-lg border border-border bg-muted/30 overflow-hidden animate-in fade-in slide-in-from-top-1 duration-200">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border bg-muted/50">
                      <th className="text-left py-2.5 px-4 font-semibold text-foreground">Category</th>
                      <th className="text-left py-2.5 px-4 font-semibold text-foreground hidden sm:table-cell">Description</th>
                      <th className="text-center py-2.5 px-4 font-semibold text-foreground w-24">Required</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/50 text-muted-foreground">
                    <tr>
                      <td className="py-2.5 px-4 font-medium text-foreground">Authentication</td>
                      <td className="py-2.5 px-4 hidden sm:table-cell">Session tokens to keep you signed in securely.</td>
                      <td className="py-2.5 px-4 text-center">
                        <span className="inline-flex items-center rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold text-primary">YES</span>
                      </td>
                    </tr>
                    <tr>
                      <td className="py-2.5 px-4 font-medium text-foreground">Security</td>
                      <td className="py-2.5 px-4 hidden sm:table-cell">CSRF protection and fraud detection.</td>
                      <td className="py-2.5 px-4 text-center">
                        <span className="inline-flex items-center rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold text-primary">YES</span>
                      </td>
                    </tr>
                    <tr>
                      <td className="py-2.5 px-4 font-medium text-foreground">Preferences</td>
                      <td className="py-2.5 px-4 hidden sm:table-cell">Tenant selection and display settings.</td>
                      <td className="py-2.5 px-4 text-center">
                        <span className="inline-flex items-center rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold text-primary">YES</span>
                      </td>
                    </tr>
                    <tr>
                      <td className="py-2.5 px-4 font-medium text-foreground">Performance</td>
                      <td className="py-2.5 px-4 hidden sm:table-cell">Usage analytics to improve the platform.</td>
                      <td className="py-2.5 px-4 text-center">
                        <span className="inline-flex items-center rounded bg-muted px-1.5 py-0.5 text-[10px] font-bold text-muted-foreground">NO</span>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}

            {/* Mobile action buttons */}
            <div className="flex lg:hidden items-center gap-2 mt-4">
              <Button
                onClick={handleReject}
                variant="outline"
                size="sm"
                className="flex-1 text-xs font-medium h-9"
              >
                Essential Only
              </Button>
              <Button
                onClick={handleAccept}
                size="sm"
                className="flex-1 h-9 text-xs font-semibold tracking-wide"
              >
                Accept All Cookies
              </Button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
});

CookieConsent.displayName = "CookieConsent";

export default CookieConsent;
