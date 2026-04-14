import type { Tool, ToolContext } from "./types.js";

export function createReadUserFileTool(): Tool {
  return {
    name: "read_user_file",
    definition: {
      name: "read_user_file",
      description: "Read the full content of a file from the user's library. Use the file ID obtained from search_files.",
      input_schema: {
        type: "object" as const,
        properties: {
          file_id: {
            type: "string",
            description: "The ID of the file to read (from the search_files catalog)",
          },
        },
        required: ["file_id"],
      },
    },
    async execute(input: unknown, context?: ToolContext): Promise<string> {
      if (!context?.userId || !context?.fileService) {
        return "Error: File reading requires an authenticated user context.";
      }
      const { file_id } = (input ?? {}) as { file_id?: string };
      if (!file_id || typeof file_id !== "string") {
        return "Error: A valid file_id string is required.";
      }
      return context.fileService.readFileContent(file_id);
    },
  };
}
