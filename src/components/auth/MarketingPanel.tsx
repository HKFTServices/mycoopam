import { useEffect, useRef, useState } from "react";
import { useTenant } from "@/contexts/TenantContext";
import { cn } from "@/lib/utils";
import { getRandomImage, MARKETING_IMAGES } from "@/lib/marketingImages";
import placeholderLogo from "@/assets/mycoop-logo-transparent.png";

const FADE_MS = 500;
const TICK_MS = 250;

function randomDelayMs() {
  return 6000 + Math.floor(Math.random() * 2001);
}

async function preloadImage(src: string): Promise<void> {
  await new Promise<void>((resolve) => {
    const img = new Image();
    img.src = src;
    const done = () => resolve();
    img.onload = done;
    img.onerror = done;
    // decode() is nicer when available, but still resolve on errors to avoid blocking rotation.
    img.decode?.().then(done).catch(done);
  });
}

function BackgroundImage() {
  const [currentSrc, setCurrentSrc] = useState<string>(() => {
    const last = localStorage.getItem("lastMarketingImage");
    return last && (MARKETING_IMAGES as readonly string[]).includes(last) ? last : getRandomImage();
  });
  const [incomingSrc, setIncomingSrc] = useState<string | null>(null);
  const [incomingVisible, setIncomingVisible] = useState(false);
  const swappingRef = useRef(false);
  const nextRotateAtRef = useRef<number>(Date.now() + randomDelayMs());
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    const rotate = async () => {
      if (swappingRef.current) return;
      swappingRef.current = true;
      try {
        const next = getRandomImage(currentSrc);
        await preloadImage(next);
        if (!mountedRef.current) return;

        setIncomingSrc(next);
        setIncomingVisible(false);
        requestAnimationFrame(() => requestAnimationFrame(() => setIncomingVisible(true)));

        window.setTimeout(() => {
          if (!mountedRef.current) return;
          setCurrentSrc(next);
          setIncomingSrc(null);
          setIncomingVisible(false);
          swappingRef.current = false;
        }, FADE_MS);
      } catch {
        swappingRef.current = false;
      }
    };

    const id = window.setInterval(() => {
      if (document.visibilityState === "hidden") return;
      if (Date.now() < nextRotateAtRef.current) return;
      nextRotateAtRef.current = Date.now() + randomDelayMs();
      void rotate();
    }, TICK_MS);

    return () => window.clearInterval(id);
  }, [currentSrc]);

  return (
    <div className="absolute inset-0 overflow-hidden rounded-[inherit]">
      <img
        src={currentSrc}
        alt="MyCo-op marketing background"
        className="absolute inset-0 h-full w-full object-cover rounded-[inherit]"
        loading="eager"
        draggable={false}
      />
      {incomingSrc && (
        <img
          src={incomingSrc}
          alt=""
          aria-hidden="true"
          className={cn(
            "absolute inset-0 h-full w-full object-cover rounded-[inherit] transition-opacity duration-500 will-change-opacity",
            incomingVisible ? "opacity-100" : "opacity-0"
          )}
          loading="eager"
          draggable={false}
        />
      )}
    </div>
  );
}

function GradientOverlay() {
  return (
    <div className="absolute inset-0 bg-gradient-to-t from-black/65 via-black/20 to-black/5" aria-hidden="true" />
  );
}

function TenantLogoOverlay() {
  const { company } = useTenant();
  if (!company?.name) return null;

  return (
    <div className="absolute top-6 right-6">
      <div className="rounded-xl bg-white/10 px-3 py-2 backdrop-blur-md shadow-sm ring-1 ring-white/10">
        <img
          src={company.logoUrl || placeholderLogo}
          alt={company.name || "Tenant logo"}
          className="max-h-[50px] w-auto object-contain"
          loading="lazy"
          draggable={false}
        />
      </div>
    </div>
  );
}

function MarketingText() {
  return (
    <div className="absolute bottom-8 left-8 right-8 text-white">
      <div className="max-w-xl space-y-3">
        <p className="text-2xl font-semibold leading-snug tracking-tight">
          MyCo-op is a digital platform designed to empower cooperatives, communities, and member-based organisations.
        </p>

        <p className="text-sm text-white/85 leading-relaxed">
          Built around the core principles of cooperative management, MyCo-op enables organisations to streamline
          operations, improve member engagement, and unlock new revenue opportunities through modern technology.
        </p>

        <div className="text-sm text-white/85">
          <p className="font-medium text-white/95">The platform focuses on:</p>
          <ul className="mt-2 list-disc pl-5 space-y-1">
            <li>Centralised management of members, services, and operations</li>
            <li>Improved decision-making through structured workflows and data visibility</li>
            <li>Enhanced service delivery across supply, distribution, and marketing activities</li>
            <li>Stronger member engagement via digital tools and communication channels</li>
            <li>Scalable systems that support both small cooperatives and large organisations</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

export function MarketingPanel({ className }: { className?: string }) {
  return (
    <div className={cn("relative h-full w-full overflow-hidden isolate rounded-[inherit]", className)}>
      <BackgroundImage />
      <GradientOverlay />
      <TenantLogoOverlay />
      <MarketingText />
    </div>
  );
}
