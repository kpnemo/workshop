interface FileChipProps {
  filename: string;
  sizeBytes: number;
  status: "uploading" | "ready" | "error";
  errorMessage?: string;
  onRemove: () => void;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  return `${Math.ceil(bytes / 1024)}KB`;
}

export function FileChip({ filename, sizeBytes, status, errorMessage, onRemove }: FileChipProps) {
  return (
    <div
      className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm ${
        status === "error"
          ? "border-red-500/50 bg-red-500/10 text-red-400"
          : "border-border bg-surface text-foreground"
      }`}
    >
      {status === "uploading" ? (
        <span className="text-muted animate-pulse">⏳</span>
      ) : status === "error" ? (
        <span>⚠️</span>
      ) : (
        <span className="text-primary">📄</span>
      )}

      <span className={status === "error" ? "line-through" : ""}>
        {filename}
      </span>

      {status !== "error" && (
        <span className="text-muted text-xs">{formatSize(sizeBytes)}</span>
      )}

      {status === "error" && errorMessage && (
        <span className="text-xs">{errorMessage}</span>
      )}

      <button
        onClick={onRemove}
        className="ml-1 text-muted hover:text-red-400 transition-colors"
        aria-label="Remove file"
      >
        ✕
      </button>
    </div>
  );
}
