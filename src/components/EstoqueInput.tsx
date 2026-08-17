import { useState, useRef, useId, useEffect, useMemo, useCallback, type KeyboardEvent, type MouseEvent } from 'react'
import { X, Plus, Loader2, CheckCircle, AlertCircle } from 'lucide-react'
import toast from 'react-hot-toast'
import type { CodigoItem } from '../types'
import type { ProdutoPreview } from './ChipInput'
import { stripAccents } from '../lib/masks'
import { normCodigo, compararCodigos } from '../lib/utils'
import { supabase } from '../lib/supabase'

interface Props {
  itens: CodigoItem[]
  onChange: (itens: CodigoItem[]) => void
  maxLength?: number
  maxItems?: number
}

export function EstoqueInput({ itens, onChange, maxLength = 20, maxItems = 400 }: Props) {
  const [codigo, setCodigo] = useState('')
  const [quantidade, setQuantidade] = useState('')
  const [preview, setPreview] = useState<ProdutoPreview | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewNaoEncontrado, setPreviewNaoEncontrado] = useState(false)
  const [previewParaCodigo, setPreviewParaCodigo] = useState('')
  const [sugestoesAbertas, setSugestoesAbertas] = useState(false)
  const [catalogoProdutos, setCatalogoProdutos] = useState<Map<string, ProdutoPreview> | null>(null)
  const codigoInputRef = useRef<HTMLInputElement>(null)
  const quantidadeInputRef = useRef<HTMLInputElement>(null)
  const codigoId = useId()
  const quantidadeId = useId()

  useEffect(() => {
    supabase
      .from('produtos')
      .select('codigo, descricao, preco_tabela')
      .eq('ativo', true)
      .then(({ data }) => {
        const map = new Map<string, ProdutoPreview>()
        for (const p of data ?? []) {
          map.set(normCodigo(p.codigo), { descricao: p.descricao, preco_tabela: Number(p.preco_tabela), codigoCanonico: p.codigo })
        }
        setCatalogoProdutos(map)
      })
  }, [])

  const lookupCodigo = useCallback(
    async (cod: string): Promise<ProdutoPreview | null> => {
      if (!catalogoProdutos) return null
      const norm = normCodigo(cod)
      const exact = catalogoProdutos.get(norm)
      if (exact) return exact
      for (const [key, prod] of catalogoProdutos) {
        if (key.endsWith(norm) && key !== norm) {
          return { ...prod, codigoCanonico: key.toUpperCase() }
        }
      }
      return null
    },
    [catalogoProdutos],
  )

  const sugestoes = useMemo(() => {
    if (!catalogoProdutos) return []
    const termo = codigo.trim()
    if (termo.length < 2) return []
    const termoNorm = stripAccents(termo).toLowerCase()
    const result: { codigo: string; descricao: string; preco_tabela: number }[] = []
    for (const [cod, prod] of catalogoProdutos) {
      const descNorm = stripAccents(prod.descricao).toLowerCase()
      const codNorm = cod.toLowerCase()
      if (descNorm.includes(termoNorm) || codNorm.includes(termoNorm)) {
        result.push({ codigo: prod.codigoCanonico ?? cod.toUpperCase(), descricao: prod.descricao, preco_tabela: prod.preco_tabela })
        if (result.length >= 8) break
      }
    }
    return result
  }, [codigo, catalogoProdutos])

  useEffect(() => {
    const norm = codigo.trim().toUpperCase()
    if (!norm) {
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
      void lookupCodigo(norm).then((result) => {
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
  }, [codigo, lookupCodigo])

  const itensSorted = useMemo(
    () => [...itens].sort((a, b) => compararCodigos(a.codigo, b.codigo)),
    [itens],
  )

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

    const codigoFinal = preview?.codigoCanonico ?? codigoLimpo
    const existenteIdx = itens.findIndex((i) => i.codigo === codigoFinal)
    if (existenteIdx >= 0) {
      toast.error(`"${codigoFinal}" já está no estoque`, { duration: 4000 })
      return
    }
    if (previewNaoEncontrado && previewParaCodigo === codigoLimpo) {
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

  const remover = (codigoRemover: string) => {
    onChange(itens.filter((i) => i.codigo !== codigoRemover))
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
          onChange={(e) => {
            setCodigo(e.target.value)
            setSugestoesAbertas(true)
          }}
          onKeyDown={handleCodigoKeyDown}
          onFocus={() => setSugestoesAbertas(true)}
          onBlur={() => {
            setTimeout(() => setSugestoesAbertas(false), 150)
          }}
          maxLength={Math.max(maxLength, 80)}
          placeholder="Código ou nome do produto"
          aria-label="Código ou nome do produto"
          autoCorrect="off"
          autoComplete="off"
          spellCheck={false}
          enterKeyHint="next"
          className="flex-1 min-w-0 rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 focus:outline-none"
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

      {sugestoesAbertas && sugestoes.length > 0 && !preview && (
        <ul
          role="listbox"
          aria-label="Sugestões de produto"
          className="mt-1.5 max-h-64 overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-sm"
        >
          {sugestoes.map((s) => (
            <li key={s.codigo}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  setCodigo(s.codigo)
                  setSugestoesAbertas(false)
                  quantidadeInputRef.current?.focus()
                }}
                className="flex w-full items-baseline gap-2 px-3 py-2 text-left text-xs hover:bg-gray-50"
              >
                <span className="shrink-0 font-mono font-semibold text-primary-700">{s.codigo}</span>
                <span className="min-w-0 flex-1 truncate text-gray-800">{s.descricao}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {codigo.trim() && !(sugestoesAbertas && sugestoes.length > 0 && !preview) && (() => {
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
                  <p className="text-amber-700 font-medium">Já adicionado ao estoque</p>
                </>
              )}
              {!previewLoading && !isDuplicado && preview && (
                <>
                  <p className="text-[11px] text-green-700 font-medium mb-0.5">
                    Código: <span className="font-mono">{preview.codigoCanonico ?? codigo.trim().toUpperCase()}</span>
                  </p>
                  <p className="font-semibold text-gray-800 truncate">{preview.descricao}</p>
                </>
              )}
              {!previewLoading && !isDuplicado && previewNaoEncontrado && (
                <p className="text-red-600 font-medium">Código não encontrado no catálogo</p>
              )}
            </div>
          </div>
        )
      })()}

      {itensSorted.length > 0 && (
        <div className="mt-3 flex flex-col gap-1.5" role="list" aria-label="Itens do estoque">
          {itensSorted.map((item) => {
            const prod = catalogoProdutos?.get(normCodigo(item.codigo)) ?? null
            return (
              <div
                key={item.codigo}
                role="listitem"
                className="flex items-center gap-2 rounded-lg bg-primary-50 px-3 py-2 text-xs text-primary-800"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-1.5">
                    <span className="font-mono font-semibold">{item.codigo}</span>
                    <span className="rounded-full bg-white/80 px-1.5 py-0.5 text-[10px] font-semibold text-primary-800">
                      ×{item.quantidade}
                    </span>
                  </div>
                  {prod ? (
                    <p className="mt-0.5 truncate text-[11px] text-gray-600">{prod.descricao}</p>
                  ) : (
                    <p className="mt-0.5 truncate text-[11px] text-amber-700">Não cadastrado no catálogo</p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => remover(item.codigo)}
                  aria-label={`Remover ${item.codigo}`}
                  className="shrink-0 rounded-full p-1 hover:bg-primary-100"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            )
          })}
        </div>
      )}

      <p className="mt-1 text-xs text-gray-400" aria-live="polite">
        {itens.length}/{maxItems} itens
      </p>
    </div>
  )
}
