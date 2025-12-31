import { useMemo } from "react";
import { formatDateLocal } from "../lib/api";

interface MonthCalendarProps {
  month: string; // YYYY-MM
  selectedDate: string; // YYYY-MM-DD
  counts: Record<string, number>;
  onSelectDate: (date: string) => void;
  onChangeMonth: (month: string) => void;
  loading?: boolean;
  error?: string | null;
}

const weekdayLabels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function monthToDate(month: string): Date {
  const [year, monthStr] = month.split("-").map(Number);
  return new Date(year, monthStr - 1, 1);
}

function formatMonthLabel(month: string): string {
  const date = monthToDate(month);
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
  });
}

function toMonthString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

function getCountClass(count: number): string {
  if (count <= 0) return "";
  if (count <= 2) return "count-low";
  if (count <= 5) return "count-med";
  return "count-high";
}

export function MonthCalendar({
  month,
  selectedDate,
  counts,
  onSelectDate,
  onChangeMonth,
  loading,
  error,
}: MonthCalendarProps) {
  const { days, monthTotal, activeDays, maxCount } = useMemo(() => {
    const firstDay = monthToDate(month);
    const monthIndex = firstDay.getMonth();
    const year = firstDay.getFullYear();
    const startOffset = (firstDay.getDay() + 6) % 7; // Monday = 0
    const totalCells = 42;
    const items: Array<{
      date: Date;
      dateStr: string;
      inMonth: boolean;
      count: number;
      countClass: string;
    }> = [];

    let total = 0;
    let active = 0;
    let max = 0;

    for (let i = 0; i < totalCells; i++) {
      const dayDate = new Date(year, monthIndex, 1 - startOffset + i);
      const dateStr = formatDateLocal(dayDate);
      const inMonth = dayDate.getMonth() === monthIndex;
      const count = counts[dateStr] ?? 0;
      const countClass = getCountClass(count);

      if (inMonth && count > 0) {
        total += count;
        active += 1;
        if (count > max) max = count;
      }

      items.push({
        date: dayDate,
        dateStr,
        inMonth,
        count,
        countClass,
      });
    }

    return { days: items, monthTotal: total, activeDays: active, maxCount: max };
  }, [month, counts]);

  const todayStr = formatDateLocal(new Date());

  const handlePrevMonth = () => {
    const current = monthToDate(month);
    const prev = new Date(current.getFullYear(), current.getMonth() - 1, 1);
    onChangeMonth(toMonthString(prev));
  };

  const handleNextMonth = () => {
    const current = monthToDate(month);
    const next = new Date(current.getFullYear(), current.getMonth() + 1, 1);
    onChangeMonth(toMonthString(next));
  };

  return (
    <div className="calendar">
      <div className="calendar-header">
        <button
          type="button"
          className="calendar-nav"
          onClick={handlePrevMonth}
          title="Previous month"
        >
          ‹
        </button>
        <div className="calendar-title">{formatMonthLabel(month)}</div>
        <button
          type="button"
          className="calendar-nav"
          onClick={handleNextMonth}
          title="Next month"
        >
          ›
        </button>
      </div>

      <div className="calendar-meta">
        <div className="calendar-stat">
          <div className="calendar-stat-value">{monthTotal}</div>
          <div className="calendar-stat-label">logs</div>
        </div>
        <div className="calendar-stat">
          <div className="calendar-stat-value">{activeDays}</div>
          <div className="calendar-stat-label">days</div>
        </div>
        <div className="calendar-stat">
          <div className="calendar-stat-value">{maxCount}</div>
          <div className="calendar-stat-label">max/day</div>
        </div>
      </div>

      <div className="calendar-grid">
        {weekdayLabels.map((label) => (
          <div key={label} className="calendar-weekday">
            {label}
          </div>
        ))}
        {days.map((day) => {
          const isSelected = day.dateStr === selectedDate;
          const isToday = day.dateStr === todayStr;
          return (
            <button
              type="button"
              key={day.dateStr + day.inMonth}
              className={[
                "calendar-day",
                day.inMonth ? "in-month" : "out-month",
                day.countClass,
                isSelected ? "is-selected" : "",
                isToday ? "is-today" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              onClick={() => onSelectDate(day.dateStr)}
            >
              <span className="calendar-day-number">{day.date.getDate()}</span>
              {day.inMonth && day.count > 0 && (
                <span className="calendar-day-count">{day.count}</span>
              )}
            </button>
          );
        })}
      </div>

      {loading && <div className="calendar-loading">Loading month…</div>}
      {error && <div className="calendar-error">{error}</div>}
    </div>
  );
}
