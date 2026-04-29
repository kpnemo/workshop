import { useEffect, useRef, useState } from "react";
import type { DebugEvent } from "../types";

interface DebugPanelProps {
  events: DebugEvent[];
  onClear: () => void;
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

const EVENT_STYLES: Record<string, { color: string; label: string }> = {
  agent: { color: "text-blue-400", label: "AGENT" },
  thinking: { color: "text-purple-400", label: "THINKING" },
  tool: { color: "text-amber-400", label: "TOOL" },
  stream: { color: "text-green-400", label: "STREAM" },
  delegation: { color: "text-pink-400", label: "DELEGATE" },
  assignment: { color: "text-pink-400", label: "ASSIGN" },
  redirect: { color: "text-pink-400", label: "REDIRECT" },
  summary: { color: "text-cyan-400", label: "SUMMARY" },
};

function ThinkingContent({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  const isLong = text.split("\n").length > 3 || text.length > 200;
  const display = isLong && !expanded ? text.split("\n").slice(0, 3).join("\n").slice(0, 200) + "..." : text;

  return (
    <div className="border-l-2 border-purple-400/30 pl-2 text-muted-foreground">
      {display}
      {isLong && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="ml-1 text-purple-400 hover:underline"
        >
          {expanded ? "less" : "more"}
        </button>
      )}
    </div>
  );
}

function EventEntry({ event }: { event: DebugEvent }) {
  const style = EVENT_STYLES[event.type] ?? { color: "text-muted-foreground", label: event.type.toUpperCase() };
  const data = event.data as Record<string, unknown>;
  const isDelegated = (data?.isDelegated as boolean) ?? false;

  return (
    <div className="flex gap-1.5 mb-2">
      <div className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${style.color.replace("text-", "bg-")}`} />
      <div className="min-w-0 text-xs font-mono">
        <div className={`font-semibold ${style.color}`}>
          {style.label}
          {event.type === "tool" && <span className="text-muted-foreground font-normal ml-1">{String(data?.tool)}</span>}
          {event.type === "agent" && isDelegated && <span className="text-pink-400 font-normal ml-1">(delegated)</span>}
        </div>

        {event.type === "agent" && (
          <>
            <div className="text-muted-foreground">{String(data?.agentId ?? "")}</div>
            <div className="text-muted-foreground/60">{String(data?.model ?? "")} · temp {String(data?.temperature ?? "")} · {String(data?.maxTokens ?? "")} max</div>
          </>
        )}

        {event.type === "thinking" && <ThinkingContent text={String(data.text)} />}

        {event.type === "tool" && (
          <>
            <div className="text-muted-foreground/60 truncate">→ {JSON.stringify(data.input)}</div>
            <div className="text-muted-foreground/60 truncate">← {String(data.resultSize)} chars</div>
            <span className="inline-block rounded bg-green-500/10 px-1.5 text-green-400 text-[10px]">
              {String(data.durationMs)}ms
            </span>
          </>
        )}

        {event.type === "stream" && (
          <div className="text-muted-foreground/60">
            {String(data.tokens)} tokens · {String(data.stopReason)} · {String(data.totalMs)}ms
          </div>
        )}

        {event.type === "delegation" && (
          <>
            <div className="text-muted-foreground">{String(data.from)} → {String(data.to)}</div>
            {data.context && <div className="text-muted-foreground/60 truncate">context: {String(data.context)}</div>}
            {data.summary && <div className="text-muted-foreground/60 truncate">summary: {String(data.summary)}</div>}
          </>
        )}

        {event.type === "assignment" && (
          <>
            <div className="text-muted-foreground">{String(data.from)} → {String(data.to)}</div>
            {data.reason && <div className="text-muted-foreground/60 truncate">reason: {String(data.reason)}</div>}
          </>
        )}

        {event.type === "redirect" && (
          <>
            <div className="text-muted-foreground">{String(data.from)} → {String(data.to)}</div>
            {data.agentName && <div className="text-muted-foreground/60 truncate">router: {String(data.agentName)}</div>}
            {data.reason && <div className="text-muted-foreground/60 truncate">reason: {String(data.reason)}</div>}
          </>
        )}

        {event.type === "summary" && (
          <>
            <div className="text-muted-foreground/60 truncate">
              {data.source === "manual-refresh" ? "Manual refresh" : "Agent updated"}
            </div>
            <div className="text-muted-foreground mt-0.5 leading-relaxed">
              {String(data.summary ?? "")}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export function DebugPanel({ events, onClear }: DebugPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [events.length]);

  // Group events by turn
  const turns: Array<{ label?: string; events: DebugEvent[] }> = [];
  let currentTurn: string | undefined;

  for (const event of events) {
    if (event.turn !== currentTurn) {
      currentTurn = event.turn;
      turns.push({ label: currentTurn, events: [event] });
    } else {
      turns[turns.length - 1]?.events.push(event);
    }
  }

  return (
    <div className="flex w-[300px] shrink-0 flex-col border-l border-border bg-[#0d1117]">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <span className="text-sm font-semibold text-amber-400">Debug Log</span>
        <button
          onClick={onClear}
          className="rounded border border-border px-2 py-0.5 text-[10px] text-muted-foreground hover:text-foreground"
        >
          Clear
        </button>
      </div>
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-3">
        {events.length === 0 && (
          <p className="text-center text-xs text-muted-foreground/50 mt-8">
            Send a message to see debug events...
          </p>
        )}
        {turns.map((turn, i) => (
          <div key={i} className="mb-3">
            {turn.label && (
              <div className="mb-2 border-b border-border/50 pb-1 text-[10px] text-muted-foreground/50 truncate">
                {turn.label}
              </div>
            )}
            {turn.events.map((event) => (
              <EventEntry key={event.id} event={event} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
