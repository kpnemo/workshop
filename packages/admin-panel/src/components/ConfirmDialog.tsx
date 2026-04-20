interface Props { open: boolean; title: string; message: string; onCancel: () => void; onConfirm: () => void; danger?: boolean; }
export default function ConfirmDialog({ open, title, message, onCancel, onConfirm, danger }: Props) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-surface border border-border rounded-lg p-6 max-w-sm w-full">
        <h2 className="text-lg font-semibold text-foreground mb-2">{title}</h2>
        <p className="text-sm text-muted mb-4">{message}</p>
        <div className="flex justify-end gap-2">
          <button className="px-3 py-1.5 text-sm rounded border border-border text-foreground" onClick={onCancel}>Cancel</button>
          <button className={`px-3 py-1.5 text-sm rounded text-white ${danger ? "bg-red-600" : "bg-primary"}`} onClick={onConfirm}>Confirm</button>
        </div>
      </div>
    </div>
  );
}
