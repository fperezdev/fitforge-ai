import type { EquipmentOption } from "@fitforge/types";

export type EquipmentGroup = {
  label: string;
  items: { value: EquipmentOption; label: string }[];
};

export const EQUIPMENT_GROUPS: EquipmentGroup[] = [
  {
    label: "Free Weights",
    items: [
      { value: "barbell", label: "Barbell + plates" },
      { value: "rack", label: "Squat / power rack" },
      { value: "dumbbells", label: "Dumbbells" },
      { value: "kettlebells", label: "Kettlebells" },
      { value: "ez_bar", label: "EZ bar" },
    ],
  },
  {
    label: "Cables & Machines",
    items: [
      { value: "cables", label: "Cable machine" },
      { value: "smith_machine", label: "Smith machine" },
      { value: "leg_press", label: "Leg press" },
      { value: "leg_curl_machine", label: "Leg curl" },
      { value: "leg_extension_machine", label: "Leg extension" },
      { value: "calf_raise_machine", label: "Calf raise machine" },
      { value: "chest_fly_machine", label: "Pec deck / chest fly" },
      { value: "lat_pulldown_machine", label: "Lat pulldown" },
      { value: "seated_row_machine", label: "Seated row" },
      { value: "hack_squat_machine", label: "Hack squat machine" },
      { value: "hip_thrust_machine", label: "Hip thrust machine" },
      { value: "shoulder_press_machine", label: "Shoulder press machine" },
      { value: "bicep_curl_machine", label: "Bicep curl machine" },
      { value: "tricep_machine", label: "Tricep machine" },
    ],
  },
  {
    label: "Bodyweight / Minimal",
    items: [
      { value: "pullup_bar", label: "Pull-up bar" },
      { value: "dip_bars", label: "Dip bars" },
      { value: "bands", label: "Resistance bands" },
      { value: "bodyweight", label: "Bodyweight only" },
    ],
  },
];
