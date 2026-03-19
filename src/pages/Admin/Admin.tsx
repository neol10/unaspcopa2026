import React, { useState } from 'react';
import { supabase } from '../../lib/supabase';
import { Trophy, Users, Calendar, Plus, Save, Trash2, Shield, ChevronDown, ChevronUp, Newspaper, Image as ImageIcon, CheckCircle, Play, Camera, Search, Settings2, Vote, ShieldAlert, Bell, Star, CreditCard, Target, Square, ArrowRightLeft, MessageSquare, Zap, Clock, ArrowRight, Pause, RotateCcw } from 'lucide-react';
import { useTeams } from '../../hooks/useTeams';
import { usePlayers } from '../../hooks/usePlayers';
import { useNews } from '../../hooks/useNews';
import { useMatches } from '../../hooks/useMatches';
import { useMatchEvents } from '../../hooks/useMatchEvents';
import { useGallery } from '../../hooks/useGallery';
import { useTournamentConfig } from '../../hooks/useTournamentConfig';
import { useAuthContext } from '../../contexts/AuthContext';
import { toast } from 'react-hot-toast';
import './Admin.css';

const uploadToStorage = async (file: File, bucket: string = 'images', folder: string = 'team-badges'): Promise<string | null> => {
  try {
    const fileExt = file.name.split('.').pop();
    const fileName = `${Math.random().toString(36).substring(2)}_${Date.now()}.${fileExt}`;
    const filePath = `${folder}/${fileName}`;

    // Adicionar timeout ao upload
    const uploadPromise = supabase.storage
      .from(bucket)
      .upload(filePath, file);

    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Tempo limite de upload excedido (15s)')), 15000)
    );

    const { error: uploadError } = await Promise.race([uploadPromise, timeoutPromise]) as any;

    if (uploadError) throw uploadError;

    const { data } = supabase.storage
      .from(bucket)
      .getPublicUrl(filePath);

    return data.publicUrl;
  } catch (err: any) {
    console.error('Upload error:', err);
    toast.error('Erro no upload: ' + err.message);
    return null;
  }
};

const formatDatetimeLocal = (dateStr: string | null) => {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};


const Admin: React.FC = () => {
  const { user, role, loading: authLoading } = useAuthContext();
  const [activeTab, setActiveTab] = useState<'matches' | 'teams' | 'players' | 'news' | 'tournament' | 'polls' | 'notifications' | 'errors'>('matches');
  
  if (authLoading) return <div className="admin-loading-state glass"><div className="spinner"></div><p>Verificando credenciais...</p></div>;

  // Evita piscar "Acesso Restrito" enquanto o role ainda está sendo resolvido.
  if (user && role === null) {
    return (
      <div className="admin-loading-state glass">
        <div className="spinner"></div>
        <p>Carregando permissões...</p>
      </div>
    );
  }

  const isAdmin = role === 'admin';

  return (
    <div className="admin-container animate-fade-in">
      {!isAdmin ? (
        <div className="admin-access-denied glass animate-fade-in">
          <div className="denied-icon">
            <ShieldAlert size={64} color="var(--primary)" />
          </div>
          <h2>Acesso Restrito</h2>
          <p>{user ? 'Sua conta não possui permissões administrativas para gerenciar a Copa.' : 'Faça login com uma conta administrativa para acessar este painel.'}</p>
          <button className="btn-home-denied" onClick={() => window.location.href = '/'}>Voltar para a Arena</button>
        </div>
      ) : (
        <>
          <header className="admin-main-header glass">
            <div className="admin-brand">
              <div className="admin-icon-box">
                <Trophy size={24} color="var(--secondary)" />
              </div>
              <div className="admin-title-group">
                <h1 className="text-gradient">Painel de Controle</h1>
                <p>Comando Central • Copa 2026</p>
                <div className="fifa-streak" style={{ marginTop: '0.5rem', opacity: 0.5 }}></div>
              </div>
            </div>
            
            <nav className="admin-tabs">
              <button 
                className={`tab-btn ${activeTab === 'matches' ? 'active' : ''}`} 
                onClick={() => setActiveTab('matches')}
              >
                <Calendar size={18} />
                <span>Partidas</span>
              </button>
              <button 
                className={`tab-btn ${activeTab === 'teams' ? 'active' : ''}`} 
                onClick={() => setActiveTab('teams')}
              >
                <Users size={18} />
                <span>Equipes</span>
              </button>
              <button 
                className={`tab-btn ${activeTab === 'players' ? 'active' : ''}`} 
                onClick={() => setActiveTab('players')}
              >
                <Users size={18} />
                <span>Atletas</span>
              </button>
              <button 
                className={`tab-btn ${activeTab === 'news' ? 'active' : ''}`} 
                onClick={() => setActiveTab('news')}
              >
                <Newspaper size={18} />
                <span>Notícias</span>
              </button>
              <button 
                className={`tab-btn ${activeTab === 'tournament' ? 'active' : ''}`} 
                onClick={() => setActiveTab('tournament')}
              >
                <Settings2 size={18} />
                <span>Torneio</span>
              </button>
              <button 
                className={`tab-btn ${activeTab === 'polls' ? 'active' : ''}`} 
                onClick={() => setActiveTab('polls')}
              >
                <Vote size={18} />
                <span>Enquetes</span>
              </button>
              <button 
                className={`tab-btn ${activeTab === 'notifications' ? 'active' : ''}`} 
                onClick={() => setActiveTab('notifications')}
              >
                <Bell size={18} />
                <span>Alertas Push</span>
              </button>
              <button 
                className={`tab-btn ${activeTab === 'errors' ? 'active' : ''}`} 
                onClick={() => setActiveTab('errors')}
              >
                <ShieldAlert size={18} />
                <span>Erros</span>
              </button>
            </nav>
          </header>

          <main className="admin-viewport">
            {activeTab === 'matches' && <MatchManagement />}
            {activeTab === 'teams' && <TeamManagement />}
            {activeTab === 'players' && <GlobalPlayerManagement />}
            {activeTab === 'news' && <NewsManagement />}
            {activeTab === 'tournament' && <TournamentManagement />}
            {activeTab === 'polls' && <PollManagement />}
            {activeTab === 'notifications' && <NotificationBroadcast />}
            {activeTab === 'errors' && <ClientErrorsPanel />}
          </main>
        </>
      )}
    </div>
  );
};

// --- Helpers ---
const sendPushNotification = async (title: string, body: string, url: string = '/') => {
  try {
    await fetch('/api/notify-push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, body, url, sound: 'default' }),
    });
  } catch (err) {
    console.error('Push notification error:', err);
  }
};

// --- Alertas Push em Massa ---
const NotificationBroadcast = () => {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [url, setUrl] = useState('/');
  const [sending, setSending] = useState(false);

  const handleBroadcast = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !body) return toast.error('Preencha título e corpo!');
    
    setSending(true);
    try {
      await sendPushNotification(title, body, url);
      toast.success('Alerta push enviado para todos os inscritos! 📢');
      setTitle('');
      setBody('');
      setUrl('/');
    } catch (err: any) {
      toast.error('Erro ao enviar broadcast: ' + err.message);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="admin-section glass animate-fade-in">
      <div className="section-header">
        <h2>Transmissão de Alertas (Push)</h2>
        <p className="section-subtitle">Envie notificações em tempo real para todos os usuários que aceitaram alertas.</p>
      </div>

      <form className="admin-form glass" onSubmit={handleBroadcast}>
        <div className="form-group">
          <label>Título do Alerta</label>
          <input 
            type="text" 
            placeholder="Ex: ⚽ GOLAÇO NA ARENA!" 
            value={title} 
            onChange={e => setTitle(e.target.value)} 
            required 
          />
        </div>
        <div className="form-group">
          <label>Mensagem</label>
          <textarea 
            placeholder="Ex: O clássico está pegando fogo! Venha conferir o resultado ao vivo." 
            value={body} 
            onChange={e => setBody(e.target.value)} 
            rows={3}
            required
          />
        </div>
        <div className="form-group">
          <label>URL de Destino (Opcional)</label>
          <input 
            type="text" 
            placeholder="Ex: /central-da-partida" 
            value={url} 
            onChange={e => setUrl(e.target.value)} 
          />
          <small>Caminho para onde o usuário será levado ao clicar.</small>
        </div>
        
        <button type="submit" className="btn-save" disabled={sending}>
          <Bell size={18} /> {sending ? 'Enviando...' : 'Disparar Alerta Agora'}
        </button>
      </form>

      <div className="broadcast-tips glass">
        <h4>💡 Dicas de Engajamento</h4>
        <ul>
          <li>Use emojis para aumentar a taxa de clique.</li>
          <li>Seja breve e direto ao ponto.</li>
          <li>Evite enviar muitos alertas em curto espaço de tempo.</li>
        </ul>
      </div>
    </div>
  );
};

// --- Observabilidade: Erros do Client ---
type ClientErrorRow = {
  id: string;
  created_at: string;
  source: string;
  message: string;
  stack: string | null;
  path: string | null;
  user_agent: string | null;
  app_version: string | null;
  extra: any;
};

const formatDateTime = (value: string) => {
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
};

