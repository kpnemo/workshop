import { Router } from "express";
import type { Request, Response } from "express";
import Anthropic from "@anthropic-ai/sdk";
import { v4 as uuidv4 } from "uuid";
import { Database } from "../services/database.js";
import type { AgentConfig } from "../types.js";
import type { ToolService } from "../services/tool-service.js";
import type { FileService } from "../services/file-service.js";

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
  toolService?: ToolService,
  fileService?: FileService
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
        summaryEnabled: c.summaryEnabled,
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

    // Add user message to history
    db.addMessage(conversation.id, "user", message);

    startSSE(res);
    const debug = req.query.debug === "true";

    try {
      const MAX_TOOL_ITERATIONS = 5;

      // Outer delegation loop — re-runs when delegate_to switches the active agent
      let fullResponse = "";
      let continueWithDelegation = true;
      let redirectsThisTurn = 0;
      let redirectJustHappened = false;
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

        if (curAgent.topicBoundaries) {
          const allowed = curAgent.topicBoundaries.allowed.join(", ");
          const blocked = curAgent.topicBoundaries.blocked.join(", ");
          systemPrompt += `\n\n[Topic Boundaries]\nYou specialize in: ${allowed}.\nDecline these topics by handing back: ${blocked}.\n\nIf the user's message is outside your scope, call the redirect_to_router tool with a short reason — do NOT just refuse or apologize. The router will pick a different specialist.`;
        }

        if (curAgentId === "router" && redirectJustHappened) {
          systemPrompt += `\n\n[Re-engagement]\nYou're being re-engaged because the previous specialist couldn't handle this message. Pick a new specialist with assign_agent. Do not ask follow-up questions; route immediately.`;
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

        if (currentConv.summaryEnabled) {
          const summaryInstruction = curAgent.summaryInstruction
            ?? "Provide a brief 2-3 sentence summary of this conversation so far, capturing the main topic and any key outcomes.";
          systemPrompt += `\n\n[Summary]\nYou have an update_summary tool. Use it to maintain a running TL;DR of this conversation. Call it after meaningful exchanges. Follow this instruction: ${summaryInstruction}`;
        }

        const delegationOptions = { isMainAgent: curIsMain, isActiveDelegate: curIsDelegate, summaryEnabled: currentConv.summaryEnabled };
        const tools = toolService ? toolService.getToolsForAgent(curAgent, delegationOptions) : [];
        let loopMessages: Array<{ role: string; content: any }>;
        if (redirectJustHappened && curAgentId === "router") {
          // Re-engagement turn: feed the router only the user's current message,
          // not the prior specialist's chat history.
          loopMessages = [{ role: "user", content: message }];
          redirectJustHappened = false;
        } else {
          loopMessages = claudeMessages;
        }

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
            messages: [...loopMessages],
          };
          if (tools.length > 0) {
            streamParams.tools = tools;
          }
          if (debug) {
            const thinkingBudget = 5000;
            streamParams.thinking = { type: "enabled", budget_tokens: thinkingBudget };
            streamParams.temperature = 1; // required when thinking is enabled
            // max_tokens must exceed thinking budget
            if (streamParams.max_tokens <= thinkingBudget) {
              streamParams.max_tokens = thinkingBudget + 1024;
            }
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
            const toolContext = { conversationId: conversation.id, res, db, agents, userId: req.userId, fileService };
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

            // Emit summary SSE event when update_summary tool is called
            if (toolUse.name === "update_summary") {
              const parsedResult = (() => { try { return JSON.parse(result); } catch { return null; } })();
              if (parsedResult?.success) {
                writeSSE(res, "summary", { summary: parsedResult.summary });
              }
              if (debug) {
                writeSSE(res, "debug_summary", { summary: parsedResult?.summary ?? result });
              }
            }

            let toolResultContent = result;
            if (toolUse.name === "redirect_to_router" && redirectsThisTurn >= 1) {
              toolResultContent = "Error: redirect already used in this turn. Please respond to the user with text instead.";
              // Note: by this point the tool's `execute` has already run and (incorrectly) flipped
              // agentId to router. Roll it back so the original agent keeps the turn.
              const conv = db.getConversation(conversation.id)!;
              if (conv.agentId === "router" && curAgentId !== "router") {
                db.setAgentId(conversation.id, curAgentId);
              }
            }

            toolResults.push({
              type: "tool_result",
              tool_use_id: toolUse.id,
              content: toolResultContent,
            });
          }

          // Push tool results as a user message
          loopMessages.push({
            role: "user",
            content: toolResults,
          });

          // Check if a routing tool was invoked (assign_agent OR redirect_to_router).
          // Both terminate this agent's turn and re-loop with the new active agent,
          // so the newly-assigned agent takes its turn immediately instead of forcing
          // the user to resend their message.
          const hasAssignment = toolResults.some((r) => r.content.startsWith("[ASSIGNMENT]"));
          const hasRedirect = toolResults.some((r) => r.content.startsWith("[REDIRECT]"));
          if (hasAssignment || hasRedirect) {
            if (hasRedirect) {
              redirectsThisTurn++;
              redirectJustHappened = true;
            }
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

  // POST /conversations/:id/summary - Manual summary refresh
  router.post("/:id/summary", async (req: Request, res: Response) => {
    if (!verifyOwnership(req.params.id, req.userId!)) {
      res.status(404).json({ error: "Conversation not found" });
      return;
    }

    const conversation = db.getConversation(req.params.id);
    if (!conversation) {
      res.status(404).json({ error: "Conversation not found" });
      return;
    }

    if (conversation.messages.length === 0) {
      res.json({ summary: null });
      return;
    }

    const agent = agents.get(conversation.agentId);
    const summaryInstruction = agent?.summaryInstruction
      ?? "Provide a brief 2-3 sentence summary of this conversation so far, capturing the main topic and any key outcomes.";

    const conversationText = conversation.messages
      .filter((m) => m.role !== "system")
      .map((m) => `${m.role}: ${m.content}`)
      .join("\n");

    try {
      const response = await getClient().messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 200,
        messages: [
          {
            role: "user",
            content: `${summaryInstruction}\n\nConversation:\n${conversationText}`,
          },
        ],
      });

      const summary = response.content[0].type === "text" ? response.content[0].text.trim() : null;
      if (summary) {
        db.setSummary(conversation.id, summary);
      }
      res.json({ summary });
    } catch (err) {
      console.error("[summary] Manual refresh failed:", err);
      res.status(500).json({ error: "Summary generation failed" });
    }
  });

  // PATCH /conversations/:id - Update conversation settings
  router.patch("/:id", (req: Request, res: Response) => {
    if (!verifyOwnership(req.params.id, req.userId!)) {
      res.status(404).json({ error: "Conversation not found" });
      return;
    }

    const { summaryEnabled } = req.body;
    if (typeof summaryEnabled === "boolean") {
      db.setSummaryEnabled(req.params.id, summaryEnabled);
    }

    const conversation = db.getConversation(req.params.id)!;
    res.json({
      conversationId: conversation.id,
      agentId: conversation.agentId,
      title: conversation.title,
      summary: conversation.summary,
      summaryEnabled: conversation.summaryEnabled,
    });
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
      summary: conversation.summary,
      summaryEnabled: conversation.summaryEnabled,
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
