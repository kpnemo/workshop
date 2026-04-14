import { useState, useRef, useCallback, useEffect } from "react";
import { Button } from "./ui/button";
import { FileChip } from "./file-chip";
import { uploadFile } from "../lib/api";
import type { FileInfo } from "../types";

const ALLOWED_EXTENSIONS = [
  ".pdf", ".txt", ".md", ".csv", ".json",
  ".js", ".ts", ".py", ".html", ".css",
  ".xml", ".yaml", ".yml", ".log",
];

interface PendingFile {
  file: File;
  status: "uploading" | "ready" | "error";
  info?: FileInfo;
  errorMessage?: string;
}

interface ChatInputProps {
  onSend: (message: string, attachment?: FileInfo) => void;
  disabled: boolean;
}

export function ChatInput({ onSend, disabled }: ChatInputProps) {
  const [value, setValue] = useState("");
  const [pendingFile, setPendingFile] = useState<PendingFile | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    textareaRef.current?.focus();
  }, [disabled]);

  const handleFileSelect = useCallback(async (file: File) => {
    const ext = "." + file.name.split(".").pop()?.toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      setPendingFile({ file, status: "error", errorMessage: "Unsupported type" });
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setPendingFile({ file, status: "error", errorMessage: "Over 10MB limit" });
      return;
    }

    setPendingFile({ file, status: "uploading" });

    try {
      const info = await uploadFile(file);
      setPendingFile({ file, status: "ready", info });
    } catch (err) {
      setPendingFile({
        file,
        status: "error",
        errorMessage: err instanceof Error ? err.message : "Upload failed",
      });
    }
  }, []);

  const handleSubmit = useCallback(() => {
    const trimmed = value.trim();
    const hasText = trimmed.length > 0;
    const hasFile = pendingFile?.status === "ready" && pendingFile.info;

    if ((!hasText && !hasFile) || disabled) return;

    onSend(trimmed, hasFile ? pendingFile.info : undefined);
    setValue("");
    setPendingFile(null);
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  }, [value, disabled, onSend, pendingFile]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setValue(e.target.value);
    const ta = e.target;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 120) + "px";
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFileSelect(file);
  };

  const isUploading = pendingFile?.status === "uploading";
  const canSend = !disabled && !isUploading && (value.trim().length > 0 || pendingFile?.status === "ready");

  return (
    <div
      className="border-t border-border bg-background px-4 py-3"
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {pendingFile && (
        <div className="mb-2">
          <FileChip
            filename={pendingFile.file.name}
            sizeBytes={pendingFile.file.size}
            status={pendingFile.status}
            errorMessage={pendingFile.errorMessage}
            onRemove={() => setPendingFile(null)}
          />
        </div>
      )}
      <div className="flex items-end gap-2">
        <input
          ref={fileInputRef}
          type="file"
          accept={ALLOWED_EXTENSIONS.join(",")}
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFileSelect(file);
            e.target.value = "";
          }}
        />
        <Button
          variant="ghost"
          size="icon"
          className="h-10 w-10 shrink-0 rounded-full"
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled || isUploading}
          aria-label="Attach file"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-4 w-4"
          >
            <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" />
          </svg>
        </Button>
        <textarea
          ref={textareaRef}
          value={value}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          placeholder={disabled ? "Waiting..." : "Type a message..."}
          disabled={disabled}
          rows={1}
          className="flex-1 resize-none rounded-2xl border border-border bg-surface px-4 py-3 text-sm text-foreground placeholder-muted outline-none focus:border-primary disabled:opacity-50"
          style={{ maxHeight: "120px" }}
        />
        <Button
          onClick={handleSubmit}
          disabled={!canSend}
          size="icon"
          className="h-10 w-10 shrink-0 rounded-full"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="currentColor"
            className="h-4 w-4"
          >
            <path d="M3.478 2.404a.75.75 0 0 0-.926.941l2.432 7.905H13.5a.75.75 0 0 1 0 1.5H4.984l-2.432 7.905a.75.75 0 0 0 .926.94 60.519 60.519 0 0 0 18.445-8.986.75.75 0 0 0 0-1.218A60.517 60.517 0 0 0 3.478 2.404Z" />
          </svg>
        </Button>
      </div>
    </div>
  );
}
