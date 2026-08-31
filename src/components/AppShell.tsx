import { useEffect, useState } from "react";
import { NavLink, useNavigate } from "react-router";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import { useModelHealthRefresh } from "@/hooks/use-model-health";
import { useIsMobile } from "@/hooks/use-mobile";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  LayoutDashboard,
  MessageSquare,
  Puzzle,
  Settings,
  LogOut,
  Sparkles,
  Hammer,
  TerminalSquare,
  Search,
  RotateCw,
  Power,
  HardDrive,
  Brain,
  Store,
  Bug,
  Activity,
} from "lucide-react";
import { OrbHUD } from "@/components/shell/OrbHUD";
import type { ComponentType, ReactNode } from "react";

type NavIcon = ComponentType<{ className?: string }>;

interface NavItem {
  to: string;
  label: string;
  icon: NavIcon;
  /** Optional badge text rendered to the right of the label. */
  badge?: string;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    label: "WORKSPACE",
    items: [
      { to: "/chat", label: "Chat", icon: MessageSquare },
      { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
      { to: "/services", label: "Services", icon: Activity },
      { to: "/forge", label: "Forge", icon: Hammer },
    ],
  },
  {
    label: "AI",
    items: [
      { to: "/models", label: "Models", icon: Brain },
      { to: "/marketplace", label: "Marketplace", icon: Store },
    ],
  },
  {
    label: "TOOLS",
    items: [
      { to: "/skills", label: "Skills", icon: Puzzle },
      { to: "/shell", label: "Shell", icon: TerminalSquare },
      { to: "/settings", label: "Settings", icon: Settings },
      { to: "/debug", label: "Debug", icon: Bug },
    ],
  },
];

/** Flat list for the mobile bottom tab bar — most important 6. */
const MOBILE_NAV: NavItem[] = [
  { to: "/chat", label: "Chat", icon: MessageSquare },
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/services", label: "Services", icon: Activity },
  { to: "/models", label: "Models", icon: Brain },
  { to: "/marketplace", label: "Store", icon: Store },
  { to: "/skills", label: "Skills", icon: Puzzle },
];

function UserMenu() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const displayName = user?.name || user?.email || "Explorer";
  const initials = displayName
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]!.toUpperCase())
    .join("");

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex size-8 items-center justify-center rounded-full border border-border bg-muted transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          aria-label="Account menu"
        >
          <Avatar className="size-8">
            {user?.image && <AvatarImage src={user.image} alt={displayName} />}
            <AvatarFallback className="bg-transparent text-xs font-semibold">
              {initials || "?"}
            </AvatarFallback>
          </Avatar>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="flex flex-col">
          <span className="text-sm font-medium">{displayName}</span>
          {user?.email && (
            <span className="text-xs font-normal text-muted-foreground">
              {user.email}
            </span>
          )}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="cursor-pointer"
          onClick={() => navigate("/settings")}
        >
          <Settings className="mr-2 size-4" />
          Settings
        </DropdownMenuItem>
        <DropdownMenuItem
          className="cursor-pointer text-destructive focus:text-destructive"
          onClick={handleSignOut}
        >
          <LogOut className="mr-2 size-4" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

interface ServerStatus {
  running: boolean;
}

function useServerStatus(): ServerStatus {
  const [running, setRunning] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      try {
        const c = new AbortController();
        const t = setTimeout(() => c.abort(), 1000);
        const r = await fetch("http://127.0.0.1:18927/healthz", { signal: c.signal });
        clearTimeout(t);
        if (!cancelled) setRunning(r.ok);
      } catch {
        if (!cancelled) setRunning(false);
      }
    };
    tick();
    const id = setInterval(tick, 5000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  return { running };
}

function SidebarLink({ item }: { item: NavItem }) {
  return (
    <NavLink
      to={item.to}
      end={false}
      className={({ isActive }) =>
        cn(
          "group relative flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground",
          isActive && "text-foreground",
        )
      }
    >
      {({ isActive }) => (
        <>
          {isActive && (
            <motion.span
              layoutId="sidebar-pill"
              transition={{ type: "spring", stiffness: 420, damping: 32 }}
              className="absolute inset-0 -z-10 rounded-lg border border-primary/25 bg-primary/10"
            />
          )}
          <item.icon
            className={cn(
              "size-4 shrink-0 transition-colors",
              isActive ? "text-primary" : "text-muted-foreground group-hover:text-foreground",
            )}
          />
          <span className="flex-1 truncate">{item.label}</span>
          {item.badge && (
            <span className="rounded border border-violet-400/30 bg-violet-400/10 px-1.5 py-0.5 text-[9px] font-medium text-violet-600 dark:text-violet-300">
              {item.badge}
            </span>
          )}
        </>
      )}
    </NavLink>
  );
}

