import { useEffect } from "react";
import { Navigate, Outlet } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAuthStore } from "@/store/auth";
import { api } from "@/lib/api";

export function RequireAuth() {
  const { user, isLoading, checkAuth } = useAuthStore();

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  // Prefetch active plan once auth is confirmed so all pages get it from cache
  useQuery({
    queryKey: ["activePlan"],
    queryFn: () => api.get("/plans/active"),
    enabled: !!user,
  });

  // Load all exercises into memory at startup — staleTime Infinity avoids re-fetching
  useQuery({
    queryKey: ["exercises"],
    queryFn: () => api.get("/exercises"),
    enabled: !!user,
    staleTime: Infinity,
  });

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin h-8 w-8 rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
}
