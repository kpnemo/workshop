import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import type { Message, AgentSummary } from "../types";

interface MessageBubbleProps {
  message: Message;
  agents?: AgentSummary[];
}

export function MessageBubble({ message, agents }: MessageBubbleProps) {
  if (message.role === "system") {
    return (
      <div className="flex justify-center px-4 py-2">
        <div className="rounded-lg bg-surface px-4 py-2 text-center text-sm text-muted">
          {message.content}
        </div>
      </div>
    );
  }

  if (message.role === "user") {
    return (
      <div className="flex justify-end px-4">
        <div className="max-w-[80%] rounded-[16px_16px_4px_16px] bg-primary px-4 py-3 text-sm leading-relaxed text-white">
          {message.content}
        </div>
      </div>
    );
  }

  const agent = message.agentId && agents
    ? agents.find((a) => a.id === message.agentId)
    : null;
  const emoji = agent?.avatar?.emoji ?? "S";
  const color = agent?.avatar?.color ?? undefined;
  const name = agent?.name ?? null;

  return (
    <div className="flex items-start gap-2 px-4">
      <div
        className="flex h-7 w-7 min-w-[1.75rem] items-center justify-center rounded-full text-xs text-white"
        style={{ backgroundColor: color ?? "var(--color-primary)" }}
      >
        {emoji}
      </div>
      <div className="max-w-[80%] rounded-[4px_16px_16px_16px] bg-assistant-bg px-4 py-3 text-sm leading-relaxed">
        {name && (
          <div className="mb-1 text-xs font-medium" style={{ color: color ?? "var(--color-primary)" }}>
            {name}
          </div>
        )}
        <div className="prose prose-invert prose-sm max-w-none prose-p:my-1 prose-ul:my-1 prose-ol:my-1 prose-li:my-0 prose-pre:my-2 prose-headings:my-2">
          <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
            {message.content}
          </ReactMarkdown>
        </div>
      </div>
    </div>
  );
}
