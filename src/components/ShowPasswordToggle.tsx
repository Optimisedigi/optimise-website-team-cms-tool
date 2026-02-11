"use client";

import { useEffect } from "react";

const ShowPasswordToggle = () => {
  useEffect(() => {
    const passwordInput = document.querySelector<HTMLInputElement>(
      'input[type="password"][name="password"]'
    );
    if (!passwordInput || passwordInput.dataset.toggleAdded) return;
    passwordInput.dataset.toggleAdded = "true";

    const wrapper = passwordInput.parentElement;
    if (!wrapper) return;
    wrapper.style.position = "relative";

    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = "Show";
    Object.assign(btn.style, {
      position: "absolute",
      right: "10px",
      top: "50%",
      transform: "translateY(-50%)",
      background: "none",
      border: "none",
      cursor: "pointer",
      fontSize: "12px",
      color: "var(--theme-elevation-400)",
      padding: "4px 6px",
    });

    btn.addEventListener("click", () => {
      const isPassword = passwordInput.type === "password";
      passwordInput.type = isPassword ? "text" : "password";
      btn.textContent = isPassword ? "Hide" : "Show";
    });

    wrapper.appendChild(btn);
  }, []);

  return null;
};

export default ShowPasswordToggle;
