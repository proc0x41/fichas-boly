import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { LoadingButton } from '../../components/LoadingButton'
import { ArrowLeft, Loader2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { fixUtf8MojibakeIfNeeded } from '../../lib/fixUtf8Mojibake'

function normCodigo(c: string): string {
  return c.trim().toLowerCase()
}

function parsePreco(v: unknown): number | null {
  if (v === '' || v === null || v === undefined) return null
  if (typeof v === 'number' && !Number.isNaN(v)) return v >= 0 ? v : null
  const s = String(v).trim().replace(/\s/g, '').replace(',', '.')
  const n = Number(s)
  return Number.isFinite(n) && n >= 0 ? n : null
}

export default function AdminProdutoForm() {
  const { id } = useParams()
  const isEditing = Boolean(id)
  const navigate = useNavigate()

  const [loadingData, setLoadingData] = useState(isEditing)
  const [saving, setSaving] = useState(false)
  const [codigo, setCodigo] = useState('')
  const [descricao, setDescricao] = useState('')
  const [preco, setPreco] = useState('')
  const [ativo, setAtivo] = useState(true)

  useEffect(() => {
    if (!isEditing || !id) return
    void supabase
      .from('produtos')
      .select('*')
      .eq('id', id)
      .single()
      .then(({ data, error }) => {
        if (error || !data) {
          toast.error('Produto não encontrado')
          navigate('/admin/produtos')
          return
        }
        setCodigo(data.codigo)
        setDescricao(fixUtf8MojibakeIfNeeded(data.descricao))
        setPreco(String(data.preco_tabela).replace('.', ','))
        setAtivo(data.ativo)
        setLoadingData(false)
      })
  }, [id, isEditing, navigate])

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!descricao.trim()) {
      toast.error('Descrição obrigatória')
      return
    }
    const pr = parsePreco(preco)
    if (pr === null) {
      toast.error('Preço inválido')
      return
    }
    setSaving(true)
    const descNorm = fixUtf8MojibakeIfNeeded(descricao.trim())

    if (isEditing) {
      const { error } = await supabase
        .from('produtos')
        .update({ descricao: descNorm, preco_tabela: pr, ativo })
        .eq('id', id!)
      setSaving(false)
      if (error) {
        toast.error(error.message || 'Erro ao atualizar produto')
        return
      }
      toast.success('Produto atualizado')
    } else {
      const c = normCodigo(codigo)
      if (!c) {
        toast.error('Código obrigatório')
        setSaving(false)
        return
      }
      const { error } = await supabase.from('produtos').insert({
        codigo: c,
        descricao: descNorm,
        preco_tabela: pr,
        ativo: true,
      })
      setSaving(false)
      if (error) {
        if (error.code === '23505') toast.error('Código já cadastrado')
        else toast.error('Erro ao salvar')
        return
      }
      toast.success('Produto cadastrado')
    }
    navigate('/admin/produtos')
  }

  if (loadingData) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pt-4 pb-8">
      <button
        onClick={() => navigate('/admin/produtos')}
        className="mb-4 flex items-center gap-1 text-sm text-gray-500"
      >
        <ArrowLeft className="h-4 w-4" />
        Voltar
      </button>

      <h2 className="mb-6 text-lg font-bold text-gray-900">
        {isEditing ? 'Editar produto' : 'Novo produto'}
      </h2>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Código</label>
          {isEditing ? (
            <>
              <input
                value={codigo}
                disabled
                className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-500"
              />
              <p className="mt-1 text-xs text-gray-400">O código não pode ser alterado após o cadastro</p>
            </>
          ) : (
            <input
              placeholder="Ex: 1001"
              value={codigo}
              onChange={(e) => setCodigo(e.target.value)}
              className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
            />
          )}
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Descrição</label>
          <input
            placeholder="Ex: CERVEJA PILSEN LATA 350ML"
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
            className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Preço tabela</label>
          <input
            placeholder="Ex: 3,50"
            value={preco}
            onChange={(e) => setPreco(e.target.value)}
            inputMode="decimal"
            className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
          />
        </div>

        {isEditing && (
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={ativo}
              onChange={(e) => setAtivo(e.target.checked)}
              className="h-4 w-4"
            />
            Ativo no catálogo
          </label>
        )}

        <LoadingButton
          type="submit"
          loading={saving}
          className="w-full rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white"
        >
          {isEditing ? 'Salvar alterações' : 'Cadastrar produto'}
        </LoadingButton>
      </form>
    </div>
  )
}
