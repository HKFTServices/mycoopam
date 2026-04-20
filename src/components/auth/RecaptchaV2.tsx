import { useEffect, useRef, useState } from "react";
import { RECAPTCHA_SITE_KEY, waitForGrecaptchaV2 } from "@/lib/recaptcha";

declare global {
  interface Window {
    grecaptcha?: {
      render: (
        container: HTMLElement | string,
        parameters: {
          sitekey: string;
          theme?: "light" | "dark";
          size?: "normal" | "compact";
          callback?: (token: string) => void;
          "expired-callback"?: () => void;
          "error-callback"?: () => void;
        },
      ) => number;
      reset: (widgetId?: number) => void;
    };
  }
}

export function RecaptchaV2({
  onToken,
  className,
  theme = "light",
  size = "normal",
}: {
  onToken: (token: string | null) => void;
  className?: string;
  theme?: "light" | "dark";
  size?: "normal" | "compact";
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const widgetIdRef = useRef<number | null>(null);
  const renderedRef = useRef(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setLoadError(null);
      if (!RECAPTCHA_SITE_KEY) {
        setLoadError("Missing reCAPTCHA site key");
        onToken(null);
        return;
      }

      try {
        await waitForGrecaptchaV2();
        if (cancelled) return;
        if (!containerRef.current) return;
        if (renderedRef.current) return;

        renderedRef.current = true;
        widgetIdRef.current = window.grecaptcha!.render(containerRef.current, {
          sitekey: RECAPTCHA_SITE_KEY,
          theme,
          size,
          callback: (token) => onToken(token),
          "expired-callback": () => onToken(null),
          "error-callback": () => onToken(null),
        });
      } catch (err: any) {
        if (cancelled) return;
        setLoadError(err?.message ?? "Failed to load reCAPTCHA");
        onToken(null);
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [onToken, size, theme]);

  // Clear token + reset widget when the site key changes (or when the component remounts).
  useEffect(() => {
    onToken(null);
    if (widgetIdRef.current != null) {
      window.grecaptcha?.reset(widgetIdRef.current);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [RECAPTCHA_SITE_KEY]);

  return (
    <div className={className}>
      <div ref={containerRef} />
      {loadError && <p className="mt-2 text-xs text-destructive">{loadError}</p>}
    </div>
  );
}

