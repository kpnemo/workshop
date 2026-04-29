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
  summaryInstruction?: string;
}

export interface DelegationMeta {
  type: "delegation_start" | "delegation_end" | "assignment" | "redirect_to_router";
  from: string;
  to: string;
  context?: string;
  summary?: string;
  agentName?: string;
  reason?: string;
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
  summary: string | null;
  summaryEnabled: boolean;
}

export interface ConversationSummary {
  id: string;
  agentId: string;
  title: string | null;
  updatedAt: Date;
  messageCount: number;
  summaryEnabled: boolean;
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

// Admin domain types (Phase 1)
export interface Group {
  id: string;
  name: string;
  createdAt: string;
}

export interface Profile {
  id: string;
  name: string;
  createdAt: string;
}

export interface AdminUserSummary {
  id: string;
  email: string;
  createdAt: string;
  groupIds: string[];
}
