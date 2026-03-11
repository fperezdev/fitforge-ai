import { NavLink, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  CalendarDays,
  Dumbbell,
  Activity,
  Bot,
  TrendingUp,
  LogOut,
  UserCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/store/auth";
import { Button } from "@/components/ui/button";

const navItems = [
  { to: "/", icon: LayoutDashboard, label: "Dashboard" },
  { to: "/planner", icon: CalendarDays, label: "Planner" },
  { to: "/workout", icon: Dumbbell, label: "Workout" },
  { to: "/cardio", icon: Activity, label: "Cardio" },
  { to: "/coach", icon: Bot, label: "AI Coach" },
  { to: "/progress", icon: TrendingUp, label: "Progress" },
  { to: "/profile", icon: UserCircle, label: "Profile" },
];

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
        <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center">
          <Dumbbell className="h-4 w-4 text-primary-foreground" />
        </div>
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
                  : "text-muted-foreground hover:bg-accent hover:text-foreground"
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
  const mobileItems = navItems.slice(0, 5);
  return (
    <nav
      className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-card border-t border-border flex items-center"
      aria-label="Mobile navigation"
    >
      {mobileItems.map(({ to, icon: Icon, label }) => (
        <NavLink
          key={to}
          to={to}
          end={to === "/"}
          className={({ isActive }) =>
            cn(
              "flex flex-1 flex-col items-center gap-1 py-2 text-xs font-medium transition-colors",
              isActive
                ? "text-primary"
                : "text-muted-foreground hover:text-foreground"
            )
          }
        >
          <Icon className="h-5 w-5" />
          {label}
        </NavLink>
      ))}
    </nav>
  );
}
