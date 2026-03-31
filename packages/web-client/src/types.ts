export interface Message {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: Date;
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
  title: string | null;
  createdAt: string;
  messages: Array<{
    role: "user" | "assistant";
    content: string;
    timestamp: string;
  }>;
}

export interface SendMessageCallbacks {
  onDelta: (text: string) => void;
  onBlocked: (message: string) => void;
  onError: (message: string) => void;
  onTitle: (title: string) => void;
  onDone: () => void;
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
  topicBoundaries?: {
    allowed: string[];
    blocked: string[];
    boundaryMessage: string;
  };
}
