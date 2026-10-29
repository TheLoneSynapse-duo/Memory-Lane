import { useEffect, useRef, useState, type FormEvent } from "react";
import { describeError } from "../data/api";
import { createAccount, signIn } from "../data/auth";
import { FaceIcon, HeartIcon, SparkleIcon } from "./icons";

/**
 * The sign-in screen, shown only when the server keeps each person's
 * memories in their own store. Email and password, with the choice to
 * create an account on the first visit.
 */
export default function AuthView() {
  const [mode, setMode] = useState<"signin" | "register">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const emailRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    emailRef.current?.focus();
  }, []);

  const registering = mode === "register";
  const canSubmit = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) && password.length >= 8 && !busy;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    try {
      const address = email.trim().toLowerCase();
      if (registering) await createAccount(address, password);
      else await signIn(address, password);
      // Signed in: the app itself takes over from this screen.
    } catch (caught) {
      setError(describeError(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-cream px-4 py-10 sm:px-8">
      <div className="panel animate-fade-up w-full max-w-4xl overflow-hidden sm:grid sm:grid-cols-[1.05fr_1fr]">
        {/* The quiet, brand side of the screen. */}
        <aside
          className="relative hidden overflow-hidden p-10 text-white sm:flex sm:flex-col"
          style={{
            background: "linear-gradient(150deg, #0f6f63 0%, #0a544a 55%, #08332e 100%)",
          }}
        >
          <span
            aria-hidden="true"
            className="absolute -right-16 -top-16 h-56 w-56 rounded-full bg-white/10"
          />
          <span
            aria-hidden="true"
            className="absolute -bottom-24 -left-16 h-64 w-64 rounded-full bg-white/5"
          />

          <div className="relative flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/15 ring-1 ring-white/25">
              <SparkleIcon className="h-6 w-6" aria-hidden="true" />
            </span>
            <p className="font-heading text-xl font-extrabold tracking-tight">Memory Lane</p>
          </div>

          <p className="relative mt-auto font-heading text-4xl font-extrabold leading-tight">
            Your memories, kept for you.
          </p>

          <ul className="relative mt-7 space-y-3 text-base text-white/85">
            <li className="flex gap-3">
              <HeartIcon className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
              Every photo and moment saved to your own account.
            </li>
            <li className="flex gap-3">
              <FaceIcon className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
              Sign in anywhere and the same faces are waiting.
            </li>
            <li className="flex gap-3">
              <SparkleIcon className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
              Nobody else can read your memories — only you.
            </li>
          </ul>
        </aside>

        {/* The form side. */}
        <form onSubmit={submit} noValidate className="p-7 sm:p-10">
          <p className="kicker">{registering ? "New here" : "Welcome back"}</p>
          <h1 className="mt-3 font-heading text-3xl leading-tight sm:text-4xl">
            {registering ? "Create your account" : "Sign in to Memory Lane"}
          </h1>
          <p className="mt-3 text-lg leading-relaxed text-ink-soft">
            {registering
              ? "One account keeps every photo, person and moment of yours — safe, and yours alone."
              : "Your memories are waiting exactly where you left them."}
          </p>

          <div className="mt-7 space-y-5">
            <div>
              <label htmlFor="auth-email" className="block text-base font-bold text-ink">
                Email
              </label>
              <input
                id="auth-email"
                ref={emailRef}
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                maxLength={200}
                placeholder="you@example.com"
                autoComplete="email"
                className="mt-2 w-full rounded-2xl border-2 border-sand-deep bg-card p-4 text-lg leading-snug text-ink shadow-xs placeholder:text-ink-soft/70 focus:border-terracotta focus:outline-none"
              />
            </div>

            <div>
              <label htmlFor="auth-password" className="block text-base font-bold text-ink">
                Password
              </label>
              <input
                id="auth-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                maxLength={200}
                placeholder={registering ? "At least 8 characters" : "Your password"}
                autoComplete={registering ? "new-password" : "current-password"}
                className="mt-2 w-full rounded-2xl border-2 border-sand-deep bg-card p-4 text-lg leading-snug text-ink shadow-xs placeholder:text-ink-soft/70 focus:border-terracotta focus:outline-none"
              />
              <p className="mt-1.5 text-sm text-ink-soft">
                {registering
                  ? "Eight characters or more — that is the only rule."
                  : "Forgotten it? Create a new account with the same email to start again."}
              </p>
            </div>
          </div>

          {error && (
            <p role="alert" className="mt-4 rounded-xl border border-ochre bg-ochre-soft px-4 py-3 text-base text-ink">
              {error}
            </p>
          )}

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <button type="submit" className="btn-primary" disabled={!canSubmit}>
              {busy ? "One moment…" : registering ? "Create account" : "Sign in"}
            </button>
            <button
              type="button"
              className="btn-ghost"
              onClick={() => {
                setMode(registering ? "signin" : "register");
                setError(null);
              }}
            >
              {registering ? "I already have an account" : "Create an account"}
            </button>
          </div>

          <p className="mt-5 text-sm text-ink-soft">
            Your memories belong to you. Signing in only decides whose they are.
          </p>
        </form>
      </div>
    </div>
  );
}
