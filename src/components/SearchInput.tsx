import { useState, useEffect } from 'react'
import { Search, X } from 'lucide-react'

interface Props {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  debounceMs?: number
}

export function SearchInput({ value, onChange, placeholder = 'Buscar...', debounceMs = 300 }: Props) {
  const [local, setLocal] = useState(value)

  useEffect(() => {
    setLocal(value)
  }, [value])

  useEffect(() => {
    const timer = setTimeout(() => onChange(local), debounceMs)
    return () => clearTimeout(timer)
  }, [local, debounceMs, onChange])

  return (
    <div className="relative">
      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
      <input
        type="text"
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg border border-gray-300 py-2.5 pl-10 pr-9 text-sm focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 focus:outline-none"
      />
      {local && (
        <button
          onClick={() => { setLocal(''); onChange('') }}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  )
}
