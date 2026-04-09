interface DebugToggleProps {
  isDebug: boolean;
  onToggle: () => void;
}

export function DebugToggle({ isDebug, onToggle }: DebugToggleProps) {
  return (
    <button
      onClick={onToggle}
      className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold transition-colors ${
        isDebug
          ? "bg-amber-500 text-black"
          : "border border-border bg-secondary text-muted-foreground hover:text-foreground"
      }`}
      title={isDebug ? "Debug mode ON — click to disable" : "Debug mode OFF — click to enable"}
    >
      <span
        className={`h-2 w-2 rounded-full ${isDebug ? "bg-black" : "bg-muted-foreground"}`}
      />
      DEBUG
    </button>
  );
}
