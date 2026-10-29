import { useEffect, useState, type ComponentType, type SVGProps } from "react";
import { clearAgentFocus, useAgentFocus, type AgentPage } from "./data/agentFocus";
import { loadAuth, signOut, useAuth } from "./data/auth";
import { greetingName, hydrateProfileFromService, initials, useProfile } from "./data/profile";
import HomeView from "./components/HomeView";
import AuthView from "./components/AuthView";
import WhoIsThis from "./components/WhoIsThis";
import CameraView from "./components/CameraView";
import PhotoStories from "./components/PhotoStories";
import MemoriesView from "./components/MemoriesView";
import TodayView from "./components/TodayView";
import VoiceAgent from "./components/VoiceAgent";
import ProfileDialog from "./components/ProfileDialog";
import WelcomeSetup from "./components/WelcomeSetup";
import {
  CalendarIcon,
  CameraIcon,
  FaceIcon,
  HeartIcon,
  HomeIcon,
  ImageIcon,
  SparkleIcon,
} from "./components/icons";

// The screens, declared once in agentFocus — the companion's "go to …" tool
// and the two rails below all move between these and cannot drift apart.
type Tab = AgentPage;

interface NavItem {
  id: Tab;
  label: string;
  /** Short label for the bottom bar on small screens. */
  short: string;
  Icon: ComponentType<SVGProps<SVGSVGElement>>;
}

const NAV_ITEMS: NavItem[] = [
  { id: "home", label: "Home", short: "Home", Icon: HomeIcon },
  { id: "faces", label: "Who is this?", short: "Faces", Icon: FaceIcon },
  { id: "camera", label: "Camera", short: "Camera", Icon: CameraIcon },
  { id: "stories", label: "Stories", short: "Stories", Icon: ImageIcon },
  { id: "memories", label: "Memories", short: "Memories", Icon: HeartIcon },
  { id: "today", label: "Today", short: "Today", Icon: CalendarIcon },
];

const AVATAR_GRADIENT = "linear-gradient(135deg, #0f6f63 0%, #0a544a 100%)";

