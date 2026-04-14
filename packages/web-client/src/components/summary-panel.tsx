import { useState, useEffect, useRef } from "react";

interface SummaryPanelProps {
  summary: string | null;
  onRefresh: () => Promise<void>;
  isStreaming: boolean;
}

export function SummaryPanel({ summary, onRefresh, isStreaming }: SummaryPanelProps) {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [cooldown, setCooldown] = useState(false);
  const [animating, setAnimating] = useState(false);
  const prevSummaryRef = useRef(summary);
  const cooldownTimer = useRef<ReturnType<typeof setTimeout>>();

  // Detect summary changes for fade-in animation
  useEffect(() => {
    if (summary !== prevSummaryRef.current) {
      prevSummaryRef.current = summary;
      setAnimating(true);
      const timer = setTimeout(() => setAnimating(false), 500);
      return () => clearTimeout(timer);
    }
  }, [summary]);

  useEffect(() => {
    return () => {
      if (cooldownTimer.current) clearTimeout(cooldownTimer.current);
    };
  }, []);

  const handleRefresh = async () => {
    if (isRefreshing || cooldown) return;
    setIsRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setIsRefreshing(false);
      setCooldown(true);
      cooldownTimer.current = setTimeout(() => setCooldown(false), 5000);
    }
  };

  return (
    <div className="sticky top-0 z-10 border-b border-blue-500/20 bg-[#0c1425] px-4 py-2.5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-blue-400 text-xs font-semibold shrink-0">SUMMARY</span>
          <span
            className={`text-sm text-muted-foreground leading-snug transition-opacity duration-500 ${
              animating ? "opacity-0" : "opacity-100"
            }`}
          >
            {summary ?? "No summary yet"}
          </span>
        </div>
        <button
          onClick={handleRefresh}
          disabled={isRefreshing || cooldown || isStreaming}
          className="shrink-0 rounded p-1 text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed"
          title={cooldown ? "Please wait before refreshing again" : "Refresh summary"}
        >
          <svg
            className={`h-3.5 w-3.5 ${isRefreshing ? "animate-spin" : ""}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
            />
          </svg>
        </button>
      </div>
    </div>
  );
}