const ClientErrorsPanel = () => {
  const [items, setItems] = useState<ClientErrorRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const { data, error } = await supabase
        .from('client_errors')
        .select('id, created_at, source, message, stack, path, user_agent, app_version, extra')
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      setItems((data || []) as ClientErrorRow[]);
    } catch (err: any) {
      console.error('Error loading client_errors:', err);
      const msg = err?.message || 'Falha ao carregar erros';
      setLoadError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  React.useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="admin-section glass animate-fade-in">
      <div className="section-header">
        <div>
          <h2>Erros do App (Client)</h2>
          <p className="section-subtitle">Últimos 50 erros reportados pelos usuários (observabilidade).</p>
        </div>
        <button className="btn-add" onClick={() => void load()} disabled={loading}>
          <RotateCcw size={18} /> {loading ? 'Atualizando...' : 'Atualizar'}
        </button>
      </div>

      <div className="client-errors-body">
        {loadError ? (
          <div className="admin-empty-state">
            <p>Não foi possível carregar: {loadError}</p>
            <button className="btn-add" onClick={() => void load()} disabled={loading}>
              <RotateCcw size={18} /> Tentar novamente
            </button>
          </div>
        ) : items.length === 0 ? (
          <div className="admin-empty-state">
            <p>Nenhum erro registrado ainda.</p>
          </div>
        ) : (
          <div className="client-errors-list">
            {items.map((it) => (
              <div key={it.id} className="client-error-item glass">
                <div className="client-error-head">
                  <strong>{it.source}</strong>
                  <span className="client-error-date">{formatDateTime(it.created_at)}</span>
                </div>
                <div className="client-error-message">{it.message}</div>
                <div className="client-error-meta">
                  {it.path ? <span>Rota: {it.path}</span> : null}
                  {it.app_version ? <span>Versão: {it.app_version}</span> : null}
                </div>

                {(it.stack || it.extra || it.user_agent) ? (
                  <details className="client-error-details">
                    <summary>Detalhes</summary>
                    {it.stack ? (
                      <pre className="client-error-pre">{it.stack}</pre>
                    ) : null}
                    {it.user_agent ? (
                      <div className="client-error-ua">UA: {it.user_agent}</div>
                    ) : null}
                    {it.extra ? (
                      <pre className="client-error-pre">{JSON.stringify(it.extra, null, 2)}</pre>
                    ) : null}
                  </details>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

// --- Sub-componentes Admin ---

const MatchManagement = () => {
  const { matches, loading, refresh } = useMatches();
  const { teams } = useTeams();
  const [isAdding, setIsAdding] = useState(false);
  const [selectedMatchId, setSelectedMatchId] = useState<string | null>(null);
  const [formData, setFormData] = useState({ 
    team_a_id: '', 
    team_b_id: '', 
    match_date: '', 
    location: 'Ginásio Principal',
    status: 'agendado',
    round: '1' 
  });
  const [searchTerm, setSearchTerm] = useState('');

  // Agrupar equipes por grupo
  const groupedTeams = teams.reduce((acc: any, team) => {
    const groupName = team.group || 'Sem Grupo';
    if (!acc[groupName]) acc[groupName] = [];
    acc[groupName].push(team);
    return acc;
  }, {});

  const handleCreateMatch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (formData.team_a_id === formData.team_b_id) return toast.error('Selecione times diferentes!');
    
    // Validação: Impedir que o mesmo time jogue duas vezes na mesma rodada
    const currentRound = parseInt(formData.round) || 1;
    const teamACollision = matches.find(m => m.round === currentRound && (m.team_a_id === formData.team_a_id || m.team_b_id === formData.team_a_id));
    const teamBCollision = matches.find(m => m.round === currentRound && (m.team_a_id === formData.team_b_id || m.team_b_id === formData.team_b_id));

    if (teamACollision) {
      const teamName = teams.find(t => t.id === formData.team_a_id)?.name;
      return toast.error(`Erro: O time ${teamName} já possui uma partida na rodada ${currentRound}!`);
    }
    if (teamBCollision) {
      const teamName = teams.find(t => t.id === formData.team_b_id)?.name;
      return toast.error(`Erro: O time ${teamName} já possui uma partida na rodada ${currentRound}!`);
    }

    try {
      const { error } = await supabase.from('matches').insert([{
        ...formData,
        match_date: formData.match_date ? new Date(formData.match_date).toISOString() : null,
        round: currentRound
      }]);
      if (error) throw error;
      setFormData({ team_a_id: '', team_b_id: '', match_date: '', location: 'Ginásio Principal', status: 'agendado', round: '1' });
      setIsAdding(false);
      refresh();
    } catch (err: any) { toast.error(err.message); }
  };

  const updateStatus = async (id: string, status: string, match?: any) => {
    try {
      const { error } = await supabase.from('matches').update({ status }).eq('id', id);
      if (error) throw error;
      
      if (status === 'ao_vivo' && match) {
        sendPushNotification(
          '🍿 Jogo Iniciado!', 
          `${match.teams_a.name} vs ${match.teams_b.name} acaba de começar!`,
          '/central-da-partida'
        );
      }

      if (status === 'finalizado' && match) {
        sendPushNotification(
          '🏁 Partida Finalizada!', 
          `Placar Final: ${match.teams_a.name} ${match.team_a_score} x ${match.team_b_score} ${match.teams_b.name}`,
          '/central-da-partida'
        );
      }
      
      refresh();
    } catch (err: any) { toast.error(err.message); }
  };

  const [editingMatchId, setEditingMatchId] = useState<string | null>(null);

  const handleUpdateMatch = async (id: string, data: any) => {
    // Validação: Impedir que o mesmo time jogue duas vezes na mesma rodada (ignorando a própria partida sendo editada)
    const currentRound = parseInt(data.round) || 1;
    const teamACollision = matches.find(m => m.id !== id && m.round === currentRound && (m.team_a_id === data.team_a_id || m.team_b_id === data.team_a_id));
    const teamBCollision = matches.find(m => m.id !== id && m.round === currentRound && (m.team_a_id === data.team_b_id || m.team_b_id === data.team_b_id));

    if (teamACollision) {
      const teamName = teams.find(t => t.id === data.team_a_id)?.name;
      return toast.error(`Erro: O time ${teamName} já possui outra partida na rodada ${currentRound}!`);
    }
    if (teamBCollision) {
      const teamName = teams.find(t => t.id === data.team_b_id)?.name;
      return toast.error(`Erro: O time ${teamName} já possui outra partida na rodada ${currentRound}!`);
    }

    try {
      const { error } = await supabase.from('matches').update({
        team_a_id: data.team_a_id,
        team_b_id: data.team_b_id,
        match_date: data.match_date ? new Date(data.match_date).toISOString() : null,
        location: data.location,
        status: data.status,
        round: currentRound
      }).eq('id', id);
      if (error) throw error;
      setEditingMatchId(null);
      refresh();
      toast.success('Partida atualizada!');
    } catch (err: any) { toast.error(err.message); }
  };

  const filteredMatches = matches.filter(m => 
    m.teams_a?.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    m.teams_b?.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    String(m.round).includes(searchTerm)
  );

  // Times ocupados na rodada selecionada (Nova Partida)
  const busyTeamIdsInRound = new Set(
    matches
      .filter(m => m.round === (parseInt(formData.round) || 1))
      .flatMap(m => [m.team_a_id, m.team_b_id])
  );

  // Times ocupados na rodada da partida sendo editada (Ignorando a própria partida)
  const getBusyTeamIdsForEdit = (matchId: string, round: number) => {
    return new Set(
      matches
        .filter(m => m.id !== matchId && m.round === round)
        .flatMap(m => [m.team_a_id, m.team_b_id])
    );
  };

  return (
    <div className="admin-section glass">
      <div className="section-header">
        <h2>Gerenciar Partidas</h2>
        <div className="admin-actions-header">
          <button className="btn-add" onClick={() => setIsAdding(!isAdding)}>
            {isAdding ? 'Cancelar' : <><Plus size={18} /> Nova Partida</>}
          </button>
          <button 
            className="btn-test-push" 
            onClick={() => sendPushNotification('🔔 Teste de Alerta', 'Se você recebeu isso, as notificações estão funcionando! 🚀')}
          >
            <Bell size={18} /> Testar Notificações
          </button>
        </div>
      </div>

      {isAdding && (
        <form className="admin-form glass" onSubmit={handleCreateMatch}>
           <div className="form-grid">
              <div className="form-group">
                <label>Equipe A</label>
                <select required value={formData.team_a_id} onChange={e => setFormData({...formData, team_a_id: e.target.value})}>
                  <option value="">Selecione...</option>
                  {Object.keys(groupedTeams).sort().map(group => {
                    const availableTeamsInGroup = groupedTeams[group].filter((t: any) => !busyTeamIdsInRound.has(t.id) || t.id === formData.team_a_id);
                    if (availableTeamsInGroup.length === 0) return null;
                    return (
                      <optgroup key={group} label={`Grupo ${group}`}>
                        {availableTeamsInGroup.sort((a: any, b: any) => a.name.localeCompare(b.name)).map((t: any) => (
                          <option key={t.id} value={t.id} disabled={formData.team_b_id === t.id}>{t.name}</option>
                        ))}
                      </optgroup>
                    );
                  })}
                </select>
              </div>
              <div className="form-group">
                <label>Equipe B</label>
                <select required value={formData.team_b_id} onChange={e => setFormData({...formData, team_b_id: e.target.value})}>
                  <option value="">Selecione...</option>
                  {Object.keys(groupedTeams).sort().map(group => {
                    const availableTeamsInGroup = groupedTeams[group].filter((t: any) => !busyTeamIdsInRound.has(t.id) || t.id === formData.team_b_id);
                    if (availableTeamsInGroup.length === 0) return null;
                    return (
                      <optgroup key={group} label={`Grupo ${group}`}>
                        {availableTeamsInGroup.sort((a: any, b: any) => a.name.localeCompare(b.name)).map((t: any) => (
                          <option key={t.id} value={t.id} disabled={formData.team_a_id === t.id}>{t.name}</option>
                        ))}
                      </optgroup>
                    );
                  })}
                </select>
              </div>
               <div className="form-group">
                 <label>Data/Hora</label>
                 <input type="datetime-local" required value={formData.match_date} onChange={e => setFormData({...formData, match_date: e.target.value})} />
               </div>
               <div className="form-group">
                 <label>Rodada (Apenas número)</label>
                 <input type="number" placeholder="Ex: 1, 2..." required value={formData.round} onChange={e => setFormData({...formData, round: e.target.value})} />
               </div>
           </div>
           <button type="submit" className="btn-save"><Save size={18} /> Criar Partida</button>
        </form>
      )}

      <div className="admin-filters-bar">
        <div className="search-input-wrapper">
          <Search size={18} />
          <input 
            type="text" 
            placeholder="Buscar por equipe ou rodada..." 
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      <div className="admin-list">
        {loading ? <p>Carregando...</p> : filteredMatches.map(match => (
          <React.Fragment key={match.id}>
            <div className={`admin-list-item match-admin-card ${match.status}`}>
              <div className="match-status-info">
                  <span className={`status-dot ${match.status}`}></span>
                  <div className="match-info-main">
                    <strong style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      {match.teams_a?.badge_url ? (
                        <img src={match.teams_a.badge_url} alt="" style={{ width: 24, height: 24, objectFit: 'contain' }} />
                      ) : (
                        <Shield size={20} />
                      )}
                      <span>{match.teams_a?.name} {match.team_a_score} x {match.team_b_score} {match.teams_b?.name}</span>
                      {match.teams_b?.badge_url ? (
                        <img src={match.teams_b.badge_url} alt="" style={{ width: 24, height: 24, objectFit: 'contain' }} />
                      ) : (
                        <Shield size={20} />
                      )}
                    </strong>
                    <div className="match-meta-admin">
                      <span className="round-badge">{match.round}</span>
                      <span className="match-date">{new Date(match.match_date).toLocaleString('pt-BR')}</span>
                    </div>
                  </div>
              </div>
              <div className="item-actions">
                {match.status === 'agendado' && (
                  <>
                    <button className="btn-icon edit" title="Editar Partida" onClick={() => {
                       setEditingMatchId(match.id);
                       setFormData({
                         team_a_id: match.team_a_id,
                         team_b_id: match.team_b_id,
                         match_date: formatDatetimeLocal(match.match_date),
                         location: match.location,
                         status: match.status,
                         round: String(match.round)
                       });
                    }}><Settings2 size={18} /></button>
                    <button className="btn-icon play" title="Começar Jogo" onClick={() => updateStatus(match.id, 'ao_vivo', match)}><Play size={18} /></button>
                  </>
                )}
                {match.status === 'ao_vivo' && (
                  <>
                    <button className="btn-live-control" onClick={() => setSelectedMatchId(selectedMatchId === match.id ? null : match.id)}>
                      {selectedMatchId === match.id ? 'Fechar Painel' : 'Lançar Eventos'}
                    </button>
                    <button className="btn-icon finish" title="Finalizar Jogo" onClick={() => updateStatus(match.id, 'finalizado', match)}><CheckCircle size={18} /></button>
                  </>
                )}
                {match.status === 'finalizado' && (
                   <>
                     <button className="btn-icon edit" title="Editar Resultado/Meta" onClick={() => {
                        setEditingMatchId(match.id);
                        setFormData({
                          team_a_id: match.team_a_id,
                          team_b_id: match.team_b_id,
                          match_date: formatDatetimeLocal(match.match_date),
                          location: match.location,
                          status: match.status,
                          round: String(match.round)
                        });
                     }}><Settings2 size={18} /></button>
                     <span className="final-label">Finalizado</span>
                   </>
                )}
                <button className="btn-icon delete" onClick={() => { if(confirm('Apagar partida?')) supabase.from('matches').delete().eq('id', match.id).then(() => refresh()) }}><Trash2 size={18} /></button>
              </div>
            </div>

            {editingMatchId === match.id && (
              <div className="admin-form glass animate-slide-down" style={{ margin: '1rem 0' }}>
                <div className="form-grid">
                  <div className="form-group">
                    <label>Equipe A</label>
                    <select value={formData.team_a_id} onChange={e => setFormData({...formData, team_a_id: e.target.value})}>
                      {teams
                        .filter(t => !getBusyTeamIdsForEdit(match.id, parseInt(formData.round)).has(t.id) || t.id === match.team_a_id)
                        .map(t => <option key={t.id} value={t.id}>{t.name}</option>)
                      }
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Equipe B</label>
                    <select value={formData.team_b_id} onChange={e => setFormData({...formData, team_b_id: e.target.value})}>
                      {teams
                        .filter(t => !getBusyTeamIdsForEdit(match.id, parseInt(formData.round)).has(t.id) || t.id === match.team_b_id)
                        .map(t => <option key={t.id} value={t.id}>{t.name}</option>)
                      }
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Data/Hora</label>
                    <input type="datetime-local" value={formData.match_date} onChange={e => setFormData({...formData, match_date: e.target.value})} />
                  </div>
                  <div className="form-group">
                    <label>Rodada</label>
                    <input type="number" value={formData.round} onChange={e => setFormData({...formData, round: e.target.value})} />
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '1rem' }}>
                  <button className="btn-save" onClick={() => handleUpdateMatch(match.id, formData)}><Save size={18} /> Atualizar Partida</button>
                  <button className="btn-cancel" onClick={() => setEditingMatchId(null)}>Cancelar</button>
                </div>
              </div>
            )}
            {selectedMatchId === match.id && (
              <div className="live-event-panel glass animate-slide-down">
                <LiveMatchControl match={match} />
              </div>
            )}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}

const LiveMatchControl: React.FC<{ match: any }> = ({ match }) => {
  const { players: playersA } = usePlayers(match.team_a_id);
  const { players: playersB } = usePlayers(match.team_b_id);
  const { events, refresh: refreshEvents } = useMatchEvents(match.id);
  const [eventType, setEventType] = useState<'gol' | 'amarelo' | 'vermelho' | 'substituicao' | 'comentario' | 'momento'>('gol');
  const [goalType, setGoalType] = useState<'normal' | 'penalti' | 'contra'>('normal');
  const [selectedMinute, setSelectedMinute] = useState<number>(0);
  const [assistantId, setAssistantId] = useState<string>('');
  const [playerOutId, setPlayerOutId] = useState<string>('');
  const [commentaryText, setCommentaryText] = useState('');
  const [mvpData, setMvpData] = useState({ 
    player_id: match.match_mvp_player_id || '', 
    description: match.match_mvp_description || '' 
  });
  const [mvpSaved, setMvpSaved] = useState(false);
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [editEventMinute, setEditEventMinute] = useState<number>(0);

  // --- Cronômetro ---
  const [seconds, setSeconds] = useState(0);
  const [isActive, setIsActive] = useState(false);

  useEffect(() => {
    let interval: any = null;
    if (isActive) {
      interval = setInterval(() => {
        setSeconds(s => s + 1);
      }, 1000);
    } else {
      clearInterval(interval);
    }
    return () => clearInterval(interval);
  }, [isActive]);

  const formatTime = (s: number) => {
    const mins = Math.floor(s / 60);
    const secs = s % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // --- Escalação / Roster ---
  const [onFieldA, setOnFieldA] = useState<string[]>([]);
  const [onFieldB, setOnFieldB] = useState<string[]>([]);

  // Inicializar quem está em campo (pode ser baseado em quem já tem eventos ou um padrão)
  useEffect(() => {
    if (playersA.length > 0 && onFieldA.length === 0) {
      setOnFieldA(playersA.slice(0, 5).map(p => p.id)); // Sugestão inicial: primeiros 5
    }
    if (playersB.length > 0 && onFieldB.length === 0) {
      setOnFieldB(playersB.slice(0, 5).map(p => p.id));
    }
  }, [playersA, playersB]);

  // Atalhos (Admin produtivo): Alt+1..6 troca tipo, Ctrl+Espaço inicia/pausa cronômetro
  useEffect(() => {
    const shouldIgnore = (target: EventTarget | null) => {
      const el = target as HTMLElement | null;
      if (!el) return false;
      const tag = (el.tagName || '').toLowerCase();
      return tag === 'input' || tag === 'textarea' || tag === 'select' || el.isContentEditable;
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (shouldIgnore(e.target)) return;

      if (e.ctrlKey && (e.code === 'Space' || e.key === ' ')) {
        e.preventDefault();
        setIsActive(prev => !prev);
        return;
      }

      if (!e.altKey) return;
      if (e.key === '1') setEventType('gol');
      else if (e.key === '2') setEventType('amarelo');
      else if (e.key === '3') setEventType('vermelho');
      else if (e.key === '4') setEventType('substituicao');
      else if (e.key === '5') setEventType('momento');
      else if (e.key === '6') setEventType('comentario');
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const togglePlayerStatus = (playerId: string, team: 'a' | 'b') => {
    if (team === 'a') {
      setOnFieldA(prev => prev.includes(playerId) ? prev.filter(id => id !== playerId) : [...prev, playerId]);
    } else {
      setOnFieldB(prev => prev.includes(playerId) ? prev.filter(id => id !== playerId) : [...prev, playerId]);
    }
  };

  const addEvent = async (playerId: string, team: 'a' | 'b') => {
    try {
      const eventMinute = selectedMinute > 0 ? selectedMinute : Math.floor(seconds / 60) || 1;

      const eventData: any = {
        match_id: match.id,
        event_type: eventType,
        minute: eventMinute
      };

      if (eventType === 'comentario' || eventType === 'momento') {
        eventData.player_id = null;
      } else {
        eventData.player_id = playerId;
      }

      if (eventType === 'gol') {
        eventData.commentary = goalType === 'normal' ? '' : `[${goalType.toUpperCase()}]`;
        if (assistantId) eventData.assistant_id = assistantId;
      }
      
      if (eventType === 'substituicao' && assistantId) {
        eventData.assistant_id = assistantId; // IN
        // Lógica de troca automática de status
        if (team === 'a') {
          setOnFieldA(prev => prev.filter(id => id !== playerId).concat(assistantId));
        } else {
          setOnFieldB(prev => prev.filter(id => id !== playerId).concat(assistantId));
        }
      }

      if (eventType === 'comentario' || eventType === 'momento') {
        eventData.commentary = commentaryText;
      }

      const { error } = await supabase.from('match_events').insert([eventData]);
      if (error) throw error;
      
      if (eventType === 'gol') {
        let newScore = {};
        if (goalType === 'contra') {
          newScore = team === 'a' ? { team_b_score: match.team_b_score + 1 } : { team_a_score: (match.team_a_score || 0) + 1 };
        } else {
          newScore = team === 'a' ? { team_a_score: (match.team_a_score || 0) + 1 } : { team_b_score: (match.team_b_score || 0) + 1 };
        }
        await supabase.from('matches').update(newScore).eq('id', match.id);
      }
      
      if (eventType === 'gol' && goalType !== 'contra') {
        const { data: p } = await supabase.from('players').select('goals_count').eq('id', playerId).single();
        await supabase.from('players').update({ goals_count: (p?.goals_count || 0) + 1 }).eq('id', playerId);
        
        if (assistantId) {
          const { data: ast } = await supabase.from('players').select('assists').eq('id', assistantId).single();
          await supabase.from('players').update({ assists: (ast?.assists || 0) + 1 }).eq('id', assistantId);
        }
      } else if (eventType === 'amarelo') {
        const { data: p } = await supabase.from('players').select('yellow_cards').eq('id', playerId).single();
        await supabase.from('players').update({ yellow_cards: (p?.yellow_cards || 0) + 1 }).eq('id', playerId);
      } else if (eventType === 'vermelho') {
        const { data: p } = await supabase.from('players').select('red_cards').eq('id', playerId).single();
        await supabase.from('players').update({ red_cards: (p?.red_cards || 0) + 1 }).eq('id', playerId);
        // Expulso sai de campo automaticamente
        if (team === 'a') setOnFieldA(prev => prev.filter(id => id !== playerId));
        else setOnFieldB(prev => prev.filter(id => id !== playerId));
      }

      setAssistantId('');
      setPlayerOutId('');
      setCommentaryText('');
      refreshEvents();
      
      if (eventType === 'gol') {
        const player = [...playersA, ...playersB].find(p => p.id === playerId);
        const teamName = team === 'a' ? match.teams_a.name : match.teams_b.name;
        let title = '⚽ GOOOOOOL!';
        let body = `Gol de ${player?.name || 'alguém'} para o ${teamName}!`;
        
        if (goalType === 'penalti') body = `[PÊNALTI] ${body}`;
        if (goalType === 'contra') {
          title = '⚽ GOL CONTRA!';
          body = `Gol contra de ${player?.name}!`;
        }

        sendPushNotification(title, body, '/central-da-partida');
      } else if (eventType === 'amarelo' || eventType === 'vermelho') {
        const player = [...playersA, ...playersB].find(p => p.id === playerId);
        const teamName = team === 'a' ? match.teams_a.name : match.teams_b.name;
        sendPushNotification(
          eventType === 'amarelo' ? '🟨 Cartão Amarelo' : '🟥 Cartão Vermelho',
          `${player?.name} (${teamName}) ${eventMinute}'`,
          '/central-da-partida'
        );
      } else if (eventType === 'substituicao') {
        const pOut = [...playersA, ...playersB].find(p => p.id === playerId);
        const pIn = [...playersA, ...playersB].find(p => p.id === assistantId);
        const teamName = team === 'a' ? match.teams_a.name : match.teams_b.name;
        sendPushNotification(
          '🔄 Substituição',
          `${teamName}: Sai ${pOut?.name}, Entra ${pIn?.name}`,
          '/central-da-partida'
        );
      } else if (eventType === 'comentario') {
        sendPushNotification('📝 Atualização', commentaryText, '/central-da-partida');
      } else if (eventType === 'momento') {
        sendPushNotification('🔥 Momento da Partida', commentaryText, '/central-da-partida');
      }
      
      // Feedback visual rápido
      toast.success('Evento registrado!');
    } catch (err: any) { toast.error(err.message); }
  };

  const removeEvent = async (event: any) => {
    if (!confirm('Deseja realmente excluir este lance? Isso reverterá placares e estatísticas.')) return;
    
    try {
      if (event.event_type === 'gol') {
        const isTeamA = playersA.some(p => p.id === event.player_id);
        const newScore = isTeamA 
          ? { team_a_score: Math.max(0, match.team_a_score - 1) } 
          : { team_b_score: Math.max(0, match.team_b_score - 1) };
        await supabase.from('matches').update(newScore).eq('id', match.id);
        
        const { data: p } = await supabase.from('players').select('goals_count').eq('id', event.player_id).single();
        await supabase.from('players').update({ goals_count: Math.max(0, (p?.goals_count || 0) - 1) }).eq('id', event.player_id);

        if (event.assistant_id) {
          const { data: ast } = await supabase.from('players').select('assists').eq('id', event.assistant_id).single();
          await supabase.from('players').update({ assists: Math.max(0, (ast?.assists || 0) - 1) }).eq('id', event.assistant_id);
        }
      }

      if (event.event_type === 'amarelo') {
        const { data: p } = await supabase.from('players').select('yellow_cards').eq('id', event.player_id).single();
        await supabase.from('players').update({ yellow_cards: Math.max(0, (p?.yellow_cards || 0) - 1) }).eq('id', event.player_id);
      } else if (event.event_type === 'vermelho') {
        const { data: p } = await supabase.from('players').select('red_cards').eq('id', event.player_id).single();
        await supabase.from('players').update({ red_cards: Math.max(0, (p?.red_cards || 0) - 1) }).eq('id', event.player_id);
      }

      await supabase.from('match_events').delete().eq('id', event.id);
      refreshEvents();
      toast.success('Evento removido e revertido.');
    } catch (err: any) { toast.error(err.message); }
  };

  const undoLastEvent = () => {
    if (events.length === 0) return;
    const lastEvent = events[0];
    removeEvent(lastEvent);
  };

  const handleManualScore = async (team: 'a' | 'b', increment: number) => {
    try {
      const currentScore = team === 'a' ? (match.team_a_score || 0) : (match.team_b_score || 0);
      const newScoreValue = Math.max(0, currentScore + increment);
      const updateData = team === 'a' ? { team_a_score: newScoreValue } : { team_b_score: newScoreValue };
      
      const { error } = await supabase.from('matches').update(updateData).eq('id', match.id);
      if (error) throw error;
      toast.success(`Placar ${team === 'a' ? 'A' : 'B'} ajustado!`);
    } catch (err: any) { toast.error(err.message); }
  };


  return (
    <div className="live-event-panel-wrapper">
      <div className="live-match-controls-top">
        <div className="live-score-display">
          <div className="team-score">
            <span className="team-name">{match.teams_a.name}</span>
            <div className="score-control">
              <button className="btn-score-adjust" onClick={() => handleManualScore('a', -1)}>-</button>
              <span className="score">{match.team_a_score}</span>
              <button className="btn-score-adjust" onClick={() => handleManualScore('a', 1)}>+</button>
            </div>
          </div>
          <span className="divider">×</span>
          <div className="team-score">
            <div className="score-control">
              <button className="btn-score-adjust" onClick={() => handleManualScore('b', -1)}>-</button>
              <span className="score">{match.team_b_score}</span>
              <button className="btn-score-adjust" onClick={() => handleManualScore('b', 1)}>+</button>
            </div>
            <span className="team-name">{match.teams_b.name}</span>
          </div>
        </div>


        <div className="stopwatch-container">
          <div className="stopwatch-display">{formatTime(seconds)}</div>
          <div className="stopwatch-actions">
            <button className={`btn-stopwatch ${isActive ? 'pause' : 'start'}`} onClick={() => setIsActive(!isActive)}>
              {isActive ? <><Pause size={14} /> Pausar</> : <><Play size={14} /> Iniciar</>}
            </button>
            <button className="btn-stopwatch reset" onClick={() => { setIsActive(false); setSeconds(0); }}>
              <RotateCcw size={14} /> Zerar
            </button>
          </div>
        </div>
        
        <button className="btn-undo-last" onClick={undoLastEvent} disabled={events.length === 0}>
          <RotateCcw size={14} /> DESFAZER ÚLTIMO
        </button>
      </div>


      <div className="event-selector">
        <button className={eventType === 'gol' ? 'active' : ''} onClick={() => setEventType('gol')}>
          <Target size={16} /> GOL
        </button>
        <button className={eventType === 'amarelo' ? 'active yellow' : ''} onClick={() => setEventType('amarelo')}>
          <Square size={16} fill={eventType === 'amarelo' ? '#fbbf24' : 'none'} /> AMARELO
        </button>
        <button className={eventType === 'vermelho' ? 'active red' : ''} onClick={() => setEventType('vermelho')}>
          <Square size={16} fill={eventType === 'vermelho' ? '#ef4444' : 'none'} /> VERMELHO
        </button>
        <button className={eventType === 'substituicao' ? 'active' : ''} onClick={() => setEventType('substituicao')}>
          <ArrowRightLeft size={16} /> SUBST.
        </button>
        <button className={eventType === 'momento' ? 'active' : ''} onClick={() => setEventType('momento')}>
          <Clock size={16} /> MOMENTO
        </button>
        <button className={eventType === 'comentario' ? 'active' : ''} onClick={() => setEventType('comentario')}>
          <MessageSquare size={16} /> TEXTO
        </button>
      </div>

      {eventType === 'gol' && (
        <div className="goal-type-selector animate-slide-down">
          <label>Tipo de Gol: </label>
          <div className="goal-type-btns">
            <button className={goalType === 'normal' ? 'active' : ''} onClick={() => setGoalType('normal')}>Normal</button>
            <button className={goalType === 'penalti' ? 'active' : ''} onClick={() => setGoalType('penalti')}>Pênalti</button>
            <button className={goalType === 'contra' ? 'active red' : ''} onClick={() => setGoalType('contra')}>Contra</button>
          </div>
        </div>
      )}

      <div className="event-controls-row">
        <div className="form-group-mini">
          <label>Minuto (Auto)</label>
          <input type="number" value={selectedMinute > 0 ? selectedMinute : Math.floor(seconds / 60) || 1} onChange={e => setSelectedMinute(parseInt(e.target.value))} />
        </div>
        
        {eventType === 'gol' && (
          <div className="form-group-mini">
            <label>Assistência</label>
            <select value={assistantId} onChange={e => setAssistantId(e.target.value)}>
              <option value="">Ninguém</option>
              {[...playersA, ...playersB].map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
        )}

        {(eventType === 'comentario' || eventType === 'momento') && (
          <div className="form-group-full">
            <input 
              type="text" 
              placeholder={eventType === 'momento' ? 'Descreva o momento da partida...' : 'Digite o comentário do jogo...'}
              value={commentaryText} 
              onChange={e => setCommentaryText(e.target.value)} 
            />
            <button className="btn-send-msg" onClick={() => addEvent('', 'a')} disabled={!commentaryText.trim()}>
              Enviar
            </button>
          </div>
        )}

        {eventType === 'substituicao' && (
          <div className="form-group-full" style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
            <div className="form-group-mini" style={{flex: 1}}>
              <label>Sai do Jogo (OUT):</label>
              <select value={playerOutId} onChange={e => setPlayerOutId(e.target.value)}>
                <option value="">Selecione quem sai...</option>
                {[...playersA, ...playersB].map(p => <option key={`out-${p.id}`} value={p.id}>{p.number}. {p.name}</option>)}
              </select>
            </div>
            <div className="form-group-mini" style={{flex: 1}}>
              <label>Entra no Jogo (IN):</label>
              <select value={assistantId} onChange={e => setAssistantId(e.target.value)}>
                <option value="">Selecione quem entra...</option>
                {[...playersA, ...playersB].map(p => <option key={`in-${p.id}`} value={p.id}>{p.number}. {p.name}</option>)}
              </select>
            </div>
            <button 
              className="btn-send-msg" 
              style={{ width: '100%', marginTop: '0.5rem' }}
              onClick={() => {
                const team = playersA.some(p => p.id === playerOutId) ? 'a' : 'b';
                addEvent(playerOutId, team);
              }}
              disabled={!playerOutId || !assistantId}
            >
              Registrar Substituição
            </button>
          </div>
        )}
      </div>
        
      <div className={`teams-lanes event-selector-active-${eventType}`}>
        <div className="lane">
          <h5>{match.teams_a.name}</h5>
          
          <div className="roster-section">
            <span className="roster-label"><Zap size={12} /> Em Campo</span>
            <div className="admin-player-btns">
              {playersA.filter(p => onFieldA.includes(p.id)).map(p => (
                <button key={p.id} onClick={() => addEvent(p.id, 'a')} className="p-btn active-field">
                  <span className="p-num">{p.number}</span>
                  <span className="p-name">{p.name.split(' ')[0]}</span>
                  <ChevronDown size={10} className="btn-status-toggle" onClick={(e) => { e.stopPropagation(); togglePlayerStatus(p.id, 'a'); }} />
                </button>
              ))}
            </div>
          </div>

          <div className="roster-section">
            <span className="roster-label"><Users size={12} /> Banco</span>
            <div className="admin-player-btns">
              {playersA.filter(p => !onFieldA.includes(p.id)).map(p => (
                <button key={p.id} onClick={() => togglePlayerStatus(p.id, 'a')} className="p-btn bench">
                  <span className="p-num">{p.number}</span>
                  <span className="p-name">{p.name.split(' ')[0]}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="divider-vertical"></div>

        <div className="lane">
          <h5>{match.teams_b.name}</h5>
          
          <div className="roster-section">
            <span className="roster-label"><Zap size={12} /> Em Campo</span>
            <div className="admin-player-btns">
              {playersB.filter(p => onFieldB.includes(p.id)).map(p => (
                <button key={p.id} onClick={() => addEvent(p.id, 'b')} className="p-btn active-field">
                  <span className="p-num">{p.number}</span>
                  <span className="p-name">{p.name.split(' ')[0]}</span>
                  <ChevronDown size={10} className="btn-status-toggle" onClick={(e) => { e.stopPropagation(); togglePlayerStatus(p.id, 'b'); }} />
                </button>
              ))}
            </div>
          </div>

          <div className="roster-section">
            <span className="roster-label"><Users size={12} /> Banco</span>
            <div className="admin-player-btns">
              {playersB.filter(p => !onFieldB.includes(p.id)).map(p => (
                <button key={p.id} onClick={() => togglePlayerStatus(p.id, 'b')} className="p-btn bench">
                  <span className="p-num">{p.number}</span>
                  <span className="p-name">{p.name.split(' ')[0]}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="recent-events-undo">
        <div className="recent-header">
          <h6>Lances Recentes</h6>
          <span className="undo-tip">Clique no minuto para editar o tempo</span>
        </div>
        <div className="undo-list">
          {events.slice(0, 8).map(event => (
            <div key={event.id} className="undo-item-container">
              <div className={`undo-item animate-slide-up ${editingEventId === event.id ? 'editing' : ''}`}>
                <div className="undo-info">
                  {editingEventId === event.id ? (
                    <div className="edit-event-inline">
                      <input 
                        type="number" 
                        value={editEventMinute} 
                        onChange={e => setEditEventMinute(parseInt(e.target.value))}
                        className="edit-min-input"
                        autoFocus
                      />
                      <button className="btn-save-edit" onClick={async () => {
                        try {
                          await supabase.from('match_events').update({ minute: editEventMinute }).eq('id', event.id);
                          setEditingEventId(null);
                          refreshEvents();
                          toast.success('Tempo atualizado!');
                        } catch (err: any) { toast.error(err.message); }
                      }}><Save size={12} /></button>
                      <button className="btn-cancel-edit" onClick={() => setEditingEventId(null)}>✕</button>
                    </div>
                  ) : (
                    <>
                      <strong className="clickable-min" onClick={() => {
                        setEditingEventId(event.id);
                        setEditEventMinute(event.minute);
                      }}>{event.minute}'</strong>
                      <span className={`event-type-tag ${event.event_type}`}>
                        {event.event_type.toUpperCase()}
                      </span>
                      <span className="p-name">{event.players?.name}</span>
                      {event.commentary && <span className="ev-comment">{event.commentary}</span>}
                    </>
                  )}
                </div>
                <div className="undo-actions">
                  <button className="btn-undo" onClick={() => removeEvent(event)} title="Remover e reverter">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            </div>
          ))}
          {events.length === 0 && <p className="empty-msg">Aguardando o primeiro lance...</p>}
        </div>
      </div>

      {/* Craque do Jogo - NOVO */}
      <div className="mvp-selection-admin">
        <div className="mvp-admin-header">
          <h6>⭐ Definir Craque do Jogo</h6>
          <button 
            className="btn-suggest-mvp" 
            onClick={() => {
              const stats: Record<string, { points: number, goals: number, firstEvent: number }> = {};
              
              events.forEach(ev => {
                if (ev.event_type === 'gol') {
                  // Gols (ignorando contra-gols que têm [CONTRA] no comentário)
                  const isOwnGoal = ev.commentary?.includes('[CONTRA]');
                  if (!isOwnGoal) {
                    if (!stats[ev.player_id]) stats[ev.player_id] = { points: 0, goals: 0, firstEvent: ev.minute };
                    stats[ev.player_id].points += 1;
                    stats[ev.player_id].goals += 1;
                    if (ev.minute < stats[ev.player_id].firstEvent) stats[ev.player_id].firstEvent = ev.minute;
                  }
                  // Assistências via evento direto ou metadado de gol
                  const assId = ev.assistant_id;
                  if (assId) {
                    if (!stats[assId]) stats[assId] = { points: 0, goals: 0, firstEvent: ev.minute };
                    stats[assId].points += 1;
                    if (ev.minute < stats[assId].firstEvent) stats[assId].firstEvent = ev.minute;
                  }
                }
              });

              const sorted = Object.entries(stats).sort(([, a], [, b]) => {
                if (b.points !== a.points) return b.points - a.points;
                if (b.goals !== a.goals) return b.goals - a.goals;
                return a.firstEvent - b.firstEvent;
              });

              if (sorted.length > 0) {
                const [bestId, bestStats] = sorted[0];
                const player = [...playersA, ...playersB].find(p => p.id === bestId);
                if (player) {
                  setMvpData({
                    player_id: bestId,
                    description: `${bestStats.goals} Gol(s) e ${bestStats.points - bestStats.goals} Assistência(s)`
                  });
                }
              } else {
                toast.error('Nenhum gol ou assistência registrado nesta partida para sugerir.');
              }
            }}
          >
            ⭐ Sugerir por Estatísticas
          </button>
        </div>
        <div className="form-grid">
          <div className="form-group">
            <label>Jogador Destaque</label>
            <select 
              className="mvp-player-select"
              value={mvpData.player_id}
              onChange={e => setMvpData({ ...mvpData, player_id: e.target.value })}
            >
              <option value="">Selecione o craque...</option>
              {playersA.length > 0 && (
                <optgroup label={match.teams_a?.name}>
                  {playersA.map(p => <option key={p.id} value={p.id}>{p.number}. {p.name}</option>)}
                </optgroup>
              )}
              {playersB.length > 0 && (
                <optgroup label={match.teams_b?.name}>
                  {playersB.map(p => <option key={p.id} value={p.id}>{p.number}. {p.name}</option>)}
                </optgroup>
              )}
            </select>
          </div>
          <div className="form-group">
            <label>Por que foi o craque? (Opcional)</label>
            <input 
              type="text"
              className="mvp-desc-input"
              placeholder="Ex: 2 gols e comandou o meio-campo"
              value={mvpData.description}
              onChange={e => setMvpData({ ...mvpData, description: e.target.value })}
            />
          </div>
        </div>
        <button 
          className="btn-save" 
          onClick={async () => {
            try {
              const { error } = await supabase.from('matches')
                .update({ 
                  match_mvp_player_id: mvpData.player_id || null,
                  match_mvp_description: mvpData.description 
                })
                .eq('id', match.id);
              if (error) throw error;
              setMvpSaved(true);
              setTimeout(() => setMvpSaved(false), 2000);
            } catch (err: any) { toast.error(err.message); }
          }}

        >
          {mvpSaved ? <><CheckCircle size={18} /> Salvo!</> : <><Save size={18} /> Salvar Craque do Jogo</>}
        </button>
      </div>
    </div>
  );
}

const TeamManagement = () => {
  const { teams, loading, refresh } = useTeams();
  const [isAdding, setIsAdding] = useState(false);
  const [expandedTeamId, setExpandedTeamId] = useState<string | null>(null);
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [editGroupValue, setEditGroupValue] = useState('');
  const [formData, setFormData] = useState({ name: '', group: '', leader: '', badge_url: '' });
  const [uploading, setUploading] = useState(false);

  const handleBadgeUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const url = await uploadToStorage(file, 'images', 'team-badges');
    if (url) setFormData(prev => ({ ...prev, badge_url: url }));
    setUploading(false);
  };

  const handleSaveGroup = async (teamId: string) => {
    try {
      const { error } = await supabase.from('teams').update({ group: editGroupValue }).eq('id', teamId);
      if (error) throw error;
      setEditingGroupId(null);
      refresh();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleAddTeam = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const { error } = await supabase.from('teams').insert([formData]);
      if (error) throw error;
      setFormData({ name: '', group: '', leader: '', badge_url: '' });
      setIsAdding(false);
      refresh();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Deseja realmente excluir esta equipe? Todos os jogadores também serão removidos.')) return;
    try {
      const { error } = await supabase.from('teams').delete().eq('id', id);
      if (error) throw error;
      refresh();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleUpdateTeam = async (teamId: string, data: any) => {
    try {
      const { error } = await supabase.from('teams').update(data).eq('id', teamId);
      if (error) throw error;
      refresh();
      toast.success('Equipe atualizada!');
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  return (
    <div className="admin-section glass">
      <div className="section-header">
        <h2>Equipes & Atletas</h2>
        <button className="btn-add" onClick={() => setIsAdding(!isAdding)}>
          {isAdding ? 'Cancelar' : <><Plus size={18} /> Nova Equipe</>}
        </button>
      </div>

      {isAdding && (
        <form className="admin-form glass" onSubmit={handleAddTeam}>
          <div className="form-grid">
            <div className="form-group">
              <label>Nome da Equipe</label>
              <input 
                type="text" 
                required 
                value={formData.name}
                onChange={(e) => setFormData({...formData, name: e.target.value})}
                placeholder="Ex: Fisioterapia FC"
              />
            </div>
            <div className="form-group">
              <label>Grupo / Categoria</label>
              <input 
                type="text"
                value={formData.group}
                onChange={(e) => setFormData({...formData, group: e.target.value})}
                required
                placeholder="Ex: Grupo A, Feminino, etc."
              />
            </div>
            <div className="form-group">
              <label>Líder/Capitão</label>
              <input 
                type="text" 
                required 
                value={formData.leader}
                onChange={(e) => setFormData({...formData, leader: e.target.value})}
              />
            </div>
            <div className="form-group">
              <label>Escudo da Equipe</label>
              <div className="image-upload-wrapper">
                <label className={`image-upload-container ${uploading ? 'uploading' : ''}`}>
                  {uploading ? (
                    <div className="upload-loading-overlay">
                      <div className="spinner"></div>
                    </div>
                  ) : formData.badge_url ? (
                    <img src={formData.badge_url} alt="Preview" className="image-preview-badge" />
                  ) : (
                    <div className="upload-icon-box">
                      <Camera size={24} />
                      <span>Upload</span>
                    </div>
                  )}
                  <input 
                    type="file" 
                    accept="image/*" 
                    className="hidden-file-input" 
                    onChange={handleBadgeUpload} 
                  />
                </label>
                {formData.badge_url && (
                  <button type="button" className="btn-remove-photo" onClick={() => setFormData({...formData, badge_url: ''})}>Remover</button>
                )}
              </div>
            </div>
          </div>
          <button type="submit" className="btn-save"><Save size={18} /> Salvar Equipe</button>
        </form>
      )}

      {loading ? <p>Carregando...</p> : (
        <div className="admin-list">
          {teams.map(team => (
            <React.Fragment key={team.id}>
              <div className="admin-list-item">
                <div className="item-main" onClick={() => setExpandedTeamId(expandedTeamId === team.id ? null : team.id)} style={{cursor: 'pointer'}}>
                  {expandedTeamId === team.id ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                  <Shield size={24} className="icon-subtle" />
                  <div className="item-info">
                    {editingGroupId === team.id ? (
                      <div className="team-edit-full-form glass" onClick={e => e.stopPropagation()}>
                        <div className="form-grid-mini">
                          <div className="image-edit-mini">
                            <label className={`image-upload-container mini ${uploading ? 'uploading' : ''}`} style={{ width: '60px', height: '60px' }}>
                              {uploading ? <div className="spinner mini"></div> : (
                                <img src={formData.badge_url || team.badge_url} alt="Badge" className="image-preview-badge" />
                              )}
                              <input type="file" accept="image/*" className="hidden-file-input" onChange={handleBadgeUpload} />
                            </label>
                          </div>
                          <input 
                            placeholder="Nome da Equipe"
                            value={formData.name}
                            onChange={e => setFormData({...formData, name: e.target.value})}
                          />
                          <input 
                            placeholder="Grupo"
                            value={editGroupValue}
                            onChange={e => setEditGroupValue(e.target.value)}
                          />
                        </div>
                        <div className="form-actions-mini">
                          <button className="btn-save-mini" onClick={() => {
                            handleUpdateTeam(team.id, { 
                              name: formData.name || team.name, 
                              leader: formData.leader || team.leader,
                              badge_url: formData.badge_url || team.badge_url,
                              group: editGroupValue 
                            });
                            setEditingGroupId(null);
                          }}><Save size={14} /> Salvar</button>
                          <button className="btn-cancel-mini" onClick={() => setEditingGroupId(null)}>✕</button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <strong>{team.name}</strong>
                        <div className="item-meta-admin">
                          <span className="group-badge-admin">{team.group || 'Sem Grupo'}</span>
                          <span className="leader-info">• Líder: {team.leader}</span>
                        </div>
                      </>
                    )}
                  </div>
                </div>
                <div className="item-actions">
                  {!editingGroupId && (
                    <button className="btn-icon edit" onClick={(e) => { 
                      e.stopPropagation(); 
                      setEditingGroupId(team.id); 
                      setEditGroupValue(team.group || '');
                      setFormData({ name: team.name, leader: team.leader, badge_url: team.badge_url || '', group: team.group || '' });
                    }}><Settings2 size={18} /></button>
                  )}
                  <button className="btn-icon delete" onClick={(e) => { e.stopPropagation(); handleDelete(team.id); }}><Trash2 size={18} /></button>
                </div>
              </div>
              {expandedTeamId === team.id && (
                <div className="team-players-admin glass">
                  <PlayerManagement teamId={team.id} teamName={team.name} />
                </div>
              )}
            </React.Fragment>
          ))}
        </div>
      )}
    </div>
  );
}

const PlayerManagement: React.FC<{ teamId: string, teamName: string }> = ({ teamId, teamName }) => {
  const { players, loading, refresh } = usePlayers(teamId);
  const [isAdding, setIsAdding] = useState(false);
  const [editingPlayerId, setEditingPlayerId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [formData, setFormData] = useState({ 
    name: '', number: '', position: 'Ala', photo_url: '', bio: '',
    goals_count: '0', assists: '0', yellow_cards: '0', red_cards: '0', clean_sheets: '0'
  });

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const url = await uploadToStorage(file, 'images', 'player-photos');
    if (url) setFormData(prev => ({ ...prev, photo_url: url }));
    setUploading(false);
  };

  const handleAddPlayer = async (e: React.FormEvent) => {
    e.preventDefault();
    const loadingToast = toast.loading('Adicionando atleta...');
    try {
      const { error } = await supabase.from('players').insert([{
        ...formData,
        team_id: teamId,
        number: parseInt(formData.number) || 0
      }]);
      if (error) throw error;
      setFormData({ 
        name: '', number: '', position: 'Ala', photo_url: '', bio: '',
        goals_count: '0', assists: '0', yellow_cards: '0', red_cards: '0', clean_sheets: '0'
      });
      setIsAdding(false);
      toast.success('Atleta adicionado!', { id: loadingToast });
    } catch (err: any) {
      toast.error(err.message, { id: loadingToast });
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Excluir atleta?')) return;
    const loadingToast = toast.loading('Excluindo...');
    try {
      const { error } = await supabase.from('players').delete().eq('id', id);
      if (error) throw error;
      toast.success('Atleta excluído!', { id: loadingToast });
    } catch (err: any) {
      toast.error(err.message, { id: loadingToast });
    }
  };

  const handleUpdatePlayer = async (playerId: string, data: any) => {
    const loadingToast = toast.loading('Atualizando...');
    try {
      const { error } = await supabase.from('players').update({
        ...data,
        number: parseInt(data.number) || 0,
        goals_count: parseInt(data.goals_count) || 0,
        assists: parseInt(data.assists) || 0,
        yellow_cards: parseInt(data.yellow_cards) || 0,
        red_cards: parseInt(data.red_cards) || 0,
        clean_sheets: parseInt(data.clean_sheets) || 0
      }).eq('id', playerId);
      if (error) throw error;
      setEditingPlayerId(null);
      toast.success('Atleta atualizado!', { id: loadingToast });
    } catch (err: any) {
      toast.error(err.message, { id: loadingToast });
    }
  };

  return (
    <div className="player-mgmt-container">
      <div className="sub-header">
        <div className="sub-header-info">
          <span className="sub-header-count">{players.length} atleta{players.length !== 1 ? 's' : ''}</span>
        </div>
        <button className="btn-add-sm" onClick={() => setIsAdding(!isAdding)}>
          {isAdding ? <>✕ Cancelar</> : <><Plus size={13} /> Novo Atleta</>}
        </button>
      </div>

      {isAdding && (
        <form className="player-form" onSubmit={handleAddPlayer}>
          <div className="player-form-grid">
            <div className="player-form-field">
              <label>Nome</label>
              <input
                type="text"
                placeholder="Ex: João Silva"
                required
                value={formData.name}
                onChange={e => setFormData({...formData, name: e.target.value})}
              />
            </div>
            <div className="player-form-field">
              <label>Nº</label>
              <input
                type="number"
                placeholder="10"
                required
                value={formData.number}
                onChange={e => setFormData({...formData, number: e.target.value})}
              />
            </div>
            <div className="player-form-field">
              <label>Posição</label>
              <select
                value={formData.position}
                onChange={e => setFormData({...formData, position: e.target.value})}
              >
                <option value="Goleiro">Goleiro</option>
                <option value="Fixo">Fixo</option>
                <option value="Ala">Ala</option>
                <option value="Pivô">Pivô</option>
              </select>
            </div>
          </div>
          <div className="player-form-grid mt-2">
            <div className="player-form-field">
              <label>Foto do Atleta</label>
              <div className="image-upload-wrapper">
                <label className={`image-upload-container ${uploading ? 'uploading' : ''}`} style={{ width: '80px', height: '80px' }}>
                  {uploading ? (
                    <div className="upload-loading-overlay">
                      <div className="spinner"></div>
                    </div>
                  ) : formData.photo_url ? (
                    <img src={formData.photo_url} alt="Preview" className="image-preview-badge" />
                  ) : (
                    <div className="upload-icon-box">
                      <Camera size={20} />
                      <span>Adicionar</span>
                    </div>
                  )}
                  <input 
                    type="file" 
                    accept="image/*" 
                    className="hidden-file-input" 
                    onChange={handlePhotoUpload} 
                  />
                </label>
              </div>
            </div>
            <div className="player-form-field">
              <label>Bio/Histórico</label>
              <input type="text" placeholder="Breve bio..." value={formData.bio} onChange={e => setFormData({...formData, bio: e.target.value})} />
            </div>
          </div>

          <div className="player-stats-editor-grid mt-2">
             <div className="stat-input">
                <label><Trophy size={14} /> Gols</label>
                <input type="number" value={formData.goals_count} onChange={e => setFormData({...formData, goals_count: e.target.value})} />
             </div>
             <div className="stat-input">
                <label><Star size={14} /> Assist.</label>
                <input type="number" value={formData.assists} onChange={e => setFormData({...formData, assists: e.target.value})} />
             </div>
             <div className="stat-input">
                <label><CreditCard size={14} style={{ color: '#fbbf24' }} /> Amarelos</label>
                <input type="number" value={formData.yellow_cards} onChange={e => setFormData({...formData, yellow_cards: e.target.value})} />
             </div>
             <div className="stat-input">
                <label><CreditCard size={14} style={{ color: '#ef4444' }} /> Vermelhos</label>
                <input type="number" value={formData.red_cards} onChange={e => setFormData({...formData, red_cards: e.target.value})} />
             </div>
             <div className="stat-input">
                <label><Shield size={14} /> Clean Sheets</label>
                <input type="number" value={formData.clean_sheets} onChange={e => setFormData({...formData, clean_sheets: e.target.value})} />
             </div>
          </div>
          <button type="submit" className="btn-save-player">
            <Save size={14} /> Salvar Atleta
          </button>
        </form>
      )}

      <div className="mini-player-list">
        {loading ? (
          <div className="admin-loading-placeholder mini">
            <div className="spinner mini"></div>
            <span>Carregando Atletas...</span>
          </div>
        ) : players.length === 0 ? (
          <div className="empty-players">
            <span>Nenhum atleta cadastrado.</span>
            <p>Clique em "Novo Atleta" para adicionar.</p>
          </div>
        ) : (
          players.map(p => (
            <div key={p.id} className="player-admin-row-wrapper">
              {editingPlayerId === p.id ? (
                <div className="player-edit-form glass">
                  <div className="player-form-grid">
                    <input value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} placeholder="Nome" />
                    <input type="number" value={formData.number} onChange={e => setFormData({...formData, number: e.target.value})} placeholder="Nº" />
                    <select value={formData.position} onChange={e => setFormData({...formData, position: e.target.value})}>
                      <option value="Goleiro">Goleiro</option>
                      <option value="Fixo">Fixo</option>
                      <option value="Ala">Ala</option>
                      <option value="Pivô">Pivô</option>
                    </select>
                  </div>
                  <div className="player-form-grid mt-2">
                    <div className="player-form-field">
                      <label>Foto</label>
                      <label className={`image-upload-container mini ${uploading ? 'uploading' : ''}`} style={{ width: '60px', height: '60px' }}>
                        {uploading ? (
                          <div className="upload-loading-overlay">
                            <div className="spinner"></div>
                          </div>
                        ) : formData.photo_url ? (
                          <img src={formData.photo_url} alt="Player" className="image-preview-badge" />
                        ) : (
                          <div className="upload-icon-box">
                            <Camera size={16} />
                            <span>Subir</span>
                          </div>
                        )}
                        <input type="file" accept="image/*" className="hidden-file-input" onChange={handlePhotoUpload} />
                      </label>
                    </div>
                    <input value={formData.bio} onChange={e => setFormData({...formData, bio: e.target.value})} placeholder="Bio" />
                  </div>
                  <div className="player-stats-editor-grid mt-2">
                    <div className="stat-input">
                       <label><Trophy size={14} /> G</label>
                       <input type="number" value={formData.goals_count} onChange={e => setFormData({...formData, goals_count: e.target.value})} />
                    </div>
                    <div className="stat-input">
                       <label><Star size={14} /> A</label>
                       <input type="number" value={formData.assists} onChange={e => setFormData({...formData, assists: e.target.value})} />
                    </div>
                    <div className="stat-input">
                       <label><CreditCard size={14} style={{ color: '#fbbf24' }} /> CA</label>
                       <input type="number" value={formData.yellow_cards} onChange={e => setFormData({...formData, yellow_cards: e.target.value})} />
                    </div>
                    <div className="stat-input">
                       <label><CreditCard size={14} style={{ color: '#ef4444' }} /> CV</label>
                       <input type="number" value={formData.red_cards} onChange={e => setFormData({...formData, red_cards: e.target.value})} />
                    </div>
                    <div className="stat-input">
                       <label><Shield size={14} /> CS</label>
                       <input type="number" value={formData.clean_sheets} onChange={e => setFormData({...formData, clean_sheets: e.target.value})} />
                    </div>
                  </div>
                  <div className="player-edit-actions">
                    <button className="btn-save-mini" onClick={() => handleUpdatePlayer(p.id, formData)}><Save size={14} /> Salvar</button>
                    <button className="btn-cancel-mini" onClick={() => setEditingPlayerId(null)}>✕</button>
                  </div>
                </div>
              ) : (
                <div className="player-row">
                  <div className="player-number-badge">{p.number}</div>
                  <div className="player-info">
                    <strong>{p.name}</strong>
                    <span className="player-position-tag">{p.position}</span>
                  </div>
                  <div className="player-actions">
                    <button className="btn-player-edit" onClick={() => {
                      setEditingPlayerId(p.id);
                      setFormData({ 
                        name: p.name, 
                        number: String(p.number), 
                        position: p.position, 
                        photo_url: p.photo_url || '', 
                        bio: p.bio || '',
                        goals_count: String(p.goals_count),
                        assists: String(p.assists),
                        yellow_cards: String(p.yellow_cards),
                        red_cards: String(p.red_cards),
                        clean_sheets: String(p.clean_sheets || 0)
                      });
                    }} title="Editar atleta">
                      <Settings2 size={13} />
                    </button>
                    <button className="btn-player-delete" onClick={() => handleDelete(p.id)} title="Remover atleta">
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

const NewsManagement = () => {
  const { news, loading, error, refresh } = useNews();
  const [isAdding, setIsAdding] = useState(false);
  const [editingNewsId, setEditingNewsId] = useState<string | null>(null);
  const [formData, setFormData] = useState({ title: '', summary: '', content: '', image_url: '' });
  const [uploading, setUploading] = useState(false);

  const formatNewsDate = (value?: string) => {
    if (!value) return '';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleDateString();
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const url = await uploadToStorage(file, 'images', 'news');
    if (url) setFormData(prev => ({ ...prev, image_url: url }));
    setUploading(false);
  };

  const handleAddNews = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const { error } = await supabase.from('news').insert([formData]);
      if (error) throw error;
      setFormData({ title: '', summary: '', content: '', image_url: '' });
      setIsAdding(false);
      
      // Notificar nova notícia
      sendPushNotification(
        '📰 Nova Notícia!', 
        formData.title,
        '/jogadores' 
      );
      
      refresh();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Deseja excluir este comunicado?')) return;
    try {
      const { error } = await supabase.from('news').delete().eq('id', id);
      if (error) throw error;
      refresh();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleUpdateNews = async (id: string, data: any) => {
    try {
      const { error } = await supabase.from('news').update(data).eq('id', id);
      if (error) throw error;
      setEditingNewsId(null);
      refresh();
      toast.success('Notícia atualizada!');
    } catch (err: any) { toast.error(err.message); }
  };

  return (
    <div className="admin-section glass">
      <div className="section-header">
        <h2>Comunicados & Notícias</h2>
        <button className="btn-add" onClick={() => setIsAdding(!isAdding)}>
          {isAdding ? 'Cancelar' : <><Plus size={18} /> Novo Post</>}
        </button>
      </div>

      {isAdding && (
        <form className="admin-form glass" onSubmit={handleAddNews}>
          <div className="form-grid-full">
            <div className="form-group">
              <label>Título da Notícia</label>
              <input 
                type="text" 
                required 
                value={formData.title}
                onChange={(e) => setFormData({...formData, title: e.target.value})}
                placeholder="Ex: Rodada 5 confirmada"
              />
            </div>
            <div className="form-group">
              <label>Resumo (Breve descrição)</label>
              <input 
                type="text" 
                required 
                value={formData.summary}
                onChange={(e) => setFormData({...formData, summary: e.target.value})}
              />
            </div>
            <div className="form-group">
              <label>Conteúdo Completo</label>
              <textarea 
                rows={4}
                required 
                value={formData.content}
                onChange={(e) => setFormData({...formData, content: e.target.value})}
              />
            </div>
            <div className="form-group">
              <label>Imagem de Capa</label>
              <div className="image-upload-wrapper">
                <label className={`image-upload-container news-upload ${uploading ? 'uploading' : ''}`} style={{ width: '100%', height: '160px' }}>
                  {uploading ? (
                    <div className="upload-loading-overlay">
                      <div className="spinner"></div>
                    </div>
                  ) : formData.image_url ? (
                    <img src={formData.image_url} alt="Preview" className="image-preview-badge" style={{ objectFit: 'cover' }} />
                  ) : (
                    <div className="upload-icon-box">
                      <Camera size={32} />
                      <span>Upload de Capa</span>
                    </div>
                  )}
                  <input type="file" accept="image/*" className="hidden-file-input" onChange={handleImageUpload} />
                </label>
              </div>
            </div>
          </div>
          <button type="submit" className="btn-save"><Save size={18} /> Publicar Notícia</button>
        </form>
      )}

      {loading ? <p>Carregando...</p> : error ? (
        <div className="empty-state glass">
          <p>Erro ao carregar os comunicados. Verifique sua conexão e tente novamente.</p>
          <button className="btn-save" onClick={() => refresh()}>Tentar novamente</button>
        </div>
      ) : (
        <div className="admin-list">
          {news.map(item => (
            <div key={item.id} className="admin-list-item-wrapper">
              <div className="admin-list-item">
                <div className="item-main">
                  <Newspaper size={24} className="icon-subtle" />
                  <div className="item-info">
                    <strong>{item.title}</strong>
                    <span>{formatNewsDate((item as any).published_at || (item as any).created_at)}</span>
                  </div>
                </div>
                <div className="item-actions">
                  <button className="btn-icon edit" onClick={() => {
                    setEditingNewsId(item.id);
                    setFormData({ title: item.title, summary: item.summary, content: item.content, image_url: item.image_url || '' });
                  }}><Settings2 size={18} /></button>
                  <button className="btn-icon delete" onClick={() => handleDelete(item.id)}><Trash2 size={18} /></button>
                </div>
              </div>

              {editingNewsId === item.id && (
                <form className="admin-form glass animate-slide-down" style={{ margin: '1rem 0' }} onSubmit={(e) => { e.preventDefault(); handleUpdateNews(item.id, formData); }}>
                  <div className="form-grid-full">
                    <div className="form-group">
                      <label>Título da Notícia</label>
                      <input type="text" required value={formData.title} onChange={(e) => setFormData({...formData, title: e.target.value})} />
                    </div>
                    <div className="form-group">
                      <label>Resumo</label>
                      <input type="text" required value={formData.summary} onChange={(e) => setFormData({...formData, summary: e.target.value})} />
                    </div>
                    <div className="form-group">
                      <label>Conteúdo</label>
                      <textarea rows={4} required value={formData.content} onChange={(e) => setFormData({...formData, content: e.target.value})} />
                    </div>
                    <div className="form-group">
                      <label>Imagem de Capa</label>
                      <label className={`image-upload-container mini ${uploading ? 'uploading' : ''}`} style={{ width: '100px', height: '60px' }}>
                        {uploading ? <div className="spinner mini"></div> : (
                          <img src={formData.image_url} alt="News" className="image-preview-badge" style={{ objectFit: 'cover' }} />
                        )}
                        <input type="file" accept="image/*" className="hidden-file-input" onChange={handleImageUpload} />
                      </label>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
                    <button type="submit" className="btn-save"><Save size={18} /> Salvar Alterações</button>
                    <button type="button" className="btn-cancel" onClick={() => setEditingNewsId(null)}>Cancelar</button>
                  </div>
                </form>
              )}
            </div>
          ))}
          {news.length === 0 && <p className="empty-msg">Nenhuma notícia publicada.</p>}
        </div>
      )}
    </div>
  );
}

// ===== Gerenciamento do Torneio =====
const TournamentManagement = () => {
  const { config, loading, saveConfig } = useTournamentConfig();
  const [form, setForm] = useState({ total_rounds: 5, matches_per_round: 4, current_phase: 'grupos', current_round: 1 });
  const [saved, setSaved] = useState(false);

  React.useEffect(() => {
    if (!loading && config.id) {
      setForm({
        total_rounds: config.total_rounds,
        matches_per_round: config.matches_per_round,
        current_phase: config.current_phase,
        current_round: config.current_round,
      });
    }
  }, [loading, config.id]);

  const handleSave = async () => {
    try {
      await saveConfig(form as any);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const phaseLabel: Record<string, string> = {
    grupos: '1ª Fase (Grupos)',
    quartas: 'Quartas de Final',
    semifinal: 'Semifinal',
    final: 'Final',
  };

  if (loading) return <div className="loading-state">Carregando configurações...</div>;

  return (
    <div className="admin-section">
      <div className="section-header">
        <h2>⚙️ Configuração do Torneio</h2>
      </div>

      <div className="tournament-config-card admin-form">
        <div className="tournament-config-grid">
          {/* Fase Atual */}
          <div className="form-group">
            <label>Fase Atual</label>
            <select
              value={form.current_phase}
              onChange={e => setForm({ ...form, current_phase: e.target.value })}
            >
              <option value="grupos">1ª Fase (Grupos)</option>
              <option value="quartas">Quartas de Final</option>
              <option value="semifinal">Semifinal</option>
              <option value="final">Final</option>
            </select>
            <span className="form-hint">Controla o display de "Fase" no sistema</span>
          </div>

          {/* Total de Rodadas */}
          <div className="form-group">
            <label>Total de Rodadas (Fase de Grupos)</label>
            <input
              type="number"
              min={1} max={20}
              value={form.total_rounds}
              onChange={e => setForm({ ...form, total_rounds: parseInt(e.target.value) || 1 })}
            />
            <span className="form-hint">Ex: 5 rodadas → depois vai ao Mata-Mata</span>
          </div>

          {/* Partidas por Rodada */}
          <div className="form-group">
            <label>Partidas por Rodada</label>
            <input
              type="number"
              min={1} max={20}
              value={form.matches_per_round}
              onChange={e => setForm({ ...form, matches_per_round: parseInt(e.target.value) || 1 })}
            />
            <span className="form-hint">Quantos jogos ocorrem em cada rodada</span>
          </div>

          {/* Rodada Atual */}
          {form.current_phase === 'grupos' && (
            <div className="form-group">
              <label>Rodada Atual</label>
              <select
                value={form.current_round}
                onChange={e => setForm({ ...form, current_round: parseInt(e.target.value) })}
              >
                {Array.from({ length: form.total_rounds }, (_, i) => i + 1).map(r => (
                  <option key={r} value={r}>{r}ª Rodada</option>
                ))}
              </select>
              <span className="form-hint">Rodada em andamento agora</span>
            </div>
          )}
        </div>

        {/* Resumo Visual */}
        <div className="tournament-summary">
          <div className="t-summary-item">
            <span className="t-summary-label">Fase</span>
            <span className="t-summary-value">{phaseLabel[form.current_phase]}</span>
          </div>
          {form.current_phase === 'grupos' && (
            <>
              <div className="t-summary-item">
                <span className="t-summary-label">Rodada</span>
                <span className="t-summary-value">{form.current_round}ª de {form.total_rounds}</span>
              </div>
              <div className="t-summary-item">
                <span className="t-summary-label">Jogos/Rodada</span>
                <span className="t-summary-value">{form.matches_per_round}</span>
              </div>
            </>
          )}
        </div>

        <button className="btn-save" onClick={handleSave}>
          {saved ? <><CheckCircle size={18} /> Salvo!</> : <><Save size={18} /> Salvar Configuração</>}
        </button>
      </div>
    </div>
  );
};

const PollManagement = () => {
  const [polls, setPolls] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [editingPollId, setEditingPollId] = useState<string | null>(null);
  const [formData, setFormData] = useState({ 
    question: '', 
    options: ['', ''] 
  });

  const fetchPolls = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('polls')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      setPolls(data || []);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  React.useEffect(() => {
    fetchPolls();
    const timer = setTimeout(() => setLoading(false), 8000);
    return () => clearTimeout(timer);
  }, []);

  const handleCreatePoll = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      // Valida opções
      const validOptions = formData.options.filter(o => o.trim() !== '');
      if (validOptions.length < 2) return toast.error('Adicione pelo menos 2 opções válidas!');

      const newPoll = {
        question: formData.question,
        options: validOptions.map((text, index) => ({
          id: `opt_${index}_${Date.now()}`,
          text,
          votes: 0
        })),
        active: false // Criada como inativa por padrão
      };

      const { error } = await supabase.from('polls').insert([newPoll]);
      if (error) throw error;
      
      setFormData({ question: '', options: ['', ''] });
      setIsAdding(false);
      fetchPolls();
    } catch (err: any) { toast.error(err.message); }
  };

  const handleUpdatePoll = async (id: string, data: any) => {
    try {
      const validOptions = data.options.filter((o: string) => o.trim() !== '');
      const { error } = await supabase.from('polls').update({
        question: data.question,
        options: validOptions.map((text: string, index: number) => ({
          id: `opt_${index}_${Date.now()}`,
          text,
          votes: 0 
        }))
      }).eq('id', id);
      if (error) throw error;
      setEditingPollId(null);
      fetchPolls();
      toast.success('Enquete atualizada!');
    } catch (err: any) { toast.error(err.message); }
  };

  const toggleActive = async (id: string, currentActive: boolean) => {
    try {
      // Se for para ativar, desativa todas as outras primeiro
      if (!currentActive) {
        await supabase.from('polls').update({ active: false }).neq('id', id);
      }
      
      const { error } = await supabase.from('polls').update({ active: !currentActive }).eq('id', id);
      if (error) throw error;
      
      if (!currentActive) {
        // Buscar a pergunta para a notificação
        const poll = polls.find(p => p.id === id);
        sendPushNotification(
          '🗳️ Nova Enquete!', 
          poll?.question || 'Dê sua opinião no site!',
          '/'
        );
      }
      
      fetchPolls();
    } catch (err: any) { toast.error(err.message); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Excluir enquete?')) return;
    try {
      const { error } = await supabase.from('polls').delete().eq('id', id);
      if (error) throw error;
      fetchPolls();
    } catch (err: any) { toast.error(err.message); }
  };

  return (
    <div className="admin-section glass">
      <div className="section-header">
        <h2>Gerenciar Enquetes</h2>
        <button className="btn-add" onClick={() => setIsAdding(!isAdding)}>
          {isAdding ? 'Cancelar' : <><Plus size={18} /> Nova Enquete</>}
        </button>
      </div>

      {isAdding && (
        <form className="admin-form glass" onSubmit={handleCreatePoll}>
          <div className="form-group-full">
            <label>Pergunta da Enquete</label>
            <input 
              type="text" 
              required 
              value={formData.question}
              onChange={e => setFormData({...formData, question: e.target.value})}
              placeholder="Ex: Quem será o artilheiro?"
            />
          </div>
          
          <div className="poll-options-editor">
            <label>Opções de Resposta</label>
            {formData.options.map((option, idx) => (
              <div key={idx} className="option-input-row">
                <input 
                  type="text"
                  placeholder={`Opção ${idx + 1}`}
                  value={option}
                  onChange={e => {
                    const newOpts = [...formData.options];
                    newOpts[idx] = e.target.value;
                    setFormData({...formData, options: newOpts});
                  }}
                  required={idx < 2}
                />
                {formData.options.length > 2 && (
                  <button type="button" className="btn-remove-opt" onClick={() => {
                    const newOpts = formData.options.filter((_, i) => i !== idx);
                    setFormData({...formData, options: newOpts});
                  }}>✕</button>
                )}
              </div>
            ))}
            <button type="button" className="btn-add-opt" onClick={() => setFormData({...formData, options: [...formData.options, '']})}>
              + Adicionar Opção
            </button>
          </div>
          
          <button type="submit" className="btn-save"><Save size={18} /> Criar Enquete</button>
        </form>
      )}

      <div className="admin-list">
        {loading ? <p>Carregando...</p> : polls.map(poll => (
          <React.Fragment key={poll.id}>
            <div className={`admin-list-item poll-item ${poll.active ? 'active-poll' : ''}`}>
              <div className="item-main">
                <Shield size={24} className={poll.active ? 'icon-active' : 'icon-subtle'} />
                <div className="item-info">
                  <strong>{poll.question}</strong>
                  <span>{poll.options.length} opções • Total: {poll.options.reduce((acc: number, o: any) => acc + o.votes, 0)} votos</span>
                </div>
              </div>
              <div className="item-actions">
                <button 
                  className={`btn-toggle-active ${poll.active ? 'active' : ''}`}
                  onClick={() => toggleActive(poll.id, poll.active)}
                >
                  {poll.active ? 'Ativa' : 'Ativar'}
                </button>
                <button className="btn-icon edit" onClick={() => {
                  setEditingPollId(poll.id);
                  setFormData({ question: poll.question, options: poll.options.map((o: any) => o.text) });
                }}><Settings2 size={18} /></button>
                <button className="btn-icon delete" onClick={() => handleDelete(poll.id)}><Trash2 size={18} /></button>
              </div>
            </div>

            {editingPollId === poll.id && (
              <form className="admin-form glass animate-slide-down" style={{ margin: '1rem 0' }} onSubmit={(e) => { e.preventDefault(); handleUpdatePoll(poll.id, formData); }}>
                <div className="form-group-full">
                  <label>Pergunta da Enquete</label>
                  <input type="text" required value={formData.question} onChange={e => setFormData({...formData, question: e.target.value})} />
                </div>
                <div className="poll-options-editor">
                  {formData.options.map((opt, idx) => (
                    <div key={idx} className="option-input-row">
                      <input type="text" value={opt} onChange={e => {
                        const newOpts = [...formData.options];
                        newOpts[idx] = e.target.value;
                        setFormData({...formData, options: newOpts});
                      }} />
                    </div>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
                  <button type="submit" className="btn-save"><Save size={18} /> Salvar Alterações</button>
                  <button type="button" className="btn-cancel" onClick={() => setEditingPollId(null)}>Cancelar</button>
                </div>
              </form>
            )}
          </React.Fragment>
        ))}
        {polls.length === 0 && !loading && <p className="empty-msg">Nenhuma enquete cadastrada.</p>}
      </div>
    </div>
  );
};

const GlobalPlayerManagement = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [uploading, setUploading] = useState(false);
  const { teams } = useTeams();
  const { players: allPlayers, loading } = usePlayers();
  
  const [formData, setFormData] = useState({ 
    name: '', number: '', position: 'Ala', team_id: '', photo_url: '', bio: '',
    goals_count: '0', assists: '0', yellow_cards: '0', red_cards: '0', clean_sheets: '0'
  });

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const url = await uploadToStorage(file, 'images', 'player-photos');
    if (url) {
      setFormData(prev => ({ ...prev, photo_url: url }));
      toast.success('Foto carregada!');
    }
    setUploading(false);
  };

  const handleAddPlayer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.team_id) return toast.error('Selecione uma equipe!');
    const loadingToast = toast.loading('Salvando atleta...');
    try {
      const { error } = await supabase.from('players').insert([{
        ...formData,
        number: parseInt(formData.number) || 0,
        goals_count: parseInt(formData.goals_count) || 0,
        assists: parseInt(formData.assists) || 0,
        yellow_cards: parseInt(formData.yellow_cards) || 0,
        red_cards: parseInt(formData.red_cards) || 0,
        clean_sheets: parseInt(formData.clean_sheets) || 0
      }]);
      if (error) throw error;
      setFormData({ 
        name: '', number: '', position: 'Ala', team_id: '', photo_url: '', bio: '',
        goals_count: '0', assists: '0', yellow_cards: '0', red_cards: '0', clean_sheets: '0'
      });
      setIsAdding(false);
      toast.success('Atleta cadastrado com sucesso!', { id: loadingToast });
    } catch (err: any) {
      toast.error(err.message, { id: loadingToast });
    }
  };

  const filteredPlayers = React.useMemo(() => {
    return allPlayers.filter(p => 
      p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (p.teams?.name || '').toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [allPlayers, searchTerm]);

  return (
    <div className="admin-section glass">
      <div className="section-header">
        <div className="header-title-box">
          <h2>Gestão Global de Atletas</h2>
          <button className="btn-add" onClick={() => setIsAdding(!isAdding)}>
            {isAdding ? 'Cancelar' : <><Plus size={18} /> Novo Atleta</>}
          </button>
        </div>
        <div className="search-bar glass">
          <Search size={18} />
          <input 
            type="text" 
            placeholder="Buscar por nome ou equipe..." 
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      {isAdding && (
        <form className="admin-form glass mt-2 mb-2" onSubmit={handleAddPlayer}>
          <div className="form-grid">
            <div className="form-group">
              <label>Nome do Atleta</label>
              <input type="text" required value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} placeholder="Ex: Lucas Silva" />
            </div>
            <div className="form-group">
              <label>Equipe</label>
              <select required value={formData.team_id} onChange={e => setFormData({...formData, team_id: e.target.value})}>
                <option value="">Selecione a equipe...</option>
                {teams.sort((a,b) => a.name.localeCompare(b.name)).map(t => (
                  <option key={t.id} value={t.id}>{t.name} ({t.group || 'S/G'})</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label>Nº Camisa</label>
              <input type="number" required value={formData.number} onChange={e => setFormData({...formData, number: e.target.value})} placeholder="10" />
            </div>
            <div className="form-group">
              <label>Posição</label>
              <select value={formData.position} onChange={e => setFormData({...formData, position: e.target.value})}>
                <option value="Goleiro">Goleiro</option>
                <option value="Fixo">Fixo</option>
                <option value="Ala">Ala</option>
                <option value="Pivô">Pivô</option>
              </select>
            </div>
          </div>

          <div className="form-grid mt-2">
            <div className="form-group">
              <label>Foto do Atleta</label>
              <div className="image-upload-wrapper">
                <label className={`image-upload-container ${uploading ? 'uploading' : ''}`} style={{ width: '80px', height: '80px' }}>
                  {uploading ? <div className="spinner"></div> : formData.photo_url ? (
                    <img src={formData.photo_url} alt="Preview" className="image-preview-badge" />
                  ) : (
                    <div className="upload-icon-box">
                      <Camera size={20} />
                      <span style={{ fontSize: '0.6rem' }}>Adicionar</span>
                    </div>
                  )}
                  <input type="file" accept="image/*" className="hidden-file-input" onChange={handlePhotoUpload} />
                </label>
              </div>
            </div>
            <div className="form-group">
              <label>Bio / Observações</label>
              <textarea rows={2} value={formData.bio} onChange={e => setFormData({...formData, bio: e.target.value})} placeholder="Breve descrição..." />
            </div>
          </div>

          <div className="player-stats-editor-grid mt-2">
             <div className="stat-input">
                <label><Trophy size={14} /> Gols</label>
                <input type="number" value={formData.goals_count} onChange={e => setFormData({...formData, goals_count: e.target.value})} />
             </div>
             <div className="stat-input">
                <label><Star size={14} /> Assist.</label>
                <input type="number" value={formData.assists} onChange={e => setFormData({...formData, assists: e.target.value})} />
             </div>
             <div className="stat-input">
                <label><CreditCard size={14} style={{ color: '#fbbf24' }} /> CA</label>
                <input type="number" value={formData.yellow_cards} onChange={e => setFormData({...formData, yellow_cards: e.target.value})} />
             </div>
             <div className="stat-input">
                <label><CreditCard size={14} style={{ color: '#ef4444' }} /> CV</label>
                <input type="number" value={formData.red_cards} onChange={e => setFormData({...formData, red_cards: e.target.value})} />
             </div>
          </div>
          <button type="submit" className="btn-save mt-3"><Save size={18} /> Salvar Atleta no Sistema</button>
        </form>
      )}

      <div className="admin-list">
        {loading ? (
          <div className="admin-loading-placeholder">
            <div className="spinner"></div>
            <p>Buscando Atletas no Banco de Dados...</p>
          </div>
        ) : (
          filteredPlayers.map(p => (
            <div key={p.id} className="admin-list-item player-search-row">
              <div className="item-main">
                <img src={p.photo_url || 'https://via.placeholder.com/40'} alt={p.name} className="player-mini-photo" />
                <div className="item-info">
                  <strong>{p.name} (#{p.number})</strong>
                  <span>{p.teams?.name} • {p.position}</span>
                </div>
              </div>
              <div className="item-stats-mini">
                <span>⚽ {p.goals_count}</span>
                <span>🎯 {p.assists}</span>
              </div>
            </div>
          ))
        )}
        {!loading && filteredPlayers.length === 0 && <p className="empty-msg">Nenhum atleta encontrado.</p>}
      </div>
    </div>
  );
};

export default Admin;
