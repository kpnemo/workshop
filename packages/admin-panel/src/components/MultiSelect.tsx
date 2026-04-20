interface Props<T extends { id: string; name: string }> {
  label: string;
  options: T[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}
export default function MultiSelect<T extends { id: string; name: string }>(
  { label, options, selectedIds, onChange }: Props<T>,
) {
  function toggle(id: string) {
    if (selectedIds.includes(id)) onChange(selectedIds.filter((x) => x !== id));
    else onChange([...selectedIds, id]);
  }
  return (
    <div>
      <div className="text-sm text-muted mb-2">{label}</div>
      <div className="space-y-1 max-h-48 overflow-auto border border-border rounded p-2 bg-background">
        {options.length === 0 && <div className="text-xs text-muted px-1">No options</div>}
        {options.map((opt) => (
          <label key={opt.id} className="flex items-center gap-2 text-sm cursor-pointer px-1 py-0.5 rounded hover:bg-surface">
            <input type="checkbox" checked={selectedIds.includes(opt.id)} onChange={() => toggle(opt.id)} />
            <span className="text-foreground">{opt.name}</span>
          </label>
        ))}
      </div>
    </div>
  );
}
