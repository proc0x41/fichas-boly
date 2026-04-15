interface Props {
  current: number
  total: number
  className?: string
}

export function ProgressBar({ current, total, className = '' }: Props) {
  const pct = total > 0 ? Math.round((current / total) * 100) : 0

  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-gray-200">
        <div
          className="h-full rounded-full bg-primary-600 transition-all duration-300"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs font-medium text-gray-600 whitespace-nowrap">
        {current}/{total}
      </span>
    </div>
  )
}
