import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Send,
  Plus,
  Bot,
  User,
  Loader2,
  RefreshCw,
  AlertCircle,
  Lock,
  CheckCircle2,
  Dumbbell,
  HeartPulse,
  Layers,
  Lightbulb,
  ClipboardList,
  MessageSquare,
} from "lucide-react";
import { api, importPlanFromAI, streamCoach } from "@/lib/api";
import type { UserProfile, WeightEntry, EquipmentOption } from "@fitforge/types";
import { EquipmentSelector } from "@/components/ui/equipment-selector";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { DatePicker } from "@/components/ui/date-picker";
import { cn } from "@/lib/utils";

// ─── Data types ───────────────────────────────────────────────────────────────

interface Conversation {
  id: string;
  title: string | null;
  mode: "advice" | "plan" | null;
  status: "active" | "closed";
  createdAt: string;
  updatedAt: string;
}

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
}

// ─── Plan helpers ─────────────────────────────────────────────────────────────

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

// ─── Full plan (from GET /plans/:id) for Include Plan button ──────────────────

interface FullTemplateExercise {
  order: number;
  targetSets: number;
  targetRepMin: number;
  targetRepMax: number;
  rir: number | null;
  restSeconds: number | null;
  exercise: { name: string } | null;
}

interface FullWorkoutTemplate {
  name: string;
  templateExercises: FullTemplateExercise[];
}

interface FullCardioExercise {
  name: string;
  zone: number | null;
  kilometers: string | number | null;
}

interface FullCardioTemplate {
  name: string;
  cardioTemplateExercises: FullCardioExercise[];
}

interface FullPlanDay {
  dayNumber: number;
  type: string;
  workoutTemplate: FullWorkoutTemplate | null;
  cardioTemplate: FullCardioTemplate | null;
}

interface FullPlanMicrocycle {
  position: number;
  days: FullPlanDay[];
}

interface FullPlan {
  id: string;
  name: string;
  status: string;
  microcycles: FullPlanMicrocycle[];
}

function formatPlanAsText(p: FullPlan): string {
  const lines: string[] = [`[Current Training Plan: "${p.name}" — ${p.status}]`];
  for (const mc of p.microcycles) {
    for (const day of mc.days) {
      const prefix = `Week ${mc.position}, Day ${day.dayNumber}`;
      if (day.type === "rest" || (!day.workoutTemplate && !day.cardioTemplate)) {
        lines.push(`${prefix} — Rest`);
        continue;
      }
      const parts: string[] = [];
      if (day.workoutTemplate) {
        const exStr = day.workoutTemplate.templateExercises
          .sort((a, b) => a.order - b.order)
          .map((te) => {
            const name = te.exercise?.name ?? "Unknown";
            const sets = te.targetSets;
            const reps =
              te.targetRepMin === te.targetRepMax
                ? `${te.targetRepMin}`
                : `${te.targetRepMin}-${te.targetRepMax}`;
            const rir = te.rir !== null ? ` RIR${te.rir}` : "";
            const rest = te.restSeconds ? ` ${te.restSeconds}s` : "";
            return `${name} ${sets}×${reps}${rir}${rest}`;
          })
          .join(", ");
        parts.push(`${day.workoutTemplate.name}: ${exStr}`);
      }
      if (day.cardioTemplate) {
        const exStr = day.cardioTemplate.cardioTemplateExercises
          .map((ce) => {
            const zone = ce.zone !== null ? ` Zone ${ce.zone}` : "";
            const km = ce.kilometers ? ` ${ce.kilometers}km` : "";
            return `${ce.name}${zone}${km}`;
          })
          .join(", ");
        parts.push(`${day.cardioTemplate.name} (Cardio): ${exStr}`);
      }
      lines.push(`${prefix} — ${parts.join(" + ")}`);
    }
  }
  return lines.join("\n");
}

function strengthDetail(ex: StrengthExercise): string {
  const reps =
    ex.repMin && ex.repMax
      ? ex.repMin === ex.repMax
        ? `${ex.repMin} reps`
        : `${ex.repMin}–${ex.repMax} reps`
      : null;
  return [
    `${ex.sets} sets`,
    reps,
    ex.rir !== undefined ? `RIR ${ex.rir}` : null,
    ex.restSeconds ? `${ex.restSeconds}s rest` : null,
  ]
    .filter(Boolean)
    .join(", ");
}