function Sidebar() {
  const status = useServerStatus();
  const [restarting, setRestarting] = useState(false);
  const [shuttingDown, setShuttingDown] = useState(false);

  async function restartServer() {
    setRestarting(true);
    try {
      await fetch("http://127.0.0.1:18927/v1/control/restart", { method: "POST" });
      // Wait briefly for the server to exit, then for a process manager
      // (or dev workflow) to bring it back. The status pill will flip to
      // Offline briefly, then back to Running once /healthz succeeds.
    } catch {
      /* server already gone */
    }
  }

  async function shutdownServer() {
    setShuttingDown(true);
    try {
      await fetch("http://127.0.0.1:18927/v1/control/shutdown", { method: "POST" });
    } catch {
      /* server already gone */
    }
  }

  return (
    <aside className="hidden w-64 shrink-0 flex-col border-r border-border/70 bg-card/40 backdrop-blur-md md:flex">
      <div className="flex flex-1 flex-col gap-1 overflow-y-auto px-3 py-4">
        {NAV_GROUPS.map((group) => (
          <div key={group.label} className="mt-3 first:mt-0">
            <div className="mb-1 px-2.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/70">
              {group.label}
            </div>
            <div className="flex flex-col gap-0.5">
              {group.items.map((item) => (
                <SidebarLink key={`${group.label}-${item.label}`} item={item} />
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="border-t border-border/70 px-3 py-3">
        <div className="mb-2 flex items-center gap-1.5">
          <span
            className={cn(
              "inline-flex size-2 rounded-full",
              status.running ? "bg-emerald-400 shadow-[0_0_8px_var(--tw-shadow-color)] shadow-emerald-400/60" : "bg-rose-400",
            )}
          />
          <span className="text-[11px] font-medium text-foreground">
            {status.running ? "Running" : "Offline"}
          </span>
          <span className="ml-auto inline-flex items-center gap-1 rounded-md border border-border/60 bg-background/60 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
            <HardDrive className="size-3" />
            Local models
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            disabled={!status.running || restarting}
            onClick={() => void restartServer()}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-md border border-border/60 bg-background/60 px-2 py-1.5 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
            aria-label="Restart server"
          >
            <RotateCw className={`size-3 ${restarting ? "animate-spin" : ""}`} />
            {restarting ? "Restarting…" : "Restart"}
          </button>
          <button
            type="button"
            disabled={!status.running || shuttingDown}
            onClick={() => void shutdownServer()}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-md border border-rose-400/30 bg-rose-500/10 px-2 py-1.5 text-[11px] font-medium text-rose-600 transition-colors hover:bg-rose-500/20 disabled:cursor-not-allowed disabled:opacity-50 dark:text-rose-300"
            aria-label="Shutdown server"
          >
            <Power className="size-3" />
            {shuttingDown ? "Shutting down…" : "Shutdown"}
          </button>
        </div>
      </div>
    </aside>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const isMobile = useIsMobile();
  useModelHealthRefresh();

  return (
    <div className="flex min-h-dvh flex-col bg-background text-foreground">
      {/* Top bar (brand + search + user) */}
      <header className="sticky top-0 z-40 border-b border-border/70 glass">
        <div className="mx-auto flex h-14 w-full max-w-[1400px] items-center justify-between gap-4 px-4">
          <NavLink
            to="/chat"
            className="flex items-center gap-2 rounded-md focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <span className="flex size-7 items-center justify-center rounded-lg bg-gradient-to-br from-cyan-400 via-sky-500 to-violet-500 shadow-lg shadow-cyan-500/20">
              <Sparkles className="size-4 text-white" />
            </span>
            <span className="font-semibold tracking-tight">Dagestan</span>
          </NavLink>

          <button
            type="button"
            className="hidden items-center gap-2 rounded-md border border-border/60 bg-background/60 px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground md:inline-flex"
            title="Search (⌘K)"
          >
            <Search className="size-3.5" />
            <span>Search…</span>
            <kbd className="ml-2 rounded border border-border/60 bg-background/60 px-1.5 py-0.5 text-[10px] font-medium">{"\u2318"}K</kbd>
          </button>

          <div className="flex items-center gap-1">
            <NavLink
              to="/settings"
              className="hidden size-8 items-center justify-center rounded-md border border-border/60 bg-background/60 text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground md:inline-flex"
              aria-label="Settings"
              title="Settings"
            >
              <Settings className="size-4" />
            </NavLink>
            <UserMenu />
          </div>
        </div>
      </header>

      {/* Body: sidebar + content */}
      <div className="mx-auto flex w-full max-w-[1400px] flex-1 gap-0">
        <Sidebar />
        <main className="flex w-full flex-1 flex-col px-4 pb-24 pt-6 sm:pb-10">
          {children}
        </main>
      </div>

      {/* Orb HUD */}
      <OrbHUD />

      {/* Mobile bottom tab bar */}
      {isMobile && (
        <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border/70 glass pb-[env(safe-area-inset-bottom)]">
          <div className="mx-auto grid h-16 max-w-md grid-cols-6 items-center px-2">
            {MOBILE_NAV.map((item) => (
              <NavLink
                key={`${item.to}-${item.label}`}
                to={item.to}
                className={({ isActive }) =>
                  cn(
                    "relative flex flex-col items-center justify-center gap-0.5 rounded-lg py-1.5 text-[11px] font-medium text-muted-foreground transition-colors",
                    isActive && "text-primary",
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    {isActive && (
                      <motion.span
                        layoutId="tab-dot"
                        transition={{ type: "spring", stiffness: 500, damping: 35 }}
                        className="absolute top-1 h-1 w-6 rounded-full bg-gradient-to-r from-cyan-400 to-violet-400"
                      />
                    )}
                    <item.icon className="size-5" />
                    {item.label}
                  </>
                )}
              </NavLink>
            ))}
          </div>
        </nav>
      )}
    </div>
  );
}
