import { useEffect, useState, useId, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { LoadingButton } from '../components/LoadingButton'
import { ArrowLeft, Plus, Trash2, Search } from 'lucide-react'
import { maskCNPJ, maskCEP, maskTelefone, maskIE, unmask, validateCNPJ } from '../lib/masks'
import { buscarCEP } from '../lib/cep'
import { buscarCNPJ } from '../lib/cnpj'
import toast from 'react-hot-toast'
import type { ClienteContato } from '../types'

interface ContatoRascunho {
  id?: string          // existe se veio do banco
  tipo: 'telefone' | 'email'
  valor: string
  rotulo: string
}

const emptyForm = {
  fantasia: '',
  razao_social: '',
  cnpj: '',
  inscricao_estadual: '',
  endereco: '',
  numero: '',
  complemento: '',
  bairro: '',
  cidade: '',
  estado: '',
  cep: '',
  comprador: '',
  dia_compras: '',
  cliente_desde: '',
  is_cliente: true,
  display_chao: 0,
  display_balcao: 0,
  display_parede: 0,
}

const emptyContato = (): ContatoRascunho => ({ tipo: 'telefone', valor: '', rotulo: '' })

export default function ClienteForm() {
  const { id } = useParams()
  const isEditing = Boolean(id)
  const navigate = useNavigate()
  const { user } = useAuth()
  const [form, setForm] = useState(emptyForm)
  const [contatos, setContatos] = useState<ContatoRascunho[]>([emptyContato()])
  const [loading, setLoading] = useState(false)
  const [loadingData, setLoadingData] = useState(isEditing)
  const [loadingCep, setLoadingCep] = useState(false)
  const [loadingCnpj, setLoadingCnpj] = useState(false)

  useEffect(() => {
    if (isEditing && id) {
      Promise.all([
        supabase.from('clientes').select('*').eq('id', id).single(),
        supabase
          .from('cliente_contatos')
          .select('*')
          .eq('cliente_id', id)
          .order('ordem'),
      ]).then(([{ data }, { data: contatosData }]) => {
        if (data) {
          setForm({
            fantasia: data.fantasia ?? '',
            razao_social: data.razao_social ?? '',
            cnpj: data.cnpj ? maskCNPJ(data.cnpj) : '',
            inscricao_estadual: data.inscricao_estadual ?? '',
            endereco: data.endereco ?? '',
            numero: data.numero ?? '',
            complemento: data.complemento ?? '',
            bairro: data.bairro ?? '',
            cidade: data.cidade ?? '',
            estado: data.estado ?? '',
            cep: data.cep ? maskCEP(data.cep) : '',
            comprador: data.comprador ?? '',
            dia_compras: data.dia_compras ?? '',
            cliente_desde: data.cliente_desde ?? '',
            is_cliente: data.is_cliente ?? true,
            display_chao: data.display_chao ?? 0,
            display_balcao: data.display_balcao ?? 0,
            display_parede: data.display_parede ?? 0,
          })
        }
        if (contatosData && contatosData.length > 0) {
          const ordenados = [...(contatosData as ClienteContato[])].sort((a, b) => {
            if (a.tipo === b.tipo) return a.ordem - b.ordem
            return a.tipo === 'telefone' ? -1 : 1
          })
          setContatos(
            ordenados.map((c) => ({
              id: c.id,
              tipo: c.tipo,
              valor: c.tipo === 'telefone' ? maskTelefone(c.valor) : c.valor,
              rotulo: c.rotulo ?? '',
            })),
          )
        }
        setLoadingData(false)
      })
    }
  }, [id, isEditing])

  const set = (field: string, value: string | number | boolean) =>
    setForm((prev) => ({ ...prev, [field]: value }))

  const addContato = (tipo: 'telefone' | 'email') =>
    setContatos((prev) => {
      const novo = { tipo, valor: '', rotulo: '' }
      if (tipo === 'telefone') {
        // insere antes do primeiro email
        const firstEmailIdx = prev.findIndex((c) => c.tipo === 'email')
        if (firstEmailIdx === -1) return [...prev, novo]
        return [...prev.slice(0, firstEmailIdx), novo, ...prev.slice(firstEmailIdx)]
      }
      return [...prev, novo]
    })

  const removeContato = (idx: number) =>
    setContatos((prev) => prev.filter((_, i) => i !== idx))

  const updateContato = (idx: number, field: keyof ContatoRascunho, value: string) =>
    setContatos((prev) =>
      prev.map((c, i) => {
        if (i !== idx) return c
        if (field === 'valor' && c.tipo === 'telefone') return { ...c, valor: maskTelefone(value) }
        return { ...c, [field]: value }
      }),
    )

  const handleBuscarCEP = async () => {
    if (!form.cep) return
    setLoadingCep(true)
    try {
      const dados = await buscarCEP(form.cep)
      setForm((prev) => ({
        ...prev,
        endereco: prev.endereco || dados.logradouro,
        bairro: prev.bairro || dados.bairro,
        cidade: prev.cidade || dados.cidade,
        estado: prev.estado || dados.uf,
      }))
      toast.success('Endereço encontrado')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao buscar CEP')
    } finally {
      setLoadingCep(false)
    }
  }

  const handleBuscarCNPJ = async () => {
    if (!form.cnpj) return
    setLoadingCnpj(true)
    try {
      const dados = await buscarCNPJ(form.cnpj)
      setForm((prev) => ({
        ...prev,
        razao_social: prev.razao_social || dados.razaoSocial,
        fantasia: prev.fantasia || dados.nomeFantasia,
        endereco: prev.endereco || dados.logradouro,
        numero: prev.numero || dados.numero,
        complemento: prev.complemento || dados.complemento,
        bairro: prev.bairro || dados.bairro,
        cidade: prev.cidade || dados.municipio,
        estado: prev.estado || dados.uf,
        cep: prev.cep || dados.cep,
      }))

      const contatoTelefone: ContatoRascunho = { tipo: 'telefone', valor: dados.telefone, rotulo: 'Principal' }
      const contatoEmail: ContatoRascunho = { tipo: 'email', valor: dados.email, rotulo: 'Principal' }

      setContatos((prev) => {
        const novos: ContatoRascunho[] = []
        if (dados.telefone && !prev.some((c) => c.tipo === 'telefone' && c.valor === dados.telefone)) {
          novos.push(contatoTelefone)
        }
        if (dados.email && !prev.some((c) => c.tipo === 'email' && c.valor === dados.email)) {
          novos.push(contatoEmail)
        }
        if (novos.length === 0) return prev
        return [...novos, ...prev]
      })

      toast.success('Empresa encontrada')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao buscar CNPJ')
    } finally {
      setLoadingCnpj(false)
    }
  }

  const total = form.display_chao + form.display_balcao + form.display_parede

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!form.fantasia.trim()) {
      toast.error('Nome fantasia é obrigatório')
      return
    }

    const cnpjRaw = unmask(form.cnpj)
    if (cnpjRaw && !validateCNPJ(cnpjRaw)) {
      toast.error('CNPJ inválido — verifique os dígitos')
      return
    }

    const cepRaw = unmask(form.cep)
    if (cepRaw && cepRaw.length !== 8) {
      toast.error('CEP deve ter 8 dígitos')
      return
    }

    // Valida telefones
    for (const c of contatos) {
      if (c.tipo === 'telefone' && c.valor) {
        const raw = unmask(c.valor)
        if (raw.length < 10) {
          toast.error('Telefone deve ter 10 ou 11 dígitos')
          return
        }
      }
    }

    setLoading(true)

    const payload = {
      fantasia: form.fantasia.trim(),
      razao_social: form.razao_social || null,
      cnpj: cnpjRaw || null,
      inscricao_estadual: unmask(form.inscricao_estadual) || null,
      endereco: form.endereco || null,
      numero: form.numero || null,
      complemento: form.complemento || null,
      bairro: form.bairro || null,
      cidade: form.cidade || null,
      estado: form.estado.trim().toUpperCase().slice(0, 2) || null,
      cep: cepRaw || null,
      comprador: form.comprador || null,
      dia_compras: form.dia_compras || null,
      cliente_desde: form.cliente_desde || null,
      is_cliente: form.is_cliente,
      display_chao: form.display_chao,
      display_balcao: form.display_balcao,
      display_parede: form.display_parede,
    }

    let clienteId = id
    let error

    if (isEditing) {
      ;({ error } = await supabase.from('clientes').update(payload).eq('id', id))
    } else {
      const res = await supabase
        .from('clientes')
        .insert({ ...payload, vendedor_id: user!.id })
        .select('id')
        .single()
      error = res.error
      clienteId = res.data?.id
    }

    if (error) {
      setLoading(false)
      toast.error('Erro ao salvar cliente')
      return
    }

    // Salva contatos: apaga os existentes e reinserir em ordem
    const contatosValidos = contatos
      .filter((c) => c.valor.trim())
      .map((c, i) => ({
        cliente_id: clienteId!,
        tipo: c.tipo,
        valor: c.tipo === 'telefone' ? unmask(c.valor) : c.valor.trim(),
        rotulo: c.rotulo.trim() || null,
        ordem: i,
      }))

    if (isEditing) {
      await supabase.from('cliente_contatos').delete().eq('cliente_id', clienteId!)
    }

    if (contatosValidos.length > 0) {
      const { error: errContatos } = await supabase
        .from('cliente_contatos')
        .insert(contatosValidos)
      if (errContatos) {
        setLoading(false)
        toast.error('Cliente salvo, mas erro ao salvar contatos')
        return
      }
    }

    setLoading(false)
    toast.success(isEditing ? 'Cliente atualizado' : 'Cliente cadastrado')
    navigate(isEditing ? `/clientes/${clienteId}` : '/clientes', { replace: true })
  }

  if (loadingData) {
    return (
      <div className="flex justify-center py-12">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary-600 border-t-transparent" />
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pt-4 pb-8">
      <button onClick={() => navigate(-1)} className="mb-4 flex items-center gap-1 text-sm text-gray-500">
        <ArrowLeft className="h-4 w-4" />
        Voltar
      </button>

      <h2 className="mb-4 text-lg font-bold text-gray-900">
        {isEditing ? 'Editar Cliente' : 'Novo Cliente'}
      </h2>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Flag is_cliente */}
        <div className="flex items-center justify-between rounded-xl border border-gray-200 bg-white px-4 py-3">
          <div>
            <p className="text-sm font-medium text-gray-800">É cliente?</p>
            <p className="text-xs text-gray-500">
              {form.is_cliente ? 'Sim — cliente ativo' : 'Não — prospect / prospecção'}
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={form.is_cliente}
            onClick={() => set('is_cliente', !form.is_cliente)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              form.is_cliente ? 'bg-blue-600' : 'bg-gray-300'
            }`}
          >
            <span
              className={`inline-block h-4 w-4 translate-x-1 rounded-full bg-white shadow transition-transform ${
                form.is_cliente ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Nome Fantasia *" value={form.fantasia} onChange={(v) => set('fantasia', v)} autoComplete="organization" />
          <Field label="Razão Social" value={form.razao_social} onChange={(v) => set('razao_social', v)} />
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto_1fr]">
          <Field
            label="CNPJ"
            value={form.cnpj}
            onChange={(v) => set('cnpj', maskCNPJ(v))}
            inputMode="numeric"
            placeholder="00.000.000/0000-00"
            maxLength={18}
          />
          <div className="-mt-3 flex items-end sm:mt-0">
            <button
              type="button"
              onClick={handleBuscarCNPJ}
              disabled={!form.cnpj || loadingCnpj}
              className="h-11 rounded-lg border border-gray-300 px-3 text-gray-500 hover:border-blue-400 hover:text-blue-600 disabled:opacity-40 disabled:cursor-not-allowed"
              title="Buscar CNPJ"
            >
              {loadingCnpj ? (
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
              ) : (
                <Search className="h-5 w-5" />
              )}
            </button>
          </div>
          <Field
            label="Inscrição Estadual"
            value={form.inscricao_estadual}
            onChange={(v) => set('inscricao_estadual', maskIE(v))}
            inputMode="numeric"
            maxLength={14}
          />
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[2fr_auto]">
          <Field
            label="CEP"
            value={form.cep}
            onChange={(v) => set('cep', maskCEP(v))}
            inputMode="numeric"
            placeholder="00000-000"
            maxLength={9}
            autoComplete="postal-code"
          />
          <div className="-mt-3 flex items-end sm:mt-0">
            <button
              type="button"
              onClick={handleBuscarCEP}
              disabled={!form.cep || loadingCep}
              className="h-11 rounded-lg border border-gray-300 px-3 text-gray-500 hover:border-blue-400 hover:text-blue-600 disabled:opacity-40 disabled:cursor-not-allowed"
              title="Buscar CEP"
            >
              {loadingCep ? (
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
              ) : (
                <Search className="h-5 w-5" />
              )}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[2fr_auto_1fr]">
          <Field label="Endereço" value={form.endereco} onChange={(v) => set('endereco', v)} autoComplete="street-address" />
          <Field
            label="Número"
            value={form.numero}
            onChange={(v) => set('numero', v)}
            inputMode="numeric"
            className="sm:w-24"
          />
          <Field label="Complemento" value={form.complemento} onChange={(v) => set('complemento', v)} />
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_2fr_auto]">
          <Field label="Bairro" value={form.bairro} onChange={(v) => set('bairro', v)} />
          <Field
            label="Cidade"
            value={form.cidade}
            onChange={(v) => set('cidade', v)}
            autoComplete="address-level2"
          />
          <Field
            label="UF"
            value={form.estado}
            onChange={(v) => set('estado', v.replace(/[^a-zA-Z]/g, '').slice(0, 2).toUpperCase())}
            placeholder="SP"
            maxLength={2}
            className="sm:w-20"
          />
        </div>

        {/* Contatos dinâmicos */}
        <div>
          <p className="mb-2 text-sm font-medium text-gray-700">Contatos</p>
          <div className="space-y-2">
            {contatos.map((c, idx) => (
              <div key={idx} className="flex items-start gap-2">
                <select
                  value={c.tipo}
                  onChange={(e) => updateContato(idx, 'tipo', e.target.value)}
                  className="h-11 rounded-lg border border-gray-300 px-2 text-sm focus:border-blue-500 focus:outline-none"
                >
                  <option value="telefone">Tel</option>
                  <option value="email">Email</option>
                </select>
                <input
                  type={c.tipo === 'email' ? 'email' : 'tel'}
                  inputMode={c.tipo === 'telefone' ? 'tel' : 'email'}
                  value={c.valor}
                  onChange={(e) => updateContato(idx, 'valor', e.target.value)}
                  placeholder={c.tipo === 'telefone' ? '(00) 00000-0000' : 'email@exemplo.com'}
                  maxLength={c.tipo === 'telefone' ? 15 : 200}
                  className="h-11 flex-1 rounded-lg border border-gray-300 px-3 text-sm focus:border-blue-500 focus:outline-none"
                />
                <input
                  type="text"
                  value={c.rotulo}
                  onChange={(e) => updateContato(idx, 'rotulo', e.target.value)}
                  placeholder="Rótulo"
                  maxLength={100}
                  className="h-11 w-28 rounded-lg border border-gray-300 px-2 text-sm focus:border-blue-500 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => removeContato(idx)}
                  className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-lg border border-gray-200 text-gray-400 hover:bg-red-50 hover:text-red-500"
                  aria-label="Remover contato"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={() => addContato('telefone')}
              className="flex items-center gap-1 rounded-lg border border-dashed border-gray-300 px-3 py-2 text-xs font-medium text-gray-500 hover:border-blue-400 hover:text-blue-600"
            >
              <Plus className="h-3.5 w-3.5" />
              Telefone
            </button>
            <button
              type="button"
              onClick={() => addContato('email')}
              className="flex items-center gap-1 rounded-lg border border-dashed border-gray-300 px-3 py-2 text-xs font-medium text-gray-500 hover:border-blue-400 hover:text-blue-600"
            >
              <Plus className="h-3.5 w-3.5" />
              E-mail
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Field label="Comprador" value={form.comprador} onChange={(v) => set('comprador', v)} />
          <Field
            label="Dia de Compras"
            value={form.dia_compras}
            onChange={(v) => set('dia_compras', v)}
            placeholder="Ex: Segunda"
          />
          <Field
            label="Cliente Desde"
            value={form.cliente_desde}
            onChange={(v) => set('cliente_desde', v)}
            type="date"
          />
        </div>

        <div>
          <p className="mb-2 text-sm font-medium text-gray-700">Displays</p>
          <div className="grid grid-cols-3 gap-3">
            <NumField label="Chão" value={form.display_chao} onChange={(v) => set('display_chao', v)} />
            <NumField label="Balcão" value={form.display_balcao} onChange={(v) => set('display_balcao', v)} />
            <NumField label="Parede" value={form.display_parede} onChange={(v) => set('display_parede', v)} />
          </div>
          <p className="mt-1 text-sm text-gray-500">Total: {total}</p>
        </div>

        <LoadingButton type="submit" loading={loading} className="w-full sm:w-auto sm:min-w-[12rem] sm:self-end">
          {isEditing ? 'Salvar Alterações' : 'Cadastrar Cliente'}
        </LoadingButton>
      </form>
    </div>
  )
}

function Field({
  label,
  value,
  onChange,
  type = 'text',
  inputMode,
  placeholder,
  maxLength,
  autoComplete,
  className = '',
}: {
  label: string
  value: string
  onChange: (v: string) => void
  type?: string
  inputMode?: 'text' | 'numeric' | 'tel' | 'email' | 'url'
  placeholder?: string
  maxLength?: number
  autoComplete?: string
  className?: string
}) {
  const id = useId()
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1 block text-xs font-medium text-gray-600">{label}</label>
      <input
        id={id}
        type={type}
        inputMode={inputMode}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        maxLength={maxLength}
        autoComplete={autoComplete}
        className="h-11 w-full rounded-lg border border-gray-300 px-3 text-sm focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 focus:outline-none"
      />
    </div>
  )
}

function NumField({
  label,
  value,
  onChange,
}: {
  label: string
  value: number
  onChange: (v: number) => void
}) {
  const id = useId()
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-xs font-medium text-gray-600">{label}</label>
      <input
        id={id}
        type="number"
        inputMode="numeric"
        pattern="[0-9]*"
        min={0}
        value={value}
        onChange={(e) => onChange(parseInt(e.target.value) || 0)}
        className="h-11 w-full rounded-lg border border-gray-300 px-3 text-sm focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 focus:outline-none"
      />
    </div>
  )
}
