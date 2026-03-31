import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import type { AgentConfig } from "../types.js";

export function loadAgents(agentsDir: string): Map<string, AgentConfig> {
  const agents = new Map<string, AgentConfig>();

  if (!fs.existsSync(agentsDir)) {
    console.warn(`[agent-loader] Directory not found: ${agentsDir}`);
    return agents;
  }

  const files = fs.readdirSync(agentsDir).filter((f) => f.endsWith(".md"));

  if (files.length === 0) {
    console.warn(`[agent-loader] No .md files found in ${agentsDir}`);
    return agents;
  }

  for (const file of files) {
    const filePath = path.join(agentsDir, file);
    try {
      const raw = fs.readFileSync(filePath, "utf-8");
      const { data, content } = matter(raw);

      if (!data.name || !data.model) {
        console.warn(`[agent-loader] Skipping ${file}: missing required fields (name, model)`);
        continue;
      }

      const id = path.basename(file, ".md");
      const config: AgentConfig = {
        id,
        name: data.name,
        model: data.model,
        maxTokens: data.maxTokens ?? 1024,
        temperature: data.temperature ?? 1.0,
        systemPrompt: content.trim(),
        avatar: {
          emoji: data.avatar?.emoji ?? "🤖",
          color: data.avatar?.color ?? "#6c5ce7",
        },
        topicBoundaries: data.topicBoundaries,
      };

      agents.set(id, config);
    } catch (err) {
      console.warn(`[agent-loader] Skipping ${file}: ${err}`);
    }
  }

  return agents;
}
