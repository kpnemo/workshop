export interface TopicBoundaries {
  allowed: string[];
  blocked: string[];
  boundaryMessage: string;
}

export interface AgentConfig {
  id: string;
  name: string;
  model: string;
  maxTokens: number;
  temperature: number;
  systemPrompt: string;
  topicBoundaries?: TopicBoundaries;
}

export interface Message {
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

export interface Conversation {
  id: string;
  agentId: string;
  title: string | null;
  messages: Message[];
  createdAt: Date;
  updatedAt: Date;
}

export interface ConversationSummary {
  id: string;
  agentId: string;
  title: string | null;
  updatedAt: Date;
  messageCount: number;
}
