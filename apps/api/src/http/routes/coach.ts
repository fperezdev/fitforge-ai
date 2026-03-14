import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { eq, and, desc } from "drizzle-orm";
import { coachConversations, coachMessages, coachRequests } from "@fitforge/db";
import { getDb } from "../../infrastructure/db.js";
import { authMiddleware, getUserId } from "../middleware/auth.js";
import { buildCoachContext } from "../../infrastructure/coach-context.js";
import { streamCoachResponse } from "../../infrastructure/gemini.js";

export const coachRoutes = new Hono()
  .use("*", authMiddleware)

  .get("/conversations", async (c) => {
    const userId = getUserId(c);
    const db = getDb();

    const conversations = await db.query.coachConversations.findMany({
      where: eq(coachConversations.userId, userId),
      orderBy: [desc(coachConversations.updatedAt)],
    });

    return c.json(conversations);
  })

  .post(
    "/conversations",
    zValidator(
      "json",
      z.object({
        title: z.string().optional(),
        mode: z.enum(["advice", "plan"]).optional(),
      }),
    ),
    async (c) => {
      const userId = getUserId(c);
      const { title, mode } = c.req.valid("json");
      const db = getDb();

      const [conversation] = await db
        .insert(coachConversations)
        .values({ userId, title: title ?? "New conversation", mode: mode ?? null })
        .returning();

      return c.json(conversation, 201);
    },
  )

  .patch(
    "/conversations/:id",
    zValidator("json", z.object({ status: z.enum(["active", "closed"]) })),
    async (c) => {
      const userId = getUserId(c);
      const { id } = c.req.param();
      const { status } = c.req.valid("json");
      const db = getDb();

      const conversation = await db.query.coachConversations.findFirst({
        where: and(eq(coachConversations.id, id), eq(coachConversations.userId, userId)),
      });
      if (!conversation) return c.json({ error: "Conversation not found" }, 404);

      const [updated] = await db
        .update(coachConversations)
        .set({ status, updatedAt: new Date() })
        .where(eq(coachConversations.id, id))
        .returning();

      return c.json(updated);
    },
  )

  .get("/conversations/:id/messages", async (c) => {
    const userId = getUserId(c);
    const { id } = c.req.param();
    const db = getDb();

    const conversation = await db.query.coachConversations.findFirst({
      where: and(eq(coachConversations.id, id), eq(coachConversations.userId, userId)),
    });
    if (!conversation) return c.json({ error: "Conversation not found" }, 404);

    const messages = await db.query.coachMessages.findMany({
      where: eq(coachMessages.conversationId, id),
      orderBy: [desc(coachMessages.createdAt)],
      limit: 50,
    });

    return c.json(messages.reverse());
  })

  // Main chat endpoint — streams AI response via SSE
  .post(
    "/conversations/:id/messages",
    zValidator("json", z.object({ content: z.string().min(1) })),
    async (c) => {
      const userId = getUserId(c);
      const { id } = c.req.param();
      const { content } = c.req.valid("json");
      const db = getDb();

      // Verify conversation ownership
      const conversation = await db.query.coachConversations.findFirst({
        where: and(eq(coachConversations.id, id), eq(coachConversations.userId, userId)),
      });
      if (!conversation) return c.json({ error: "Conversation not found" }, 404);

      // Block messages on closed conversations
      if (conversation.status === "closed") {
        return c.json({ error: "This conversation is closed." }, 403);
      }

      // Save user message
      await db.insert(coachMessages).values({
        conversationId: id,
        role: "user",
        content,
      });

      // Create request record
      const [request] = await db
        .insert(coachRequests)
        .values({
          userId,
          conversationId: id,
          userMessage: content,
          status: "processing",
          startedAt: new Date(),
        })
        .returning();

      // Build context (includes conversation mode)
      const context = await buildCoachContext(userId, id);

      // Stream response
      return new Response(
        new ReadableStream({
          async start(controller) {
            const encoder = new TextEncoder();
            let fullResponse = "";

            try {
              fullResponse = await streamCoachResponse(content, context, (chunk) => {
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ chunk })}\n\n`));
              });

              // Save assistant message
              const [msg] = await db
                .insert(coachMessages)
                .values({
                  conversationId: id,
                  coachRequestId: request.id,
                  role: "assistant",
                  content: fullResponse,
                })
                .returning();

              // Update request as completed
              await db
                .update(coachRequests)
                .set({
                  status: "completed",
                  response: fullResponse,
                  completedAt: new Date(),
                })
                .where(eq(coachRequests.id, request.id));

              // Update conversation updatedAt
              await db
                .update(coachConversations)
                .set({ updatedAt: new Date() })
                .where(eq(coachConversations.id, id));

              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({ done: true, messageId: msg.id })}\n\n`),
              );
            } catch (err) {
              const errorMsg = err instanceof Error ? err.message : "Unknown error";
              console.error("[coach] LLM request failed:", err);
              await db
                .update(coachRequests)
                .set({ status: "failed", error: errorMsg, completedAt: new Date() })
                .where(eq(coachRequests.id, request.id));

              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({ error: "Failed to get a response. Please try again." })}\n\n`,
                ),
              );
            } finally {
              controller.close();
            }
          },
        }),
        {
          headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            Connection: "keep-alive",
          },
        },
      );
    },
  );
