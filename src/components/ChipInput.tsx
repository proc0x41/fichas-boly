import { useState, useRef, useId, useEffect, useMemo, type KeyboardEvent, type MouseEvent } from 'react'
import { X, Plus, Loader2, CheckCircle, AlertCircle } from 'lucide-react'
import toast from 'react-hot-toast'
import type { CodigoItem } from '../types'
import { stripAccents } from '../lib/masks'
import { normCodigo, parsePercentInput } from '../lib/utils'

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
  /** Catálogo de produtos (chave = código normalizado) para exibir descrição em cada chip. */
  produtosCatalogo?: Map<string, ProdutoPreview> | null
  /** Desconto % global do pedido (0–100). Usado para exibir o efetivo de cada item quando não há override. */
  descontoGlobalPercent?: number
  maxLength?: number
  maxItems?: number
}

function fmtPct(n: number): string {
  return n.toLocaleString('pt-BR', { maximumFractionDigits: 2, useGrouping: false })
}

interface ChipDiscountProps {
  override: number | null | undefined
  global: number
  onChange: (next: number | null) => void
}

function ChipDiscount({ override, global, onChange }: ChipDiscountProps) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  // Espelho em ref: o `onBlur` pode disparar com o closure de um render
  // anterior (teclado mobile / troca rápida de foco); a ref sempre tem o
  // valor mais recente digitado.
  const draftRef = useRef('')
  const inputRef = useRef<HTMLInputElement>(null)

  const hasOverride = override !== null && override !== undefined
  const effective = hasOverride ? override! : global

  const setDraftBoth = (v: string) => {
    setDraft(v)
    draftRef.current = v
  }

  const startEdit = () => {
    setDraftBoth(hasOverride ? fmtPct(override!) : '')
    setEditing(true)
    setTimeout(() => inputRef.current?.focus(), 0)
  }

  /** `null` = herda o global; número = override (0 = sem desconto). */
  const commit = (raw: string | null) => {
    if (raw === null) {
      onChange(null)
    } else {
      onChange(parsePercentInput(raw))
    }
    setEditing(false)
  }

  const saveDraft = () => {
    const trimmed = draftRef.current.trim()
    // Vazio = limpa o override e volta a herdar o global.
    // Para tirar o desconto do item é preciso 0 (botão "0%").
    commit(trimmed === '' ? null : trimmed)
  }

  if (editing) {
    return (
      <span className="inline-flex items-center gap-1">
        <input
          ref={inputRef}
          type="text"
          inputMode="decimal"
          value={draft}
          onChange={(e) => setDraftBoth(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              saveDraft()
            } else if (e.key === 'Escape') {
              setEditing(false)
            }
          }}
          onBlur={saveDraft}
          placeholder={`${fmtPct(global)}%`}
          maxLength={6}
          aria-label="Desconto deste item em % — digite 0 para sem desconto, apague para herdar o global"
          className="w-14 rounded border border-primary-500 px-1 py-0.5 text-center text-[10px] font-semibold focus:outline-none focus:ring-2 focus:ring-primary-500/30"
        />
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => commit('0')}
          title="Sem desconto neste item"
          aria-label="Sem desconto neste item"
          className="rounded-full bg-blue-100 px-1.5 py-0.5 text-[10px] font-bold text-blue-800 ring-1 ring-blue-400 active:bg-blue-200"
        >
          0%
        </button>
        {hasOverride && (
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => commit(null)}
            title="Voltar a herdar o desconto global"
            aria-label="Voltar a herdar o desconto global"
            className="rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] font-semibold text-gray-600 ring-1 ring-gray-300 active:bg-gray-200"
          >
            ↩
          </button>
        )}
      </span>
    )
  }

  return (
    <button
      type="button"
      onClick={startEdit}
      title={
        hasOverride
          ? 'Desconto específico deste item — clique para alterar (botão 0% = sem desconto, ↩ = volta ao global)'
          : 'Herda o desconto global — clique para tirar o desconto só deste item (botão 0%)'
      }
      className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums transition-colors ${
        hasOverride
          ? 'bg-blue-100 text-blue-800 ring-1 ring-blue-400'
          : 'bg-white/80 text-gray-500'
      }`}
    >
      {fmtPct(effective)}%
    </button>
  )
}

interface ChipQuantidadeProps {
  quantidade: number
  onChange: (nova: number) => void
}

function ChipQuantidade({ quantidade, onChange }: ChipQuantidadeProps) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  // Mesmo espelho em ref do ChipDiscount: o `onBlur` pode disparar com o
  // closure de um render anterior no teclado mobile.
  const draftRef = useRef('')
  const inputRef = useRef<HTMLInputElement>(null)

  const setDraftBoth = (v: string) => {
    setDraft(v)
    draftRef.current = v
  }

  const startEdit = () => {
    setDraftBoth(String(quantidade))
    setEditing(true)
    setTimeout(() => inputRef.current?.focus(), 0)
  }

  const save = () => {
    const trimmed = draftRef.current.trim()
    const qtd = parseInt(trimmed, 10)
    if (trimmed && Number.isFinite(qtd) && qtd > 0 && qtd <= 99999) {
      if (qtd !== quantidade) onChange(qtd)
    } else if (trimmed) {
      toast.error('Quantidade deve ser entre 1 e 99999')
    }
    // Vazio ou inválido = descarta e mantém a anterior.
    setEditing(false)
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        type="text"
        value={draft}
        onChange={(e) => setDraftBoth(e.target.value.replace(/\D/g, '').slice(0, 5))}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            save()
          } else if (e.key === 'Escape') {
            setEditing(false)
          }
        }}
        onBlur={save}
        inputMode="numeric"
        pattern="[0-9]*"
        enterKeyHint="done"
        maxLength={5}
        aria-label="Quantidade do item"
        className="w-16 rounded border border-primary-500 px-1 py-0.5 text-center text-[10px] font-semibold focus:outline-none focus:ring-2 focus:ring-primary-500/30"
      />
    )
  }

  return (
    <button
      type="button"
      onClick={startEdit}
      title="Quantidade — clique para alterar sem remover o item"
      aria-label={`Quantidade ${quantidade} — clique para alterar`}
      className="rounded-full bg-white/80 px-1.5 py-0.5 text-[10px] font-semibold text-primary-800 transition-colors hover:bg-white"
    >
      ×{quantidade}
    </button>
  )
}

export function ChipInput({ itens, onChange, onLookupCodigo, produtosCatalogo, descontoGlobalPercent = 0, maxLength = 20, maxItems = 400 }: Props) {
  const [codigo, setCodigo] = useState('')
  const [quantidade, setQuantidade] = useState('')
  const [preview, setPreview] = useState<ProdutoPreview | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewNaoEncontrado, setPreviewNaoEncontrado] = useState(false)
  const [previewParaCodigo, setPreviewParaCodigo] = useState('')
  const [sugestoesAbertas, setSugestoesAbertas] = useState(false)
  const codigoInputRef = useRef<HTMLInputElement>(null)
  const quantidadeInputRef = useRef<HTMLInputElement>(null)
  const codigoId = useId()
  const quantidadeId = useId()

  // Sugestões por nome/código: busca no catálogo disponível localmente.
  // Filtra por descrição ou código contendo o termo (case/accent-insensitive). Máx 8 itens.
  const sugestoes = useMemo(() => {
    if (!produtosCatalogo) return []
    const termo = codigo.trim()
    if (termo.length < 2) return []
    const termoNorm = stripAccents(termo).toLowerCase()
    const result: { codigo: string; descricao: string; preco_tabela: number }[] = []
    for (const [cod, prod] of produtosCatalogo) {
      const descNorm = stripAccents(prod.descricao).toLowerCase()
      const codNorm = cod.toLowerCase()
      if (descNorm.includes(termoNorm) || codNorm.includes(termoNorm)) {
        result.push({ codigo: prod.codigoCanonico ?? cod.toUpperCase(), descricao: prod.descricao, preco_tabela: prod.preco_tabela })
        if (result.length >= 8) break
      }
    }
    return result
  }, [codigo, produtosCatalogo])

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

  const setOverride = (idx: number, novo: number | null) => {
    onChange(
      itens.map((it, i) =>
        i === idx ? { ...it, descontoOverride: novo } : it,
      ),
    )
  }

  const alterarQuantidade = (idx: number, nova: number) => {
    onChange(
      itens.map((it, i) =>
        i === idx ? { ...it, quantidade: nova } : it,
      ),
    )
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
          onChange={(e) => {
            setCodigo(e.target.value)
            setSugestoesAbertas(true)
          }}
          onKeyDown={handleCodigoKeyDown}
          onFocus={() => setSugestoesAbertas(true)}
          onBlur={() => {
            // Pequeno delay para permitir click nas sugestões antes de fechar.
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

      {/* Sugestões por nome/código (catálogo local). Ocultas quando o preview já encontrou correspondência exata. */}
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
                <span className="shrink-0 text-[11px] tabular-nums text-gray-500">
                  {Number(s.preco_tabela).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {onLookupCodigo && codigo.trim() && !(sugestoesAbertas && sugestoes.length > 0 && !preview) && (() => {
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
                  <p className="text-[11px] text-green-700 font-medium mb-0.5">
                    Código: <span className="font-mono">{preview.codigoCanonico ?? codigo.trim().toUpperCase()}</span>
                  </p>
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
        <div className="mt-3 flex flex-col gap-1.5" role="list" aria-label="Itens do pedido">
          {itens.map((item, idx) => idx).reverse().map((idx) => {
            const item = itens[idx]
            const prod = produtosCatalogo?.get(normCodigo(item.codigo)) ?? null
            return (
              <div
                key={`${item.codigo}-${idx}`}
                role="listitem"
                className="flex items-center gap-2 rounded-lg bg-primary-50 px-3 py-2 text-xs text-primary-800"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-1.5">
                    <span className="font-mono font-semibold">{item.codigo}</span>
                    <ChipQuantidade
                      quantidade={item.quantidade}
                      onChange={(v) => alterarQuantidade(idx, v)}
                    />
                    <ChipDiscount
                      override={item.descontoOverride}
                      global={descontoGlobalPercent}
                      onChange={(v) => setOverride(idx, v)}
                    />
                  </div>
                  {prod ? (
                    <p className="mt-0.5 truncate text-[11px] text-gray-600">{prod.descricao}</p>
                  ) : (
                    <p className="mt-0.5 truncate text-[11px] text-amber-700">Não cadastrado no catálogo</p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => remover(idx)}
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
