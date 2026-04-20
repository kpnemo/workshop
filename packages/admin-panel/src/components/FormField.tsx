import type { ReactNode } from "react";
interface Props { label: string; error?: string; children: ReactNode; }
export default function FormField({ label, error, children }: Props) {
  return (
    <label className="block space-y-1">
      <span className="text-sm text-muted">{label}</span>
      {children}
      {error && <span className="block text-xs text-red-400">{error}</span>}
    </label>
  );
}
