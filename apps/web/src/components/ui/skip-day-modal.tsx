import { SkipForward } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";

interface SkipDayModalProps {
  open: boolean;
  workoutName: string | null;
  weekIndex: number;
  dayIndex: number;
  isPending: boolean;
  isError: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

export function SkipDayModal({
  open,
  workoutName,
  weekIndex,
  dayIndex,
  isPending,
  isError,
  onConfirm,
  onClose,
}: SkipDayModalProps) {
  return (
    <Modal open={open} onClose={onClose} title="Skip this workout?">
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Week {weekIndex + 1} · Day {dayIndex + 1}
          {workoutName && (
            <>
              {" — "}
              <span className="font-medium text-foreground">{workoutName}</span>
            </>
          )}{" "}
          will be marked as skipped. The next planned day will be shown instead.
        </p>
        {isError && (
          <p className="text-sm text-destructive">Failed to skip — please try again.</p>
        )}
        <div className="flex justify-end gap-3 pt-1">
          <Button variant="outline" onClick={onClose} disabled={isPending}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={onConfirm}
            loading={isPending}
          >
            <SkipForward className="h-4 w-4" />
            Skip workout
          </Button>
        </div>
      </div>
    </Modal>
  );
}
