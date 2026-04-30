export interface DelegationMeta {
  type: "delegation_start" | "delegation_end" | "assignment" | "redirect_to_router";
  from: string;
  to: string;
  context?: string;
  summary?: string;
  agentName?: string;
  reason?: string;
}

export interface DebugEvent {
  id: string;
  timestamp: Date;
  type: 'agent' | 'thinking' | 'tool' | 'stream' | 'delegation' | 'assignment' | 'redirect' | 'summary';
  data: Record<string, unknown>;
  turn?: string;
}

export interface Message {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: Date;
  agentId?: string | null;
  delegationMeta?: DelegationMeta | null;
}

export interface ConversationSummary {
  id: string;
  agentId: string;
  title: string | null;
  updatedAt: string;
  messageCount: number;
  summaryEnabled: boolean;
  icon: string | null;
}

export interface ChatState {
  conversationId: string | null;
  messages: Message[];
  conversations: ConversationSummary[];
  isStreaming: boolean;
  isConnecting: boolean;
  error: string | null;
  summary: string | null;
  summaryEnabled: boolean;
}

export interface ConversationResponse {
  conversationId: string;
  agentId: string;
  createdAt: string;
}

export interface ConversationDetail {
  conversationId: string;
  agentId: string;
  activeAgent?: string | null;
  title: string | null;
  createdAt: string;
  summary: string | null;
  summaryEnabled: boolean;
  messages: Array<{
    role: "user" | "assistant" | "system";
    content: string;
    timestamp: string;
    agentId?: string | null;
    delegationMeta?: DelegationMeta | null;
  }>;
}

export interface SendMessageCallbacks {
  onDelta: (text: string, agentId?: string) => void;
  onBlocked?: (message: string) => void;
  onError: (message: string) => void;
  onTitle: (title: string) => void;
  onIcon?: (icon: string) => void;
  onDone: () => void;
  onDelegationStart?: (data: { from: string; to: string; agentName: string; emoji: string; color: string; context: string }) => void;
  onDelegationEnd?: (data: { from: string; to: string; agentName: string; summary: string }) => void;
  onAssignment?: (data: { from: string; to: string; agentName: string; reason: string }) => void;
  onRedirect?: (data: { from: string; to: string; agentName: string; reason: string }) => void;
  onDebugAgent?: (data: { agentId: string; model: string; temperature: number; maxTokens: number; systemPromptPreview: string; isDelegated: boolean }) => void;
  onDebugThinking?: (data: { text: string }) => void;
  onDebugTool?: (data: { tool: string; input: Record<string, unknown>; result: string; durationMs: number; resultSize: number }) => void;
  onDebugStream?: (data: { tokens: number; stopReason: string; totalMs: number; iteration: number }) => void;
  onSummary?: (data: { summary: string }) => void;
  onDebugSummary?: (data: { summary: string }) => void;
}

export interface AgentAvatar {
  emoji: string;
  color: string;
}

export interface AgentSummary {
  id: string;
  name: string;
  model: string;
  avatar: AgentAvatar;
  hasGuardrails: boolean;
}

export interface AgentConfig {
  id: string;
  name: string;
  model: string;
  maxTokens: number;
  temperature: number;
  systemPrompt: string;
  avatar: AgentAvatar;
  tools?: string[];
  delegates?: string[];
  topicBoundaries?: {
    allowed: string[];
    blocked: string[];
    boundaryMessage: string;
  };
}

export interface CreateAgentInput {
  name: string;
  systemPrompt: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
  avatar?: AgentAvatar;
  tools?: string[];
  delegates?: string[];
  topicBoundaries?: {
    allowed: string[];
    blocked: string[];
    boundaryMessage: string;
  };
}

export interface FileInfo {
  id: string;
  filename: string;
  sizeBytes: number;
  mimeType: string;
  description: string | null;
  createdAt: string;
}
