import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import type { AgentConfig, CreateAgentInput } from "../types";

const AVATAR_COLORS = ["#6c5ce7", "#00b894", "#fd79a8", "#fdcb6e", "#74b9ff"];
const DEFAULT_EMOJIS = ["🤖", "📝", "💻", "🎯", "🧠", "🔧", "🎨", "🛡️"];

interface AgentFormProps {
  agent?: AgentConfig;
  onSave: (data: CreateAgentInput) => Promise<void>;
  onBack: () => void;
}

export function AgentForm({ agent, onSave, onBack }: AgentFormProps) {
  const [name, setName] = useState(agent?.name ?? "");
  const [systemPrompt, setSystemPrompt] = useState(agent?.systemPrompt ?? "");
  const [model, setModel] = useState(agent?.model ?? "claude-sonnet-4-20250514");
  const [temperature, setTemperature] = useState(agent?.temperature ?? 0.7);
  const [maxTokens, setMaxTokens] = useState(agent?.maxTokens ?? 1024);
  const [emoji, setEmoji] = useState(agent?.avatar?.emoji ?? "🤖");
  const [color, setColor] = useState(agent?.avatar?.color ?? "#6c5ce7");
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showGuardrails, setShowGuardrails] = useState(!!agent?.topicBoundaries);
  const [allowed, setAllowed] = useState(agent?.topicBoundaries?.allowed.join("\n") ?? "");
  const [blocked, setBlocked] = useState(agent?.topicBoundaries?.blocked.join("\n") ?? "");
  const [boundaryMessage, setBoundaryMessage] = useState(agent?.topicBoundaries?.boundaryMessage ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isValid = name.trim() !== "" && systemPrompt.trim() !== "";

  async function handleSubmit() {
    if (!isValid || saving) return;
    setSaving(true);
    setError(null);

    const data: CreateAgentInput = {
      name: name.trim(),
      systemPrompt: systemPrompt.trim(),
      model,
      temperature,
      maxTokens,
      avatar: { emoji, color },
    };

    if (showGuardrails && (allowed.trim() || blocked.trim())) {
      data.topicBoundaries = {
        allowed: allowed.split("\n").map((s) => s.trim()).filter(Boolean),
        blocked: blocked.split("\n").map((s) => s.trim()).filter(Boolean),
        boundaryMessage: boundaryMessage.trim() || "I can't help with that topic.",
      };
    }

    try {
      await onSave(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save agent");
      setSaving(false);
    }
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <button onClick={onBack} className="rounded p-1 text-muted hover:bg-background hover:text-foreground">
            <ArrowLeft size={16} />
          </button>
          <span className="text-sm font-semibold">{agent ? "Edit Agent" : "New Agent"}</span>
        </div>
        <button
          onClick={handleSubmit}
          disabled={!isValid || saving}
          className="rounded bg-primary px-4 py-1.5 text-sm text-white hover:bg-primary/90 disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save"}
        </button>
      </div>

      {/* Form */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="flex flex-col gap-4">
          {error && (
            <div className="rounded border border-red-900/50 bg-red-950/30 px-3 py-2 text-sm text-red-400">{error}</div>
          )}

          {/* Avatar */}
          <div>
            <label className="mb-1.5 block text-xs text-muted">Avatar</label>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                className="flex h-11 w-11 items-center justify-center rounded-full border-2 border-border text-lg"
                style={{ backgroundColor: color }}
              >
                {emoji}
              </button>
              <div className="flex flex-col gap-1.5">
                <div className="flex gap-1.5">
                  {AVATAR_COLORS.map((c) => (
                    <button
                      key={c}
                      onClick={() => setColor(c)}
                      className="h-5 w-5 rounded-full"
                      style={{ backgroundColor: c, outline: c === color ? "2px solid #e0e0e0" : "none", outlineOffset: "2px" }}
                    />
                  ))}
                </div>
                <span className="text-[10px] text-muted">Click avatar to change emoji</span>
              </div>
            </div>
            {showEmojiPicker && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {DEFAULT_EMOJIS.map((e) => (
                  <button
                    key={e}
                    onClick={() => { setEmoji(e); setShowEmojiPicker(false); }}
                    className={`flex h-8 w-8 items-center justify-center rounded text-lg hover:bg-surface ${e === emoji ? "bg-primary/20" : ""}`}
                  >
                    {e}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Name */}
          <div>
            <label className="mb-1 block text-xs text-muted">Name *</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="My Agent"
              className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted focus:border-primary focus:outline-none" />
          </div>

          {/* System Prompt */}
          <div>
            <label className="mb-1 block text-xs text-muted">System Prompt *</label>
            <textarea value={systemPrompt} onChange={(e) => setSystemPrompt(e.target.value)}
              placeholder="You are a helpful assistant that..." rows={5}
              className="w-full resize-y rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted focus:border-primary focus:outline-none" />
          </div>

          {/* Tools Info */}
          <div className="rounded-md border border-border bg-surface/50 px-3 py-2.5">
            <p className="text-xs text-muted">
              Tools are configured in the agent's markdown file. Add a <code className="rounded bg-background px-1 py-0.5 text-[11px] text-foreground">tools:</code> field to the frontmatter:
            </p>
            <pre className="mt-2 rounded bg-background px-2.5 py-2 text-[11px] leading-relaxed text-foreground">
{`tools:
  - browse_url`}
            </pre>
            <div className="mt-2.5">
              <span className="text-[11px] text-muted">Available tools:</span>
              <div className="mt-1 flex items-center gap-1.5">
                <span className="rounded bg-primary/15 px-1.5 py-0.5 text-[11px] text-primary">browse_url</span>
                <span className="text-[11px] text-muted">Fetch and extract text content from web pages</span>
              </div>
            </div>
          </div>

          {/* Model / Temperature / MaxTokens */}
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="mb-1 block text-xs text-muted">Model</label>
              <select value={model} onChange={(e) => setModel(e.target.value)}
                className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none">
                <option value="claude-sonnet-4-20250514">claude-sonnet-4</option>
                <option value="claude-haiku-4-5-20251001">claude-haiku-4.5</option>
              </select>
            </div>
            <div className="w-24">
              <label className="mb-1 block text-xs text-muted">Temperature</label>
              <input type="number" step={0.1} min={0} max={1} value={temperature}
                onChange={(e) => setTemperature(parseFloat(e.target.value) || 0)}
                className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none" />
            </div>
            <div className="w-24">
              <label className="mb-1 block text-xs text-muted">Max Tokens</label>
              <input type="number" min={1} max={4096} value={maxTokens}
                onChange={(e) => setMaxTokens(parseInt(e.target.value) || 1024)}
                className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none" />
            </div>
          </div>

          {/* Guardrails */}
          <div className="border-t border-border pt-4">
            <button onClick={() => setShowGuardrails(!showGuardrails)} className="mb-2 text-xs text-muted hover:text-foreground">
              {showGuardrails ? "▼" : "▶"} Topic Guardrails (optional)
            </button>
            {showGuardrails && (
              <div className="flex flex-col gap-3">
                <div className="flex gap-3">
                  <div className="flex-1">
                    <label className="mb-1 block text-[11px] text-success">Allowed Topics</label>
                    <textarea value={allowed} onChange={(e) => setAllowed(e.target.value)}
                      placeholder={"product questions\npricing\ntroubleshooting"} rows={3}
                      className="w-full resize-y rounded-md border border-border bg-surface px-3 py-2 text-xs text-foreground placeholder:text-muted focus:border-primary focus:outline-none" />
                  </div>
                  <div className="flex-1">
                    <label className="mb-1 block text-[11px] text-[#fd79a8]">Blocked Topics</label>
                    <textarea value={blocked} onChange={(e) => setBlocked(e.target.value)}
                      placeholder={"competitor comparisons\npolitical topics"} rows={3}
                      className="w-full resize-y rounded-md border border-border bg-surface px-3 py-2 text-xs text-foreground placeholder:text-muted focus:border-primary focus:outline-none" />
                  </div>
                </div>
                <div>
                  <label className="mb-1 block text-[11px] text-muted">Boundary Message</label>
                  <input value={boundaryMessage} onChange={(e) => setBoundaryMessage(e.target.value)}
                    placeholder="I can only help with product-related questions."
                    className="w-full rounded-md border border-border bg-surface px-3 py-2 text-xs text-foreground placeholder:text-muted focus:border-primary focus:outline-none" />
                </div>
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}
