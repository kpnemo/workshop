export interface TopicBoundaries {
  allowed: string[];
  blocked: string[];
  boundaryMessage: string;
}

export interface Avatar {
  emoji: string;
  color: string;
}

export interface AgentConfig {
  id: string;
  name: string;
  model: string;
  maxTokens: number;
  temperature: number;
  systemPrompt: string;
  avatar: Avatar;
  topicBoundaries?: TopicBoundaries;
  tools?: string[];
  delegates?: string[];
}

export interface DelegationMeta {
  type: "delegation_start" | "delegation_end";
  from: string;
  to: string;
  context?: string;
  summary?: string;
}

export interface Message {
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: Date;
  agentId?: string | null;
  delegationMeta?: DelegationMeta | null;
}

export interface Conversation {
  id: string;
  agentId: string;
  activeAgent: string | null;
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

export interface User {
  id: string;
  email: string;
  createdAt: Date;
}

export interface FileRecord {
  id: string;
  userId: string;
  filename: string;
  storagePath: string;
  sizeBytes: number;
  mimeType: string;
  description: string | null;
  createdAt: Date;
}

declare module "express-serve-static-core" {
  interface Request {
    userId?: string;
  }
}
