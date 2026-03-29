import { useState, useCallback, useEffect } from "react";

const DEFAULT_STORAGE_KEY = "member_onboarding_completed";

export function useOnboardingTour(storageKey: string | null = DEFAULT_STORAGE_KEY) {
  const [isActive, setIsActive] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [hasCompleted, setHasCompleted] = useState(() => {
    if (!storageKey) return true; // treat null key as "already completed" to prevent auto-trigger
    try { return localStorage.getItem(storageKey) === "true"; } catch { return false; }
  });

  // Re-evaluate hasCompleted when storageKey changes (e.g. tenant resolved)
  useEffect(() => {
    if (!storageKey) {
      setHasCompleted(true);
      return;
    }
    try {
      setHasCompleted(localStorage.getItem(storageKey) === "true");
    } catch {
      setHasCompleted(false);
    }
  }, [storageKey]);

  // Auto-trigger on first visit (only if key is resolved)
  useEffect(() => {
    if (!storageKey || hasCompleted) return;
    const timer = setTimeout(() => setIsActive(true), 800);
    return () => clearTimeout(timer);
  }, [hasCompleted, storageKey]);

  const startTour = useCallback(() => {
    setCurrentStep(0);
    setIsActive(true);
  }, []);

  const nextStep = useCallback((totalSteps: number) => {
    if (currentStep < totalSteps - 1) {
      setCurrentStep((s) => s + 1);
    } else {
      completeTour();
    }
  }, [currentStep]);

  const prevStep = useCallback(() => {
    setCurrentStep((s) => Math.max(0, s - 1));
  }, []);

  const completeTour = useCallback(() => {
    setIsActive(false);
    setCurrentStep(0);
    setHasCompleted(true);
    if (storageKey) {
      try { localStorage.setItem(storageKey, "true"); } catch {}
    }
  }, [storageKey]);

  const skipTour = useCallback(() => {
    completeTour();
  }, [completeTour]);

  return {
    isActive,
    currentStep,
    hasCompleted,
    startTour,
    nextStep,
    prevStep,
    skipTour,
    completeTour,
  };
}
