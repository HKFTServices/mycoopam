import { useEffect, useState, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { X, ChevronLeft, ChevronRight, Sparkles, PartyPopper } from "lucide-react";
import { cn } from "@/lib/utils";

export interface TourStep {
  target: string; // data-tour attribute value
  title: string;
  description: string;
  position?: "top" | "bottom" | "left" | "right";
  action?: string; // optional action prompt text
}

interface OnboardingTourProps {
  steps: TourStep[];
  isActive: boolean;
  currentStep: number;
  onNext: () => void;
  onPrev: () => void;
  onSkip: () => void;
  onComplete: () => void;
}

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
  bottom: number;
  right: number;
}

const PADDING = 8;
const TOOLTIP_GAP = 12;

const OnboardingTour = ({ steps, isActive, currentStep, onNext, onPrev, onSkip, onComplete }: OnboardingTourProps) => {
  const [targetRect, setTargetRect] = useState<Rect | null>(null);
  const [tooltipStyle, setTooltipStyle] = useState<React.CSSProperties>({});
  const [resolvedPosition, setResolvedPosition] = useState<"top" | "bottom" | "left" | "right">("bottom");
  const [isVisible, setIsVisible] = useState(false);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);

  const step = steps[currentStep];
  const isLastStep = currentStep === steps.length - 1;
  const isFirstStep = currentStep === 0;
  const progressValue = ((currentStep + 1) / steps.length) * 100;

  // Find and track target element
  const updatePosition = useCallback(() => {
    if (!step) return;

    const el = document.querySelector(`[data-tour="${step.target}"]`);
    if (!el) {
      // If target not found, show as centered modal
      setTargetRect(null);
      setTooltipStyle({
        position: "fixed",
        top: "50%",
        left: "50%",
        transform: "translate(-50%, -50%)",
        maxWidth: "min(400px, calc(100vw - 32px))",
      });
      setIsVisible(true);
      return;
    }

    const rect = el.getBoundingClientRect();
    setTargetRect({
      top: rect.top,
      left: rect.left,
      width: rect.width,
      height: rect.height,
      bottom: rect.bottom,
      right: rect.right,
    });

    // Scroll element into view if needed
    const isInViewport = rect.top >= 0 && rect.bottom <= window.innerHeight;
    if (!isInViewport) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      // Re-measure after scroll
      requestAnimationFrame(() => {
        const newRect = el.getBoundingClientRect();
        setTargetRect({
          top: newRect.top,
          left: newRect.left,
          width: newRect.width,
          height: newRect.height,
          bottom: newRect.bottom,
          right: newRect.right,
        });
      });
    }
  }, [step]);

  // Position tooltip relative to target
  useEffect(() => {
    if (!targetRect || !tooltipRef.current) return;

    const tooltip = tooltipRef.current;
    const tooltipRect = tooltip.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    const preferred = step?.position || "bottom";
    let pos = preferred;

    // Check if preferred position fits, otherwise find best alternative
    const fits = {
      bottom: targetRect.bottom + TOOLTIP_GAP + tooltipRect.height < vh,
      top: targetRect.top - TOOLTIP_GAP - tooltipRect.height > 0,
      right: targetRect.right + TOOLTIP_GAP + tooltipRect.width < vw,
      left: targetRect.left - TOOLTIP_GAP - tooltipRect.width > 0,
    };

    if (!fits[pos]) {
      if (fits.bottom) pos = "bottom";
      else if (fits.top) pos = "top";
      else if (fits.right) pos = "right";
      else if (fits.left) pos = "left";
      else pos = "bottom"; // fallback
    }

    setResolvedPosition(pos);

    const maxWidth = Math.min(380, vw - 32);
    let style: React.CSSProperties = { position: "fixed", maxWidth, zIndex: 10002 };

    switch (pos) {
      case "bottom":
        style.top = targetRect.bottom + TOOLTIP_GAP;
        style.left = Math.max(16, Math.min(targetRect.left + targetRect.width / 2 - maxWidth / 2, vw - maxWidth - 16));
        break;
      case "top":
        style.bottom = vh - targetRect.top + TOOLTIP_GAP;
        style.left = Math.max(16, Math.min(targetRect.left + targetRect.width / 2 - maxWidth / 2, vw - maxWidth - 16));
        break;
      case "right":
        style.top = Math.max(16, targetRect.top + targetRect.height / 2 - tooltipRect.height / 2);
        style.left = targetRect.right + TOOLTIP_GAP;
        break;
      case "left":
        style.top = Math.max(16, targetRect.top + targetRect.height / 2 - tooltipRect.height / 2);
        style.right = vw - targetRect.left + TOOLTIP_GAP;
        break;
    }

    setTooltipStyle(style);
    setIsVisible(true);
  }, [targetRect, step]);

  // Re-measure on step change and window resize
  useEffect(() => {
    if (!isActive) return;

    setIsVisible(false);
    // Small delay to allow DOM to settle
    const timer = setTimeout(updatePosition, 150);

    const handleResize = () => updatePosition();
    window.addEventListener("resize", handleResize);
    window.addEventListener("scroll", handleResize, true);

    return () => {
      clearTimeout(timer);
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("scroll", handleResize, true);
    };
  }, [isActive, currentStep, updatePosition]);

  // Observe target element mutations
  useEffect(() => {
    if (!isActive || !step) return;

    resizeObserverRef.current = new ResizeObserver(() => updatePosition());
    const el = document.querySelector(`[data-tour="${step.target}"]`);
    if (el) resizeObserverRef.current.observe(el);

    return () => {
      resizeObserverRef.current?.disconnect();
    };
  }, [isActive, step, updatePosition]);

  if (!isActive || !step) return null;

  const handleNext = () => {
    if (isLastStep) onComplete();
    else onNext();
  };

  return createPortal(
    <div className="onboarding-tour" aria-live="polite">
      {/* Backdrop overlay with cutout */}
      <div className="fixed inset-0 z-[10000] pointer-events-auto" onClick={onSkip}>
        <svg className="absolute inset-0 w-full h-full" style={{ zIndex: 10000 }}>
          <defs>
            <mask id="tour-mask">
              <rect x="0" y="0" width="100%" height="100%" fill="white" />
              {targetRect && (
                <rect
                  x={targetRect.left - PADDING}
                  y={targetRect.top - PADDING}
                  width={targetRect.width + PADDING * 2}
                  height={targetRect.height + PADDING * 2}
                  rx="8"
                  fill="black"
                />
              )}
            </mask>
          </defs>
          <rect
            x="0" y="0" width="100%" height="100%"
            fill="rgba(0,0,0,0.55)"
            mask="url(#tour-mask)"
          />
        </svg>
      </div>

      {/* Highlight ring around target */}
      {targetRect && (
        <div
          className="fixed z-[10001] pointer-events-none rounded-lg ring-2 ring-primary ring-offset-2 ring-offset-background transition-all duration-300"
          style={{
            top: targetRect.top - PADDING,
            left: targetRect.left - PADDING,
            width: targetRect.width + PADDING * 2,
            height: targetRect.height + PADDING * 2,
          }}
        />
      )}

      {/* Tooltip card */}
      <div
        ref={tooltipRef}
        className={cn(
          "z-[10002] bg-popover text-popover-foreground border border-border rounded-xl shadow-lg p-4 pointer-events-auto transition-opacity duration-200",
          isVisible ? "opacity-100" : "opacity-0"
        )}
        style={tooltipStyle}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-2 mb-3">
          <div className="flex items-center gap-2">
            {isFirstStep ? (
              <Sparkles className="h-5 w-5 text-primary shrink-0" />
            ) : isLastStep ? (
              <PartyPopper className="h-5 w-5 text-primary shrink-0" />
            ) : null}
            <h3 className="font-semibold text-sm">{step.title}</h3>
          </div>
          <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0 -mt-1 -mr-1" onClick={onSkip}>
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>

        {/* Description */}
        <p className="text-sm text-muted-foreground leading-relaxed">{step.description}</p>

        {/* Action prompt */}
        {step.action && (
          <p className="text-xs text-primary font-medium mt-2 italic">{step.action}</p>
        )}

        {/* Progress + controls */}
        <div className="mt-4 space-y-3">
          <div className="flex items-center gap-2">
            <Progress value={progressValue} className="h-1.5 flex-1" />
            <span className="text-[11px] text-muted-foreground whitespace-nowrap">
              {currentStep + 1} of {steps.length}
            </span>
          </div>

          <div className="flex items-center justify-between">
            <Button variant="ghost" size="sm" onClick={onSkip} className="text-xs h-8 text-muted-foreground">
              Skip tour
            </Button>
            <div className="flex items-center gap-1.5">
              {!isFirstStep && (
                <Button variant="outline" size="sm" onClick={onPrev} className="h-8 gap-1 text-xs">
                  <ChevronLeft className="h-3.5 w-3.5" />
                  Back
                </Button>
              )}
              <Button size="sm" onClick={handleNext} className="h-8 gap-1 text-xs">
                {isLastStep ? "Get started!" : "Next"}
                {!isLastStep && <ChevronRight className="h-3.5 w-3.5" />}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default OnboardingTour;
