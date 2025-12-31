interface DateNavigationProps {
  date: string;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  isToday: boolean;
}

function formatDisplayDate(dateStr: string): string {
  const [year, month, day] = dateStr.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
  });
}

export function DateNavigation({
  date,
  onPrev,
  onNext,
  onToday,
  isToday,
}: DateNavigationProps) {
  return (
    <footer className="date-navigation">
      <button type="button" className="date-nav-btn" onClick={onPrev}>
        ← Prev
      </button>
      <div className="date-nav-center">
        <span className="date-nav-date">{formatDisplayDate(date)}</span>
        {!isToday && (
          <button type="button" className="date-nav-today" onClick={onToday}>
            Today
          </button>
        )}
      </div>
      <button type="button" className="date-nav-btn" onClick={onNext}>
        Next →
      </button>
    </footer>
  );
}
