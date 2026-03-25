export function TypingIndicator() {
  return (
    <div className="flex items-start gap-2 px-4">
      <div className="flex h-7 w-7 min-w-[1.75rem] items-center justify-center rounded-full bg-primary text-xs text-white">
        S
      </div>
      <div className="rounded-[4px_16px_16px_16px] bg-assistant-bg px-4 py-3">
        <div className="flex gap-1">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-2 w-2 rounded-full bg-muted"
              style={{
                animation: "pulse-dot 1.4s infinite ease-in-out",
                animationDelay: `${i * 0.2}s`,
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
