"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

const TARGET_COLLECTIONS = ["clients", "client-proposals"];

function shouldResetTabs(pathname: string | null): boolean {
  if (!pathname) return false;
  return TARGET_COLLECTIONS.some((slug) => {
    const prefix = `/admin/collections/${slug}`;
    return pathname === prefix || pathname.startsWith(`${prefix}/`);
  });
}

function clickDefaultTopLevelTab(): boolean {
  const collectionRoot = document.querySelector(
    ".collection-edit--clients, .collection-edit--client-proposals",
  );
  if (!collectionRoot) return false;

  const tabButtons = Array.from(
    collectionRoot.querySelectorAll<HTMLButtonElement>(
      ".tabs-field:not(.tabs-field--within-collapsible) .tabs-field__tab-button:not(.tabs-field__tab-button--hidden)",
    ),
  );
  const targetTab =
    tabButtons.find((tab) => tab.textContent?.trim().toLowerCase() === "business") ||
    tabButtons[0];

  if (!targetTab) return false;
  if (!targetTab.classList.contains("tabs-field__tab-button--active")) {
    targetTab.click();
  }
  return true;
}

const ResetDocumentTabsOnOpen = ({ children }: { children?: React.ReactNode }) => {
  const pathname = usePathname();
  const userInteractedRef = useRef(false);

  useEffect(() => {
    if (!shouldResetTabs(pathname)) return;

    userInteractedRef.current = false;

    const handleUserTabClick = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest(".tabs-field__tab-button")) {
        userInteractedRef.current = true;
      }
    };

    document.addEventListener("click", handleUserTabClick, { capture: true });

    // Payload restores the last active tab from document preferences shortly
    // after mount. Run a few delayed passes so each freshly opened client or
    // proposal settles back onto its first/top tab, but stop if the user clicks
    // a tab during that short initial load window.
    const timers = [0, 100, 300, 700].map((delay) =>
      window.setTimeout(() => {
        if (!userInteractedRef.current) clickDefaultTopLevelTab();
      }, delay),
    );

    return () => {
      document.removeEventListener("click", handleUserTabClick, { capture: true });
      timers.forEach((timer) => window.clearTimeout(timer));
    };
  }, [pathname]);

  return <>{children}</>;
};

export default ResetDocumentTabsOnOpen;