function cardioDetail(ex: CardioExercise): string {
  return [
    ex.kilometers !== undefined ? `${ex.kilometers} km` : null,
    ex.zone !== undefined ? `Zone ${ex.zone}` : null,
  ]
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
          <p className="font-medium text-xs uppercase tracking-wide mb-1">Week {week.week}</p>
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

// ─── Message bubbles ──────────────────────────────────────────────────────────

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
          isUser ? "bg-primary text-primary-foreground" : "bg-muted",
        )}
        aria-hidden
      >
        {isUser ? <User className="h-3.5 w-3.5" /> : <Bot className="h-3.5 w-3.5" />}
      </div>
      <div
        className={cn(
          "max-w-[80%] rounded-2xl px-4 py-2.5 text-sm",
          isUser ? "bg-primary text-primary-foreground rounded-tr-sm" : "bg-muted rounded-tl-sm",
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
        <p className={cn("mt-1 text-[10px] opacity-60", isUser ? "text-right" : "text-left")}>
          {new Date(message.createdAt).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </p>
      </div>
    </div>
  );
}

function FailedMessageBubble({ content, onRetry }: { content: string; onRetry: () => void }) {
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

// ─── Profile Gate ─────────────────────────────────────────────────────────────

type GateField =
  | "displayName"
  | "dateOfBirth"
  | "gender"
  | "heightCm"
  | "weight"
  | "fitnessGoal"
  | "experienceLevel";

const GATE_FIELDS: GateField[] = [
  "displayName",
  "dateOfBirth",
  "gender",
  "heightCm",
  "weight",
  "fitnessGoal",
  "experienceLevel",
];

const FIELD_LABELS: Record<GateField, string> = {
  displayName: "your display name",
  dateOfBirth: "your date of birth",
  gender: "your gender",
  heightCm: "your height",
  weight: "your current weight",
  fitnessGoal: "your primary fitness goal",
  experienceLevel: "your experience level",
};

const FIELD_PROMPTS: Record<GateField, string> = {
  displayName: "What should we call you?",
  dateOfBirth: "What is your date of birth?",
  gender: "What is your gender?",
  heightCm: "What is your height (in cm)?",
  weight: "What is your current weight (in kg)?",
  fitnessGoal: "What is your primary fitness goal?",
  experienceLevel: "What is your training experience level?",
};

function isMissingField(
  field: GateField,
  profile: UserProfile | undefined,
  hasWeight: boolean,
): boolean {
  if (!profile) return true;
  if (field === "weight") return !hasWeight;
  const val = profile[field as keyof UserProfile];
  return !val;
}

function ProfileGate({
  profile,
  hasWeight,
  onComplete,
}: {
  profile: UserProfile | undefined;
  hasWeight: boolean;
  onComplete: () => void;
}) {
  const queryClient = useQueryClient();
  const [inputValue, setInputValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  const missingFields = GATE_FIELDS.filter((f) => isMissingField(f, profile, hasWeight));
  const currentField = missingFields[0] ?? null;
  const doneCount = GATE_FIELDS.length - missingFields.length;

  const profileMutation = useMutation({
    mutationFn: (data: Partial<UserProfile>) => api.patch<UserProfile>("/me/profile", data),
    onSuccess: (updated) => {
      queryClient.setQueryData(["me/profile"], updated);
      setInputValue("");
      setError(null);
    },
    onError: (err: Error) => setError(err.message),
  });

  const weightMutation = useMutation({
    mutationFn: (weightKg: number) =>
      api.post<WeightEntry>("/body/weight", {
        date: new Date().toISOString().slice(0, 10),
        weightKg,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["weight"] });
      setInputValue("");
      setError(null);
    },
    onError: (err: Error) => setError(err.message),
  });

  // Re-check completion after mutations settle
  useEffect(() => {
    if (missingFields.length === 0) onComplete();
  }, [missingFields.length, onComplete]);

  if (missingFields.length === 0) return null;

  const isPending = profileMutation.isPending || weightMutation.isPending;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const val = inputValue.trim();
    if (!val || !currentField) return;

    if (currentField === "weight") {
      const num = parseFloat(val);
      if (isNaN(num) || num <= 0) {
        setError("Please enter a valid weight in kg.");
        return;
      }
      weightMutation.mutate(num);
      return;
    }

    if (currentField === "heightCm") {
      const num = parseFloat(val);
      if (isNaN(num) || num <= 0) {
        setError("Please enter a valid height in cm.");
        return;
      }
      profileMutation.mutate({ heightCm: num });
      return;
    }

    profileMutation.mutate({ [currentField]: val });
  }

  const isSelect =
    currentField === "fitnessGoal" ||
    currentField === "experienceLevel" ||
    currentField === "gender";

  const selectOptions: Record<string, { value: string; label: string }[]> = {
    gender: [
      { value: "male", label: "Male" },
      { value: "female", label: "Female" },
      { value: "other", label: "Other" },
      { value: "prefer_not_to_say", label: "Prefer not to say" },
    ],
    fitnessGoal: [
      { value: "hypertrophy", label: "Muscle Building" },
      { value: "strength", label: "Strength" },
      { value: "endurance", label: "Endurance" },
      { value: "weight_loss", label: "Weight Loss" },
      { value: "general_fitness", label: "General Fitness" },
      { value: "running", label: "Running" },
    ],
    experienceLevel: [
      { value: "beginner", label: "Beginner (< 1 year)" },
      { value: "intermediate", label: "Intermediate (1–3 years)" },
      { value: "advanced", label: "Advanced (3+ years)" },
    ],
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-6 p-8 text-center max-w-sm mx-auto">
      <div className="h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center">
        <Bot className="h-7 w-7 text-primary" />
      </div>

      <div>
        <h2 className="text-lg font-semibold">Before we begin</h2>
        <p className="text-sm text-muted-foreground mt-1">
          We need a few details to personalise your coaching.
        </p>
      </div>

      {/* Progress */}
      <div className="w-full">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs text-muted-foreground">
            {doneCount} of {GATE_FIELDS.length} complete
          </span>
          <span className="text-xs text-muted-foreground">{missingFields.length} remaining</span>
        </div>
        <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
          <div
            className="h-full bg-primary rounded-full transition-all duration-300"
            style={{ width: `${(doneCount / GATE_FIELDS.length) * 100}%` }}
          />
        </div>
      </div>

      {/* Current question */}
      {currentField && (
        <form onSubmit={handleSubmit} className="w-full space-y-3">
          <label className="block text-sm font-medium text-left">
            {FIELD_PROMPTS[currentField]}
          </label>

          {currentField === "dateOfBirth" ? (
            <DatePicker
              value={inputValue}
              onChange={(v) => setInputValue(v)}
              toDate={new Date()}
              placeholder="Select date of birth"
            />
          ) : isSelect ? (
            <select
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              className="w-full h-10 rounded-lg border border-border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              aria-label={FIELD_LABELS[currentField]}
              required
            >
              <option value="">— select —</option>
              {selectOptions[currentField].map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          ) : (
            <input
              type={currentField === "heightCm" || currentField === "weight" ? "number" : "text"}
              step={currentField === "heightCm" || currentField === "weight" ? "0.1" : undefined}
              min={currentField === "heightCm" || currentField === "weight" ? "0" : undefined}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder={
                currentField === "heightCm"
                  ? "e.g. 175"
                  : currentField === "weight"
                    ? "e.g. 75"
                    : currentField === "displayName"
                      ? "e.g. Alex"
                      : ""
              }
              className="w-full h-10 rounded-lg border border-border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              aria-label={FIELD_LABELS[currentField]}
              required
            />
          )}

          {error && <p className="text-xs text-destructive text-left">{error}</p>}

          <Button
            type="submit"
            className="w-full"
            loading={isPending}
            disabled={!inputValue.trim()}
          >
            Continue
          </Button>
        </form>
      )}
    </div>
  );
}

// ─── Mode Selector ────────────────────────────────────────────────────────────

function ModeSelector({ onSelect }: { onSelect: (mode: "advice" | "plan") => void }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-6 p-8 text-center">
      <div className="h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center">
        <Bot className="h-7 w-7 text-primary" />
      </div>
      <div>
        <h2 className="text-lg font-semibold">FitForge AI Coach</h2>
        <p className="text-sm text-muted-foreground mt-1 max-w-xs">
          What would you like to do today?
        </p>
      </div>
      <div className="flex flex-col sm:flex-row gap-3 w-full max-w-sm">
        <button
          onClick={() => onSelect("advice")}
          className="flex-1 flex flex-col items-center gap-2 rounded-xl border border-border bg-card p-5 text-sm font-medium hover:border-primary hover:bg-primary/5 transition-colors"
        >
          <Lightbulb className="h-6 w-6 text-primary" />
          <span>Get Advice</span>
          <span className="text-xs text-muted-foreground font-normal">
            Ask about training, hypertrophy, or cardio
          </span>
        </button>
        <button
          onClick={() => onSelect("plan")}
          className="flex-1 flex flex-col items-center gap-2 rounded-xl border border-border bg-card p-5 text-sm font-medium hover:border-primary hover:bg-primary/5 transition-colors"
        >
          <ClipboardList className="h-6 w-6 text-primary" />
          <span>Build a Plan</span>
          <span className="text-xs text-muted-foreground font-normal">
            Get a personalised training plan
          </span>
        </button>
      </div>
    </div>
  );
}

// ─── Advice Flow ──────────────────────────────────────────────────────────────

function AdviceFlow({
  onStart,
  isLoading,
}: {
  onStart: (concern: string) => void;
  isLoading: boolean;
}) {
  const [concern, setConcern] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const val = concern.trim();
    if (!val) return;
    onStart(val);
  }

  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-5 p-8 text-center max-w-sm mx-auto">
      <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center">
        <Lightbulb className="h-6 w-6 text-primary" />
      </div>
      <div>
        <h2 className="text-base font-semibold">What would you like advice on?</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Describe your training topic or question.
        </p>
      </div>
      <form onSubmit={handleSubmit} className="w-full space-y-3">
        <textarea
          value={concern}
          onChange={(e) => setConcern(e.target.value)}
          rows={3}
          placeholder="e.g. How should I structure my upper/lower split for hypertrophy?"
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
          aria-label="Training topic"
        />
        <Button type="submit" className="w-full" loading={isLoading} disabled={!concern.trim()}>
          Start conversation
        </Button>
      </form>
    </div>
  );
}

