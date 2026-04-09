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
    let conversation = db.getConversation(req.params.id)!;

    const { message } = req.body;
    if (!message || (typeof message === "string" && message.trim() === "")) {
      res.status(400).json({ error: "Message is required" });
      return;
    }

    const agent = agents.get(conversation.agentId)!;

    // Delegation routing: use active_agent if set, otherwise conversation's agent
    const activeAgentId = conversation.activeAgent ?? conversation.agentId;
    const activeAgent = agents.get(activeAgentId);

    if (!activeAgent) {
      db.setActiveAgent(conversation.id, null);
      startSSE(res);
      writeSSE(res, "error", { message: `Agent "${activeAgentId}" not found. Returning to main agent.` });
      writeSSE(res, "delegation_end", { from: activeAgentId, to: conversation.agentId, agentName: agent.name, summary: "Agent unavailable" });
      writeSSE(res, "done", { conversationId: conversation.id });
      res.end();
      return;
    }

    const isMainAgent = activeAgentId === conversation.agentId;
    const isActiveDelegate = !isMainAgent;

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

    startSSE(res);
      const debug = req.query.debug === "true";

    try {
      const MAX_TOOL_ITERATIONS = 5;

      // Outer delegation loop — re-runs when delegate_to switches the active agent
      let fullResponse = "";
      let continueWithDelegation = true;
      while (continueWithDelegation) {
        continueWithDelegation = false;

        // Reload conversation to get latest state (including active_agent changes from delegation)
        const currentConv = db.getConversation(conversation.id)!;
        conversation = currentConv; // keep outer ref in sync (needed after assign_agent changes agentId)
        const curAgentId = currentConv.activeAgent ?? currentConv.agentId;
        const curAgent = agents.get(curAgentId);

        if (!curAgent) {
          db.setActiveAgent(conversation.id, null);
          writeSSE(res, "error", { message: `Agent "${curAgentId}" not found. Returning to main agent.` });
          writeSSE(res, "delegation_end", { from: curAgentId, to: conversation.agentId, agentName: agent.name, summary: "Agent unavailable" });
          break;
        }

        const curIsMain = curAgentId === conversation.agentId;
        const curIsDelegate = !curIsMain;

        // Build messages array for Claude — delegation-aware
        let claudeMessages: Array<{ role: string; content: any }>;

        if (curIsDelegate) {
          const delegationStartIdx = currentConv.messages.findLastIndex(
            (m) => m.delegationMeta?.type === "delegation_start"
          );
          const messagesAfterDelegation = delegationStartIdx >= 0
            ? currentConv.messages.slice(delegationStartIdx + 1)
            : currentConv.messages;

          claudeMessages = messagesAfterDelegation
            .filter((m) => m.role !== "system")
            .map((m) => ({ role: m.role, content: m.content }));
        } else {
          claudeMessages = currentConv.messages
            .filter((m) => {
              if (m.agentId && m.agentId !== conversation.agentId && !m.delegationMeta) return false;
              if (m.delegationMeta?.type === "delegation_start") return false;
              if (m.delegationMeta?.type === "delegation_end") return true;
              return m.role !== "system";
            })
            .map((m) => {
              if (m.delegationMeta?.type === "delegation_end") {
                return { role: "user" as const, content: `[Specialist agent completed task: ${m.delegationMeta.summary}]` };
              }
              return { role: m.role, content: m.content };
            });
        }

        // Build system prompt
        let systemPrompt = curAgent.systemPrompt;

        if (curIsMain && curAgent.delegates && curAgent.delegates.length > 0) {
          const delegateDescriptions = curAgent.delegates
            .map((delegateId) => {
              const delegateAgent = agents.get(delegateId);
              if (!delegateAgent) return null;
              const firstLine = delegateAgent.systemPrompt.split("\n")[0];
              return `• ${delegateId} ("${delegateAgent.name}") — ${firstLine}`;
            })
            .filter(Boolean)
            .join("\n");

          systemPrompt += `\n\n[Available Specialist Agents]\nYou can delegate tasks to these specialist agents using the delegate_to tool:\n\n${delegateDescriptions}\n\nWhen a user's request matches a specialist's capability, delegate to them with a clear context summary. Handle general conversation yourself.`;
        }

        if (curIsDelegate) {
          const delegationStart = currentConv.messages.findLast(
            (m) => m.delegationMeta?.type === "delegation_start"
          );
          const delegationContext = delegationStart?.delegationMeta?.context ?? "No context provided";
          systemPrompt = `[Delegation Context]\nYou have been asked to help with a specific task.\nContext from the main agent: "${delegationContext}"\n\nWhen you have completed the task, you MUST call the hand_back tool with a brief summary of what you accomplished. Do not continue the conversation after handing back.\n\n${systemPrompt}`;

          // When specialist is invoked immediately after delegation (no user message yet),
          // inject the delegation context as a synthetic user message so Claude has something to respond to
          if (claudeMessages.length === 0) {
            claudeMessages.push({ role: "user", content: delegationContext });
          }
        }

        const delegationOptions = { isMainAgent: curIsMain, isActiveDelegate: curIsDelegate };
        const tools = toolService ? toolService.getToolsForAgent(curAgent, delegationOptions) : [];
        const loopMessages: Array<{ role: string; content: any }> = claudeMessages;

        fullResponse = "";
        let iterations = 0;
        let delegateToOccurred = false;
        let handBackOccurred = false;

        while (iterations < MAX_TOOL_ITERATIONS) {
          iterations++;

          const streamParams: Record<string, any> = {
            model: curAgent.model,
            max_tokens: curAgent.maxTokens,
            temperature: curAgent.temperature,
            system: systemPrompt,
            messages: loopMessages,
          };
          if (tools.length > 0) {
            streamParams.tools = tools;
          }
          if (debug) {
            streamParams.thinking = { type: "enabled", budget_tokens: 5000 };
            streamParams.temperature = 1; // required when thinking is enabled
          }

          if (debug) {
            writeSSE(res, "debug_agent", {
              agentId: curAgentId,
              model: curAgent.model,
              temperature: curAgent.temperature,
              maxTokens: curAgent.maxTokens,
              systemPromptPreview: curAgent.systemPrompt.slice(0, 200),
              isDelegated: curIsDelegate,
            });
          }

          const streamStart = Date.now();
          let stream;
          try {
            console.log(`[stream] Starting Claude stream (agent: ${curAgentId}, model: ${curAgent.model}, iteration: ${iterations}, messages: ${loopMessages.length})`);
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
              writeSSE(res, "delta", { text: event.delta.text, agentId: curAgentId });
            }
          }

          // Get the final message for stop_reason and tool_use blocks
          const finalMessage = await stream.finalMessage();
          const streamMs = Date.now() - streamStart;

          console.log(`[stream] Response complete (${fullResponse.length} chars, ${streamMs}ms, stop: ${finalMessage.stop_reason})`);

          if (debug) {
            const thinkingBlocks = finalMessage.content.filter(
              (block: any) => block.type === "thinking"
            );
            for (const block of thinkingBlocks) {
              writeSSE(res, "debug_thinking", { text: (block as any).thinking });
            }
          }

          if (debug) {
            writeSSE(res, "debug_stream", {
              tokens: finalMessage.usage?.output_tokens ?? 0,
              stopReason: finalMessage.stop_reason,
              totalMs: streamMs,
              iteration: iterations,
            });
          }

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
            const toolContext = { conversationId: conversation.id, res, db, agents };
            const result = await toolService.execute(toolUse.name, toolUse.input, toolContext);
            const toolMs = Date.now() - toolStart;

            console.log(`[tool] ${toolUse.name} completed (${toolMs}ms, ${result.length} chars)`);
            writeSSE(res, "tool_done", { tool: toolUse.name, duration_ms: toolMs });

            if (debug) {
              writeSSE(res, "debug_tool", {
                tool: toolUse.name,
                input: toolUse.input,
                result: result.slice(0, 500),
                durationMs: toolMs,
                resultSize: result.length,
              });
            }

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

          // Check if an assignment tool was invoked (terminal — router's turn is done)
          const hasAssignment = toolResults.some((r) => r.content.startsWith("[ASSIGNMENT]"));
          if (hasAssignment) {
            // assign_agent reassigns the conversation. Continue the outer loop so the
            // newly-assigned agent takes its turn immediately, responding to the user's
            // original message instead of forcing them to send another one.
            continueWithDelegation = true;
            break;
          }

          // Check if a delegation tool was invoked
          const hasDelegation = toolResults.some((r) => r.content.startsWith("[DELEGATION]"));
          if (hasDelegation) {
            delegateToOccurred = toolUseBlocks.some((t: any) => t.name === "delegate_to");
            handBackOccurred = toolUseBlocks.some((t: any) => t.name === "hand_back");
            break;
          }

          // Reset fullResponse for the next iteration — we only save the final text
          fullResponse = "";
        }

        // Save this agent's response
        if (fullResponse) {
          db.addMessage(conversation.id, "assistant", fullResponse, curAgentId);
        }

        // If delegate_to occurred, continue the outer loop to run the specialist immediately
        if (delegateToOccurred) {
          console.log(`[delegation] delegate_to occurred — continuing with specialist agent`);
          continueWithDelegation = true;
        }
        // If hand_back occurred, continue the outer loop so the main agent can produce a summary
        if (handBackOccurred) {
          console.log(`[delegation] hand_back occurred — continuing with main agent for summary`);
          continueWithDelegation = true;
        }
      }

      // Generate title if this is the first exchange (no title yet)
      // Re-read conversation to get current agentId (assignment may have changed it mid-turn)
      const finalConv = db.getConversation(conversation.id)!;
      if (!conversation.title && finalConv.agentId !== "router") {
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
      activeAgent: conversation.activeAgent,
      title: conversation.title,
      createdAt: conversation.createdAt.toISOString(),
      messages: conversation.messages.map((m) => ({
        role: m.role,
        content: m.content,
        timestamp: m.timestamp.toISOString(),
        agentId: m.agentId ?? null,
        delegationMeta: m.delegationMeta ?? null,
      })),
    });
  });

  return router;
}
