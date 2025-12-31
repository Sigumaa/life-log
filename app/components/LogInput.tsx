import { useState, type FormEvent, type KeyboardEvent } from "react";
import type { LogType } from "../lib/api";

interface LogInputProps {
  onSubmit: (type: LogType, content: string, metadata?: Record<string, unknown>) => Promise<void>;
}

export function LogInput({ onSubmit }: LogInputProps) {
  const [content, setContent] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!content.trim() || submitting) return;

    setSubmitting(true);
    try {
      // Default to 'thought' type for quick input
      await onSubmit("thought", content.trim());
      setContent("");
    } finally {
      setSubmitting(false);
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // Submit on Cmd/Ctrl + Enter
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSubmit(e as unknown as FormEvent);
    }
  };

  return (
    <form className="log-input" onSubmit={handleSubmit}>
      <textarea
        className="log-input-field"
        placeholder="What's on your mind?"
        value={content}
        onChange={(e) => setContent(e.target.value)}
        onKeyDown={handleKeyDown}
        disabled={submitting}
        rows={2}
      />
      <div className="log-input-footer">
        <span className="log-input-hint">Cmd+Enter to submit</span>
        <button
          type="submit"
          className="log-input-submit"
          disabled={!content.trim() || submitting}
        >
          {submitting ? "Saving..." : "Log"}
        </button>
      </div>
    </form>
  );
}
