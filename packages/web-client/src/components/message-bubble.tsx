import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import type { Message } from "../types";

interface MessageBubbleProps {
  message: Message;
}

export function MessageBubble({ message }: MessageBubbleProps) {
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

  // Assistant
  return (
    <div className="flex items-start gap-2 px-4">
      <div className="flex h-7 w-7 min-w-[1.75rem] items-center justify-center rounded-full bg-primary text-xs text-white">
        S
      </div>
      <div className="max-w-[80%] rounded-[4px_16px_16px_16px] bg-assistant-bg px-4 py-3 text-sm leading-relaxed">
        <div className="prose prose-invert prose-sm max-w-none prose-p:my-1 prose-ul:my-1 prose-ol:my-1 prose-li:my-0 prose-pre:my-2 prose-headings:my-2">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            rehypePlugins={[rehypeHighlight]}
          >
            {message.content}
          </ReactMarkdown>
        </div>
      </div>
    </div>
  );
}
