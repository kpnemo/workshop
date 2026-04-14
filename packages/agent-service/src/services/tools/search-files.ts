import type { Tool, ToolContext } from "./types.js";

export function createSearchFilesTool(): Tool {
  return {
    name: "search_files",
    definition: {
      name: "search_files",
      description: "Search the user's file library. Returns a catalog of all uploaded files with descriptions. Use this to find relevant files before reading them with read_user_file.",
      input_schema: {
        type: "object" as const,
        properties: {
          query: {
            type: "string",
            description: "What you are looking for in the user's files",
          },
        },
        required: ["query"],
      },
    },
    async execute(input: unknown, context?: ToolContext): Promise<string> {
      if (!context?.userId || !context?.fileService) {
        return "Error: File search requires an authenticated user context.";
      }
      return context.fileService.readIndex(context.userId);
    },
  };
}
