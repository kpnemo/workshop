export interface DelegationMeta {
  type: "delegation_start" | "delegation_end" | "assignment";
  from: string;
  to: string;
  context?: string;
  summary?: string;
  agentName?: string;
  reason?: string;
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
}

export interface ChatState {
  conversationId: string | null;
  messages: Message[];
  conversations: ConversationSummary[];
  isStreaming: boolean;
  isConnecting: boolean;
  error: string | null;
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
  onBlocked: (message: string) => void;
  onError: (message: string) => void;
  onTitle: (title: string) => void;
  onDone: () => void;
  onDelegationStart?: (data: { from: string; to: string; agentName: string; emoji: string; color: string; context: string }) => void;
  onDelegationEnd?: (data: { from: string; to: string; agentName: string; summary: string }) => void;
  onAssignment?: (data: { from: string; to: string; agentName: string; reason: string }) => void;
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
