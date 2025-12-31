import { useState, useEffect, useCallback, useMemo, useRef } from "react";
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
  getUserTimezone,
  getLogs,
  getTagLogs,
  getTimelineLogs,
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
  const [viewMode, setViewMode] = useState<"day" | "archive" | "tag">("day");
  const [selectedTagId, setSelectedTagId] = useState<string | null>(null);
  const [tagLogs, setTagLogs] = useState<Log[]>([]);
  const [tagCursor, setTagCursor] = useState<string | null>(null);
  const [tagHasMore, setTagHasMore] = useState(true);
  const [tagLoading, setTagLoading] = useState(false);
  const [tagError, setTagError] = useState<string | null>(null);
  const [archiveFilter, setArchiveFilter] = useState<"all" | "links" | LogType>("all");
  const [archiveLogs, setArchiveLogs] = useState<Log[]>([]);
  const [archiveCursor, setArchiveCursor] = useState<string | null>(null);
  const [archiveHasMore, setArchiveHasMore] = useState(true);
  const [archiveLoading, setArchiveLoading] = useState(false);
  const [archiveError, setArchiveError] = useState<string | null>(null);
  const archiveSentinelRef = useRef<HTMLDivElement | null>(null);

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
    if (viewMode !== "day") return;
    loadData();
  }, [viewMode, loadData]);

  const baseLogs = viewMode === "tag" ? tagLogs : logs;

  const typeCounts = useMemo(() => {
    const counts = logTypes.reduce((acc, type) => {
      acc[type] = 0;
      return acc;
    }, {} as Record<LogType, number>);
    for (const log of baseLogs) {
      counts[log.type] = (counts[log.type] ?? 0) + 1;
    }
    return counts;
  }, [baseLogs]);

  const filteredLogs = useMemo(() => {
    return baseLogs.filter((log) => {
      const typeMatch = activeTypes.length === 0 || activeTypes.includes(log.type);
      const linkMatch =
        !linksOnly ||
        hasUrl(log.content) ||
        (typeof log.metadata?.url === "string" && log.metadata.url.length > 0);
      return typeMatch && linkMatch;
    });
  }, [baseLogs, activeTypes, linksOnly]);

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

  const handleSelectTag = (tagId: string) => {
    setSelectedTagId((prev) => {
      const next = prev === tagId ? null : tagId;
      setViewMode(next ? "tag" : "day");
      return next;
    });
  };

  const emptyMessage =
    baseLogs.length > 0 && filteredLogs.length === 0
      ? "No logs match current filters."
      : undefined;

  const loadTagLogs = useCallback(
    async (cursor?: string, append?: boolean) => {
      if (!selectedTagId) return;
      setTagLoading(true);
      setTagError(null);
      try {
        const res = await getTagLogs(selectedTagId, { limit: 50, cursor });
        setTagLogs((prev) => (append ? [...prev, ...res.items] : res.items));
        setTagCursor(res.nextCursor ?? null);
        setTagHasMore(res.hasMore);
      } catch (err) {
        setTagError(err instanceof Error ? err.message : "Failed to load tag logs");
      } finally {
        setTagLoading(false);
      }
    },
    [selectedTagId]
  );

  const loadArchiveLogs = useCallback(
    async (cursor?: string, append?: boolean) => {
      setArchiveLoading(true);
      setArchiveError(null);
      try {
        const types =
          archiveFilter === "links"
            ? (["bookmark", "reading"] as LogType[])
            : archiveFilter === "all"
              ? undefined
              : ([archiveFilter] as LogType[]);

        const res = await getTimelineLogs({
          types,
          limit: 50,
          cursor,
        });
        setArchiveLogs((prev) => (append ? [...prev, ...res.items] : res.items));
        setArchiveCursor(res.nextCursor ?? null);
        setArchiveHasMore(res.hasMore);
      } catch (err) {
        setArchiveError(err instanceof Error ? err.message : "Failed to load archive");
      } finally {
        setArchiveLoading(false);
      }
    },
    [archiveFilter]
  );

  useEffect(() => {
    if (viewMode !== "tag") return;
    if (!selectedTagId) {
      setTagLogs([]);
      setTagCursor(null);
      setTagHasMore(true);
      setTagError(null);
      return;
    }
    setTagLogs([]);
    setTagCursor(null);
    setTagHasMore(true);
    loadTagLogs();
  }, [viewMode, selectedTagId, loadTagLogs]);

  useEffect(() => {
    if (viewMode !== "archive") return;
    setArchiveLogs([]);
    setArchiveCursor(null);
    setArchiveHasMore(true);
    loadArchiveLogs();
  }, [viewMode, archiveFilter, loadArchiveLogs]);

  useEffect(() => {
    if (viewMode !== "archive") return;
    const sentinel = archiveSentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (
          entry.isIntersecting &&
          archiveHasMore &&
          !archiveLoading &&
          !archiveError
        ) {
          loadArchiveLogs(archiveCursor ?? undefined, true);
        }
      },
      { rootMargin: "300px" }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [
    viewMode,
    archiveHasMore,
    archiveLoading,
    archiveCursor,
    archiveError,
    loadArchiveLogs,
  ]);

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
  const selectedTag = selectedTagId ? tags.find((tag) => tag.id === selectedTagId) : null;
  const showTagView = viewMode === "tag" && Boolean(selectedTagId);
  const showArchiveView = viewMode === "archive";
  const timeZone = getUserTimezone();

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <div className="dashboard-title-group">
          <h1 className="dashboard-title">LifeLog</h1>
          <div className="view-toggle">
            <button
              type="button"
              className={`view-toggle-btn ${viewMode === "day" ? "active" : ""}`}
              onClick={() => {
                setViewMode("day");
                setSelectedTagId(null);
              }}
            >
              Day
            </button>
            <button
              type="button"
              className={`view-toggle-btn ${viewMode === "archive" ? "active" : ""}`}
              onClick={() => {
                setViewMode("archive");
                setSelectedTagId(null);
              }}
            >
              Archive
            </button>
          </div>
        </div>
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
          selectedTagId={selectedTagId}
          onSelectTag={handleSelectTag}
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

          {showArchiveView ? (
            <section className="archive-controls">
              <div className="archive-title">Archive timeline</div>
              <div className="archive-tabs">
                {[
                  { key: "all", label: "All", emoji: "✨" },
                  { key: "links", label: "Links", emoji: "🔗" },
                  { key: "activity", label: "activity", emoji: "🎯" },
                  { key: "wake_up", label: "wake_up", emoji: "🌅" },
                  { key: "meal", label: "meal", emoji: "🍽️" },
                  { key: "location", label: "location", emoji: "📍" },
                  { key: "thought", label: "thought", emoji: "💭" },
                  { key: "reading", label: "reading", emoji: "📖" },
                  { key: "media", label: "media", emoji: "🎬" },
                  { key: "bookmark", label: "bookmark", emoji: "🔗" },
                ].map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    className={`archive-tab ${archiveFilter === item.key ? "active" : ""}`}
                    onClick={() =>
                      setArchiveFilter(item.key as "all" | "links" | LogType)
                    }
                  >
                    <span className="archive-tab-emoji">{item.emoji}</span>
                    <span className="archive-tab-label">{item.label}</span>
                  </button>
                ))}
              </div>
            </section>
          ) : (
            <>
              <LogInput onSubmit={handleCreateLog} />
              <QuickButtons onQuickLog={handleCreateLog} />
              <LogFilters
                activeTypes={activeTypes}
                onToggleType={handleToggleType}
                onClearTypes={handleClearFilters}
                linksOnly={linksOnly}
                onToggleLinksOnly={handleToggleLinksOnly}
                typeCounts={typeCounts}
                totalCount={baseLogs.length}
                filteredCount={filteredLogs.length}
              />
            </>
          )}

          {showArchiveView ? (
            <section className="archive-view">
              <div className="timeline-section">
                <h2 className="timeline-title">Archive</h2>
                {archiveError && (
                  <div className="error-banner">
                    {archiveError}
                    <button type="button" onClick={() => setArchiveError(null)}>Dismiss</button>
                  </div>
                )}
                {archiveLoading && archiveLogs.length === 0 ? (
                  <div className="loading">Loading...</div>
                ) : (
                  <LogTimeline
                    logs={archiveLogs}
                    onUpdate={() => loadArchiveLogs()}
                    emptyMessage="No logs in archive yet."
                    groupByDate
                    timeZone={timeZone}
                  />
                )}
                <div ref={archiveSentinelRef} className="archive-sentinel" />
                {archiveLoading && archiveLogs.length > 0 && (
                  <div className="loading">Loading more...</div>
                )}
                {!archiveHasMore && archiveLogs.length > 0 && (
                  <div className="archive-end">You've reached the beginning.</div>
                )}
              </div>
            </section>
          ) : showTagView ? (
            <section className="tag-view">
              <div className="tag-view-header">
                <div>
                  <div className="tag-view-title">
                    {selectedTag ? `#${selectedTag.name}` : "Tag timeline"}
                  </div>
                  <div className="tag-view-subtitle">
                    Scroll back through everything you logged for this tag.
                  </div>
                </div>
                <div className="tag-view-actions">
                  <button
                    type="button"
                    className="tag-view-back"
                    onClick={() => setSelectedTagId(null)}
                  >
                    Back to day view
                  </button>
                </div>
              </div>

              {tagError && (
                <div className="error-banner">
                  {tagError}
                  <button type="button" onClick={() => setTagError(null)}>Dismiss</button>
                </div>
              )}

              <div className="timeline-section">
                <h2 className="timeline-title">
                  Tag timeline
                </h2>
                {tagLoading && tagLogs.length === 0 ? (
                  <div className="loading">Loading...</div>
                ) : (
                  <LogTimeline
                    logs={filteredLogs}
                    onUpdate={() => loadTagLogs()}
                    emptyMessage={emptyMessage ?? "No logs for this tag yet."}
                    groupByDate
                    timeZone={timeZone}
                  />
                )}
              </div>

              {tagHasMore && (
                <div className="tag-load-more">
                  <button
                    type="button"
                    className="tag-load-more-btn"
                    onClick={() => loadTagLogs(tagCursor ?? undefined, true)}
                    disabled={tagLoading}
                  >
                    {tagLoading ? "Loading..." : "Load more"}
                  </button>
                </div>
              )}
            </section>
          ) : (
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
          )}
        </main>

        <RightSidebar stats={stats} />
      </div>

      {!showTagView && !showArchiveView && (
        <DateNavigation
          date={date}
          onPrev={goToPrevDay}
          onNext={goToNextDay}
          onToday={goToToday}
          isToday={isToday}
        />
      )}
    </div>
  );
}
