import { useNavigate, Link } from "react-router-dom";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { CalendarRange, Plus } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EQUIPMENT_GROUPS } from "@/components/ui/equipment-selector";
import type { UserProfile, EquipmentOption } from "@fitforge/types";

// ─── Schema ───────────────────────────────────────────────────────────────────

const newPlanSchema = z.object({
  name: z.string().min(1, "Name required"),
  description: z.string().optional(),
  microcycleLength: z.number().int().min(1).max(31),
  mesocycleLength: z.number().int().min(1).max(52),
});

type NewPlanForm = z.infer<typeof newPlanSchema>;

// ─── Main Page ────────────────────────────────────────────────────────────────

export function PlannerPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: profile } = useQuery<UserProfile>({
    queryKey: ["me/profile"],
    queryFn: () => api.get<UserProfile>("/me/profile"),
  });

  // Resolve display labels for the user's equipment
  const equipmentLabels: string[] = (() => {
    const eq: EquipmentOption[] = profile?.equipment ?? ["full_gym"];
    if (eq.includes("full_gym")) return ["Full Gym"];
    const allItems = EQUIPMENT_GROUPS.flatMap((g) => g.items);
    return eq.map((v) => allItems.find((i) => i.value === v)?.label ?? v);
  })();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<NewPlanForm>({
    resolver: zodResolver(newPlanSchema),
    defaultValues: { microcycleLength: 5, mesocycleLength: 4 },
  });

  const createMutation = useMutation({
    mutationFn: (data: NewPlanForm) => api.post<{ id: string }>("/plans", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["plans"] });
      navigate("/plan", { replace: true });
    },
  });

  return (
    <div className="flex flex-col items-center justify-center py-16 px-4">
      <div className="w-full max-w-sm space-y-8">
        {/* Icon + heading */}
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="rounded-full bg-muted p-5">
            <CalendarRange className="h-10 w-10 text-muted-foreground" />
          </div>
          <div className="space-y-1">
            <h1 className="text-2xl font-bold">Create your training plan</h1>
            <p className="text-sm text-muted-foreground">
              Set up your plan structure. You can assign workouts to each day after.
            </p>
          </div>
        </div>

        {/* Create form */}
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
          <Button
            type="submit"
            className="w-full"
            loading={isSubmitting || createMutation.isPending}
          >
            <Plus className="h-4 w-4" />
            Create plan
          </Button>

          {/* Equipment summary — read-only, driven by profile */}
          <div className="rounded-md border border-input bg-muted/40 px-3 py-2.5 space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Equipment
              </span>
              <Link to="/profile" className="text-xs text-primary hover:underline shrink-0">
                Change in Profile →
              </Link>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {equipmentLabels.map((label) => (
                <span
                  key={label}
                  className="inline-flex items-center rounded-full border border-input bg-background px-2.5 py-0.5 text-xs font-medium text-foreground"
                >
                  {label}
                </span>
              ))}
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
