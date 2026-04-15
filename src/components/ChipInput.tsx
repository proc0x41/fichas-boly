import { useState, useId, type KeyboardEvent } from 'react'
import { X, Plus } from 'lucide-react'

interface Props {
  codigos: string[]
  onChange: (codigos: string[]) => void
  maxLength?: number
  maxItems?: number
}

export function ChipInput({ codigos, onChange, maxLength = 20, maxItems = 200 }: Props) {
  const [input, setInput] = useState('')
  const inputId = useId()

  const addCodigo = () => {
    const value = input.trim().toUpperCase()
    if (!value) return
    if (value.length > maxLength) return
    if (codigos.length >= maxItems) return
    if (!codigos.includes(value)) {
      onChange([...codigos, value])
    }
    setInput('')
  }

  const removeCodigo = (idx: number) => {
    onChange(codigos.filter((_, i) => i !== idx))
  }

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      addCodigo()
    }
  }

  return (
    <div>
      <div className="flex gap-2">
        <input
          id={inputId}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          maxLength={maxLength}
          placeholder="Código do produto"
          autoCapitalize="characters"
          autoCorrect="off"
          autoComplete="off"
          enterKeyHint="send"
          className="flex-1 rounded-lg border border-gray-300 px-3 py-2.5 text-sm uppercase focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 focus:outline-none"
        />
        <button
          type="button"
          onClick={addCodigo}
          disabled={!input.trim() || codigos.length >= maxItems}
          aria-label="Adicionar código"
          className="flex items-center gap-1 rounded-lg bg-primary-600 px-3 py-2.5 text-sm font-medium text-white transition-colors hover:bg-primary-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
        >
          <Plus className="h-4 w-4" />
          Adicionar
        </button>
      </div>

      {codigos.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2" role="list" aria-label="Códigos adicionados">
          {codigos.map((codigo, idx) => (
            <span
              key={idx}
              role="listitem"
              className="inline-flex items-center gap-1 rounded-full bg-primary-100 px-3 py-1 text-xs font-medium text-primary-700"
            >
              {codigo}
              <button
                type="button"
                onClick={() => removeCodigo(idx)}
                aria-label={`Remover código ${codigo}`}
                className="ml-0.5 rounded-full p-0.5 hover:bg-primary-200"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      <p className="mt-1 text-xs text-gray-400" aria-live="polite">
        {codigos.length}/{maxItems} códigos
      </p>
    </div>
  )
}
