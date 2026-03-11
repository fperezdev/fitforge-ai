import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, Pencil } from "lucide-react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { api } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";

interface Exercise {
  id: string;
  name: string;
  category: string;
}

interface Template {
  id: string;
  name: string;
  description: string | null;
  templateExercises: Array<{
    id: string;
    order: number;
    targetSets: number;
    targetRepMin: number;
    targetRepMax: number;
    restSeconds: number | null;
    exercise: Exercise;
  }>;
}

const templateSchema = z.object({
  name: z.string().min(1, "Name required"),
  description: z.string().optional(),
  exercises: z.array(
    z.object({
      exerciseId: z.string().min(1, "Required"),
      order: z.number().int().min(1),
      targetSets: z.number().int().min(1),
      targetRepMin: z.number().int().min(1),
      targetRepMax: z.number().int().min(1),
      restSeconds: z.number().int().optional().nullable(),
    })
  ),
});

type TemplateForm = z.infer<typeof templateSchema>;

function TemplateCard({
  template,
  onEdit,
  onDelete,
}: {
  template: Template;
  onEdit: (t: Template) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <Card className="hover:border-primary/50 transition-colors cursor-pointer group">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle className="text-base">{template.name}</CardTitle>
            {template.description && (
              <p className="text-sm text-muted-foreground mt-0.5">
                {template.description}
              </p>
            )}
          </div>
          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <Button
              variant="ghost"
              size="icon"
              onClick={(e) => {
                e.stopPropagation();
                onEdit(template);
              }}
              aria-label="Edit template"
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={(e) => {
                e.stopPropagation();
                onDelete(template.id);
              }}
              aria-label="Delete template"
            >
              <Trash2 className="h-3.5 w-3.5 text-destructive" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap gap-1.5">
          {template.templateExercises.map((ex) => (
            <Badge key={ex.id} variant="secondary">
              {ex.exercise.name} {ex.targetSets}×{ex.targetRepMin}–{ex.targetRepMax}
            </Badge>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export function PlannerPage() {
  const queryClient = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Template | null>(null);

  const { data: templates = [] } = useQuery<Template[]>({
    queryKey: ["templates"],
    queryFn: () => api.get("/templates"),
  });

  const { data: exercises = [] } = useQuery<Exercise[]>({
    queryKey: ["exercises"],
    queryFn: () => api.get("/exercises"),
  });

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<TemplateForm>({
    resolver: zodResolver(templateSchema),
    defaultValues: { exercises: [] },
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: "exercises",
  });

  const saveMutation = useMutation({
    mutationFn: (data: TemplateForm) =>
      editing
        ? api.put(`/templates/${editing.id}`, data)
        : api.post("/templates", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["templates"] });
      setModalOpen(false);
      setEditing(null);
      reset({ exercises: [] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/templates/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["templates"] }),
  });

  function openCreate() {
    setEditing(null);
    reset({ name: "", description: "", exercises: [] });
    setModalOpen(true);
  }

  function openEdit(template: Template) {
    setEditing(template);
    reset({
      name: template.name,
      description: template.description ?? "",
      exercises: template.templateExercises.map((ex) => ({
        exerciseId: ex.exercise.id,
        order: ex.order,
        targetSets: ex.targetSets,
        targetRepMin: ex.targetRepMin,
        targetRepMax: ex.targetRepMax,
        restSeconds: ex.restSeconds,
      })),
    });
    setModalOpen(true);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Workout Planner</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {templates.length} template{templates.length !== 1 ? "s" : ""}
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4" />
          New template
        </Button>
      </div>

      {templates.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <p className="text-muted-foreground">
              No templates yet. Create one or ask the{" "}
              <span className="text-primary">AI Coach</span> to generate a plan.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {templates.map((t) => (
            <TemplateCard
              key={t.id}
              template={t}
              onEdit={openEdit}
              onDelete={(id) => deleteMutation.mutate(id)}
            />
          ))}
        </div>
      )}

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? "Edit template" : "New template"}
        className="max-w-2xl max-h-[90vh] overflow-y-auto"
      >
        <form
          onSubmit={handleSubmit((d) => saveMutation.mutate(d))}
          className="space-y-5"
          noValidate
        >
          <Input
            label="Template name"
            placeholder="e.g. Push A – Chest & Shoulders"
            error={errors.name?.message}
            {...register("name")}
          />
          <Input
            label="Description (optional)"
            placeholder="Brief notes about this template"
            {...register("description")}
          />

          {/* Exercises */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium">Exercises</label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  append({
                    exerciseId: "",
                    order: fields.length + 1,
                    targetSets: 3,
                    targetRepMin: 8,
                    targetRepMax: 12,
                    restSeconds: 90,
                  })
                }
              >
                <Plus className="h-3.5 w-3.5" />
                Add exercise
              </Button>
            </div>

            <div className="space-y-3">
              {fields.map((field, i) => (
                <div
                  key={field.id}
                  className="rounded-lg border border-border p-3 space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-muted-foreground">
                      Exercise {i + 1}
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => remove(i)}
                      aria-label="Remove exercise"
                    >
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  </div>

                  <div>
                    <label className="text-sm font-medium mb-1.5 block">
                      Exercise
                    </label>
                    <select
                      className="w-full h-10 rounded-lg border border-border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                      {...register(`exercises.${i}.exerciseId`)}
                    >
                      <option value="">Select exercise…</option>
                      {exercises.map((ex) => (
                        <option key={ex.id} value={ex.id}>
                          {ex.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="grid grid-cols-4 gap-2">
                    <Input
                      label="Sets"
                      type="number"
                      min={1}
                      {...register(`exercises.${i}.targetSets`, {
                        valueAsNumber: true,
                      })}
                    />
                    <Input
                      label="Rep min"
                      type="number"
                      min={1}
                      {...register(`exercises.${i}.targetRepMin`, {
                        valueAsNumber: true,
                      })}
                    />
                    <Input
                      label="Rep max"
                      type="number"
                      min={1}
                      {...register(`exercises.${i}.targetRepMax`, {
                        valueAsNumber: true,
                      })}
                    />
                    <Input
                      label="Rest (s)"
                      type="number"
                      min={0}
                      {...register(`exercises.${i}.restSeconds`, {
                        valueAsNumber: true,
                      })}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setModalOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              loading={isSubmitting || saveMutation.isPending}
            >
              {editing ? "Save changes" : "Create template"}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
