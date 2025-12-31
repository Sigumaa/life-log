import { useState } from "react";
import { type Log, deleteLog, updateLog } from "../lib/api";

interface LogTimelineProps {
  logs: Log[];
  onUpdate: () => void;
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

  return (
    <div className={`log-item ${deleting ? "deleting" : ""}`}>
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
            {log.content}
            {typeof log.metadata?.url === "string" && (
              <a
                href={log.metadata.url}
                target="_blank"
                rel="noopener noreferrer"
                className="log-item-url"
              >
                {new URL(log.metadata.url).hostname}
              </a>
            )}
          </div>
        )}
      </div>
      {!editing && (
        <div className="log-item-actions">
          <button
            type="button"
            className="log-item-btn-edit"
            onClick={() => setEditing(true)}
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
      )}
    </div>
  );
}

export function LogTimeline({ logs, onUpdate }: LogTimelineProps) {
  if (logs.length === 0) {
    return (
      <div className="log-timeline-empty">
        No logs yet. Start logging!
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
