"use client";

import { useEffect } from "react";

/**
 * Adds a "Show / Hide" toggle button to every password input in the admin —
 * login screen, user create form (password + confirm password), and the
 * change-password view.
 *
 * Uses a MutationObserver so toggles are added even when the form renders
 * after this component mounts (e.g. when navigating into "Create New User").
 */
const ShowPasswordToggle = ({ children }: { children?: React.ReactNode }) => {
  useEffect(() => {
    const TOGGLE_FLAG = "pwToggleAdded";

    const attachToggle = (input: HTMLInputElement) => {
      if (input.dataset[TOGGLE_FLAG]) return;
      input.dataset[TOGGLE_FLAG] = "true";

      const wrapper = input.parentElement;
      if (!wrapper) return;

      // Make sure the wrapper can host the absolutely-positioned button.
      const computed = getComputedStyle(wrapper);
      if (computed.position === "static") {
        wrapper.style.position = "relative";
      }

      // Leave space for the button so it doesn't overlap typed text.
      const currentPadding = parseInt(computed.paddingRight, 10) || 0;
      if (currentPadding < 56) {
        input.style.paddingRight = "56px";
      }

      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = "Show";
      btn.setAttribute("aria-label", "Show password");
      Object.assign(btn.style, {
        position: "absolute",
        right: "10px",
        top: "50%",
        transform: "translateY(-50%)",
        background: "none",
        border: "none",
        cursor: "pointer",
        fontSize: "12px",
        fontWeight: "600",
        color: "var(--theme-elevation-500)",
        padding: "4px 6px",
        zIndex: "2",
      } as Partial<CSSStyleDeclaration>);

      btn.addEventListener("click", () => {
        const isPassword = input.type === "password";
        input.type = isPassword ? "text" : "password";
        btn.textContent = isPassword ? "Hide" : "Show";
        btn.setAttribute(
          "aria-label",
          isPassword ? "Hide password" : "Show password",
        );
      });

      wrapper.appendChild(btn);
    };

    const scan = () => {
      try {
        // Cover the login field, the user-creation password + confirm fields,
        // and the change-password view.
        const inputs = document.querySelectorAll<HTMLInputElement>(
          'input[type="password"]',
        );
        inputs.forEach(attachToggle);
      } catch {
        // Never let a DOM mutation crash the admin shell.
      }
    };

    // Initial pass for fields already in the DOM. Defer so React has
    // finished its initial commit before we mutate the DOM.
    const initial = setTimeout(scan, 0);

    // Watch for fields added later (forms render after navigation).
    // Debounce to avoid running on every keystroke / React re-render.
    let debounce: ReturnType<typeof setTimeout> | null = null;
    const observer = new MutationObserver(() => {
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(scan, 50);
    });
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      clearTimeout(initial);
      if (debounce) clearTimeout(debounce);
      observer.disconnect();
    };
  }, []);

  return <>{children}</>;
};

export default ShowPasswordToggle;
