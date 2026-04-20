import { useState, useRef, useId, type KeyboardEvent, type MouseEvent } from 'react'
import { X, Plus } from 'lucide-react'
import toast from 'react-hot-toast'
import type { CodigoItem } from '../types'

interface Props {
  itens: CodigoItem[]
  onChange: (itens: CodigoItem[]) => void
  maxLength?: number
  maxItems?: number
}

export function ChipInput({ itens, onChange, maxLength = 20, maxItems = 200 }: Props) {
  const [codigo, setCodigo] = useState('')
  const [quantidade, setQuantidade] = useState('')
  const codigoInputRef = useRef<HTMLInputElement>(null)
  const quantidadeInputRef = useRef<HTMLInputElement>(null)
  const codigoId = useId()
  const quantidadeId = useId()

  const adicionar = () => {
    const codigoLimpo = codigo.trim().toUpperCase()
    if (!codigoLimpo) {
      toast.error('Informe o código do produto')
      codigoInputRef.current?.focus()
      return
    }
    if (codigoLimpo.length > maxLength) {
      toast.error(`Código deve ter no máximo ${maxLength} caracteres`)
      return
    }

    const qtdStr = quantidade.trim()
    if (!qtdStr) {
      toast.error('Quantidade é obrigatória')
      quantidadeInputRef.current?.focus()
      return
    }
    const qtd = parseInt(qtdStr, 10)
    if (!Number.isFinite(qtd) || qtd <= 0) {
      toast.error('Quantidade deve ser maior que zero')
      quantidadeInputRef.current?.focus()
      return
    }
    if (qtd > 99999) {
      toast.error('Quantidade muito alta')
      return
    }

    if (itens.length >= maxItems) {
      toast.error(`Limite de ${maxItems} itens atingido`)
      return
    }

    const existenteIdx = itens.findIndex((i) => i.codigo === codigoLimpo)
    if (existenteIdx >= 0) {
      const novos = itens.slice()
      novos[existenteIdx] = { codigo: codigoLimpo, quantidade: novos[existenteIdx].quantidade + qtd }
      onChange(novos)
      toast.success(`Quantidade somada: ${codigoLimpo} (+${qtd})`)
    } else {
      onChange([...itens, { codigo: codigoLimpo, quantidade: qtd }])
    }

    setCodigo('')
    setQuantidade('')
    codigoInputRef.current?.focus()
  }

  const remover = (idx: number) => {
    onChange(itens.filter((_, i) => i !== idx))
  }

  const handleCodigoKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      quantidadeInputRef.current?.focus()
    }
  }

  const handleQuantidadeKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      adicionar()
    }
  }

  // onMouseDown com preventDefault impede que o input perca foco antes do click,
  // mantendo o teclado aberto no mobile quando o usuário toca em "Adicionar".
  const handleButtonMouseDown = (e: MouseEvent<HTMLButtonElement>) => {
    e.preventDefault()
  }

  return (
    <div>
      <div className="flex gap-2">
        <input
          id={codigoId}
          ref={codigoInputRef}
          type="text"
          value={codigo}
          onChange={(e) => setCodigo(e.target.value)}
          onKeyDown={handleCodigoKeyDown}
          maxLength={maxLength}
          placeholder="Código"
          aria-label="Código do produto"
          autoCapitalize="characters"
          autoCorrect="off"
          autoComplete="off"
          spellCheck={false}
          enterKeyHint="next"
          className="flex-1 min-w-0 rounded-lg border border-gray-300 px-3 py-2.5 text-sm uppercase focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 focus:outline-none"
        />
        <input
          id={quantidadeId}
          ref={quantidadeInputRef}
          type="text"
          value={quantidade}
          onChange={(e) => setQuantidade(e.target.value.replace(/\D/g, '').slice(0, 5))}
          onKeyDown={handleQuantidadeKeyDown}
          inputMode="numeric"
          pattern="[0-9]*"
          placeholder="Qtd."
          aria-label="Quantidade"
          autoComplete="off"
          enterKeyHint="send"
          className="w-16 shrink-0 rounded-lg border border-gray-300 px-2 py-2.5 text-center text-sm focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 focus:outline-none"
        />
        <button
          type="button"
          onMouseDown={handleButtonMouseDown}
          onClick={adicionar}
          disabled={itens.length >= maxItems}
          aria-label="Adicionar item"
          className="flex shrink-0 items-center gap-1 rounded-lg bg-primary-600 px-3 py-2.5 text-sm font-medium text-white transition-colors hover:bg-primary-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>

      {itens.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2" role="list" aria-label="Itens do pedido">
          {itens.map((item, idx) => (
            <span
              key={`${item.codigo}-${idx}`}
              role="listitem"
              className="inline-flex items-center gap-1 rounded-full bg-primary-100 px-3 py-1 text-xs font-medium text-primary-700"
            >
              <span>{item.codigo}</span>
              <span className="rounded-full bg-white/70 px-1.5 py-0.5 text-[10px] font-semibold text-primary-800">
                ×{item.quantidade}
              </span>
              <button
                type="button"
                onClick={() => remover(idx)}
                aria-label={`Remover ${item.codigo}`}
                className="ml-0.5 rounded-full p-0.5 hover:bg-primary-200"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      <p className="mt-1 text-xs text-gray-400" aria-live="polite">
        {itens.length}/{maxItems} itens
      </p>
    </div>
  )
}
