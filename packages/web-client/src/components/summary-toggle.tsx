interface SummaryToggleProps {
  enabled: boolean;
  disabled?: boolean;
  onToggle: () => void;
}

export function SummaryToggle({ enabled, disabled, onToggle }: SummaryToggleProps) {
  return (
    <button
      onClick={onToggle}
      disabled={disabled}
      className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold transition-colors ${
        enabled
          ? "bg-blue-500 text-white"
          : "border border-border bg-secondary text-muted-foreground hover:text-foreground"
      } ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
      title={enabled ? "Summary ON — click to disable" : "Summary OFF — click to enable"}
    >
      <span
        className={`h-2 w-2 rounded-full ${enabled ? "bg-white" : "bg-muted-foreground"}`}
      />
      SUMMARY
    </button>
  );
}
