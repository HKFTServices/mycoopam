import * as React from "react";

const MOBILE_BREAKPOINT = 768;

export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    if (typeof window.matchMedia !== "function") return window.innerWidth < MOBILE_BREAKPOINT;
    return window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`).matches;
  });

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
    const onChange = (event?: MediaQueryListEvent) => {
      setIsMobile(event?.matches ?? mql.matches);
    };

    // Safari < 14 / older WebViews
    if (typeof mql.addEventListener === "function") {
      mql.addEventListener("change", onChange);
      onChange();
      return () => mql.removeEventListener("change", onChange);
    }

    // eslint-disable-next-line deprecation/deprecation
    mql.addListener(onChange);
    onChange();
    // eslint-disable-next-line deprecation/deprecation
    return () => mql.removeListener(onChange);
  }, []);

  return isMobile;
}
