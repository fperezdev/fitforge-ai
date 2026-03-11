import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Send, Plus, Bot, User, Loader2 } from "lucide-react";
import { api, streamCoach } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { cn } from "@/lib/utils";

interface Conversation {
  id: string;
  title: string | null;
  updatedAt: string;
}

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
}

// Detect and extract <plan>...</plan> block from assistant message
function extractPlan(content: string): object | null {
  const match = content.match(/<plan>([\s\S]*?)<\/plan>/);
  if (!match) return null;
  try {
    return JSON.parse(match[1]);
  } catch {
    return null;
  }
}

function MessageBubble({
  message,
  onSavePlan,
}: {
  message: Message;
  onSavePlan?: (plan: object) => void;
}) {
  const isUser = message.role === "user";
  const plan = !isUser ? extractPlan(message.content) : null;
  const displayContent = message.content.replace(/<plan>[\s\S]*?<\/plan>/g, "").trim();

  return (
    <div className={cn("flex gap-3", isUser && "flex-row-reverse")}>
      <div
        className={cn(
          "h-7 w-7 rounded-full flex items-center justify-center shrink-0 mt-0.5",
          isUser ? "bg-primary text-primary-foreground" : "bg-muted"
        )}
        aria-hidden
      >
        {isUser ? <User className="h-3.5 w-3.5" /> : <Bot className="h-3.5 w-3.5" />}
      </div>
      <div
        className={cn(
          "max-w-[80%] rounded-2xl px-4 py-2.5 text-sm",
          isUser
            ? "bg-primary text-primary-foreground rounded-tr-sm"
            : "bg-muted rounded-tl-sm"
        )}
      >
        <p className="whitespace-pre-wrap">{displayContent}</p>
        {plan && (
          <button
            onClick={() => onSavePlan?.(plan)}
            className="mt-3 flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
          >
            <Plus className="h-3 w-3" />
            Save this plan as workout template
          </button>
        )}
      </div>
    </div>
  );
}

