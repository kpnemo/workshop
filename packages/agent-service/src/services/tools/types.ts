import type Anthropic from "@anthropic-ai/sdk";

export interface Tool {
  name: string;
  definition: Anthropic.Messages.Tool;
  execute(input: unknown): Promise<string>;
}
