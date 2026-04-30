import { lazy, Suspense } from "react";
import dynamicIconImports from "lucide-react/dynamicIconImports";
import type { AgentAvatar } from "../types";

interface Props {
  icon: string | null;
  agentAvatar: AgentAvatar;
  size?: "sm" | "md";
}

const sizeClasses = {
  sm: "h-6 w-6 text-sm",
  md: "h-8 w-8 text-base",
};

const lucideSize = { sm: 14, md: 18 };

// Cache lazy components per icon name so repeat renders don't re-create them.
const lucideCache = new Map<string, ReturnType<typeof lazy>>();

function getLucideComponent(name: string) {
  if (lucideCache.has(name)) return lucideCache.get(name)!;
  const importer = (dynamicIconImports as Record<string, () => Promise<{ default: any }>>)[name];
  if (!importer) return null;
  const Comp = lazy(importer);
  lucideCache.set(name, Comp);
  return Comp;
}

export function ConversationIcon({ icon, agentAvatar, size = "sm" }: Props) {
  const fallback = <>{agentAvatar.emoji}</>;
  const wrapperClass = `flex items-center justify-center rounded-full flex-none ${sizeClasses[size]}`;
  const wrapperStyle = { backgroundColor: agentAvatar.color };

  let inner: React.ReactNode = fallback;

  if (icon) {
    if (icon.startsWith("emoji:")) {
      const body = icon.slice("emoji:".length);
      if (body.length > 0) inner = body;
    } else if (icon.startsWith("lucide:")) {
      const name = icon.slice("lucide:".length);
      const Comp = getLucideComponent(name);
      if (Comp) {
        const LucideIcon = Comp as React.ComponentType<{ size?: number }>;
        inner = (
          <Suspense fallback={fallback}>
            <LucideIcon size={lucideSize[size]} />
          </Suspense>
        );
      }
    }
  }

  return (
    <div className={wrapperClass} style={wrapperStyle}>
      {inner}
    </div>
  );
}
