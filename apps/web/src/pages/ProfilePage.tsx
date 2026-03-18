import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { User, Ruler, Target, Save, ChevronDown, ShieldAlert, Dumbbell } from "lucide-react";
import { api } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/date-picker";
import { Badge } from "@/components/ui/badge";
import { useAuthStore } from "@/store/auth";
import type { UserProfile, EquipmentOption } from "@fitforge/types";
import { EquipmentSelector } from "@/components/ui/equipment-selector";

// ─── Validation ───────────────────────────────────────────────────────────────

const profileSchema = z.object({
  displayName: z.string().min(2, "At least 2 characters").max(100),
  dateOfBirth: z.string().optional(),
  gender: z.string().optional(),
  heightCm: z.coerce.number().positive().optional().or(z.literal("")),
  unitPreference: z.enum(["metric", "imperial"]),
  fitnessGoal: z.string().optional(),
  experienceLevel: z.string().optional(),
  injuries: z.string().optional(),
  equipment: z.array(z.string()).min(1),
});

type ProfileFormValues = z.infer<typeof profileSchema>;

// ─── Select helper ────────────────────────────────────────────────────────────

function SelectField({
  label,
  id,
  options,
  value,
  onChange,
  error,
}: {
  label: string;
  id: string;
  options: { value: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
  error?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-foreground">
        {label}
      </label>
      <div className="relative">
        <select
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full appearance-none rounded-md border border-input bg-background px-3 py-2 pr-9 text-sm text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
        >
          <option value="">— select —</option>
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function ProfilePage() {
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const [saved, setSaved] = useState(false);

  const { data: profile, isLoading } = useQuery<UserProfile>({
    queryKey: ["me/profile"],
    queryFn: () => api.get<UserProfile>("/me/profile"),
  });

  const {
    register,
    handleSubmit,
    setValue,
    control,
    formState: { errors, isDirty },
    reset,
  } = useForm<ProfileFormValues>({
    resolver: zodResolver(profileSchema),
    values: profile
      ? {
          displayName: profile.displayName,
          dateOfBirth: profile.dateOfBirth?.slice(0, 10) ?? "",
          gender: profile.gender ?? "",
          heightCm: profile.heightCm ? Number(profile.heightCm) : ("" as const),
          unitPreference: profile.unitPreference,
          fitnessGoal: profile.fitnessGoal ?? "",
          experienceLevel: profile.experienceLevel ?? "",
          injuries: profile.injuries ?? "",
          equipment: profile.equipment ?? ["full_gym"],
        }
      : undefined,
  });

  const unitPref = useWatch({ control, name: "unitPreference" });
  const watchedDateOfBirth = useWatch({ control, name: "dateOfBirth" });
  const watchedGender = useWatch({ control, name: "gender" });
  const watchedFitnessGoal = useWatch({ control, name: "fitnessGoal" });
  const watchedExperienceLevel = useWatch({ control, name: "experienceLevel" });
  const watchedEquipment = useWatch({ control, name: "equipment" }) as EquipmentOption[];

  const mutation = useMutation({
    mutationFn: (data: ProfileFormValues) =>
      api.patch<UserProfile>("/me/profile", {
        ...data,
        heightCm: data.heightCm === "" ? null : Number(data.heightCm),
        dateOfBirth: data.dateOfBirth || null,
        gender: data.gender || null,
        fitnessGoal: data.fitnessGoal || null,
        experienceLevel: data.experienceLevel || null,
        injuries: data.injuries || null,
      }),
    onSuccess: (updated) => {
      qc.setQueryData(["me/profile"], updated);
      reset({
        displayName: updated.displayName,
        dateOfBirth: updated.dateOfBirth?.slice(0, 10) ?? "",
        gender: updated.gender ?? "",
        heightCm: updated.heightCm ? Number(updated.heightCm) : "",
        unitPreference: updated.unitPreference,
        fitnessGoal: updated.fitnessGoal ?? "",
        experienceLevel: updated.experienceLevel ?? "",
        injuries: updated.injuries ?? "",
        equipment: updated.equipment ?? ["full_gym"],
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    },
  });

  const onSubmit = (data: ProfileFormValues) => mutation.mutate(data);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6 p-4 md:p-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
          <User className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-foreground">Profile</h1>
          <p className="text-sm text-muted-foreground">{user?.email}</p>
        </div>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        {/* Personal info */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <User className="h-4 w-4" />
              Personal Info
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Input
                label="Display Name"
                {...register("displayName")}
                error={errors.displayName?.message}
              />
            </div>

            <DatePicker
              label="Date of Birth"
              value={watchedDateOfBirth ?? ""}
              onChange={(v) => setValue("dateOfBirth", v, { shouldDirty: true })}
              error={errors.dateOfBirth?.message}
              toDate={new Date()}
            />

            <SelectField
              label="Gender"
              id="gender"
              value={watchedGender ?? ""}
              onChange={(v) => setValue("gender", v, { shouldDirty: true })}
              options={[
                { value: "male", label: "Male" },
                { value: "female", label: "Female" },
                { value: "non_binary", label: "Non-binary" },
                { value: "prefer_not_to_say", label: "Prefer not to say" },
              ]}
            />
          </CardContent>
        </Card>

        {/* Physical */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Ruler className="h-4 w-4" />
              Physical
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Input
              label={`Height (${unitPref === "imperial" ? "in" : "cm"})`}
              type="number"
              step="0.1"
              {...register("heightCm")}
              error={errors.heightCm?.message}
            />

            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-foreground">Unit Preference</span>
              <div className="flex gap-2">
                {(["metric", "imperial"] as const).map((u) => (
                  <button
                    key={u}
                    type="button"
                    onClick={() => setValue("unitPreference", u, { shouldDirty: true })}
                    className={[
                      "flex-1 rounded-md border px-3 py-2 text-sm font-medium transition-colors",
                      unitPref === u
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-input bg-background text-foreground hover:bg-muted",
                    ].join(" ")}
                  >
                    {u.charAt(0).toUpperCase() + u.slice(1)}
                  </button>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Fitness */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Target className="h-4 w-4" />
              Fitness
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <SelectField
              label="Primary Goal"
              id="fitnessGoal"
              value={watchedFitnessGoal ?? ""}
              onChange={(v) => setValue("fitnessGoal", v, { shouldDirty: true })}
              options={[
                { value: "hypertrophy", label: "Muscle Building" },
                { value: "strength", label: "Strength" },
                { value: "endurance", label: "Endurance" },
                { value: "weight_loss", label: "Weight Loss" },
                { value: "general_fitness", label: "General Fitness" },
                { value: "running", label: "Running" },
              ]}
            />

            <SelectField
              label="Experience Level"
              id="experienceLevel"
              value={watchedExperienceLevel ?? ""}
              onChange={(v) => setValue("experienceLevel", v, { shouldDirty: true })}
              options={[
                { value: "beginner", label: "Beginner (< 1 year)" },
                { value: "intermediate", label: "Intermediate (1–3 years)" },
                { value: "advanced", label: "Advanced (3+ years)" },
              ]}
            />
          </CardContent>
        </Card>

        {/* Equipment */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Dumbbell className="h-4 w-4" />
              Equipment
            </CardTitle>
          </CardHeader>
          <CardContent>
            <EquipmentSelector
              value={watchedEquipment ?? ["full_gym"]}
              onChange={(v) => setValue("equipment", v, { shouldDirty: true })}
            />
          </CardContent>
        </Card>

        {/* Injuries */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ShieldAlert className="h-4 w-4" />
              Injuries &amp; Limitations
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="injuries" className="text-sm font-medium text-foreground">
                Injuries / Physical Limitations
              </label>
              <textarea
                id="injuries"
                {...register("injuries")}
                rows={3}
                placeholder="e.g. Lower back pain, left shoulder impingement…"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground shadow-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none"
              />
              <p className="text-xs text-muted-foreground">
                This information helps the AI coach tailor advice and avoid exercises that may
                aggravate your condition.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Save */}
        <div className="flex items-center justify-between">
          {mutation.isError && (
            <p className="text-sm text-destructive">{(mutation.error as Error).message}</p>
          )}
          {saved && (
            <Badge variant="success" className="text-sm">
              Saved!
            </Badge>
          )}
          <div className="ml-auto">
            <Button
              type="submit"
              disabled={!isDirty || mutation.isPending}
              loading={mutation.isPending}
            >
              <Save className="h-4 w-4 mr-2" />
              Save Changes
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}
