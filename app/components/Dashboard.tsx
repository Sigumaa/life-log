import { useState, useEffect, useCallback, useMemo } from "react";
import { LogInput } from "./LogInput";
import { QuickButtons } from "./QuickButtons";
import { LogTimeline } from "./LogTimeline";
import { LogFilters } from "./LogFilters";
import { LeftSidebar, RightSidebar } from "./Sidebar";
import { DateNavigation } from "./DateNavigation";
import { SearchModal } from "./SearchModal";
import {
  getTodayDate,
  formatDateLocal,
  parseDateLocal,
  getLogs,
  getStats,
  getMonthCounts,
  getTags,
  createLog,
  type Log,
  type Tag,
  type Stats,
  type LogType,
  logTypes,
} from "../lib/api";
import { hasUrl } from "../lib/links";

export function Dashboard() {
  const [date, setDate] = useState(getTodayDate());
  const [calendarMonth, setCalendarMonth] = useState(date.slice(0, 7));
  const [logs, setLogs] = useState<Log[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [monthCounts, setMonthCounts] = useState<Record<string, number>>({});
  const [monthLoading, setMonthLoading] = useState(false);
  const [monthError, setMonthError] = useState<string | null>(null);
  const [activeTypes, setActiveTypes] = useState<LogType[]>([]);
  const [linksOnly, setLinksOnly] = useState(false);

  // Load data
  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [logsRes, tagsRes, statsRes] = await Promise.all([
        getLogs(date),
        getTags(),
        getStats(),
      ]);
      setLogs(logsRes.items);
      setTags(tagsRes);
      setStats(statsRes);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load data");
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const typeCounts = useMemo(() => {
    const counts = logTypes.reduce((acc, type) => {
      acc[type] = 0;
      return acc;
    }, {} as Record<LogType, number>);
    for (const log of logs) {
      counts[log.type] = (counts[log.type] ?? 0) + 1;
    }
    return counts;
  }, [logs]);

  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      const typeMatch = activeTypes.length === 0 || activeTypes.includes(log.type);
      const linkMatch =
        !linksOnly ||
        hasUrl(log.content) ||
        (typeof log.metadata?.url === "string" && log.metadata.url.length > 0);
      return typeMatch && linkMatch;
    });
  }, [logs, activeTypes, linksOnly]);

  const handleToggleType = (type: LogType) => {
    setActiveTypes((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]
    );
  };

  const handleClearFilters = () => {
    setActiveTypes([]);
    setLinksOnly(false);
  };

  const handleToggleLinksOnly = () => {
    setLinksOnly((prev) => !prev);
  };

  const emptyMessage =
    logs.length > 0 && filteredLogs.length === 0
      ? "No logs match current filters."
      : undefined;

  useEffect(() => {
    const dateMonth = date.slice(0, 7);
    setCalendarMonth((prev) => (prev === dateMonth ? prev : dateMonth));
  }, [date]);

  useEffect(() => {
    let cancelled = false;
    const loadMonthCounts = async () => {
      setMonthLoading(true);
      setMonthError(null);
      try {
        const monthDays = await getMonthCounts(calendarMonth);
        if (cancelled) return;
        const counts: Record<string, number> = {};
        for (const day of monthDays) {
          counts[day.date] = day.count;
        }
        setMonthCounts(counts);
      } catch (err) {
        if (!cancelled) {
          setMonthError(err instanceof Error ? err.message : "Failed to load month stats");
        }
      } finally {
        if (!cancelled) {
          setMonthLoading(false);
        }
      }
    };
    loadMonthCounts();
    return () => {
      cancelled = true;
    };
  }, [calendarMonth]);

  // Keyboard shortcut for search (Cmd/Ctrl + K)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setIsSearchOpen(true);
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Handle new log creation
  const handleCreateLog = async (
    type: LogType,
    content: string,
    metadata?: Record<string, unknown>
  ) => {
    try {
      const newLog = await createLog({
        type,
        content,
        timestamp: Date.now(),
        metadata,
      });
      setLogs((prev) => [newLog, ...prev]);
      // Refresh stats
      const newStats = await getStats();
      setStats(newStats);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create log");
    }
  };

  // Navigate to previous/next day
  const goToPrevDay = () => {
    const current = parseDateLocal(date);
    current.setDate(current.getDate() - 1);
    setDate(formatDateLocal(current));
  };

  const goToNextDay = () => {
    const current = parseDateLocal(date);
    current.setDate(current.getDate() + 1);
    setDate(formatDateLocal(current));
  };

  const goToToday = () => {
    setDate(getTodayDate());
  };

  const isToday = date === getTodayDate();

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <h1 className="dashboard-title">LifeLog</h1>
        <div className="dashboard-actions">
          <button
            type="button"
            className="header-btn"
            title="検索 (⌘K)"
            onClick={() => setIsSearchOpen(true)}
          >
            🔍 検索
            <span className="header-btn-shortcut">⌘K</span>
          </button>
        </div>
      </header>

      <SearchModal isOpen={isSearchOpen} onClose={() => setIsSearchOpen(false)} />

      <div className="dashboard-content">
        <LeftSidebar
          tags={tags}
          onTagsChange={loadData}
          selectedDate={date}
          onSelectDate={setDate}
          calendarMonth={calendarMonth}
          onChangeMonth={setCalendarMonth}
          monthCounts={monthCounts}
          monthLoading={monthLoading}
          monthError={monthError}
        />

        <main className="main-area">
          {error && (
            <div className="error-banner">
              {error}
              <button type="button" onClick={() => setError(null)}>Dismiss</button>
            </div>
          )}

          <LogInput onSubmit={handleCreateLog} />
          <QuickButtons onQuickLog={handleCreateLog} />
          <LogFilters
            activeTypes={activeTypes}
            onToggleType={handleToggleType}
            onClearTypes={handleClearFilters}
            linksOnly={linksOnly}
            onToggleLinksOnly={handleToggleLinksOnly}
            typeCounts={typeCounts}
            totalCount={logs.length}
            filteredCount={filteredLogs.length}
          />

          <div className="timeline-section">
            <h2 className="timeline-title">
              {isToday ? "Today's Logs" : `Logs for ${date}`}
            </h2>
            {loading ? (
              <div className="loading">Loading...</div>
            ) : (
              <LogTimeline
                logs={filteredLogs}
                onUpdate={loadData}
                emptyMessage={emptyMessage}
              />
            )}
          </div>
        </main>

        <RightSidebar stats={stats} />
      </div>

      <DateNavigation
        date={date}
        onPrev={goToPrevDay}
        onNext={goToNextDay}
        onToday={goToToday}
        isToday={isToday}
      />
    </div>
  );
}
