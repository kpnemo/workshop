import { Router } from "express";
import type { Request, Response } from "express";
import Anthropic from "@anthropic-ai/sdk";
import { v4 as uuidv4 } from "uuid";
import { Database } from "../services/database.js";
import { checkTopicBoundary } from "../services/guardrails.js";
import type { AgentConfig } from "../types.js";
import type { ToolService } from "../services/tool-service.js";

let anthropic: Anthropic | null = null;
function getClient(): Anthropic {
  if (!anthropic) {
    anthropic = new Anthropic();
  }
  return anthropic;
}

export function createConversationRouter(
  agents: Map<string, AgentConfig>,
  db: Database,
  toolService?: ToolService
): Router {
  const router = Router();

  function verifyOwnership(conversationId: string, userId: string): boolean {
    const ownerId = db.getConversationOwnerId(conversationId);
    return ownerId === userId;
  }

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
  router.get("/", (req: Request, res: Response) => {
    const conversations = db.listConversations(req.userId!);
    console.log(`[conversations] Listed ${conversations.length} conversation(s) for user ${req.userId}`);
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
    const conversation = db.createConversation(id, agentId, req.userId!);
    console.log(`[conversations] Created conversation ${id} with agent "${agentId}"`);
    res.status(201).json({
      conversationId: conversation.id,
      agentId: conversation.agentId,
      createdAt: conversation.createdAt.toISOString(),
    });
  });

  // DELETE /conversations/:id - Delete a conversation
  router.delete("/:id", (req: Request, res: Response) => {
    if (!verifyOwnership(req.params.id, req.userId!)) {
      res.status(404).json({ error: "Conversation not found" });
      return;
    }
    const deleted = db.deleteConversation(req.params.id as string);
    if (!deleted) {
      res.status(404).json({ error: "Conversation not found" });
      return;
    }
    console.log(`[conversations] Deleted conversation ${req.params.id}`);
    res.status(204).send();
  });

  // POST /conversations/:id/messages - Send a message (SSE response)
  router.post("/:id/messages", async (req: Request, res: Response) => {
    if (!verifyOwnership(req.params.id, req.userId!)) {
      res.status(404).json({ error: "Conversation not found" });
      return;
    }
    const conversation = db.getConversation(req.params.id)!;

    const { message } = req.body;
    if (!message || (typeof message === "string" && message.trim() === "")) {
      res.status(400).json({ error: "Message is required" });
      return;
    }

    const agent = agents.get(conversation.agentId)!;
    console.log(`[message] New message in conversation ${conversation.id} (agent: "${conversation.agentId}")`);
    console.log(`[message] User: "${message.slice(0, 100)}${message.length > 100 ? "..." : ""}"`);

    // Guardrail check (before SSE headers)
    if (agent.topicBoundaries) {
      console.log(`[guardrails] Checking topic boundaries for agent "${conversation.agentId}"`);
      const guardrailResult = await checkTopicBoundary(
        message,
        agent.topicBoundaries
      );

      if (!guardrailResult.allowed) {
        console.log(`[guardrails] Message BLOCKED: ${guardrailResult.message}`);
        db.addMessage(conversation.id, "user", message);
        startSSE(res);
        writeSSE(res, "blocked", { message: guardrailResult.message });
        writeSSE(res, "done", { conversationId: conversation.id });
        res.end();
        return;
      }
      console.log(`[guardrails] Message allowed`);
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

    const MAX_TOOL_ITERATIONS = 5;
    const tools = toolService ? toolService.getToolsForAgent(agent) : [];

    // Messages array for the agentic loop — starts with conversation history
    // and grows with tool_use/tool_result pairs during tool execution
    const loopMessages: Array<{ role: string; content: any }> = claudeMessages;

    startSSE(res);

    try {
      let fullResponse = "";
      let iterations = 0;

      while (iterations < MAX_TOOL_ITERATIONS) {
        iterations++;

        const streamParams: Record<string, any> = {
          model: agent.model,
          max_tokens: agent.maxTokens,
          temperature: agent.temperature,
          system: agent.systemPrompt,
          messages: loopMessages,
        };
        if (tools.length > 0) {
          streamParams.tools = tools;
        }

        const streamStart = Date.now();
        let stream;
        try {
          console.log(`[stream] Starting Claude stream (model: ${agent.model}, iteration: ${iterations}, messages: ${loopMessages.length})`);
          stream = getClient().messages.stream(streamParams as any);
        } catch (err) {
          console.error("[stream] Failed to create stream:", err);
          writeSSE(res, "error", { message: "LLM service error" });
          break;
        }

        // Stream text deltas to frontend in real-time
        for await (const event of stream) {
          if (
            event.type === "content_block_delta" &&
            event.delta.type === "text_delta"
          ) {
            fullResponse += event.delta.text;
            writeSSE(res, "delta", { text: event.delta.text });
          }
        }

        // Get the final message for stop_reason and tool_use blocks
        const finalMessage = await stream.finalMessage();
        const streamMs = Date.now() - streamStart;

        console.log(`[stream] Response complete (${fullResponse.length} chars, ${streamMs}ms, stop: ${finalMessage.stop_reason})`);

        // Check if Claude wants to use tools
        if (finalMessage.stop_reason !== "tool_use") {
          break; // No tool calls — we're done
        }

        // Extract tool_use blocks
        const toolUseBlocks = finalMessage.content.filter(
          (block: any) => block.type === "tool_use"
        );

        if (toolUseBlocks.length === 0 || !toolService) {
          break;
        }

        // Push assistant message with all content blocks (text + tool_use)
        loopMessages.push({
          role: "assistant",
          content: finalMessage.content,
        });

        // Execute each tool and build tool_result blocks
        const toolResults: Array<{ type: "tool_result"; tool_use_id: string; content: string }> = [];

        for (const toolUse of toolUseBlocks as any[]) {
          console.log(`[tool] Executing ${toolUse.name} with input: ${JSON.stringify(toolUse.input).slice(0, 200)}`);
          writeSSE(res, "tool_start", { tool: toolUse.name, input: toolUse.input });

          const toolStart = Date.now();
          const result = await toolService.execute(toolUse.name, toolUse.input);
          const toolMs = Date.now() - toolStart;

          console.log(`[tool] ${toolUse.name} completed (${toolMs}ms, ${result.length} chars)`);
          writeSSE(res, "tool_done", { tool: toolUse.name, duration_ms: toolMs });

          toolResults.push({
            type: "tool_result",
            tool_use_id: toolUse.id,
            content: result,
          });
        }

        // Push tool results as a user message
        loopMessages.push({
          role: "user",
          content: toolResults,
        });

        // Reset fullResponse for the next iteration — we only save the final text
        fullResponse = "";
      }

      // Save final assistant response
      if (fullResponse) {
        db.addMessage(conversation.id, "assistant", fullResponse);
      }

      // Generate title if this is the first exchange (no title yet)
      if (!conversation.title) {
        try {
          console.log(`[title] Generating title for conversation ${conversation.id}`);
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
            console.log(`[title] Generated: "${title}"`);
          }
        } catch (err) {
          console.error("[title] Title generation failed:", err);
        }
      }

      writeSSE(res, "done", { conversationId: conversation.id });
      res.end();
    } catch (err) {
      console.error("[stream] Stream error:", err);
      writeSSE(res, "error", { message: "LLM service error" });
      writeSSE(res, "done", { conversationId: conversation.id });
      res.end();
    }
  });

  // GET /conversations/:id - Get conversation history
  router.get("/:id", (req: Request, res: Response) => {
    if (!verifyOwnership(req.params.id, req.userId!)) {
      res.status(404).json({ error: "Conversation not found" });
      return;
    }
    const conversation = db.getConversation(req.params.id)!;

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
