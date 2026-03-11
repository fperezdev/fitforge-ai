import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/AppLayout";
import { RequireAuth } from "@/components/layout/RequireAuth";
import { LoginPage } from "@/pages/LoginPage";
import { RegisterPage } from "@/pages/RegisterPage";
import { DashboardPage } from "@/pages/DashboardPage";
import { PlannerPage } from "@/pages/PlannerPage";
import { WorkoutPage } from "@/pages/WorkoutPage";
import { ActiveSessionPage } from "@/pages/ActiveSessionPage";
import { CardioPage } from "@/pages/CardioPage";
import { CoachPage } from "@/pages/CoachPage";
import { ProgressPage } from "@/pages/ProgressPage";
import { ProfilePage } from "@/pages/ProfilePage";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
    },
  },
});

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          {/* Public */}
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />

          {/* Protected */}
          <Route element={<RequireAuth />}>
            <Route element={<AppLayout />}>
              <Route path="/" element={<DashboardPage />} />
              <Route path="/planner" element={<PlannerPage />} />
              <Route path="/workout" element={<WorkoutPage />} />
              <Route path="/workout/new" element={<WorkoutPage />} />
              <Route path="/workout/:id" element={<ActiveSessionPage />} />
              <Route path="/cardio" element={<CardioPage />} />
              <Route path="/coach" element={<CoachPage />} />
              <Route path="/progress" element={<ProgressPage />} />
              <Route path="/profile" element={<ProfilePage />} />
            </Route>
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}

export default App;
