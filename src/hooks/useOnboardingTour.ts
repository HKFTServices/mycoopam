import { useState, useCallback, useEffect } from "react";

const DEFAULT_STORAGE_KEY = "member_onboarding_completed";

export function useOnboardingTour(storageKey: string = DEFAULT_STORAGE_KEY) {
  const [isActive, setIsActive] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [hasCompleted, setHasCompleted] = useState(() => {
    try { return localStorage.getItem(storageKey) === "true"; } catch { return false; }
  });

  // Auto-trigger on first visit
  useEffect(() => {
    if (!hasCompleted) {
      const timer = setTimeout(() => setIsActive(true), 800);
      return () => clearTimeout(timer);
    }
  }, [hasCompleted]);

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
    try { localStorage.setItem(storageKey, "true"); } catch {}
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
