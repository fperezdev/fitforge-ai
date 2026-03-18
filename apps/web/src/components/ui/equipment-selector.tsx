import type { EquipmentOption } from "@fitforge/types";
import { cn } from "@/lib/utils";
import { EQUIPMENT_GROUPS } from "./equipment-groups";

export type { EquipmentGroup } from "./equipment-groups";
export { EQUIPMENT_GROUPS } from "./equipment-groups";

// ─── Component ────────────────────────────────────────────────────────────────

export function EquipmentSelector({
  value,
  onChange,
}: {
  value: EquipmentOption[];
  onChange: (v: EquipmentOption[]) => void;
}) {
  const isFullGym = value.includes("full_gym");

  function toggleFullGym() {
    onChange(["full_gym"]);
  }

  function toggleItem(item: EquipmentOption) {
    const next = isFullGym
      ? [item]
      : value.includes(item)
        ? value.filter((v) => v !== item)
        : [...value, item];
    onChange(next.length === 0 ? ["full_gym"] : next);
  }

  const btnBase =
    "rounded-md border px-3 py-1.5 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-ring";
  const active = "border-primary bg-primary text-primary-foreground";
  const inactive = "border-input bg-background text-foreground hover:bg-muted";

  return (
    <div className="space-y-4">
      {/* Full Gym — full width */}
      <button
        type="button"
        onClick={toggleFullGym}
        className={cn(btnBase, "w-full", isFullGym ? active : inactive)}
      >
        Full Gym — no restriction
      </button>

      {/* Groups */}
      {EQUIPMENT_GROUPS.map((group) => (
        <div key={group.label} className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {group.label}
          </p>
          <div className="flex flex-wrap gap-2">
            {group.items.map((item) => {
              const selected = !isFullGym && value.includes(item.value);
              return (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => toggleItem(item.value)}
                  className={cn(btnBase, selected ? active : inactive)}
                >
                  {item.label}
                </button>
              );
            })}
          </div>
        </div>
      ))}

      <p className="text-xs text-muted-foreground">
        Select the equipment you have available. Helps tailor workouts and plan suggestions to your
        setup.
      </p>
    </div>
  );
}
