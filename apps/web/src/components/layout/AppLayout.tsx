import { Outlet } from "react-router-dom";
import { Sidebar, BottomNav } from "./Sidebar";

export function AppLayout() {
  return (
    <div className="flex min-h-screen w-full overflow-x-hidden bg-background">
      <Sidebar />
      <main className="flex-1 min-w-0 overflow-x-hidden overflow-y-auto pb-20 md:pb-0">
        <div className="w-full max-w-5xl mx-auto px-4 py-6">
          <Outlet />
        </div>
      </main>
      <BottomNav />
    </div>
  );
}
