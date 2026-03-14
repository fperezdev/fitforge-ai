import { useState } from "react";
import { CalendarClock, SkipForward } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";

interface SkipDayModalProps {
  open: boolean;
  workoutName: string | null;
  weekIndex: number;
  dayIndex: number;
  isPending: boolean;
  isSkipError: boolean;
  isMoveError: boolean;
  onSkip: (notes?: string) => void;
  onMove: () => void;
  onClose: () => void;
}

export function SkipDayModal({
  open,
  workoutName,
  weekIndex,
  dayIndex,
  isPending,
  isSkipError,
  isMoveError,
  onSkip,
  onMove,
  onClose,
}: SkipDayModalProps) {
  const [skipNotes, setSkipNotes] = useState("");

  function handleClose() {
    setSkipNotes("");
    onClose();
  }

  return (
    <Modal open={open} onClose={handleClose} title="What would you like to do?">
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Week {weekIndex + 1} · Day {dayIndex + 1}
          {workoutName && (
            <>
              {" — "}
              <span className="font-medium text-foreground">{workoutName}</span>
            </>
          )}
        </p>

        <div className="grid grid-cols-2 gap-3">
          {/* Move option */}
          <button
            type="button"
            disabled={isPending}
            onClick={onMove}
            className="flex flex-col items-center gap-2 rounded-lg border border-border bg-muted/30 px-3 py-4 text-center transition-colors hover:border-primary/50 hover:bg-primary/5 disabled:opacity-50"
          >
            <CalendarClock className="h-5 w-5 text-primary" />
            <span className="text-sm font-medium">Move to tomorrow</span>
            <span className="text-xs text-muted-foreground">Schedule shifts forward 1 day</span>
          </button>

          {/* Skip option */}
          <button
            type="button"
            disabled={isPending}
            onClick={() => {
              onSkip(skipNotes || undefined);
              setSkipNotes("");
            }}
            className="flex flex-col items-center gap-2 rounded-lg border border-border bg-muted/30 px-3 py-4 text-center transition-colors hover:border-destructive/50 hover:bg-destructive/5 disabled:opacity-50"
          >
            <SkipForward className="h-5 w-5 text-destructive" />
            <span className="text-sm font-medium">Skip day</span>
            <span className="text-xs text-muted-foreground">Mark as skipped, no reschedule</span>
          </button>
        </div>

        {/* Optional skip reason */}
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="skip-notes"
            className="text-xs font-medium text-muted-foreground uppercase tracking-wide"
          >
            Reason for skipping (optional)
          </label>
          <textarea
            id="skip-notes"
            value={skipNotes}
            onChange={(e) => setSkipNotes(e.target.value)}
            rows={2}
            placeholder="e.g. Feeling tired, travelling…"
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground shadow-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none"
          />
        </div>

        {(isSkipError || isMoveError) && (
          <p className="text-sm text-destructive">
            {isMoveError ? "Failed to move day" : "Failed to skip day"} — please try again.
          </p>
        )}

        <div className="flex justify-end pt-1">
          <Button variant="outline" onClick={handleClose} disabled={isPending}>
            Cancel
          </Button>
        </div>
      </div>
    </Modal>
  );
}
