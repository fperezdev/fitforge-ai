import { create } from "zustand";
import { api, setTokens, clearTokens } from "@/lib/api";

interface User {
  id: string;
  email: string;
}

interface AuthState {
  user: User | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (
    email: string,
    password: string,
    displayName: string
  ) => Promise<void>;
  logout: () => Promise<void>;
  checkAuth: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isLoading: true,

  login: async (email, password) => {
    const res = await api.post<{
      accessToken: string;
      refreshToken: string;
      user: User;
    }>("/auth/login", { email, password });
    setTokens(res.accessToken, res.refreshToken);
    set({ user: res.user });
  },

  register: async (email, password, displayName) => {
    const res = await api.post<{
      accessToken: string;
      refreshToken: string;
      user: User;
    }>("/auth/register", { email, password, displayName });
    setTokens(res.accessToken, res.refreshToken);
    set({ user: res.user });
  },

  logout: async () => {
    await api.post("/auth/logout").catch(() => {});
    clearTokens();
    set({ user: null });
  },

  checkAuth: async () => {
    const token = localStorage.getItem("access_token");
    if (!token) {
      set({ isLoading: false, user: null });
      return;
    }
    try {
      const profile = await api.get<{ userId: string; displayName: string }>(
        "/me/profile"
      );
      // We don't have /me/user but can derive from profile
      set({ user: { id: profile.userId, email: "" }, isLoading: false });
    } catch {
      clearTokens();
      set({ user: null, isLoading: false });
    }
  },
}));
