import { useEffect, useRef, useState, type FormEvent } from "react";
import { saveProfile } from "../data/profile";
import { FaceIcon, HeartIcon, SparkleIcon } from "./icons";

/**
 * The first screen: ask for the personal details the whole app is greeted
 * with. Nothing else loads until this is answered, because the app opens with
 * "Hello, {name}" — and the companion needs the same name to answer with.
 */
export default function WelcomeSetup() {
  const [name, setName] = useState("");
  const [preferredName, setPreferredName] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  function start(e: FormEvent) {
    e.preventDefault();
    const clean = name.trim();
    saveProfile({
      name: clean,
      preferredName: preferredName.trim(),
      onboarded: true,
    });
  }

  function skip() {
    saveProfile({ onboarded: true });
  }

  const canStart = name.trim().length > 0;

  return (
    <div className="flex min-h-screen items-center justify-center bg-cream px-4 py-10 sm:px-8">
      <div className="panel animate-fade-up w-full max-w-4xl overflow-hidden sm:grid sm:grid-cols-[1.05fr_1fr]">
        {/* The quiet, brand side of the screen. */}
        <aside
          className="relative hidden overflow-hidden p-10 text-white sm:flex sm:flex-col"
          style={{
            background:
              "linear-gradient(150deg, #0f6f63 0%, #0a544a 55%, #08332e 100%)",
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
            <p className="font-heading text-xl font-extrabold tracking-tight">
              Memory Lane
            </p>
          </div>

          <p className="relative mt-auto font-heading text-4xl font-extrabold leading-tight">
            A little light on your memories.
          </p>

          <ul className="relative mt-7 space-y-3 text-base text-white/85">
            <li className="flex gap-3">
              <FaceIcon className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
              Recognise a face and remember how you know them.
            </li>
            <li className="flex gap-3">
              <HeartIcon className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
              Keep the moments you would hate to lose.
            </li>
            <li className="flex gap-3">
              <SparkleIcon className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
              Open every day to &ldquo;Hello, {preferredName.trim() || name.trim().split(/\s+/)[0] || "your name"}&rdquo;.
            </li>
          </ul>
        </aside>

        {/* The form side. */}
        <form onSubmit={start} noValidate className="p-7 sm:p-10">
          <p className="kicker">Personal details</p>
          <h1 className="mt-3 font-heading text-3xl leading-tight sm:text-4xl">
            What should I call you?
          </h1>
          <p className="mt-3 text-lg leading-relaxed text-ink-soft">
            Tell me your name and the app will open with a hello every single
            time. Your companion will know it too, so you never have to
            introduce yourself twice.
          </p>

          <div className="mt-7 space-y-5">
            <div>
              <label htmlFor="welcome-name" className="block text-base font-bold text-ink">
                Your name
              </label>
              <input
                id="welcome-name"
                ref={inputRef}
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={60}
                placeholder="e.g. Margaret Hale"
                autoComplete="name"
                className="mt-2 w-full rounded-2xl border-2 border-sand-deep bg-card p-4 text-lg leading-snug text-ink shadow-xs placeholder:text-ink-soft/70 focus:border-terracotta focus:outline-none"
              />
            </div>

            <div>
              <label htmlFor="welcome-preferred" className="block text-base font-bold text-ink">
                What should I call you?{" "}
                <span className="font-normal text-ink-soft">(optional)</span>
              </label>
              <input
                id="welcome-preferred"
                type="text"
                value={preferredName}
                onChange={(e) => setPreferredName(e.target.value)}
                maxLength={40}
                placeholder="e.g. Maggie"
                className="mt-2 w-full rounded-2xl border-2 border-sand-deep bg-card p-4 text-lg leading-snug text-ink shadow-xs placeholder:text-ink-soft/70 focus:border-terracotta focus:outline-none"
              />
              <p className="mt-1.5 text-sm text-ink-soft">
                Leave it empty and I&rsquo;ll use the first word of your name.
              </p>
            </div>
          </div>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <button type="submit" className="btn-primary" disabled={!canStart}>
              Start using the app
            </button>
            <button type="button" onClick={skip} className="btn-ghost">
              Skip for now
            </button>
          </div>

          <p className="mt-5 text-sm text-ink-soft">
            You can change these details at any time from your profile, at the
            top of every screen.
          </p>
        </form>
      </div>
    </div>
  );
}