export function CoachPage() {
  const queryClient = useQueryClient();
  const [activeConv, setActiveConv] = useState<string | null>(null);
  const [inputValue, setInputValue] = useState("");
  const [streamingMsg, setStreamingMsg] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [planToSave, setPlanToSave] = useState<object | null>(null);
  const streamControllerRef = useRef<AbortController | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const { data: conversations = [] } = useQuery<Conversation[]>({
    queryKey: ["conversations"],
    queryFn: () => api.get("/coach/conversations"),
  });

  const { data: messages = [] } = useQuery<Message[]>({
    queryKey: ["messages", activeConv],
    queryFn: () => api.get(`/coach/conversations/${activeConv}/messages`),
    enabled: !!activeConv,
  });

  const createConvMutation = useMutation({
    mutationFn: (title?: string) =>
      api.post<Conversation>("/coach/conversations", { title }),
    onSuccess: (conv) => {
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
      setActiveConv(conv.id);
    },
  });

  const saveTemplateMutation = useMutation({
    mutationFn: (plan: Record<string, unknown>) =>
      api.post("/templates", {
        name: plan.name ?? "AI Generated Plan",
        description: plan.description,
        exercises: [],
      }),
    onSuccess: () => {
      setPlanToSave(null);
      queryClient.invalidateQueries({ queryKey: ["templates"] });
    },
  });

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingMsg]);

  function sendMessage() {
    if (!activeConv || !inputValue.trim() || isStreaming) return;

    const msg = inputValue.trim();
    setInputValue("");
    setStreamingMsg("");
    setIsStreaming(true);

    // Optimistically add user message
    queryClient.setQueryData<Message[]>(["messages", activeConv], (prev) => [
      ...(prev ?? []),
      {
        id: `optimistic-${Date.now()}`,
        conversationId: activeConv,
        role: "user",
        content: msg,
        createdAt: new Date().toISOString(),
      },
    ]);

    streamControllerRef.current = streamCoach(
      activeConv,
      msg,
      (chunk) => setStreamingMsg((p) => p + chunk),
      (_messageId) => {
        setIsStreaming(false);
        setStreamingMsg("");
        queryClient.invalidateQueries({ queryKey: ["messages", activeConv] });
        queryClient.invalidateQueries({ queryKey: ["conversations"] });
      },
      (err) => {
        setIsStreaming(false);
        setStreamingMsg("");
        console.error("Coach error:", err);
      }
    );
  }

  return (
    <div className="flex h-[calc(100vh-6rem)] gap-4">
      {/* Sidebar — conversation list */}
      <aside className="hidden md:flex flex-col w-64 shrink-0 border border-border rounded-xl bg-card overflow-hidden">
        <div className="p-3 border-b border-border">
          <Button
            size="sm"
            className="w-full"
            onClick={() => createConvMutation.mutate("New conversation")}
            loading={createConvMutation.isPending}
          >
            <Plus className="h-3.5 w-3.5" />
            New chat
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {conversations.length === 0 && (
            <p className="text-xs text-muted-foreground text-center p-4">
              No conversations yet
            </p>
          )}
          {conversations.map((conv) => (
            <button
              key={conv.id}
              onClick={() => setActiveConv(conv.id)}
              className={cn(
                "w-full text-left px-3 py-2 rounded-lg text-sm transition-colors",
                activeConv === conv.id
                  ? "bg-primary text-primary-foreground"
                  : "hover:bg-accent"
              )}
            >
              <p className="truncate font-medium">
                {conv.title ?? "Conversation"}
              </p>
              <p className={cn(
                "text-xs truncate mt-0.5",
                activeConv === conv.id ? "text-primary-foreground/70" : "text-muted-foreground"
              )}>
                {new Date(conv.updatedAt).toLocaleDateString()}
              </p>
            </button>
          ))}
        </div>
      </aside>

      {/* Chat area */}
      <div className="flex-1 flex flex-col border border-border rounded-xl bg-card overflow-hidden">
        {!activeConv ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-4 p-8 text-center">
            <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center">
              <Bot className="h-8 w-8 text-primary" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">FitForge AI Coach</h2>
              <p className="text-sm text-muted-foreground mt-1 max-w-sm">
                Your personal trainer powered by Gemini. Ask for advice, generate
                workout plans, or discuss your progress.
              </p>
            </div>
            <Button
              onClick={() => createConvMutation.mutate("New conversation")}
              loading={createConvMutation.isPending}
            >
              Start chatting
            </Button>
          </div>
        ) : (
          <>
            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {messages.map((msg) => (
                <MessageBubble
                  key={msg.id}
                  message={msg}
                  onSavePlan={(plan) => setPlanToSave(plan)}
                />
              ))}

              {/* Streaming bubble */}
              {isStreaming && (
                <div className="flex gap-3">
                  <div className="h-7 w-7 rounded-full bg-muted flex items-center justify-center shrink-0 mt-0.5">
                    <Bot className="h-3.5 w-3.5" />
                  </div>
                  <div className="max-w-[80%] rounded-2xl rounded-tl-sm bg-muted px-4 py-2.5 text-sm">
                    {streamingMsg ? (
                      <p className="whitespace-pre-wrap">{streamingMsg}</p>
                    ) : (
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    )}
                  </div>
                </div>
              )}
              <div ref={bottomRef} />
            </div>

            {/* Input */}
            <div className="p-3 border-t border-border">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  sendMessage();
                }}
                className="flex gap-2"
              >
                <input
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  placeholder="Ask your coach…"
                  disabled={isStreaming}
                  className="flex-1 h-10 rounded-lg border border-border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
                  aria-label="Message input"
                />
                <Button
                  type="submit"
                  size="icon"
                  disabled={!inputValue.trim() || isStreaming}
                  aria-label="Send"
                >
                  <Send className="h-4 w-4" />
                </Button>
              </form>
            </div>
          </>
        )}
      </div>

      {/* Plan save modal */}
      <Modal
        open={!!planToSave}
        onClose={() => setPlanToSave(null)}
        title="Save workout plan"
      >
        <p className="text-sm text-muted-foreground mb-4">
          The AI generated a structured plan. Do you want to save it as a
          workout template?
        </p>
        <pre className="text-xs bg-muted rounded-lg p-3 overflow-auto max-h-48 mb-4">
          {JSON.stringify(planToSave, null, 2)}
        </pre>
        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={() => setPlanToSave(null)}>
            Cancel
          </Button>
          <Button
            onClick={() =>
              planToSave && saveTemplateMutation.mutate(planToSave as Record<string, unknown>)
            }
            loading={saveTemplateMutation.isPending}
          >
            Save plan
          </Button>
        </div>
      </Modal>
    </div>
  );
}
