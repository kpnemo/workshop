import type { DelegationMeta, AgentSummary } from "../types";

interface DelegationBannerProps {
  meta: DelegationMeta;
  agents: AgentSummary[];
}

export function DelegationBanner({ meta, agents }: DelegationBannerProps) {
  if (meta.type === "delegation_start") {
    const targetAgent = agents.find((a) => a.id === meta.to);
    const emoji = targetAgent?.avatar?.emoji ?? "🤖";
    const name = targetAgent?.name ?? meta.to;

    return (
      <div className="flex items-center justify-center gap-2 px-4 py-2">
        <div className="flex items-center gap-2 rounded-full bg-surface px-4 py-1.5 text-xs text-muted">
          <span>{emoji}</span>
          <span className="font-medium text-foreground">{name}</span>
          <span>joined</span>
          {meta.context && (
            <span className="text-muted">— {meta.context}</span>
          )}
        </div>
      </div>
    );
  }

  if (meta.type === "delegation_end") {
    const mainAgent = agents.find((a) => a.id === meta.to);
    const emoji = mainAgent?.avatar?.emoji ?? "🤖";
    const name = mainAgent?.name ?? "Main Agent";

    return (
      <div className="flex items-center justify-center gap-2 px-4 py-2">
        <div className="flex items-center gap-2 rounded-full bg-surface px-4 py-1.5 text-xs text-muted">
          <span>{emoji}</span>
          <span className="font-medium text-foreground">{name}</span>
          <span>resumed</span>
        </div>
      </div>
    );
  }

  if (meta.type === "assignment") {
    const targetAgent = agents.find((a) => a.id === meta.to);
    const emoji = targetAgent?.avatar?.emoji ?? "🤖";
    const name = meta.agentName ?? targetAgent?.name ?? meta.to;

    return (
      <div className="flex items-center justify-center gap-2 px-4 py-2">
        <div className="flex items-center gap-2 rounded-full bg-surface px-4 py-1.5 text-xs text-muted">
          <span>✨</span>
          <span>Connected you with</span>
          <span>{emoji}</span>
          <span className="font-medium text-foreground">{name}</span>
          {meta.reason && <span className="text-muted">— {meta.reason}</span>}
        </div>
      </div>
    );
  }

  if (meta.type === "redirect_to_router") {
    const fromAgent = agents.find((a) => a.id === meta.from);
    const fromEmoji = fromAgent?.avatar?.emoji ?? "🤖";
    const fromName = fromAgent?.name ?? meta.from;
    const toAgent = agents.find((a) => a.id === meta.to);
    const toName = meta.agentName ?? toAgent?.name ?? meta.to;
    // Live SSE delivers reason on `meta.reason`; history-reload delivers it via `meta.summary`.
    const reason = meta.reason ?? meta.summary;

    return (
      <div className="flex items-center justify-center gap-2 px-4 py-2">
        <div className="flex items-center gap-2 rounded-full bg-surface px-4 py-1.5 text-xs text-muted">
          <span>{fromEmoji}</span>
          <span className="font-medium text-foreground">{fromName}</span>
          <span>sent you back to</span>
          <span>✨</span>
          <span className="font-medium text-foreground">{toName}</span>
          {reason && <span className="text-muted">— {reason}</span>}
        </div>
      </div>
    );
  }

  return null;
}