// ─── Plan Flow ────────────────────────────────────────────────────────────────

type PlanType = "hypertrophy" | "cardio" | "both";

const PLAN_TYPE_OPTIONS: { value: PlanType; label: string; icon: React.ReactNode }[] = [
  { value: "hypertrophy", label: "Hypertrophy only", icon: <Dumbbell className="h-5 w-5" /> },
  { value: "cardio", label: "Cardio only", icon: <HeartPulse className="h-5 w-5" /> },
  { value: "both", label: "Both", icon: <Layers className="h-5 w-5" /> },
];

function PlanFlow({
  onStart,
  isLoading,
  profile,
}: {
  onStart: (
    objectives: string,
    planType: PlanType,
    equipment: EquipmentOption[],
    injuries: string,
    extra: string,
  ) => void;
  isLoading: boolean;
  profile: UserProfile | undefined;
}) {
  const [step, setStep] = useState<1 | 2 | 3 | 4 | 5>(1);
  const [objectives, setObjectives] = useState("");
  const [planType, setPlanType] = useState<PlanType | null>(null);
  const [equipment, setEquipment] = useState<EquipmentOption[]>(profile?.equipment ?? ["full_gym"]);
  const [injuries, setInjuries] = useState(profile?.injuries ?? "");
  const [extra, setExtra] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (step === 1) {
      if (!objectives.trim()) return;
      setStep(2);
    } else if (step === 2) {
      if (!planType) return;
      setStep(3);
    } else if (step === 3) {
      // Auto-save equipment to profile (fire-and-forget)
      api.patch("/me/profile", { equipment });
      setStep(4);
    } else if (step === 4) {
      // Auto-save injuries to profile (fire-and-forget)
      api.patch("/me/profile", { injuries });
      setStep(5);
    } else {
      onStart(objectives.trim(), planType!, equipment, injuries.trim(), extra.trim());
    }
  }

  return (
    <div className="flex flex-col items-center gap-5 p-8 text-center max-w-sm mx-auto min-h-full justify-center">
      <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
        <ClipboardList className="h-6 w-6 text-primary" />
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-2">
        {([1, 2, 3, 4, 5] as const).map((s) => (
          <div
            key={s}
            className={cn(
              "h-2 w-2 rounded-full transition-colors",
              s <= step ? "bg-primary" : "bg-muted",
            )}
          />
        ))}
      </div>

      <form onSubmit={handleSubmit} className="w-full space-y-4">
        {step === 1 && (
          <>
            <div>
              <h2 className="text-base font-semibold">Describe your training goals</h2>
              <p className="text-sm text-muted-foreground mt-1">
                What do you want to achieve with this plan?
              </p>
            </div>
            <textarea
              value={objectives}
              onChange={(e) => setObjectives(e.target.value)}
              rows={3}
              placeholder="e.g. Build muscle mass and lose some body fat over 12 weeks"
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
              aria-label="Training objectives"
            />
            <Button type="submit" className="w-full" disabled={!objectives.trim()}>
              Next
            </Button>
          </>
        )}

        {step === 2 && (
          <>
            <div>
              <h2 className="text-base font-semibold">What type of plan?</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Choose the focus of your training plan.
              </p>
            </div>
            <div className="flex flex-col gap-2">
              {PLAN_TYPE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setPlanType(opt.value)}
                  className={cn(
                    "flex items-center gap-3 rounded-xl border px-4 py-3 text-sm font-medium transition-colors text-left",
                    planType === opt.value
                      ? "border-primary bg-primary/5 text-primary"
                      : "border-border hover:border-primary/50 hover:bg-muted/50",
                  )}
                >
                  {opt.icon}
                  {opt.label}
                  {planType === opt.value && (
                    <CheckCircle2 className="h-4 w-4 ml-auto text-primary" />
                  )}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="outline" className="flex-1" onClick={() => setStep(1)}>
                Back
              </Button>
              <Button type="submit" className="flex-1" disabled={!planType}>
                Next
              </Button>
            </div>
          </>
        )}

        {step === 3 && (
          <>
            <div>
              <h2 className="text-base font-semibold">What equipment do you have?</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Helps tailor the plan to what's available to you.
              </p>
            </div>
            <div className="text-left">
              <EquipmentSelector value={equipment} onChange={setEquipment} />
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="outline" className="flex-1" onClick={() => setStep(2)}>
                Back
              </Button>
              <Button type="submit" className="flex-1">
                Next
              </Button>
            </div>
          </>
        )}

        {step === 4 && (
          <>
            <div>
              <h2 className="text-base font-semibold">Any injuries or conditions?</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Optional — helps the AI avoid exercises that aggravate your condition.
              </p>
            </div>
            <textarea
              value={injuries}
              onChange={(e) => setInjuries(e.target.value)}
              rows={3}
              placeholder="e.g. Lower back pain, right knee tendinitis"
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
              aria-label="Injuries or conditions"
            />
            <p className="text-xs text-muted-foreground -mt-2">
              This will also update your profile.
            </p>
            <div className="flex gap-2">
              <Button type="button" variant="outline" className="flex-1" onClick={() => setStep(3)}>
                Back
              </Button>
              <Button type="submit" className="flex-1">
                Next
              </Button>
            </div>
          </>
        )}

        {step === 5 && (
          <>
            <div>
              <h2 className="text-base font-semibold">Any additional context?</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Optional — days per week, preferences, schedule, etc.
              </p>
            </div>
            <textarea
              value={extra}
              onChange={(e) => setExtra(e.target.value)}
              rows={6}
              placeholder="e.g. 4 days per week, prefer morning workouts"
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
              aria-label="Additional context"
            />
            <div className="flex gap-2">
              <Button type="button" variant="outline" className="flex-1" onClick={() => setStep(4)}>
                Back
              </Button>
              <Button type="submit" className="flex-1" loading={isLoading}>
                Generate Plan
              </Button>
            </div>
          </>
        )}
      </form>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export function CoachPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // Conversation selection
  const [activeConv, setActiveConv] = useState<string | null>(null);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  // Chat state
  const [inputValue, setInputValue] = useState("");
  const [streamingMsg, setStreamingMsg] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [planToSave, setPlanToSave] = useState<object | null>(null);
  const [failedMessage, setFailedMessage] = useState<{
    convId: string;
    content: string;
  } | null>(null);
  const lastServerMessagesRef = useRef<Message[]>([]);
  const streamControllerRef = useRef<AbortController | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const userScrolledUpRef = useRef(false);

  // Funnel state: which step the "new chat" pane is on
  type FunnelStep = "mode" | "advice" | "plan";
  const [funnelStep, setFunnelStep] = useState<FunnelStep>("mode");
  const [isCreatingConv, setIsCreatingConv] = useState(false);

  // ── Data ──────────────────────────────────────────────────────────────────

  const { data: profile, isLoading: isProfileLoading } = useQuery<UserProfile>({
    queryKey: ["me/profile"],
    queryFn: () => api.get<UserProfile>("/me/profile"),
  });

  const { data: weightEntries = [], isLoading: isWeightLoading } = useQuery<WeightEntry[]>({
    queryKey: ["weight"],
    queryFn: () => api.get<WeightEntry[]>("/body/weight?limit=1"),
  });
  const hasWeight = weightEntries.length > 0;

  const profileComplete =
    !!profile &&
    !!profile.displayName &&
    !!profile.dateOfBirth &&
    !!profile.gender &&
    (!!profile.heightCm || profile.heightCm === 0) &&
    hasWeight &&
    !!profile.fitnessGoal &&
    !!profile.experienceLevel;

  const { data: conversations = [], isLoading: isConversationsLoading } = useQuery<Conversation[]>({
    queryKey: ["conversations"],
    queryFn: () => api.get("/coach/conversations"),
  });

  const { data: messages = [], isLoading: isMessagesLoading } = useQuery<Message[]>({
    queryKey: ["messages", activeConv],
    queryFn: () => api.get(`/coach/conversations/${activeConv}/messages`),
    enabled: !!activeConv,
  });

  const { data: plan = null, isLoading: isPlanLoading } = useQuery<{
    id: string;
    name: string;
    status: string;
  } | null>({
    queryKey: ["plans"],
    queryFn: () => api.get("/plans"),
  });
  const canImportPlan = plan === null || plan.status === "draft";

  // Active conversation metadata
  const activeConvData = conversations.find((c) => c.id === activeConv);
  const isClosed = activeConvData?.status === "closed";

  // ── Effects ───────────────────────────────────────────────────────────────

  useEffect(() => {
    lastServerMessagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    if (!userScrolledUpRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, streamingMsg, failedMessage]);

  useEffect(() => {
    setFailedMessage(null);
    userScrolledUpRef.current = false;
  }, [activeConv]);

  // Reset funnel when user deselects conversation
  useEffect(() => {
    if (!activeConv) setFunnelStep("mode");
  }, [activeConv]);

  // ── Mutations ─────────────────────────────────────────────────────────────

  const importPlanMutation = useMutation({
    mutationFn: (p: object) => importPlanFromAI(p),
    onSuccess: () => {
      setPlanToSave(null);
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
      queryClient.invalidateQueries({ queryKey: ["plans"] });
      navigate("/planner");
    },
  });

  // ── Chat helpers ──────────────────────────────────────────────────────────

  async function sendMessage(content?: string, convId?: string) {
    const targetConv = convId ?? activeConv;
    if (!targetConv || isStreaming) return;
    const isRetry = content !== undefined && convId === undefined;
    const userText = content ?? inputValue.trim();
    if (!userText) return;

    // In plan-mode, always append the current draft plan as context if one exists
    const convMode =
      convId != null
        ? null // first message of a brand-new conv — no draft plan yet
        : activeConvData?.mode;
    let msg = userText;
    if (!isRetry && convMode === "plan" && plan?.status === "draft" && plan.id) {
      try {
        const full = await api.get<FullPlan>(`/plans/${plan.id}`);
        msg = `${userText}\n\n${formatPlanAsText(full)}`;
      } catch {
        // silently fall back to sending without plan context
      }
    }

    if (!isRetry && convId === undefined) {
      setInputValue("");
    }
    setFailedMessage(null);
    setStreamingMsg("");
    setIsStreaming(true);

    if (isRetry) {
      queryClient.setQueryData<Message[]>(["messages", targetConv], lastServerMessagesRef.current);
    } else {
      userScrolledUpRef.current = false;
      queryClient.setQueryData<Message[]>(["messages", targetConv], (prev) => [
        ...(prev ?? []),
        {
          id: `optimistic-${Date.now()}`,
          conversationId: targetConv,
          role: "user",
          content: msg,
          createdAt: new Date().toISOString(),
        },
      ]);
    }

    streamControllerRef.current = streamCoach(
      targetConv,
      msg,
      (chunk) => setStreamingMsg((p) => p + chunk),
      (_messageId) => {
        setIsStreaming(false);
        setStreamingMsg("");
        queryClient.invalidateQueries({ queryKey: ["messages", targetConv] });
        queryClient.invalidateQueries({ queryKey: ["conversations"] });
      },
      (err) => {
        setIsStreaming(false);
        setStreamingMsg("");
        setFailedMessage({
          convId: targetConv,
          content: err.message || "Failed to get a response. Please try again.",
        });
      },
    );
  }

  // ── Funnel actions ────────────────────────────────────────────────────────

  async function startAdvice(concern: string) {
    setIsCreatingConv(true);
    try {
      // Build [Context] block from profile already in scope
      const contextLines: string[] = [];
      if (profile) {
        const p = profile;
        if (p.displayName) contextLines.push(`Name: ${p.displayName}`);
        if (p.dateOfBirth) {
          const age = Math.floor(
            (Date.now() - new Date(p.dateOfBirth).getTime()) / (1000 * 60 * 60 * 24 * 365.25),
          );
          contextLines.push(`Age: ${age} years`);
        }
        if (p.gender) contextLines.push(`Gender: ${p.gender}`);
        if (p.experienceLevel) contextLines.push(`Experience: ${p.experienceLevel}`);
        if (p.fitnessGoal) contextLines.push(`Goal: ${p.fitnessGoal}`);
        if (p.heightCm) contextLines.push(`Height: ${p.heightCm} cm`);
        if (p.equipment && p.equipment.length > 0 && !p.equipment.includes("full_gym")) {
          contextLines.push(`Equipment: ${p.equipment.join(", ")}`);
        }
        if (p.injuries?.trim()) contextLines.push(`Injuries/conditions: ${p.injuries.trim()}`);
      }
      if (plan) {
        contextLines.push(`Current plan: "${plan.name}" (${plan.status})`);
      }

      const firstMessage =
        contextLines.length > 0
          ? `[Context]\n${contextLines.join("\n")}\n\n[Question]\n${concern}`
          : concern;

      const conv = await api.post<Conversation>("/coach/conversations", {
        title: concern.slice(0, 80),
        mode: "advice",
      });
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
      setActiveConv(conv.id);
      sendMessage(firstMessage, conv.id);
    } finally {
      setIsCreatingConv(false);
    }
  }

  async function startPlan(
    objectives: string,
    planType: PlanType,
    equipment: EquipmentOption[],
    injuries: string,
    extra: string,
  ) {
    setIsCreatingConv(true);
    const planTypeLabel =
      planType === "hypertrophy"
        ? "Hypertrophy only"
        : planType === "cardio"
          ? "Cardio only"
          : "Both (Hypertrophy + Cardio)";

    const equipmentLabel = equipment.includes("full_gym") ? "Full Gym" : equipment.join(", ");

    const firstMessage = [
      `Plan type: ${planTypeLabel}`,
      `Objectives: ${objectives}`,
      `Equipment: ${equipmentLabel}`,
      injuries ? `Injuries/conditions: ${injuries}` : null,
      extra ? `Additional context: ${extra}` : null,
      "Please create a training plan based on the above.",
    ]
      .filter(Boolean)
      .join("\n");

    try {
      const conv = await api.post<Conversation>("/coach/conversations", {
        title: objectives.slice(0, 80),
        mode: "plan",
      });
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
      setActiveConv(conv.id);
      sendMessage(firstMessage, conv.id);
    } finally {
      setIsCreatingConv(false);
    }
  }

  // ── Derived values ────────────────────────────────────────────────────────

  const showFailedBubble = failedMessage?.convId === activeConv;
  const lastUserMessage = [...lastServerMessagesRef.current]
    .reverse()
    .find((m) => m.role === "user");

  // ── Render ────────────────────────────────────────────────────────────────

  if (
    isProfileLoading ||
    isWeightLoading ||
    isConversationsLoading ||
    isPlanLoading ||
    (activeConv && isMessagesLoading)
  ) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin h-8 w-8 rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-6rem)] gap-4">
      {/* Mobile sidebar toggle */}
      <button
        onClick={() => setMobileSidebarOpen((v) => !v)}
        className="md:hidden fixed top-4 right-4 z-50 h-9 w-9 rounded-lg bg-primary text-primary-foreground flex items-center justify-center shadow-lg"
        aria-label="Toggle conversations"
      >
        <MessageSquare className="h-4 w-4" />
      </button>

      {/* Mobile sidebar overlay */}
      {mobileSidebarOpen && (
        <div
          className="md:hidden fixed inset-0 z-40 bg-black/40"
          onClick={() => setMobileSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          "flex flex-col w-64 shrink-0 border border-border rounded-xl bg-card overflow-hidden",
          "md:flex",
          mobileSidebarOpen
            ? "fixed inset-y-0 left-0 z-50 rounded-none border-r border-l-0 border-y-0 shadow-xl"
            : "hidden",
        )}
      >
        <div className="p-3 border-b border-border">
          <Button
            size="sm"
            className="w-full"
            onClick={() => {
              setActiveConv(null);
              setFunnelStep("mode");
              setMobileSidebarOpen(false);
            }}
            disabled={isCreatingConv}
          >
            <Plus className="h-3.5 w-3.5" />
            New chat
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {conversations.length === 0 && (
            <p className="text-xs text-muted-foreground text-center p-4">No conversations yet</p>
          )}
          {conversations.map((conv) => (
            <button
              key={conv.id}
              onClick={() => {
                setActiveConv(conv.id);
                setMobileSidebarOpen(false);
              }}
              className={cn(
                "w-full text-left px-3 py-2 rounded-lg text-sm transition-colors",
                activeConv === conv.id ? "bg-primary text-primary-foreground" : "hover:bg-accent",
              )}
            >
              <div className="flex items-center gap-1.5 min-w-0">
                {conv.status === "closed" && (
                  <Lock
                    className={cn(
                      "h-3 w-3 shrink-0",
                      activeConv === conv.id
                        ? "text-primary-foreground/70"
                        : "text-muted-foreground",
                    )}
                    aria-label="Closed"
                  />
                )}
                <p className="truncate font-medium">{conv.title ?? "Conversation"}</p>
              </div>
              <p
                className={cn(
                  "text-xs truncate mt-0.5",
                  activeConv === conv.id ? "text-primary-foreground/70" : "text-muted-foreground",
                )}
              >
                {new Date(conv.createdAt).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </p>
            </button>
          ))}
        </div>
      </aside>

      {/* Main chat area */}
      <div className="flex-1 flex flex-col border border-border rounded-xl bg-card overflow-hidden">
        {/* Profile gate */}
        {!profileComplete ? (
          <ProfileGate
            profile={profile}
            hasWeight={hasWeight}
            onComplete={() => {
              /* gate disappears automatically when profileComplete flips */
            }}
          />
        ) : activeConv ? (
          <>
            {/* Messages */}
            <div
              ref={scrollContainerRef}
              className="flex-1 overflow-y-auto p-4 space-y-4"
              onScroll={() => {
                const el = scrollContainerRef.current;
                if (!el) return;
                const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 100;
                userScrolledUpRef.current = !nearBottom;
              }}
            >
              {messages.map((msg) => (
                <div key={msg.id}>
                  <MessageBubble
                    message={msg}
                    onSavePlan={(p) => setPlanToSave(p)}
                    canImportPlan={canImportPlan}
                  />
                  {msg.role === "assistant" && extractPlan(msg.content) && (
                    <div className="flex gap-3 mt-2">
                      <div className="h-7 w-7 shrink-0" aria-hidden />
                      <div className="max-w-[80%] rounded-xl bg-primary/5 border border-primary/15 px-4 py-2.5 text-xs text-muted-foreground">
                        <span className="font-medium text-foreground">There is a draft plan.</span>{" "}
                        It will be included automatically as context — you can edit or delete it and
                        keep chatting.
                      </div>
                    </div>
                  )}
                </div>
              ))}

              {showFailedBubble && (
                <FailedMessageBubble
                  content={failedMessage!.content}
                  onRetry={() => sendMessage(lastUserMessage?.content)}
                />
              )}

              {isStreaming && (
                <div className="flex gap-3">
                  <div className="h-7 w-7 rounded-full bg-muted flex items-center justify-center shrink-0 mt-0.5">
                    <Bot className="h-3.5 w-3.5" />
                  </div>
                  <div className="max-w-[80%] rounded-2xl rounded-tl-sm bg-muted px-4 py-2.5 text-sm">
                    {(() => {
                      const planStart = streamingMsg.indexOf("<plan>");
                      const visibleText =
                        planStart === -1 ? streamingMsg : streamingMsg.slice(0, planStart).trim();
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

            {/* Input or closed banner */}
            <div className="p-3 border-t border-border">
              {isClosed ? (
                <div className="flex items-center justify-center gap-2 h-10 rounded-lg bg-muted px-4 text-sm text-muted-foreground">
                  Your training plan is active. Start a new Plan Making conversation to refine
                  another.
                </div>
              ) : (
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
              )}
            </div>
          </>
        ) : (
          /* No active conversation — show funnel */
          <div className="flex-1 overflow-y-auto min-h-0">
            {funnelStep === "mode" && (
              <ModeSelector
                onSelect={(mode) => setFunnelStep(mode === "advice" ? "advice" : "plan")}
              />
            )}
            {funnelStep === "advice" && (
              <AdviceFlow onStart={startAdvice} isLoading={isCreatingConv} />
            )}
            {funnelStep === "plan" && (
              <PlanFlow onStart={startPlan} isLoading={isCreatingConv} profile={profile} />
            )}
          </div>
        )}
      </div>

      {/* Plan import modal */}
      <Modal
        open={!!planToSave}
        onClose={() => setPlanToSave(null)}
        title="Import as Training Plan"
      >
        <p className="text-sm text-muted-foreground mb-4">
          The AI generated a structured plan. Save it as a Training Plan to review and assign
          workouts day by day.
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
