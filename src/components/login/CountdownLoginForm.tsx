"use client";

import { type UserWithToken, useAuth } from "@payloadcms/ui";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useCallback, useEffect, useId, useRef, useState } from "react";
import "./CountdownLogin.css";

/**
 * Concept 4 "Countdown" admin login.
 *
 * Submitting starts the real login request and a 3-2-1 countdown in
 * parallel. Lift-off only happens once the server has accepted the
 * credentials; a rejection drops straight back to the idle form with the
 * server's message. After the launch animation the session user is handed to
 * Payload's auth context and we navigate straight to the safe redirect target
 * (no route-transition overlay), replacing the login entry in history.
 */

type Phase = "idle" | "counting" | "launching" | "done";

type LoginTimings = {
  /** Gap between each countdown number. */
  countStepMs: number;
  /** How long the rocket flies before we navigate away. */
  launchMs: number;
  /** Launch duration used when the user prefers reduced motion. */
  reducedLaunchMs: number;
};

const DEFAULT_TIMINGS: LoginTimings = {
  countStepMs: 350,
  launchMs: 2100,
  reducedLaunchMs: 800,
};

const COUNTDOWN = ["3", "2", "1"] as const;

const GENERIC_ERROR = "Something went wrong. Please try again.";
const NETWORK_ERROR = "We couldn't reach the server. Check your connection and try again.";

type LoginResult =
  | { ok: true; data: LoginResponse }
  | { ok: false; message: string };

type LoginResponse = UserWithToken;

