import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Send, Plus, Bot, User, Loader2, RefreshCw, AlertCircle } from "lucide-react";
import { api, importPlanFromAI, streamCoach } from "@/lib/api";
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

interface StrengthExercise {
  name: string;
  sets?: number;
  repMin?: number;
  repMax?: number;
  restSeconds?: number;
  rir?: number;
}

interface CardioExercise {
  name: string;
  zone?: number;
  kilometers?: number;
}

interface WorkoutBlock {
  name?: string;
  exercises: StrengthExercise[];
}

interface CardioBlock {
  name?: string;
  exercises: CardioExercise[];
}

interface Day {
  day: number;
  rest?: boolean;
  restNote?: string;
  workout?: WorkoutBlock;
  cardio?: CardioBlock;
}

interface Week {
  week: number;
  days: Day[];
}

interface WorkoutPlan {
  name: string;
  description?: string;
  weeks: Week[];
}

function strengthDetail(ex: StrengthExercise): string {
  const reps =
    ex.repMin && ex.repMax
      ? ex.repMin === ex.repMax
        ? `${ex.repMin} reps`
        : `${ex.repMin}–${ex.repMax} reps`
      : null;
  return [`${ex.sets} sets`, reps, ex.rir !== undefined ? `RIR ${ex.rir}` : null, ex.restSeconds ? `${ex.restSeconds}s rest` : null]
    .filter(Boolean)
    .join(", ");
}

function cardioDetail(ex: CardioExercise): string {
  return [ex.kilometers !== undefined ? `${ex.kilometers} km` : null, ex.zone !== undefined ? `Zone ${ex.zone}` : null]
    .filter(Boolean)
    .join(", ");
}

function ExerciseList<T extends { name: string }>({
  exercises,
  detail,
}: {
  exercises: T[];
  detail: (ex: T) => string;
}) {
  return (
    <ul className="mt-1 space-y-0.5 pl-3">
      {exercises.map((ex, i) => {
        const d = detail(ex);
        return (
          <li key={i} className="text-xs list-disc list-inside">
            <span className="font-medium">{ex.name}</span>
            {d ? ` — ${d}` : ""}
          </li>
        );
      })}
    </ul>
  );
}