export default function App() {
  const [tab, setTab] = useState<Tab>("home");
  const [profileOpen, setProfileOpen] = useState(false);
  const profile = useProfile();
  const agentFocus = useAgentFocus();
  const auth = useAuth();

  // The companion can move the screen. It asks for a person to be shown — a
  // request to be on the page that holds their card — or asks to be taken
  // somewhere outright: "go to memories", "show me today".
  useEffect(() => {
    if (!agentFocus) return;
    if (agentFocus.kind === "page") {
      setTab(agentFocus.page);
      // Carried out, so this same request never moves the screen twice.
      clearAgentFocus();
      return;
    }
    setTab("faces");
  }, [agentFocus]);

  // The welcome step collects the name the whole app is greeted with. It
  // only runs once we know the server will let the request through — before
  // a sign-in is refused with a 401.
  useEffect(() => {
    void loadAuth();
  }, []);

  useEffect(() => {
    if (auth.status === "open" || auth.status === "signed-in") hydrateProfileFromService();
  }, [auth.status]);

  // Checking whether a login is needed comes before anything else loads.
  if (auth.status === "checking") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-cream">
        <p className="font-heading text-xl text-ink-soft">Memory Lane</p>
      </div>
    );
  }
  if (auth.status === "locked") return <AuthView />;

  if (!profile.onboarded) return <WelcomeSetup />;

  const today = new Date().toLocaleDateString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  const greeting = greetingName(profile) || "friend";

  return (
    <div className="min-h-screen">
      {/* ---------- Side rail (large screens) ---------- */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-72 flex-col border-r border-border bg-card lg:flex">
        <div className="flex items-center gap-3 px-6 py-6">
          <span
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-white shadow-md"
            style={{ background: AVATAR_GRADIENT }}
            aria-hidden="true"
          >
            <SparkleIcon className="h-6 w-6" />
          </span>
          <span>
            <span className="block font-heading text-lg font-extrabold leading-tight tracking-tight text-ink">
              Memory Lane
            </span>
            <span className="block text-xs leading-tight text-ink-soft">
              A gentle guide for when a face feels far away
            </span>
          </span>
        </div>

        <nav aria-label="Main" className="flex-1 space-y-1.5 px-4 py-2">
          {NAV_ITEMS.map(({ id, label, Icon }) => {
            const active = tab === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                aria-current={active ? "page" : undefined}
                className={`flex w-full cursor-pointer items-center gap-3 rounded-2xl px-3 py-2.5 text-base font-bold transition-all duration-150 ease-out active:scale-[0.98] ${
                  active
                    ? "bg-mint text-terracotta-deep shadow-xs"
                    : "text-ink-soft hover:bg-sand hover:text-ink"
                }`}
              >
                <span
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-colors duration-150 ${
                    active ? "bg-terracotta text-white" : "bg-sand text-ink-soft"
                  }`}
                  aria-hidden="true"
                >
                  <Icon className="h-5 w-5" />
                </span>
                {label}
              </button>
            );
          })}
        </nav>

        <div className="p-4">
          <button
            type="button"
            onClick={() => setProfileOpen(true)}
            aria-haspopup="dialog"
            className="flex w-full cursor-pointer items-center gap-3 rounded-2xl border border-border bg-cream px-3 py-3 text-left shadow-xs transition-shadow duration-150 hover:shadow-sm"
          >
            <span
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full font-heading text-base font-extrabold text-white"
              style={{ background: AVATAR_GRADIENT }}
              aria-hidden="true"
            >
              {initials(profile)}
            </span>
            <span className="min-w-0">
              <span className="block truncate text-base font-bold leading-tight text-ink">
                {profile.name || "Add your name"}
              </span>
              <span className="block text-xs leading-tight text-terracotta">
                Personal details
              </span>
            </span>
          </button>
        </div>
      </aside>

      {/* ---------- Main column ---------- */}
      <div className="flex min-h-screen flex-col lg:pl-72">
        <header className="sticky top-0 z-20 border-b border-border bg-cream/90 backdrop-blur">
          <div className="mx-auto flex h-16 w-full max-w-3xl items-center gap-3 px-4 sm:px-6">
            {/* Small screens: the wordmark, since the rail is away. */}
            <div className="flex items-center gap-2.5 lg:hidden">
              <span
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-white shadow-sm"
                style={{ background: AVATAR_GRADIENT }}
                aria-hidden="true"
              >
                <SparkleIcon className="h-5 w-5" />
              </span>
              <span className="font-heading text-lg font-extrabold tracking-tight text-ink">
                Memory Lane
              </span>
            </div>

            {/* Large screens: the hello, dated for the day. */}
            <div className="hidden lg:block">
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-terracotta">
                {today}
              </p>
              <p className="font-heading text-lg font-extrabold leading-tight text-ink">
                Hello, {greeting}
              </p>
            </div>

            <div className="ml-auto flex items-center gap-2">
              {auth.status === "signed-in" && (
                <button
                  type="button"
                  onClick={() => void signOut()}
                  className="cursor-pointer rounded-full border border-border bg-card px-3.5 py-2 text-sm font-bold text-ink-soft shadow-xs transition-colors duration-150 hover:text-ink"
                >
                  Sign out
                </button>
              )}
              <button
                type="button"
                onClick={() => setProfileOpen(true)}
                aria-haspopup="dialog"
                aria-label={`Personal details for ${profile.name || "you"}`}
                className="flex cursor-pointer items-center gap-2.5 rounded-full bg-card py-1.5 pl-1.5 pr-1.5 shadow-xs ring-1 ring-border transition-shadow duration-150 hover:shadow-sm sm:pr-4"
              >
                <span
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full font-heading text-sm font-extrabold text-white"
                  style={{ background: AVATAR_GRADIENT }}
                  aria-hidden="true"
                >
                  {initials(profile)}
                </span>
                <span className="hidden text-base font-bold text-ink sm:block">
                  {greetingName(profile) || "Your name"}
                </span>
              </button>
            </div>
          </div>
        </header>

        <main className="flex-1">
          {tab === "home" ? (
            <HomeView
              onOpenFaces={() => setTab("faces")}
              onOpenCamera={() => setTab("camera")}
              onOpenStories={() => setTab("stories")}
              onOpenMemories={() => setTab("memories")}
            />
          ) : tab === "faces" ? (
            <WhoIsThis focus={agentFocus} onFocusHandled={clearAgentFocus} />
          ) : tab === "camera" ? (
            <CameraView onOpenLibrary={() => setTab("home")} />
          ) : tab === "stories" ? (
            <PhotoStories />
          ) : tab === "memories" ? (
            <MemoriesView />
          ) : (
            <TodayView />
          )}
        </main>

        <footer className="border-t border-border bg-card/60 px-5 pb-36 pt-6 text-center lg:pb-8">
          <p className="text-sm text-ink-soft">
            Memory Lane — your people, stories, and plans, kept in one place.
          </p>
        </footer>
      </div>

      {/* ---------- Bottom bar (small screens) ---------- */}
      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-card/95 backdrop-blur lg:hidden"
      >
        <ul className="mx-auto grid max-w-2xl grid-cols-6 gap-0.5 px-1 pb-[env(safe-area-inset-bottom)]">
          {NAV_ITEMS.map(({ id, short, Icon }) => {
            const active = tab === id;
            return (
              <li key={id}>
                <button
                  type="button"
                  onClick={() => setTab(id)}
                  aria-current={active ? "page" : undefined}
                  className={`flex w-full cursor-pointer flex-col items-center gap-1 rounded-2xl px-0.5 py-2.5 transition-colors duration-150 ${
                    active ? "text-terracotta-deep" : "text-ink-soft"
                  }`}
                >
                  <span
                    className={`flex h-8 w-8 items-center justify-center rounded-xl transition-colors duration-150 ${
                      active ? "bg-mint" : "bg-transparent"
                    }`}
                    aria-hidden="true"
                  >
                    <Icon className="h-5 w-5" />
                  </span>
                  <span className="whitespace-nowrap text-[0.72rem] font-bold leading-none">
                    {short}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      {profileOpen && <ProfileDialog onClose={() => setProfileOpen(false)} />}

      {/* The companion, available from every screen. */}
      <VoiceAgent />
    </div>
  );
}