export type CountdownLoginFormProps = {
  forgotPasswordUrl: string;
  loginUrl: string;
  redirectTo: string;
  timings?: Partial<LoginTimings>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isLoginResponse(value: unknown): value is LoginResponse {
  if (!isRecord(value) || typeof value.exp !== "number") return false;
  const { user } = value;
  return (
    isRecord(user) &&
    typeof user.collection === "string" &&
    (typeof user.id === "string" || typeof user.id === "number")
  );
}

/** Pulls the first readable message out of a Payload REST error body. */
function errorMessageFrom(body: unknown): string | null {
  if (!isRecord(body)) return null;
  if (Array.isArray(body.errors)) {
    for (const entry of body.errors) {
      if (isRecord(entry) && typeof entry.message === "string" && entry.message.trim()) {
        return entry.message;
      }
    }
  }
  if (typeof body.message === "string" && body.message.trim()) return body.message;
  return null;
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

export function CountdownLoginForm({
  forgotPasswordUrl,
  loginUrl,
  redirectTo,
  timings,
}: CountdownLoginFormProps) {
  const { countStepMs, launchMs, reducedLaunchMs } = { ...DEFAULT_TIMINGS, ...timings };
  const { setUser } = useAuth();
  const router = useRouter();
  const statusId = useId();

  const [phase, setPhase] = useState<Phase>("idle");
  const [count, setCount] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [errorPulse, setErrorPulse] = useState(0);
  const [invalidField, setInvalidField] = useState<"email" | "password" | null>(null);

  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const timersRef = useRef<number[]>([]);
  const abortRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      abortRef.current?.abort();
      for (const id of timersRef.current) window.clearTimeout(id);
      timersRef.current = [];
    };
  }, []);

  const wait = useCallback(
    (ms: number) =>
      new Promise<void>((resolve) => {
        timersRef.current.push(window.setTimeout(resolve, ms));
      }),
    [],
  );

  const requestLogin = useCallback(
    async (email: string, password: string, signal: AbortSignal): Promise<LoginResult> => {
      try {
        const res = await fetch(loginUrl, {
          body: JSON.stringify({ email, password }),
          credentials: "include",
          headers: { Accept: "application/json", "Content-Type": "application/json" },
          method: "POST",
          signal,
        });
        const contentType = res.headers.get("content-type") ?? "";
        const body: unknown = contentType.includes("application/json")
          ? await res.json().catch(() => null)
          : null;

        if (res.ok && isLoginResponse(body)) return { ok: true, data: body };
        return { ok: false, message: errorMessageFrom(body) ?? GENERIC_ERROR };
      } catch {
        return { ok: false, message: NETWORK_ERROR };
      }
    },
    [loginUrl],
  );

  const fail = useCallback((message: string, field: "email" | "password" | null) => {
    setPhase("idle");
    setCount(null);
    setStatus("");
    setError(message);
    setInvalidField(field);
    setErrorPulse((n) => n + 1);
  }, []);

  // Focus the offending field once the fieldset is enabled again.
  useEffect(() => {
    if (errorPulse === 0) return;
    const target = invalidField === "email" ? emailRef.current : passwordRef.current;
    target?.focus();
  }, [errorPulse, invalidField]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (phase !== "idle") return;

    const formData = new FormData(event.currentTarget);
    const email = String(formData.get("email") ?? "");
    const password = String(formData.get("password") ?? "");

    if (!email.trim()) {
      fail("Enter your email address.", "email");
      return;
    }
    if (!password) {
      fail("Enter your password.", "password");
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setError(null);
    setInvalidField(null);
    setPhase("counting");
    setStatus("Checking your details…");

    const countdown = (async () => {
      for (const step of COUNTDOWN) {
        if (!mountedRef.current) return;
        setCount(step);
        await wait(countStepMs);
      }
    })();

    const [result] = await Promise.all([
      requestLogin(email, password, controller.signal),
      countdown,
    ]);
    if (!mountedRef.current || controller.signal.aborted) return;

    if (!result.ok) {
      fail(result.message, "password");
      return;
    }

    setCount("Lift-off!");
    setPhase("launching");
    setStatus("Welcome aboard. Loading your dashboard…");
    router.prefetch(redirectTo);

    await wait(prefersReducedMotion() ? reducedLaunchMs : launchMs);
    if (!mountedRef.current) return;

    setPhase("done");
    setCount(null);
    setUser(result.data);
    // Plain navigation, not a Payload route transition: a transition would show
    // the full-screen rocket overlay before the dashboard's own loader, so
    // login would jump twice. The finished launch scene stays up until the
    // dashboard (already prefetched) replaces it.
    router.replace(redirectTo);
  };

  const busy = phase !== "idle";
  const sceneClass = [
    "od-launch",
    busy && "is-counting",
    (phase === "launching" || phase === "done") && "is-launching",
    phase === "done" && "is-done",
  ]
    .filter(Boolean)
    .join(" ");

  let buttonLabel = <span className="od-launch__label">Launch</span>;
  if (phase === "done") {
    buttonLabel = <span className="od-launch__label">Signed in</span>;
  } else if (count) {
    buttonLabel = (
      <span className="od-launch__count" key={count}>
        {count}
      </span>
    );
  }

  return (
    <div className={sceneClass}>
      <main className="od-launch__main">
        <form
          aria-busy={busy}
          className="od-launch__card"
          data-error-pulse={errorPulse % 2 === 1 ? "odd" : errorPulse > 0 ? "even" : undefined}
          noValidate
          onSubmit={handleSubmit}
        >
          <div className="od-launch__top">
            <img
              alt="Optimise Digital"
              className="od-launch__logo"
              height={151}
              src="/optimise-digital-logo-black.webp"
              width={1068}
            />
          </div>
          <h1 className="od-launch__title">Ready for launch?</h1>
          <fieldset className="od-launch__fields" disabled={busy}>
            <label className="od-launch__sr" htmlFor="od-launch-email">
              Email
            </label>
            <div className="od-launch__field">
              <input
                aria-describedby={error ? statusId : undefined}
                aria-invalid={invalidField === "email" || undefined}
                autoCapitalize="none"
                autoComplete="username"
                autoCorrect="off"
                className="od-launch__input"
                id="od-launch-email"
                inputMode="email"
                name="email"
                placeholder="Email address"
                ref={emailRef}
                required
                spellCheck={false}
                type="email"
              />
            </div>
            <label className="od-launch__sr" htmlFor="od-launch-password">
              Password
            </label>
            <div className="od-launch__field">
              <input
                aria-describedby={error ? statusId : undefined}
                aria-invalid={invalidField === "password" || undefined}
                autoComplete="current-password"
                className="od-launch__input"
                id="od-launch-password"
                name="password"
                placeholder="Password"
                ref={passwordRef}
                required
                type="password"
              />
            </div>
            <div className="od-launch__row">
              <Link className="od-launch__forgot" href={forgotPasswordUrl} prefetch={false}>
                Forgot password?
              </Link>
            </div>
            <button className="od-launch__submit" type="submit">
              {buttonLabel}
            </button>
          </fieldset>
          <p
            aria-live="polite"
            className={error ? "od-launch__status od-launch__status--error" : "od-launch__status"}
            id={statusId}
            role="status"
          >
            {error ?? status}
          </p>
        </form>
      </main>

      <div aria-hidden="true" className="od-launch__ground" />
      <div aria-hidden="true" className="od-launch__tower" />
      <div aria-hidden="true" className="od-launch__rocket">
        <img alt="" height={768} src="/optimise-digital-rocket.png" width={334} />
      </div>
      <div aria-hidden="true" className="od-launch__billow">
        <i />
        <i />
        <i />
        <i />
        <i />
      </div>
    </div>
  );
}
