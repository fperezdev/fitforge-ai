import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, CalendarRange } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { api } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";

// ─── Types ────────────────────────────────────────────────────────────────────

interface TrainingPlan {
  id: string;
  name: string;
  description: string | null;
  status: "draft" | "active" | "completed";
  microcycleLength: number;
  mesocycleLength: number;
  updatedAt: string;
}

// ─── Schema ───────────────────────────────────────────────────────────────────

const newPlanSchema = z.object({
  name: z.string().min(1, "Name required"),
  description: z.string().optional(),
  microcycleLength: z.number().int().min(1).max(31),
  mesocycleLength: z.number().int().min(1).max(52),
});

type NewPlanForm = z.infer<typeof newPlanSchema>;

// ─── Plan Card ────────────────────────────────────────────────────────────────

const STATUS_COLORS = {
  draft: "secondary",
  active: "success",
  completed: "default",
} as const;

function PlanCard({
  plan,
  onClick,
  onDelete,
}: {
  plan: TrainingPlan;
  onClick: () => void;
  onDelete: (id: string) => void;
}) {
  return (
    <Card
      className="hover:border-primary/50 transition-colors cursor-pointer group"
      onClick={onClick}
    >
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle className="text-base">{plan.name}</CardTitle>
            {plan.description && (
              <p className="text-sm text-muted-foreground mt-0.5">
                {plan.description}
              </p>
            )}
          </div>
          <div className="flex items-center gap-1">
            <Badge variant={STATUS_COLORS[plan.status]}>
              {plan.status.charAt(0).toUpperCase() + plan.status.slice(1)}
            </Badge>
            <Button
              variant="ghost"
              size="icon"
              onClick={(e) => { e.stopPropagation(); onDelete(plan.id); }}
              aria-label="Delete plan"
              className="opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <Trash2 className="h-3.5 w-3.5 text-destructive" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex gap-3 text-sm text-muted-foreground">
          <span>{plan.mesocycleLength} week{plan.mesocycleLength !== 1 ? "s" : ""}</span>
          <span>·</span>
          <span>{plan.microcycleLength} days/week</span>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── New Plan Modal ───────────────────────────────────────────────────────────

function NewPlanModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<NewPlanForm>({
    resolver: zodResolver(newPlanSchema),
    defaultValues: { microcycleLength: 7, mesocycleLength: 4 },
  });

  const createMutation = useMutation({
    mutationFn: (data: NewPlanForm) => api.post<TrainingPlan>("/plans", data),
    onSuccess: (plan) => {
      queryClient.invalidateQueries({ queryKey: ["plans"] });
      reset();
      onClose();
      navigate(`/planner/plans/${plan.id}`);
    },
  });

  return (
    <Modal open={open} onClose={onClose} title="New training plan">
      <form
        onSubmit={handleSubmit((d) => createMutation.mutate(d))}
        className="space-y-4"
        noValidate
      >
        <Input
          label="Plan name"
          placeholder="e.g. Hypertrophy Block A"
          error={errors.name?.message}
          {...register("name")}
        />
        <Input
          label="Description (optional)"
          placeholder="Goal, notes…"
          {...register("description")}
        />
        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Days per week"
            type="number"
            min={1}
            max={31}
            error={errors.microcycleLength?.message}
            {...register("microcycleLength", { valueAsNumber: true })}
          />
          <Input
            label="Number of weeks"
            type="number"
            min={1}
            max={52}
            error={errors.mesocycleLength?.message}
            {...register("mesocycleLength", { valueAsNumber: true })}
          />
        </div>
        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={isSubmitting || createMutation.isPending}>
            Create plan
          </Button>
        </div>
      </form>
    </Modal>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export function PlannerPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [planModalOpen, setPlanModalOpen] = useState(false);

  const { data: plans = [] } = useQuery<TrainingPlan[]>({
    queryKey: ["plans"],
    queryFn: () => api.get("/plans"),
  });

  const deletePlan = useMutation({
    mutationFn: (id: string) => api.delete(`/plans/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["plans"] }),
  });

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Training Plans</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {plans.length} plan{plans.length !== 1 ? "s" : ""}
          </p>
        </div>
        <Button onClick={() => setPlanModalOpen(true)}>
          <Plus className="h-4 w-4" />
          New plan
        </Button>
      </div>

      {/* Plan list */}
      {plans.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <CalendarRange className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground">
              No training plans yet. Create one or ask the{" "}
              <span className="text-primary">AI Coach</span> to generate a plan.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {plans.map((p) => (
            <PlanCard
              key={p.id}
              plan={p}
              onClick={() => navigate(`/planner/plans/${p.id}`)}
              onDelete={(id) => deletePlan.mutate(id)}
            />
          ))}
        </div>
      )}

      <NewPlanModal
        open={planModalOpen}
        onClose={() => setPlanModalOpen(false)}
      />
    </div>
  );
}
