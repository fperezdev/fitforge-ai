import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { serve } from "@hono/node-server";
import { authRoutes } from "./http/routes/auth.js";
import { profileRoutes } from "./http/routes/profile.js";
import { exerciseRoutes } from "./http/routes/exercises.js";
import { templateRoutes } from "./http/routes/templates.js";
import { cardioTemplateRoutes } from "./http/routes/cardioTemplates.js";
import { planRoutes } from "./http/routes/plans.js";
import { sessionRoutes } from "./http/routes/sessions.js";
import { cardioRoutes, bodyRoutes } from "./http/routes/cardio-body.js";
import { coachRoutes } from "./http/routes/coach.js";
import { progressRoutes } from "./http/routes/progress.js";
import { errorHandler } from "./http/middleware/error.js";

const app = new Hono();

// Middleware
app.use("*", logger());
app.use(
  "*",
  cors({
    origin: (origin) => {
      if (process.env.NODE_ENV !== "production" && origin?.startsWith("http://localhost:")) {
        return origin;
      }
      const allowed = (process.env.WEB_URL ?? "http://localhost:5173")
        .split(",")
        .map((s) => s.trim());
      return allowed.includes(origin) ? origin : allowed[0];
    },
    allowHeaders: ["Content-Type", "Authorization"],
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    credentials: true,
  })
);
app.use("*", errorHandler);

// Health check
app.get("/health", (c) => c.json({ status: "ok", version: "1.0.0" }));

// Routes
app.route("/auth", authRoutes);
app.route("/me/profile", profileRoutes);
app.route("/exercises", exerciseRoutes);
app.route("/templates", templateRoutes);
app.route("/cardio-templates", cardioTemplateRoutes);
app.route("/plans", planRoutes);
app.route("/sessions", sessionRoutes);
app.route("/cardio", cardioRoutes);
app.route("/body", bodyRoutes);
app.route("/coach", coachRoutes);
app.route("/me", progressRoutes);

const port = Number(process.env.PORT ?? 3000);
console.log(`FitForge API running on port ${port}`);

serve({ fetch: app.fetch, port });

export default app;
