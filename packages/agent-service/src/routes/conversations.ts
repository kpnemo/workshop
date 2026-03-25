import { Router } from "express";
import type { Request, Response } from "express";
import Anthropic from "@anthropic-ai/sdk";
import { ConversationStore } from "../services/conversation.js";
import { checkTopicBoundary } from "../services/guardrails.js";
import type { AgentConfig } from "../types.js";

let anthropic: Anthropic | null = null;
function getClient(): Anthropic {
  if (!anthropic) {
    anthropic = new Anthropic();
  }
  return anthropic;
}

export function createConversationRouter(
  agents: Map<string, AgentConfig>,
  store: ConversationStore
): Router {
  const router = Router();

  // Helper to start SSE response
  function startSSE(res: Response) {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();
  }

  function writeSSE(res: Response, event: string, data: object) {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  }

  // POST /conversations - Create a new conversation
  router.post("/", (req: Request, res: Response) => {
    const { agentId } = req.body;

    if (!agentId || (typeof agentId === "string" && agentId.trim() === "")) {
      res.status(400).json({ error: "agentId is required" });
      return;
    }

    if (!agents.has(agentId)) {
      res.status(404).json({ error: "Agent not found" });
      return;
    }

    const conversation = store.create(agentId);
    res.status(201).json({
      conversationId: conversation.id,
      agentId: conversation.agentId,
      createdAt: conversation.createdAt.toISOString(),
    });
  });

  // POST /conversations/:id/messages - Send a message (SSE response)
  router.post("/:id/messages", async (req: Request, res: Response) => {
    const conversation = store.get(req.params.id as string);
    if (!conversation) {
      res.status(404).json({ error: "Conversation not found" });
      return;
    }

    const { message } = req.body;
    if (!message || (typeof message === "string" && message.trim() === "")) {
      res.status(400).json({ error: "Message is required" });
      return;
    }

    const agent = agents.get(conversation.agentId)!;

    // Guardrail check (before SSE headers)
    if (agent.topicBoundaries) {
      const guardrailResult = await checkTopicBoundary(
        message,
        agent.topicBoundaries
      );

      if (!guardrailResult.allowed) {
        store.addMessage(conversation.id, "user", message);
        startSSE(res);
        writeSSE(res, "blocked", { message: guardrailResult.message });
        writeSSE(res, "done", { conversationId: conversation.id });
        res.end();
        return;
      }
    }

    // Add user message to history
    store.addMessage(conversation.id, "user", message);

    // Build messages array for Claude
    const claudeMessages = conversation.messages.map((m) => ({
      role: m.role,
      content: m.content,
    }));

    // Attempt to create stream BEFORE setting SSE headers.
    // If this fails (connection refused, auth error), we can still send 502 JSON.
    let stream;
    try {
      stream = getClient().messages.stream({
        model: agent.model,
        max_tokens: agent.maxTokens,
        temperature: agent.temperature,
        system: agent.systemPrompt,
        messages: claudeMessages,
      });
    } catch (err) {
      console.error("[routes] Failed to create stream:", err);
      res.status(502).json({ error: "LLM service error" });
      return;
    }

    // Stream created successfully — now switch to SSE
    startSSE(res);

    try {
      let fullResponse = "";

      for await (const event of stream) {
        if (
          event.type === "content_block_delta" &&
          event.delta.type === "text_delta"
        ) {
          fullResponse += event.delta.text;
          writeSSE(res, "delta", { text: event.delta.text });
        }
      }

      // Add assistant response to history
      store.addMessage(conversation.id, "assistant", fullResponse);

      writeSSE(res, "done", { conversationId: conversation.id });
      res.end();
    } catch (err) {
      console.error("[routes] Stream error:", err);
      writeSSE(res, "error", { message: "LLM service error" });
      writeSSE(res, "done", { conversationId: conversation.id });
      res.end();
    }
  });

  // GET /conversations/:id - Get conversation history
  router.get("/:id", (req: Request, res: Response) => {
    const conversation = store.get(req.params.id as string);
    if (!conversation) {
      res.status(404).json({ error: "Conversation not found" });
      return;
    }

    res.json({
      conversationId: conversation.id,
      agentId: conversation.agentId,
      createdAt: conversation.createdAt.toISOString(),
      messages: conversation.messages.map((m) => ({
        role: m.role,
        content: m.content,
        timestamp: m.timestamp.toISOString(),
      })),
    });
  });

  return router;
}
