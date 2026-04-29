interface Props {
  label: string
  hint: string
  value: string
  onChange: (text: string) => void
  readOnly?: boolean
}

export default function ReflectField({ label, hint, value, onChange, readOnly }: Props) {
  return (
    <div>
      <label className="text-xs font-medium uppercase tracking-wider text-text-muted">
        {label}
      </label>
      <div className="text-[11px] text-text-muted mb-1.5">{hint}</div>
      {readOnly ? (
        <div className="min-h-[88px] rounded-lg border border-border bg-bg-secondary px-3 py-2 text-sm text-text-primary leading-relaxed whitespace-pre-wrap break-words">
          {value || <span className="text-text-muted italic">—</span>}
        </div>
      ) : (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={4}
          className="w-full rounded-lg border border-border bg-bg-secondary px-3 py-2 text-sm text-text-primary leading-relaxed resize-none focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent transition-colors"
        />
      )}
    </div>
  )
}
