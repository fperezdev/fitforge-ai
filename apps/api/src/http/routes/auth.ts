import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { getSupabaseClient } from "../../infrastructure/supabase.js";
import { userProfiles } from "@fitforge/db";
import { getDb } from "../../infrastructure/db.js";

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  displayName: z.string().min(2).max(100),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

export const authRoutes = new Hono()
  .post("/register", zValidator("json", registerSchema), async (c) => {
    const { email, password, displayName } = c.req.valid("json");
    const supabase = getSupabaseClient();
    const db = getDb();

    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

    if (error) {
      return c.json({ error: error.message }, 400);
    }

    // Create profile record
    await db.insert(userProfiles).values({
      userId: data.user.id,
      displayName,
    });

    // Sign in to get tokens
    const { data: session, error: signInError } =
      await supabase.auth.signInWithPassword({ email, password });

    if (signInError || !session.session) {
      return c.json({ error: "Account created but sign-in failed" }, 500);
    }

    return c.json(
      {
        accessToken: session.session.access_token,
        refreshToken: session.session.refresh_token,
        user: { id: data.user.id, email: data.user.email },
      },
      201
    );
  })

  .post("/login", zValidator("json", loginSchema), async (c) => {
    const { email, password } = c.req.valid("json");
    const supabase = getSupabaseClient();

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error || !data.session) {
      return c.json({ error: "Invalid credentials" }, 401);
    }

    return c.json({
      accessToken: data.session.access_token,
      refreshToken: data.session.refresh_token,
      user: { id: data.user.id, email: data.user.email },
    });
  })

  .post("/logout", async (c) => {
    const authHeader = c.req.header("Authorization");
    if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.slice(7);
      const supabase = getSupabaseClient();
      await supabase.auth.admin.signOut(token);
    }
    return c.json({ success: true });
  })

  .post(
    "/refresh",
    zValidator("json", z.object({ refreshToken: z.string() })),
    async (c) => {
      const { refreshToken } = c.req.valid("json");
      const supabase = getSupabaseClient();

      const { data, error } = await supabase.auth.refreshSession({
        refresh_token: refreshToken,
      });

      if (error || !data.session) {
        return c.json({ error: "Invalid refresh token" }, 401);
      }

      return c.json({
        accessToken: data.session.access_token,
        refreshToken: data.session.refresh_token,
      });
    }
  );
