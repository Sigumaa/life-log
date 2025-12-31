import { useState } from "react";
import { type Tag, type Stats, createTag, deleteTag } from "../lib/api";
import { MonthCalendar } from "./MonthCalendar";

interface LeftSidebarProps {
  tags: Tag[];
  onTagsChange: () => void;
  selectedTagId: string | null;
  onSelectTag: (tagId: string) => void;
  selectedDate: string;
  onSelectDate: (date: string) => void;
  calendarMonth: string;
  onChangeMonth: (month: string) => void;
  monthCounts: Record<string, number>;
  monthLoading?: boolean;
  monthError?: string | null;
}

export function LeftSidebar({
  tags,
  onTagsChange,
  selectedTagId,
  onSelectTag,
  selectedDate,
  onSelectDate,
  calendarMonth,
  onChangeMonth,
  monthCounts,
  monthLoading,
  monthError,
}: LeftSidebarProps) {
  const [newTagName, setNewTagName] = useState("");
  const [creating, setCreating] = useState(false);

  const handleCreateTag = async () => {
    if (!newTagName.trim() || creating) return;
    setCreating(true);
    try {
      await createTag({ name: newTagName.trim() });
      setNewTagName("");
      onTagsChange();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to create tag");
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteTag = async (id: string) => {
    if (!confirm("Delete this tag?")) return;
    try {
      await deleteTag(id);
      onTagsChange();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to delete tag");
    }
  };

  return (
    <aside className="sidebar sidebar-left">
      <section className="sidebar-section">
        <h3 className="sidebar-title">Calendar</h3>
        <MonthCalendar
          month={calendarMonth}
          selectedDate={selectedDate}
          counts={monthCounts}
          onSelectDate={onSelectDate}
          onChangeMonth={onChangeMonth}
          loading={monthLoading}
          error={monthError}
        />
      </section>

      <section className="sidebar-section">
        <h3 className="sidebar-title">Tags</h3>
        <div className="tag-list">
          {tags.length === 0 ? (
            <div className="tag-list-empty">No tags yet</div>
          ) : (
            tags.map((tag) => (
              <div
                key={tag.id}
                className={`tag-item ${selectedTagId === tag.id ? "tag-item-selected" : ""}`}
                onClick={() => onSelectTag(tag.id)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onSelectTag(tag.id);
                  }
                }}
              >
                <span
                  className="tag-color"
                  style={{ backgroundColor: tag.color || "#6b7280" }}
                />
                <span className="tag-name">#{tag.name}</span>
                <button
                  type="button"
                  className="tag-delete"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteTag(tag.id);
                  }}
                  title="Delete tag"
                >
                  x
                </button>
              </div>
            ))
          )}
        </div>
        <div className="tag-create">
          <input
            type="text"
            className="tag-create-input"
            placeholder="New tag..."
            value={newTagName}
            onChange={(e) => setNewTagName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleCreateTag();
            }}
            disabled={creating}
          />
          <button
            type="button"
            className="tag-create-btn"
            onClick={handleCreateTag}
            disabled={!newTagName.trim() || creating}
          >
            +
          </button>
        </div>
      </section>
    </aside>
  );
}

interface RightSidebarProps {
  stats: Stats | null;
}

export function RightSidebar({ stats }: RightSidebarProps) {
  if (!stats) {
    return (
      <aside className="sidebar sidebar-right">
        <div className="sidebar-loading">Loading...</div>
      </aside>
    );
  }

  return (
    <aside className="sidebar sidebar-right">
      <section className="sidebar-section">
        <h3 className="sidebar-title">Stats</h3>
        <div className="stats-grid">
          <div className="stat-item">
            <div className="stat-value">{stats.todayCount}</div>
            <div className="stat-label">Today</div>
          </div>
          <div className="stat-item">
            <div className="stat-value">{stats.weekCount}</div>
            <div className="stat-label">This week</div>
          </div>
        </div>
      </section>

      {stats.topTags.length > 0 && (
        <section className="sidebar-section">
          <h3 className="sidebar-title">Top Tags</h3>
          <div className="top-tags">
            {stats.topTags.map((tag) => (
              <div key={tag.id} className="top-tag-item">
                <span className="top-tag-name">#{tag.name}</span>
                <span className="top-tag-count">{tag.count}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {stats.recentUrls.length > 0 && (
        <section className="sidebar-section">
          <h3 className="sidebar-title">Recent URLs</h3>
          <div className="recent-urls">
            {stats.recentUrls.slice(0, 5).map((url) => {
              let hostname = url;
              try {
                hostname = new URL(url).hostname;
              } catch {
                // Keep original URL if parsing fails
              }
              return (
                <a
                  key={url}
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="recent-url"
                >
                  {hostname}
                </a>
              );
            })}
          </div>
        </section>
      )}
    </aside>
  );
}
