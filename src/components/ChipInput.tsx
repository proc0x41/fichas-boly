import { useState, useRef, useId, useEffect, type KeyboardEvent, type MouseEvent } from 'react'
import { X, Plus, Loader2, CheckCircle, AlertCircle } from 'lucide-react'
import toast from 'react-hot-toast'
import type { CodigoItem } from '../types'

export interface ProdutoPreview {
  descricao: string
  preco_tabela: number
  /** Código canônico do catálogo (pode diferir do digitado, ex: digitou "0094" → canônico "AR0094") */
  codigoCanonico?: string
}

interface Props {
  itens: CodigoItem[]
  onChange: (itens: CodigoItem[]) => void
  onLookupCodigo?: (codigo: string) => Promise<ProdutoPreview | null>
  maxLength?: number
  maxItems?: number
}

export function ChipInput({ itens, onChange, onLookupCodigo, maxLength = 20, maxItems = 400 }: Props) {
  const [codigo, setCodigo] = useState('')
  const [quantidade, setQuantidade] = useState('')
  const [preview, setPreview] = useState<ProdutoPreview | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewNaoEncontrado, setPreviewNaoEncontrado] = useState(false)
  const [previewParaCodigo, setPreviewParaCodigo] = useState('')
  const codigoInputRef = useRef<HTMLInputElement>(null)
  const quantidadeInputRef = useRef<HTMLInputElement>(null)
  const codigoId = useId()
  const quantidadeId = useId()

  useEffect(() => {
    const norm = codigo.trim().toUpperCase()
    if (!norm || !onLookupCodigo) {
      setPreview(null)
      setPreviewNaoEncontrado(false)
      setPreviewLoading(false)
      setPreviewParaCodigo('')
      return
    }
    setPreviewLoading(true)
    setPreview(null)
    setPreviewNaoEncontrado(false)
    const timer = setTimeout(() => {
      void onLookupCodigo(norm).then((result) => {
        setPreviewLoading(false)
        setPreviewParaCodigo(norm)
        if (result) {
          setPreview(result)
          setPreviewNaoEncontrado(false)
        } else {
          setPreview(null)
          setPreviewNaoEncontrado(true)
        }
      })
    }, 300)
    return () => clearTimeout(timer)
  }, [codigo, onLookupCodigo])

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

    // Se o lookup encontrou um código canônico diferente do digitado (ex: "0094" → "AR0094"), usa o canônico
    const codigoFinal = (preview?.codigoCanonico ?? codigoLimpo)
    const existenteIdx = itens.findIndex((i) => i.codigo === codigoFinal)
    if (existenteIdx >= 0) {
      toast.error(`"${codigoFinal}" já está no pedido`, { duration: 4000 })
      return
    }
      if (onLookupCodigo && previewNaoEncontrado && previewParaCodigo === codigoLimpo) {
        toast(`Código "${codigoLimpo}" não encontrado no catálogo — adicionado mesmo assim`, {
          icon: '⚠️',
          style: { background: '#fef9c3', color: '#713f12' },
          duration: 4000,
        })
      }
      onChange([...itens, { codigo: codigoFinal, quantidade: qtd }])

    setCodigo('')
    setQuantidade('')
    setPreview(null)
    setPreviewNaoEncontrado(false)
    setPreviewParaCodigo('')
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

      {onLookupCodigo && codigo.trim() && (() => {
        const codigoFinalPreview = preview?.codigoCanonico ?? codigo.trim().toUpperCase()
        const isDuplicado = itens.some((i) => i.codigo === codigoFinalPreview)
        return (
          <div
            className={`mt-1.5 flex items-center gap-2 rounded-lg border px-3 py-2 text-xs ${
              previewLoading
                ? 'border-gray-200 bg-gray-50 text-gray-400'
                : isDuplicado
                  ? 'border-amber-300 bg-amber-50'
                  : preview
                    ? 'border-green-200 bg-green-50'
                    : previewNaoEncontrado
                      ? 'border-red-200 bg-red-50'
                      : 'border-gray-200 bg-gray-50 text-gray-400'
            }`}
          >
            {previewLoading && <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />}
            {!previewLoading && isDuplicado && <AlertCircle className="h-3.5 w-3.5 shrink-0 text-amber-500" />}
            {!previewLoading && !isDuplicado && preview && <CheckCircle className="h-3.5 w-3.5 shrink-0 text-green-600" />}
            {!previewLoading && !isDuplicado && previewNaoEncontrado && <AlertCircle className="h-3.5 w-3.5 shrink-0 text-red-500" />}
            <div className="min-w-0">
              {previewLoading && <span>Buscando...</span>}
              {!previewLoading && isDuplicado && (
                <>
                  {preview && (
                    <p className="font-semibold text-gray-800 truncate">{preview.descricao}</p>
                  )}
                  <p className="text-amber-700 font-medium">Já adicionado ao pedido</p>
                </>
              )}
              {!previewLoading && !isDuplicado && preview && (
                <>
                  {preview.codigoCanonico && preview.codigoCanonico !== codigo.trim().toUpperCase() && (
                    <p className="text-[11px] text-green-700 font-medium mb-0.5">
                      Código: <span className="font-mono">{preview.codigoCanonico}</span>
                    </p>
                  )}
                  <p className="font-semibold text-gray-800 truncate">{preview.descricao}</p>
                  <p className="text-gray-500">
                    {Number(preview.preco_tabela).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                  </p>
                </>
              )}
              {!previewLoading && !isDuplicado && previewNaoEncontrado && (
                <p className="text-red-600 font-medium">Código não encontrado no catálogo</p>
              )}
            </div>
          </div>
        )
      })()}

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
