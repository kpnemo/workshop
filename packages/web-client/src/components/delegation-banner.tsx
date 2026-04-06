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

  return null;
}
