export const MUSCLE_LABELS: Record<string, string> = {
  chest: "Chest",
  back: "Back",
  lats: "Lats",
  traps: "Traps",
  anterior_deltoids: "Anterior Deltoids",
  lateral_deltoids: "Lateral Deltoids",
  posterior_deltoids: "Posterior Deltoids",
  biceps: "Biceps",
  triceps: "Triceps",
  forearms: "Forearms",
  core: "Core",
  obliques: "Obliques",
  glutes: "Glutes",
  quadriceps: "Quadriceps",
  hamstrings: "Hamstrings",
  calves: "Calves",
  soleus: "Soleus",
  hip_flexors: "Hip Flexors",
  adductors: "Adductors",
  full_body: "Full Body",
  other: "Other",
};

export function muscleLabel(key: string): string {
  return MUSCLE_LABELS[key] ?? key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
