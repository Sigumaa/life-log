import { useState } from "react";
import type { LogType } from "../lib/api";

interface QuickButtonsProps {
  onQuickLog: (type: LogType, content: string, metadata?: Record<string, unknown>) => Promise<void>;
}

const quickActions: { type: LogType; emoji: string; label: string; defaultContent: string }[] = [
  { type: "wake_up", emoji: "🌅", label: "Wake up", defaultContent: "Woke up" },
  { type: "meal", emoji: "🍽️", label: "Meal", defaultContent: "" },
  { type: "location", emoji: "📍", label: "Location", defaultContent: "" },
  { type: "thought", emoji: "💭", label: "Thought", defaultContent: "" },
  { type: "reading", emoji: "📖", label: "Reading", defaultContent: "" },
  { type: "bookmark", emoji: "🔗", label: "Bookmark", defaultContent: "" },
  { type: "activity", emoji: "🎯", label: "Activity", defaultContent: "" },
  { type: "media", emoji: "🎬", label: "Media", defaultContent: "" },
];

export function QuickButtons({ onQuickLog }: QuickButtonsProps) {
  const [activeType, setActiveType] = useState<LogType | null>(null);
  const [content, setContent] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleQuickAction = async (action: (typeof quickActions)[0]) => {
    if (action.defaultContent) {
      // Immediate log (like wake_up)
      setSubmitting(true);
      try {
        await onQuickLog(action.type, action.defaultContent);
      } finally {
        setSubmitting(false);
      }
    } else {
      // Show input for this type
      setActiveType(action.type);
      setContent("");
    }
  };

  const handleSubmit = async () => {
    if (!activeType || !content.trim() || submitting) return;

    setSubmitting(true);
    try {
      await onQuickLog(activeType, content.trim());
      setActiveType(null);
      setContent("");
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = () => {
    setActiveType(null);
    setContent("");
  };

  return (
    <div className="quick-buttons">
      <div className="quick-buttons-row">
        {quickActions.map((action) => (
          <button
            key={action.type}
            type="button"
            className={`quick-btn ${activeType === action.type ? "active" : ""}`}
            onClick={() => handleQuickAction(action)}
            disabled={submitting}
            title={action.label}
          >
            <span className="quick-btn-emoji">{action.emoji}</span>
            <span className="quick-btn-label">{action.label}</span>
          </button>
        ))}
      </div>

      {activeType && (
        <div className="quick-input-panel">
          <input
            type="text"
            className="quick-input-field"
            placeholder={`Enter ${quickActions.find((a) => a.type === activeType)?.label.toLowerCase()}...`}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSubmit();
              if (e.key === "Escape") handleCancel();
            }}
            autoFocus
            disabled={submitting}
          />
          <div className="quick-input-actions">
            <button
              type="button"
              className="quick-input-cancel"
              onClick={handleCancel}
              disabled={submitting}
            >
              Cancel
            </button>
            <button
              type="button"
              className="quick-input-submit"
              onClick={handleSubmit}
              disabled={!content.trim() || submitting}
            >
              Save
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
