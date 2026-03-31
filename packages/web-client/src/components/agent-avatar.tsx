import type { AgentAvatar as AgentAvatarType } from "../types";

interface AgentAvatarProps {
  avatar: AgentAvatarType;
  size?: "sm" | "md" | "lg";
}

const sizeClasses = {
  sm: "h-6 w-6 text-xs",
  md: "h-8 w-8 text-sm",
  lg: "h-11 w-11 text-lg",
};

export function AgentAvatar({ avatar, size = "md" }: AgentAvatarProps) {
  return (
    <div
      className={`flex items-center justify-center rounded-full ${sizeClasses[size]}`}
      style={{ backgroundColor: avatar.color }}
    >
      {avatar.emoji}
    </div>
  );
}
