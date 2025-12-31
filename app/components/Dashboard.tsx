import { useState, useEffect, useCallback } from "react";
import { LogInput } from "./LogInput";
import { QuickButtons } from "./QuickButtons";
import { LogTimeline } from "./LogTimeline";
import { LeftSidebar, RightSidebar } from "./Sidebar";
import { DateNavigation } from "./DateNavigation";
import { SearchModal } from "./SearchModal";
import {
  getTodayDate,
  formatDateLocal,
  parseDateLocal,
  getLogs,
  getStats,
  getTags,
  createLog,
  type Log,
  type Tag,
  type Stats,
  type LogType,
} from "../lib/api";

export function Dashboard() {
  const [date, setDate] = useState(getTodayDate());
  const [logs, setLogs] = useState<Log[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSearchOpen, setIsSearchOpen] = useState(false);

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
        <LeftSidebar tags={tags} onTagsChange={loadData} />

        <main className="main-area">
          {error && (
            <div className="error-banner">
              {error}
              <button type="button" onClick={() => setError(null)}>Dismiss</button>
            </div>
          )}

          <LogInput onSubmit={handleCreateLog} />
          <QuickButtons onQuickLog={handleCreateLog} />

          <div className="timeline-section">
            <h2 className="timeline-title">
              {isToday ? "Today's Logs" : `Logs for ${date}`}
            </h2>
            {loading ? (
              <div className="loading">Loading...</div>
            ) : (
              <LogTimeline logs={logs} onUpdate={loadData} />
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
