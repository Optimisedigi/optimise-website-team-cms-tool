"use client";
import React, { useState } from "react";
import { useAuth } from "@payloadcms/ui";

const FirstLoginSetup: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const { user } = useAuth();
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const u = user as Record<string, unknown> | null;
  const needsSetup =
    u && u.role !== "admin" && u.setupCompleted === false;

  if (!needsSetup) {
    return (
      <>
        <style>{`a[href*="/forgot"] { display: none !important; }`}</style>
        {children}
      </>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!name.trim()) {
      setError("Please enter your name.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`/api/users/${u.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          password,
          setupCompleted: true,
        }),
      });
      if (!res.ok) throw new Error();
      window.location.reload();
    } catch {
      setError("Something went wrong. Please try again.");
      setSubmitting(false);
    }
  };

  return (
    <>
      <style>{`
        a[href*="/forgot"] { display: none !important; }
        .first-login-overlay {
          position: fixed;
          inset: 0;
          z-index: 10000;
          display: flex;
          align-items: center;
          justify-content: center;
          background: var(--theme-bg, #fff);
        }
        .first-login-card {
          width: 100%;
          max-width: 420px;
          padding: 2.5rem;
        }
        .first-login-card h2 {
          margin: 0 0 0.5rem;
          font-size: 1.5rem;
        }
        .first-login-card p {
          margin: 0 0 2rem;
          color: var(--theme-elevation-600, #666);
          font-size: 0.9rem;
        }
        .first-login-card label {
          display: block;
          margin-bottom: 0.4rem;
          font-weight: 500;
          font-size: 0.875rem;
        }
        .first-login-card input {
          width: 100%;
          padding: 0.65rem 0.75rem;
          margin-bottom: 1.25rem;
          border: 1px solid var(--theme-elevation-200, #ddd);
          border-radius: 4px;
          font-size: 0.95rem;
          background: var(--theme-input-bg, #fff);
          color: var(--theme-text, #000);
          box-sizing: border-box;
        }
        .first-login-card input:focus {
          outline: none;
          border-color: var(--theme-elevation-500, #999);
        }
        .first-login-card button {
          width: 100%;
          padding: 0.75rem;
          margin-top: 0.5rem;
          background: var(--theme-text, #000);
          color: var(--theme-bg, #fff);
          border: none;
          border-radius: 4px;
          font-size: 1rem;
          font-weight: 500;
          cursor: pointer;
        }
        .first-login-card button:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
        .first-login-error {
          color: var(--theme-error-500, #e11d48);
          font-size: 0.875rem;
          margin-bottom: 1rem;
        }
      `}</style>
      <div className="first-login-overlay">
        <form className="first-login-card" onSubmit={handleSubmit}>
          <h2>Welcome! Let&apos;s set up your account</h2>
          <p>Enter your name and create a password to get started.</p>

          {error && <div className="first-login-error">{error}</div>}

          <label htmlFor="setup-name">First name</label>
          <input
            id="setup-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your first name"
            autoFocus
          />

          <label htmlFor="setup-password">New password</label>
          <input
            id="setup-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="At least 8 characters"
          />

          <label htmlFor="setup-confirm">Confirm password</label>
          <input
            id="setup-confirm"
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="Re-enter your password"
          />

          <button type="submit" disabled={submitting}>
            {submitting ? "Setting up..." : "Complete setup"}
          </button>
        </form>
      </div>
      {children}
    </>
  );
};

export default FirstLoginSetup;