function PlanDisplay({ plan }: { plan: WorkoutPlan }) {
  return (
    <div className="mt-3 space-y-3 text-sm">
      <div>
        <p className="font-semibold">{plan.name}</p>
        {plan.description && (
          <p className="text-xs text-muted-foreground mt-0.5">{plan.description}</p>
        )}
      </div>
      {plan.weeks.map((week) => (
        <div key={week.week}>
          <p className="font-medium text-xs uppercase tracking-wide mb-1">
            Week {week.week}
          </p>
          {week.days.map((day, di) => (
            <div key={di} className="mb-2">
              <p className="font-medium">Day {day.day}</p>
              {day.rest ? (
                <p className="text-xs text-muted-foreground mt-0.5 pl-3">
                  Rest day{day.restNote ? ` — ${day.restNote}` : ""}
                </p>
              ) : (
                <>
                  {day.workout && (
                    <div>
                      {day.workout.name && (
                        <p className="text-xs font-medium pl-3 mt-0.5">{day.workout.name}</p>
                      )}
                      <ExerciseList exercises={day.workout.exercises} detail={strengthDetail} />
                    </div>
                  )}
                  {day.cardio && (
                    <div className="mt-1">
                      {day.cardio.name && (
                        <p className="text-xs font-medium pl-3 mt-0.5">{day.cardio.name}</p>
                      )}
                      <ExerciseList exercises={day.cardio.exercises} detail={cardioDetail} />
                    </div>
                  )}
                </>
              )}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function MessageBubble({
  message,
  onSavePlan,
  canImportPlan,
}: {
  message: Message;
  onSavePlan?: (plan: object) => void;
  canImportPlan?: boolean;
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
        {plan && <PlanDisplay plan={plan as WorkoutPlan} />}
        {plan && canImportPlan && (
          <button
            onClick={() => onSavePlan?.(plan)}
            className="mt-3 flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
          >
            <Plus className="h-3 w-3" />
            Import as Training Plan
          </button>
        )}
        {plan && !canImportPlan && (
          <p className="mt-3 text-xs text-muted-foreground">
            You already have a training plan.
          </p>
        )}
      </div>
    </div>
  );
}

function FailedMessageBubble({
  content,
  onRetry,
}: {
  content: string;
  onRetry: () => void;
}) {
  return (
    <div className="flex gap-3">
      <div
        className="h-7 w-7 rounded-full bg-destructive/10 flex items-center justify-center shrink-0 mt-0.5"
        aria-hidden
      >
        <AlertCircle className="h-3.5 w-3.5 text-destructive" />
      </div>
      <div className="max-w-[80%] rounded-2xl rounded-tl-sm px-4 py-2.5 text-sm bg-destructive/10 text-destructive border border-destructive/20">
        <p>{content}</p>
        <button
          onClick={onRetry}
          className="mt-3 flex items-center gap-1.5 text-xs font-medium hover:underline"
        >
          <RefreshCw className="h-3 w-3" />
          Retry message
        </button>
      </div>
    </div>
  );
}

export function CoachPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [activeConv, setActiveConv] = useState<string | null>(null);
  const [inputValue, setInputValue] = useState("");
  const [streamingMsg, setStreamingMsg] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [planToSave, setPlanToSave] = useState<object | null>(null);
  const [failedMessage, setFailedMessage] = useState<{ convId: string; content: string } | null>(null);
  const lastServerMessagesRef = useRef<Message[]>([]);
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

  const { data: plan = null } = useQuery<{ id: string } | null>({
    queryKey: ["plans"],
    queryFn: () => api.get("/plans"),
  });
  const canImportPlan = plan === null;

  // Keep a ref to the last data that came from the server (not optimistic)
  useEffect(() => {
    lastServerMessagesRef.current = messages;
  }, [messages]);

  const createConvMutation = useMutation({
    mutationFn: (title?: string) =>
      api.post<Conversation>("/coach/conversations", { title }),
    onSuccess: (conv) => {
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
      setActiveConv(conv.id);
    },
  });

  const importPlanMutation = useMutation({
    mutationFn: (plan: object) => importPlanFromAI(plan),
    onSuccess: (result) => {
      setPlanToSave(null);
      queryClient.invalidateQueries({ queryKey: ["plans"] });
      navigate(`/planner/plans/${result.id}`);
    },
  });

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingMsg, failedMessage]);

  // Clear failed message when switching conversations
  useEffect(() => {
    setFailedMessage(null);
  }, [activeConv]);

  function sendMessage(content?: string) {
    if (!activeConv || isStreaming) return;
    const isRetry = content !== undefined;
    const msg = content ?? inputValue.trim();
    if (!msg) return;

    if (!isRetry) setInputValue("");
    setFailedMessage(null);
    setStreamingMsg("");
    setIsStreaming(true);

    if (isRetry) {
      // Reset cache to last server state to remove the stale optimistic message
      queryClient.setQueryData<Message[]>(
        ["messages", activeConv],
        lastServerMessagesRef.current
      );
    } else {
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
    }

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
        setFailedMessage({
          convId: activeConv,
          content: err.message || "Failed to get a response. Please try again.",
        });
      }
    );
  }

  // Show the failed bubble only when it belongs to the active conversation
  const showFailedBubble = failedMessage?.convId === activeConv;

  // The last user message from server state — used for retry
  const lastUserMessage = [...lastServerMessagesRef.current].reverse().find((m) => m.role === "user");

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
                  canImportPlan={canImportPlan}
                />
              ))}

              {/* Failed message bubble */}
              {showFailedBubble && (
                <FailedMessageBubble
                  content={failedMessage!.content}
                  onRetry={() => sendMessage(lastUserMessage?.content)}
                />
              )}

              {/* Streaming bubble */}
              {isStreaming && (
                <div className="flex gap-3">
                  <div className="h-7 w-7 rounded-full bg-muted flex items-center justify-center shrink-0 mt-0.5">
                    <Bot className="h-3.5 w-3.5" />
                  </div>
                  <div className="max-w-[80%] rounded-2xl rounded-tl-sm bg-muted px-4 py-2.5 text-sm">
                    {(() => {
                      const planStart = streamingMsg.indexOf("<plan>");
                      const visibleText = planStart === -1
                        ? streamingMsg
                        : streamingMsg.slice(0, planStart).trim();
                      const buildingPlan = planStart !== -1;
                      return (
                        <>
                          {visibleText ? (
                            <p className="whitespace-pre-wrap">{visibleText}</p>
                          ) : !buildingPlan ? (
                            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                          ) : null}
                          {buildingPlan && (
                            <p className="flex items-center gap-1.5 text-xs text-muted-foreground mt-2">
                              <Loader2 className="h-3 w-3 animate-spin" />
                              Building your workout plan…
                            </p>
                          )}
                        </>
                      );
                    })()}
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

      {/* Plan import modal */}
      <Modal
        open={!!planToSave}
        onClose={() => setPlanToSave(null)}
        title="Import as Training Plan"
      >
        <p className="text-sm text-muted-foreground mb-4">
          The AI generated a structured plan. Save it as a Training Plan to
          review and assign workouts day by day.
        </p>
        {planToSave && (
          <div className="bg-muted rounded-lg p-3 overflow-auto max-h-48 mb-4">
            <PlanDisplay plan={planToSave as WorkoutPlan} />
          </div>
        )}
        {importPlanMutation.error && (
          <p className="text-sm text-destructive mb-4">
            {(importPlanMutation.error as Error).message}
          </p>
        )}
        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={() => setPlanToSave(null)}>
            Cancel
          </Button>
          <Button
            onClick={() => planToSave && importPlanMutation.mutate(planToSave)}
            loading={importPlanMutation.isPending}
          >
            Import Plan
          </Button>
        </div>
      </Modal>
    </div>
  );
}
