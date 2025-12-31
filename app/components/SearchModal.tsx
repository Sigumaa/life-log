import { useState, useEffect, useRef, useCallback } from "react";
import { searchLogs, logTypes, type Log, type LogType } from "../lib/api";

interface SearchModalProps {
  isOpen: boolean;
  onClose: () => void;
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

function formatDateTime(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function SearchModal({ isOpen, onClose }: SearchModalProps) {
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<LogType | "">("");
  const [results, setResults] = useState<Log[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);

  // Focus input when modal opens
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100);
    } else {
      // Reset state when closing
      setQuery("");
      setTypeFilter("");
      setResults([]);
      setSearched(false);
      setError(null);
    }
  }, [isOpen]);

  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  // Handle click outside
  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  const handleSearch = useCallback(async () => {
    if (query.length < 2) {
      setError("2文字以上入力してください");
      return;
    }

    setLoading(true);
    setError(null);
    setSearched(true);

    try {
      const response = await searchLogs(query, {
        type: typeFilter || undefined,
      });
      setResults(response.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : "検索に失敗しました");
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, [query, typeFilter]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && query.length >= 2) {
      handleSearch();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="search-modal-backdrop" onClick={handleBackdropClick}>
      <div className="search-modal" ref={modalRef}>
        <div className="search-modal-header">
          <h2 className="search-modal-title">検索</h2>
          <button
            type="button"
            className="search-modal-close"
            onClick={onClose}
            aria-label="閉じる"
          >
            ✕
          </button>
        </div>

        <div className="search-modal-body">
          <div className="search-input-row">
            <input
              ref={inputRef}
              type="text"
              className="search-input"
              placeholder="検索キーワード（2文字以上）"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
            />
            <select
              className="search-type-filter"
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value as LogType | "")}
            >
              <option value="">すべてのタイプ</option>
              {logTypes.map((type) => (
                <option key={type} value={type}>
                  {typeEmojis[type]} {type}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="search-btn"
              onClick={handleSearch}
              disabled={query.length < 2 || loading}
            >
              {loading ? "検索中..." : "検索"}
            </button>
          </div>

          {error && <div className="search-error">{error}</div>}

          <div className="search-results">
            {loading ? (
              <div className="search-loading">検索中...</div>
            ) : searched && results.length === 0 ? (
              <div className="search-no-results">
                検索結果がありません
              </div>
            ) : (
              results.map((log) => (
                <div key={log.id} className="search-result-item">
                  <div className="search-result-header">
                    <span className="search-result-emoji">
                      {typeEmojis[log.type] || "📝"}
                    </span>
                    <span className="search-result-type">{log.type}</span>
                    <span className="search-result-time">
                      {formatDateTime(log.timestamp)}
                    </span>
                  </div>
                  <div className="search-result-content">{log.content}</div>
                </div>
              ))
            )}
          </div>

          {results.length > 0 && (
            <div className="search-result-count">
              {results.length}件の結果
              {results.length === 50 && "（最大50件）"}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
