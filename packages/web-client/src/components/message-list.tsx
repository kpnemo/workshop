import { useAutoScroll } from "../hooks/use-auto-scroll";
import { MessageBubble } from "./message-bubble";
import { TypingIndicator } from "./typing-indicator";
import type { Message } from "../types";

interface MessageListProps {
  messages: Message[];
  isStreaming: boolean;
}

export function MessageList({ messages, isStreaming }: MessageListProps) {
  const lastMessage = messages[messages.length - 1];
  const showTypingIndicator =
    isStreaming && lastMessage?.role === "assistant" && lastMessage.content === "";

  const { scrollRef, handleScroll } = useAutoScroll([messages, isStreaming]);

  return (
    <div
      ref={scrollRef}
      onScroll={handleScroll}
      className="flex-1 overflow-y-auto py-4"
    >
      {messages.length === 0 && (
        <div className="flex h-full flex-col items-center justify-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-xl text-white">
            S
          </div>
          <div className="text-base font-semibold">Support Bot</div>
          <div className="max-w-[260px] text-center text-sm text-muted">
            Ask me about products, troubleshooting, or pricing. I&apos;m here to help!
          </div>
        </div>
      )}

      <div className="flex flex-col gap-4">
        {messages.map((msg) =>
          msg.role === "assistant" && msg.content === "" && showTypingIndicator ? null : (
            <MessageBubble key={msg.id} message={msg} />
          )
        )}
        {showTypingIndicator && <TypingIndicator />}
      </div>
    </div>
  );
}
