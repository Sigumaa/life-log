import { useState } from "react";
import { type Log, deleteLog, updateLog } from "../lib/api";
import { extractUrls, linkifyText } from "../lib/links";
import { LinkPreview } from "./LinkPreview";

interface LogTimelineProps {
  logs: Log[];
  onUpdate: () => void;
  emptyMessage?: string;
  groupByDate?: boolean;
  timeZone?: string;
}

const typeEmojis: Record<string, string> = {
  activity: "🎯",
  wake_up: "🌅",
  meal: "🍽️",
  location: "📍",
  thought: "💭",
  reading: "📖",
  media: "🎬",
  bookmark: "🔗",
};

function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

interface LogItemProps {
  log: Log;
  onDelete: () => void;
  onUpdate: (content: string) => void;
}

function LogItem({ log, onDelete, onUpdate }: LogItemProps) {
  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState(log.content);
  const [deleting, setDeleting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [actionsOpen, setActionsOpen] = useState(false);

  const handleSave = async () => {
    if (editContent.trim() === log.content || saving) return;
    setSaving(true);
    try {
      await onUpdate(editContent.trim());
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setActionsOpen(false);
    if (!confirm("Delete this log?")) return;
    setDeleting(true);
    try {
      await onDelete();
    } catch {
      setDeleting(false);
    }
  };

  const handleCancel = () => {
    setEditContent(log.content);
    setEditing(false);
  };

  const contentParts = linkifyText(log.content);
  const urlSet = new Set<string>();
  if (typeof log.metadata?.url === "string") {
    urlSet.add(log.metadata.url);
  }
  for (const url of extractUrls(log.content)) urlSet.add(url);
  const urls = Array.from(urlSet.values());
  const previewUrl = urls[0];

  return (
    <div
      className={`log-item ${deleting ? "deleting" : ""} ${actionsOpen ? "actions-open" : ""}`}
    >
      <div className="log-item-time">{formatTime(log.timestamp)}</div>
      <div className="log-item-emoji">{typeEmojis[log.type] || "📝"}</div>
      <div className="log-item-content">
        {editing ? (
          <div className="log-item-edit">
            <textarea
              className="log-item-edit-field"
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleSave();
                if (e.key === "Escape") handleCancel();
              }}
              autoFocus
              disabled={saving}
            />
            <div className="log-item-edit-actions">
              <button
                type="button"
                onClick={handleCancel}
                disabled={saving}
                className="log-item-btn-cancel"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving || editContent.trim() === log.content}
                className="log-item-btn-save"
              >
                {saving ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        ) : (
          <div className="log-item-text">
            {contentParts.map((part, index) =>
              part.type === "text" ? (
                <span key={`text-${index}`}>{part.value}</span>
              ) : (
                <a
                  key={`link-${index}`}
                  href={part.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="log-item-link"
                >
                  {part.value}
                </a>
              )
            )}
            {urls.length > 1 && (
              <span className="log-item-links">
                {urls.slice(1).map((url) => {
                  let label = url;
                  try {
                    label = new URL(url).hostname;
                  } catch {
                    // fallback to raw url
                  }
                  return (
                    <a
                      key={url}
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="log-item-link"
                    >
                      {label}
                    </a>
                  );
                })}
              </span>
            )}
            {previewUrl && <LinkPreview url={previewUrl} />}
          </div>
        )}
      </div>
      {!editing && (
        <div className="log-item-actions">
          <button
            type="button"
            className="log-item-btn-more"
            onClick={() => setActionsOpen((prev) => !prev)}
            title="More actions"
            aria-label="More actions"
            aria-expanded={actionsOpen}
          >
            ...
          </button>
          <div className="log-item-actions-menu" role="menu">
          <button
            type="button"
            className="log-item-btn-edit"
            onClick={() => {
              setActionsOpen(false);
              setEditing(true);
            }}
            title="Edit"
          >
            Edit
          </button>
          <button
            type="button"
            className="log-item-btn-delete"
            onClick={handleDelete}
            disabled={deleting}
            title="Delete"
          >
            Delete
          </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function LogTimeline({
  logs,
  onUpdate,
  emptyMessage,
  groupByDate,
  timeZone,
}: LogTimelineProps) {
  if (logs.length === 0) {
    return (
      <div className="log-timeline-empty">
        {emptyMessage ?? "No logs yet. Start logging!"}
      </div>
    );
  }

  const handleDelete = async (id: string) => {
    await deleteLog(id);
    onUpdate();
  };

  const handleUpdate = async (id: string, content: string) => {
    await updateLog(id, { content });
    onUpdate();
  };

  if (groupByDate) {
    const tz =
      timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone;
    const keyFormatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    const labelFormatter = new Intl.DateTimeFormat(undefined, {
      timeZone: tz,
      year: "numeric",
      month: "long",
      day: "numeric",
      weekday: "short",
    });

    const groups: Array<{ key: string; label: string; items: Log[] }> = [];
    for (const log of logs) {
      const key = keyFormatter.format(new Date(log.timestamp));
      const label = labelFormatter.format(new Date(log.timestamp));
      const last = groups[groups.length - 1];
      if (!last || last.key !== key) {
        groups.push({ key, label, items: [log] });
      } else {
        last.items.push(log);
      }
    }

    return (
      <div className="log-timeline log-timeline-grouped">
        {groups.map((group, index) => (
          <div key={group.key} className="log-group">
            <div className="log-group-header">
              <span className="log-group-date">{group.label}</span>
              <span className="log-group-count">{group.items.length}</span>
            </div>
            <div className="log-group-items">
              {group.items.map((log) => (
                <LogItem
                  key={log.id}
                  log={log}
                  onDelete={() => handleDelete(log.id)}
                  onUpdate={(content) => handleUpdate(log.id, content)}
                />
              ))}
            </div>
            {index < groups.length - 1 && <hr className="log-group-divider" />}
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="log-timeline">
      {logs.map((log) => (
        <LogItem
          key={log.id}
          log={log}
          onDelete={() => handleDelete(log.id)}
          onUpdate={(content) => handleUpdate(log.id, content)}
        />
      ))}
    </div>
  );
}
