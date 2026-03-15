import { useState, useRef, useEffect } from "react";
import { NavLink, useNavigate, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  CalendarDays,
  Dumbbell,
  Activity,
  Bot,
  TrendingUp,
  LogOut,
  UserCircle,
  Ellipsis,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/store/auth";
import { Button } from "@/components/ui/button";

const navItems = [
  { to: "/", icon: LayoutDashboard, label: "Dashboard" },
  { to: "/planner", icon: CalendarDays, label: "Planner" },
  { to: "/coach", icon: Bot, label: "AI Coach" },
  { to: "/progress", icon: TrendingUp, label: "Progress" },
  { to: "/workout", icon: Dumbbell, label: "Workout" },
  { to: "/cardio", icon: Activity, label: "Cardio" },
  { to: "/profile", icon: UserCircle, label: "Profile" },
];

const mobileMainItems = navItems.slice(0, 4);
const mobileMoreItems = navItems.slice(4);

export function Sidebar() {
  const { logout } = useAuthStore();
  const navigate = useNavigate();

  async function handleLogout() {
    await logout();
    navigate("/login");
  }

  return (
    <aside className="hidden md:flex flex-col w-60 min-h-screen border-r border-border bg-card px-3 py-6 gap-1">
      {/* Logo */}
      <div className="flex items-center gap-2 px-3 mb-6">
        <img src="/favicon.svg" className="h-8 w-8" alt="FitForge logo" />
        <span className="font-bold text-lg">FitForge</span>
      </div>

      {/* Nav */}
      <nav className="flex-1 flex flex-col gap-1" aria-label="Main navigation">
        {navItems.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === "/"}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                isActive
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground",
              )
            }
          >
            <Icon className="h-4 w-4" />
            {label}
          </NavLink>
        ))}
      </nav>

      <Button
        variant="ghost"
        size="sm"
        onClick={handleLogout}
        className="justify-start gap-3 text-muted-foreground"
      >
        <LogOut className="h-4 w-4" />
        Sign out
      </Button>
    </aside>
  );
}

// Bottom nav for mobile
export function BottomNav() {
  const [moreOpen, setMoreOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const navRef = useRef<HTMLElement>(null);
  const location = useLocation();

  const isMoreActive = mobileMoreItems.some((item) =>
    item.to === "/" ? location.pathname === "/" : location.pathname.startsWith(item.to),
  );

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMoreOpen(false);
      }
    }
    if (moreOpen) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [moreOpen]);

  // Prevent pinch-to-zoom on the nav bar on iOS (touch-action CSS is not enough on iOS WebKit)
  useEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    function preventZoom(e: TouchEvent) {
      if (e.touches.length > 1) e.preventDefault();
    }
    nav.addEventListener("touchmove", preventZoom, { passive: false });
    return () => nav.removeEventListener("touchmove", preventZoom);
  }, []);

  return (
    <nav
      ref={navRef}
      className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-card border-t border-border flex items-center"
      aria-label="Mobile navigation"
    >
      {mobileMainItems.map(({ to, icon: Icon, label }) => (
        <NavLink
          key={to}
          to={to}
          end={to === "/"}
          className={({ isActive }) =>
            cn(
              "flex flex-1 flex-col items-center gap-1 py-2 text-base scale-75 origin-bottom font-medium transition-colors",
              isActive ? "text-primary" : "text-muted-foreground hover:text-foreground",
            )
          }
        >
          <Icon className="h-5 w-5" />
          {label}
        </NavLink>
      ))}

      {/* More menu */}
      <div className="relative flex flex-1" ref={menuRef}>
        <button
          onClick={() => setMoreOpen((v) => !v)}
          className={cn(
            "flex flex-1 flex-col items-center gap-1 py-2 text-base scale-75 origin-bottom font-medium transition-colors",
            moreOpen || isMoreActive
              ? "text-primary"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          <Ellipsis className="h-5 w-5" />
          More
        </button>

        {moreOpen && (
          <div className="absolute bottom-full right-0 mb-2 w-44 rounded-xl border border-border bg-card shadow-lg py-1 overflow-hidden">
            {mobileMoreItems.map(({ to, icon: Icon, label }) => (
              <NavLink
                key={to}
                to={to}
                end={to === "/"}
                onClick={() => setMoreOpen(false)}
                className={({ isActive }) =>
                  cn(
                    "flex items-center gap-3 px-4 py-2.5 text-sm font-medium transition-colors",
                    isActive ? "bg-primary/10 text-primary" : "text-foreground hover:bg-accent",
                  )
                }
              >
                <Icon className="h-4 w-4" />
                {label}
              </NavLink>
            ))}
          </div>
        )}
      </div>
    </nav>
  );
}
