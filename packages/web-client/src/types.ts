export interface Message {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: Date;
}

export interface ChatState {
  conversationId: string | null;
  messages: Message[];
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
  onDone: () => void;
}
