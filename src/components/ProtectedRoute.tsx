import { useAuth } from "@/contexts/AuthContext";
import { Navigate, useLocation } from "react-router-dom";
import { Loader2 } from "lucide-react";

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { session, profile, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/auth" replace />;
  }

  // Redirect incomplete profiles to onboarding (unless already there or applying for membership)
  const regStatus = (profile as any)?.registration_status;
  const needsOnboarding = (profile as any)?.needs_onboarding;
  const isOnboardingRoute = location.pathname === "/onboarding" || location.pathname === "/membership-application";

  if (
    profile &&
    regStatus === "incomplete" &&
    !isOnboardingRoute
  ) {
    return <Navigate to="/onboarding" replace />;
  }

  // Redirect registered legacy users who haven't completed onboarding
  if (
    profile &&
    regStatus === "registered" &&
    needsOnboarding === true &&
    !isOnboardingRoute
  ) {
    return <Navigate to="/onboarding" replace />;
  }

  // Show pending approval message for users awaiting document review
  if (
    profile &&
    regStatus === "pending_approval" &&
    !isOnboardingRoute
  ) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="max-w-md text-center space-y-4 p-8">
          <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
            <Loader2 className="h-8 w-8 text-primary animate-spin" />
          </div>
          <h2 className="text-xl font-semibold">Registration Under Review</h2>
          <p className="text-muted-foreground text-sm">
            Your registration documents are being reviewed. You'll receive an email once your account has been approved.
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};

export default ProtectedRoute;
