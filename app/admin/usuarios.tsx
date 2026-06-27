'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { LOCAL_LABEL } from '@/lib/constants'
import { Edit2, Trash2, X, Save } from 'lucide-react'

const ROLE_INFO = {
  admin: { label: 'Administrador', cor: 'bg-red-100 text-red-700' },
  cozinha: { label: 'Cozinha', cor: 'bg-blue-100 text-blue-700' },
  loja: { label: 'Loja', cor: 'bg-amber-100 text-amber-700' },
}

export default function UsuariosTab() {
  const [usuarios, setUsuarios] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [usuarioEditando, setUsuarioEditando] = useState<any>(null)
  const [formEdicao, setFormEdicao] = useState({
    nome: '',
    role: 'loja' as 'admin' | 'cozinha' | 'loja',
    loja_id: 'loja1',
    ativo: true,
  })
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')

  useEffect(() => {
    carregarUsuarios()
  }, [])

  async function carregarUsuarios() {
    setLoading(true)
    const { data } = await supabase.from('usuarios').select('*').order('created_at', { ascending: false })
    setUsuarios(data || [])
    setLoading(false)
  }

  function abrirEdicao(usuario: any) {
    setUsuarioEditando(usuario)
    setFormEdicao({
      nome: usuario.nome,
      role: usuario.role,
      loja_id: usuario.loja_id || 'loja1',
      ativo: usuario.ativo,
    })
    setErro('')
  }

  function cancelarEdicao() {
    setUsuarioEditando(null)
    setErro('')
  }

  async function salvarAlteracoes() {
    if (!usuarioEditando) return
    setSalvando(true)
    setErro('')

    try {
      const { error } = await supabase
        .from('usuarios')
        .update({
          nome: formEdicao.nome,
          role: formEdicao.role,
          loja_id: formEdicao.role === 'loja' ? formEdicao.loja_id : null,
          ativo: formEdicao.ativo,
        })
        .eq('id', usuarioEditando.id)

      if (error) {
        setErro(error.message)
        setSalvando(false)
        return
      }

      carregarUsuarios()
      cancelarEdicao()
    } catch (err) {
      setErro('Erro ao salvar alterações')
      console.error(err)
    }

    setSalvando(false)
  }

  async function deletarUsuario(id: string) {
    if (!confirm('Tem certeza que deseja deletar este usuário?')) return

    setSalvando(true)
    try {
      // Deletar do Auth
      await supabase.auth.admin.deleteUser(id)

      // Deletar da tabela usuarios
      await supabase.from('usuarios').delete().eq('id', id)

      carregarUsuarios()
    } catch (err) {
      setErro('Erro ao deletar usuário')
      console.error(err)
    }
    setSalvando(false)
  }

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-800 mb-2">Gerenciar Usuários</h2>
        <p className="text-sm text-gray-600">
          Configure permissões e acesso para cada usuário do sistema
        </p>
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-400">Carregando...</div>
      ) : usuarios.length === 0 ? (
        <div className="text-center py-12 text-gray-400">Nenhum usuário cadastrado</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {usuarios.map(u => (
            <div key={u.id} className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1">
                  <p className="font-semibold text-gray-800">{u.nome}</p>
                  <p className="text-xs text-gray-500">{u.email}</p>
                </div>
                <span className={`text-xs px-2 py-1 rounded font-medium ${ROLE_INFO[u.role as keyof typeof ROLE_INFO]?.cor}`}>
                  {ROLE_INFO[u.role as keyof typeof ROLE_INFO]?.label}
                </span>
              </div>

              {u.role === 'loja' && u.loja_id && (
                <p className="text-xs text-gray-500 mb-3">📍 {LOCAL_LABEL[u.loja_id]}</p>
              )}

              <div className="flex items-center justify-between text-xs mb-3">
                <span className={`px-2 py-1 rounded ${u.ativo ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                  {u.ativo ? '✓ Ativo' : 'Inativo'}
                </span>
                <span className="text-gray-400">
                  Criado em {new Date(u.created_at).toLocaleDateString('pt-BR')}
                </span>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => abrirEdicao(u)}
                  className="flex-1 bg-blue-50 text-blue-600 rounded-lg py-2 text-sm font-medium flex items-center justify-center gap-1 hover:bg-blue-100"
                >
                  <Edit2 size={14} /> Editar
                </button>
                <button
                  onClick={() => deletarUsuario(u.id)}
                  disabled={salvando}
                  className="flex-1 bg-red-50 text-red-600 rounded-lg py-2 text-sm font-medium flex items-center justify-center gap-1 hover:bg-red-100 disabled:opacity-50"
                >
                  <Trash2 size={14} /> Deletar
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal de Edição */}
      {usuarioEditando && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-lg max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-800">Editar Permissões</h3>
              <button onClick={cancelarEdicao} className="text-gray-400 hover:text-gray-600">
                <X size={24} />
              </button>
            </div>

            {erro && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4 text-sm text-red-700">
                {erro}
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nome</label>
                <input
                  type="text"
                  value={formEdicao.nome}
                  onChange={e => setFormEdicao({ ...formEdicao, nome: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Função</label>
                <select
                  value={formEdicao.role}
                  onChange={e => setFormEdicao({ ...formEdicao, role: e.target.value as any })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white"
                >
                  <option value="admin">Administrador</option>
                  <option value="cozinha">Funcionário Cozinha</option>
                  <option value="loja">Funcionário Loja</option>
                </select>
              </div>

              {formEdicao.role === 'loja' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Loja Designada</label>
                  <select
                    value={formEdicao.loja_id}
                    onChange={e => setFormEdicao({ ...formEdicao, loja_id: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white"
                  >
                    <option value="loja1">Paraisópolis</option>
                    <option value="loja2">Itajubá</option>
                  </select>
                </div>
              )}

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="ativo"
                  checked={formEdicao.ativo}
                  onChange={e => setFormEdicao({ ...formEdicao, ativo: e.target.checked })}
                  className="w-4 h-4 rounded"
                />
                <label htmlFor="ativo" className="text-sm font-medium text-gray-700">
                  Usuário ativo
                </label>
              </div>

              {/* Permissões por Role */}
              <div className="bg-gray-50 rounded-lg p-4">
                <p className="text-xs font-semibold text-gray-700 mb-3">Permissões</p>
                <ul className="text-xs text-gray-600 space-y-2">
                  {formEdicao.role === 'admin' && (
                    <>
                      <li>✓ Gerenciar produtos</li>
                      <li>✓ Ver relatórios</li>
                      <li>✓ Gerenciar usuários</li>
                      <li>✓ Monitorar operações</li>
                    </>
                  )}
                  {formEdicao.role === 'cozinha' && (
                    <>
                      <li>✓ Ver ordens de produção</li>
                      <li>✓ Registrar lotes</li>
                      <li>✓ Gerenciar envios</li>
                      <li>✓ Reagendar ordens</li>
                    </>
                  )}
                  {formEdicao.role === 'loja' && (
                    <>
                      <li>✓ Criar ordens</li>
                      <li>✓ Ver estoque local</li>
                      <li>✓ Confirmar recebimentos</li>
                      <li>✓ Registrar vendas</li>
                    </>
                  )}
                </ul>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={salvarAlteracoes}
                  disabled={salvando}
                  className="flex-1 bg-green-600 text-white rounded-lg py-2 font-semibold flex items-center justify-center gap-2 hover:bg-green-700 disabled:opacity-50"
                >
                  <Save size={16} /> Salvar
                </button>
                <button
                  onClick={cancelarEdicao}
                  disabled={salvando}
                  className="flex-1 bg-gray-100 text-gray-700 rounded-lg py-2 font-semibold hover:bg-gray-200 disabled:opacity-50"
                >
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
