import { Router } from "express";
import type { Request, Response } from "express";
import Anthropic from "@anthropic-ai/sdk";
import { v4 as uuidv4 } from "uuid";
import { Database } from "../services/database.js";
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
  db: Database
): Router {
  const router = Router();

  function startSSE(res: Response) {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();
  }

  function writeSSE(res: Response, event: string, data: object) {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  }

  // GET /conversations - List all conversations
  router.get("/", (_req: Request, res: Response) => {
    const conversations = db.listConversations();
    res.json(
      conversations.map((c) => ({
        id: c.id,
        agentId: c.agentId,
        title: c.title,
        updatedAt: c.updatedAt.toISOString(),
        messageCount: c.messageCount,
      }))
    );
  });

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

    const id = uuidv4();
    const conversation = db.createConversation(id, agentId);
    res.status(201).json({
      conversationId: conversation.id,
      agentId: conversation.agentId,
      createdAt: conversation.createdAt.toISOString(),
    });
  });

  // DELETE /conversations/:id - Delete a conversation
  router.delete("/:id", (req: Request, res: Response) => {
    const deleted = db.deleteConversation(req.params.id as string);
    if (!deleted) {
      res.status(404).json({ error: "Conversation not found" });
      return;
    }
    res.status(204).send();
  });

  // POST /conversations/:id/messages - Send a message (SSE response)
  router.post("/:id/messages", async (req: Request, res: Response) => {
    const conversation = db.getConversation(req.params.id as string);
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
        db.addMessage(conversation.id, "user", message);
        startSSE(res);
        writeSSE(res, "blocked", { message: guardrailResult.message });
        writeSSE(res, "done", { conversationId: conversation.id });
        res.end();
        return;
      }
    }

    // Add user message to history
    db.addMessage(conversation.id, "user", message);

    // Reload conversation to get all messages including the one just added
    const updatedConversation = db.getConversation(conversation.id)!;

    // Build messages array for Claude
    const claudeMessages = updatedConversation.messages.map((m) => ({
      role: m.role,
      content: m.content,
    }));

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

      // Save assistant response
      db.addMessage(conversation.id, "assistant", fullResponse);

      // Generate title if this is the first exchange (no title yet)
      if (!conversation.title) {
        try {
          const titleResponse = await getClient().messages.create({
            model: "claude-haiku-4-5-20251001",
            max_tokens: 20,
            messages: [
              {
                role: "user",
                content: `Generate a 3-6 word title for this conversation. Reply with ONLY the title, no quotes or punctuation.\n\nUser: ${message}\nAssistant: ${fullResponse.slice(0, 200)}`,
              },
            ],
          });

          const title =
            titleResponse.content[0].type === "text"
              ? titleResponse.content[0].text.trim()
              : null;

          if (title) {
            db.setTitle(conversation.id, title);
            writeSSE(res, "title", { title });
          }
        } catch (err) {
          console.error("[routes] Title generation failed:", err);
        }
      }

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
    const conversation = db.getConversation(req.params.id as string);
    if (!conversation) {
      res.status(404).json({ error: "Conversation not found" });
      return;
    }

    res.json({
      conversationId: conversation.id,
      agentId: conversation.agentId,
      title: conversation.title,
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
