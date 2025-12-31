import { logTypes, type LogType } from "../lib/api";

const typeEmojis: Record<LogType, string> = {
  activity: "🎯",
  wake_up: "🌅",
  meal: "🍽️",
  location: "📍",
  thought: "💭",
  reading: "📖",
  media: "🎬",
  bookmark: "🔗",
};

interface LogFiltersProps {
  activeTypes: LogType[];
  onToggleType: (type: LogType) => void;
  onClearTypes: () => void;
  linksOnly: boolean;
  onToggleLinksOnly: () => void;
  typeCounts: Record<LogType, number>;
  totalCount: number;
  filteredCount: number;
}

export function LogFilters({
  activeTypes,
  onToggleType,
  onClearTypes,
  linksOnly,
  onToggleLinksOnly,
  typeCounts,
  totalCount,
  filteredCount,
}: LogFiltersProps) {
  const filtersActive = activeTypes.length > 0 || linksOnly;

  return (
    <section className="log-filters">
      <div className="log-filters-header">
        <h3 className="log-filters-title">Filters</h3>
        <div className="log-filters-summary">
          {filteredCount}/{totalCount}
        </div>
      </div>
      <div className="log-filters-row">
        <button
          type="button"
          className={`filter-chip ${filtersActive ? "" : "active"}`}
          onClick={onClearTypes}
        >
          ✨ All
        </button>
        <button
          type="button"
          className={`filter-chip ${linksOnly ? "active" : ""}`}
          onClick={onToggleLinksOnly}
        >
          🔗 Links
        </button>
      </div>
      <div className="log-filters-row">
        {logTypes.map((type) => (
          <button
            key={type}
            type="button"
            className={`filter-chip ${activeTypes.includes(type) ? "active" : ""}`}
            onClick={() => onToggleType(type)}
          >
            <span className="filter-chip-emoji">{typeEmojis[type]}</span>
            <span className="filter-chip-label">{type}</span>
            <span className="filter-chip-count">{typeCounts[type] ?? 0}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
