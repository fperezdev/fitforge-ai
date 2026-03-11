import type { Context, MiddlewareHandler } from "hono";
import { getSupabaseClient } from "../../infrastructure/supabase.js";

export const authMiddleware: MiddlewareHandler = async (c, next) => {
  const authHeader = c.req.header("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const token = authHeader.slice(7);
  const supabase = getSupabaseClient();

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) {
    return c.json({ error: "Invalid or expired token" }, 401);
  }

  c.set("userId", data.user.id);
  c.set("user", data.user);
  await next();
};

export function getUserId(c: Context): string {
  return c.get("userId") as string;
}
