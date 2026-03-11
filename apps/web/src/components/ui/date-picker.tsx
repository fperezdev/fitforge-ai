import * as React from "react";
import { DayPicker, useDayPicker } from "react-day-picker";
import { format, parse, isValid, setMonth, setYear, getYear, getMonth } from "date-fns";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Caption: prev / [Month] [Year] / next ────────────────────────────────────

function CaptionWithDropdowns() {
  const { months: calMonths, goToMonth, previousMonth, nextMonth, dayPickerProps } = useDayPicker();
  const currentMonth = calMonths[0]?.date ?? new Date();
  const fromDate = (dayPickerProps as { fromDate?: Date }).fromDate;
  const toDate   = (dayPickerProps as { toDate?: Date }).toDate;

  const minYear = fromDate ? getYear(fromDate) : 1900;
  const maxYear = toDate   ? getYear(toDate)   : getYear(new Date());

  const years = React.useMemo(() => {
    const arr: number[] = [];
    for (let y = maxYear; y >= minYear; y--) arr.push(y);
    return arr;
  }, [minYear, maxYear]);

  const monthNames = [
    "January","February","March","April",
    "May","June","July","August",
    "September","October","November","December",
  ];

  const navBtnCls = cn(
    "h-7 w-7 shrink-0 rounded-md flex items-center justify-center",
    "text-muted-foreground hover:bg-muted hover:text-foreground transition-colors",
    "disabled:opacity-30 disabled:cursor-not-allowed"
  );

  const selectCls = cn(
    "rounded border border-border bg-background px-1.5 py-1 text-sm font-semibold text-foreground",
    "focus:outline-none focus:ring-2 focus:ring-ring cursor-pointer"
  );

  return (
    <div className="flex items-center gap-1 w-full px-1">
      <button
        type="button"
        aria-label="Go to the Previous Month"
        disabled={!previousMonth}
        onClick={() => previousMonth && goToMonth(previousMonth)}
        className={navBtnCls}
      >
        <ChevronLeft className="h-4 w-4" />
      </button>

      <div className="flex flex-1 items-center justify-center gap-1">
        <select
          aria-label="Month"
          value={getMonth(currentMonth)}
          onChange={(e) => goToMonth(setMonth(currentMonth, Number(e.target.value)))}
          className={selectCls}
        >
          {monthNames.map((m, i) => (
            <option key={m} value={i}>{m}</option>
          ))}
        </select>
        <select
          aria-label="Year"
          value={getYear(currentMonth)}
          onChange={(e) => goToMonth(setYear(currentMonth, Number(e.target.value)))}
          className={selectCls}
        >
          {years.map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
      </div>

      <button
        type="button"
        aria-label="Go to the Next Month"
        disabled={!nextMonth}
        onClick={() => nextMonth && goToMonth(nextMonth)}
        className={navBtnCls}
      >
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  );
}

// ─── Calendar ─────────────────────────────────────────────────────────────────

function Calendar({
  className,
  ...props
}: React.ComponentProps<typeof DayPicker>) {
  return (
    <DayPicker
      showOutsideDays
      className={cn("p-3", className)}
      classNames={{
        months:        "flex flex-col",
        month:         "space-y-3",
        month_caption: "flex items-center h-9",
        caption_label: "hidden",
        // Hide the built-in Nav — we render prev/next inside CaptionWithDropdowns
        nav:           "hidden",
        button_previous: "hidden",
        button_next:     "hidden",
        month_grid:    "w-full border-collapse table-fixed",
        // thead / th — table layout, no flex override
        weekdays:      "",
        weekday:       "text-muted-foreground text-center text-xs font-medium pb-1",
        // tbody / tr — table layout
        week:          "",
        day:           "text-center text-sm p-0",
        day_button:    cn(
          "flex items-center justify-center w-full h-9 rounded-md font-normal transition-colors",
          "hover:bg-muted hover:text-foreground",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        ),
        selected:  "[&>button]:bg-primary [&>button]:text-primary-foreground [&>button]:hover:bg-primary",
        today:     "[&>button]:font-bold [&>button]:ring-1 [&>button]:ring-primary",
        outside:   "[&>button]:text-muted-foreground [&>button]:opacity-40",
        disabled:  "[&>button]:text-muted-foreground [&>button]:opacity-30 [&>button]:cursor-not-allowed",
        hidden:    "invisible",
      }}
      components={{
        // Suppress the built-in Chevron — nav is hidden anyway
        Chevron: () => <></>,
        MonthCaption: () => <CaptionWithDropdowns />,
      }}
      {...props}
    />
  );
}

// ─── DatePicker ───────────────────────────────────────────────────────────────

export interface DatePickerProps {
  /** ISO date string "YYYY-MM-DD" or empty string */
  value?: string;
  onChange?: (value: string) => void;
  label?: string;
  error?: string;
  placeholder?: string;
  disabled?: boolean;
  /** Latest selectable date (defaults to today) */
  toDate?: Date;
  /** Earliest selectable date */
  fromDate?: Date;
  id?: string;
}

export function DatePicker({
  value,
  onChange,
  label,
  error,
  placeholder = "Pick a date",
  disabled,
  toDate = new Date(),
  fromDate,
  id,
}: DatePickerProps) {
  const inputId = id ?? label?.toLowerCase().replace(/\s+/g, "-");
  const [open, setOpen] = React.useState(false);
  const containerRef = React.useRef<HTMLDivElement>(null);

  const selected = React.useMemo(() => {
    if (!value) return undefined;
    const d = parse(value, "yyyy-MM-dd", new Date());
    return isValid(d) ? d : undefined;
  }, [value]);

  // Close on outside click or Escape
  React.useEffect(() => {
    if (!open) return;
    function handleDown(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handleDown);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleDown);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  function handleSelect(day: Date | undefined) {
    onChange?.(day ? format(day, "yyyy-MM-dd") : "");
    setOpen(false);
  }

  return (
    <div ref={containerRef} className="flex flex-col gap-1.5">
      {label && (
        <label htmlFor={inputId} className="text-sm font-medium text-foreground">
          {label}
        </label>
      )}

      <div className="relative">
        <button
          id={inputId}
          type="button"
          disabled={disabled}
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-haspopup="dialog"
          className={cn(
            "flex h-10 w-full items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm text-left",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            "disabled:cursor-not-allowed disabled:opacity-50",
            !selected && "text-muted-foreground",
            error && "border-destructive"
          )}
        >
          <CalendarDays className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="flex-1 truncate">
            {selected ? format(selected, "PPP") : placeholder}
          </span>
        </button>

        {open && (
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Date picker calendar"
            className="absolute z-50 mt-1 w-auto min-w-[280px] rounded-xl border border-border bg-card shadow-lg"
          >
            <Calendar
              mode="single"
              selected={selected}
              onSelect={handleSelect}
              defaultMonth={selected ?? new Date()}
              fromDate={fromDate}
              toDate={toDate}
              disabled={[
                ...(fromDate ? [{ before: fromDate }] : []),
                ...(toDate   ? [{ after:  toDate   }] : []),
              ]}
            />
          </div>
        )}
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
