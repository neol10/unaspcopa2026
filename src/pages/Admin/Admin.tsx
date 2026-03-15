import React, { useState } from 'react';
import { supabase } from '../../lib/supabase';
import { Trophy, Users, Calendar, Plus, Save, Trash2, Shield, ChevronDown, ChevronUp, Newspaper, Image as ImageIcon, CheckCircle, Play, Camera, Search, Settings2, Vote, ShieldAlert } from 'lucide-react';
import { useMatchMvpVoting } from '../../hooks/useMatchMvpVoting';
import { useTeams } from '../../hooks/useTeams';
import { usePlayers } from '../../hooks/usePlayers';
import { useNews } from '../../hooks/useNews';
import { useMatches } from '../../hooks/useMatches';
import { useMatchEvents } from '../../hooks/useMatchEvents';
import { useGallery } from '../../hooks/useGallery';
import { useTournamentConfig } from '../../hooks/useTournamentConfig';
import { useAuthContext } from '../../contexts/AuthContext';
import './Admin.css';

const Admin: React.FC = () => {
  const { user, role, loading: authLoading } = useAuthContext();
  const [activeTab, setActiveTab] = useState<'matches' | 'teams' | 'players' | 'news' | 'tournament' | 'polls'>('matches');
  
  if (authLoading) return <div className="admin-loading-state glass"><div className="spinner"></div><p>Verificando credenciais...</p></div>;

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
                <Shield size={18} />
                <span>Enquetes</span>
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
          </main>
        </>
      )}
    </div>
  );
};

// --- Helpers ---
const sendPushNotification = async (title: string, body: string, url: string = '/') => {
  try {
    await supabase.functions.invoke('notify-push', {
      body: { title, body, url, sound: 'default' }
    });
  } catch (err) {
    console.error('Push notification error:', err);
  }
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
    scheduled_at: '', 
    location: 'Ginásio Principal',
    status: 'agendado',
    round: '1ª Rodada' 
  });

  const handleCreateMatch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (formData.team_a_id === formData.team_b_id) return alert('Selecione times diferentes!');
    try {
      const { error } = await supabase.from('matches').insert([{
        ...formData,
        round: parseInt(formData.round) || 1
      }]);
      if (error) throw error;
      setFormData({ team_a_id: '', team_b_id: '', scheduled_at: '', location: 'Ginásio Principal', status: 'agendado', round: '1' });
      setIsAdding(false);
      refresh();
    } catch (err: any) { alert(err.message); }
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
    } catch (err: any) { alert(err.message); }
  };

  const [editingMatchId, setEditingMatchId] = useState<string | null>(null);

  const handleUpdateMatch = async (id: string, data: any) => {
    try {
      const { error } = await supabase.from('matches').update({
        ...data,
        round: parseInt(data.round) || 1
      }).eq('id', id);
      if (error) throw error;
      setEditingMatchId(null);
      refresh();
      alert('Partida atualizada!');
    } catch (err: any) { alert(err.message); }
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
                  {teams.sort((a, b) => (a.group || '').localeCompare(b.group || '')).map(t => (
                    <option key={t.id} value={t.id}>{t.name} ({t.group || 'Sem Grupo'})</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>Equipe B</label>
                <select required value={formData.team_b_id} onChange={e => setFormData({...formData, team_b_id: e.target.value})}>
                  <option value="">Selecione...</option>
                  {teams.sort((a, b) => (a.group || '').localeCompare(b.group || '')).map(t => (
                    <option key={t.id} value={t.id}>{t.name} ({t.group || 'Sem Grupo'})</option>
                  ))}
                </select>
              </div>
               <div className="form-group">
                 <label>Data/Hora</label>
                 <input type="datetime-local" required value={formData.scheduled_at} onChange={e => setFormData({...formData, scheduled_at: e.target.value})} />
               </div>
               <div className="form-group">
                 <label>Rodada (Apenas número)</label>
                 <input type="number" placeholder="Ex: 1, 2..." required value={formData.round} onChange={e => setFormData({...formData, round: e.target.value})} />
               </div>
           </div>
           <button type="submit" className="btn-save"><Save size={18} /> Criar Partida</button>
        </form>
      )}

      <div className="admin-list">
        {loading ? <p>Carregando...</p> : matches.map(match => (
          <React.Fragment key={match.id}>
            <div className={`admin-list-item match-admin-card ${match.status}`}>
              <div className="match-status-info">
                  <span className={`status-dot ${match.status}`}></span>
                  <div className="match-info-main">
                    <strong>{match.teams_a?.name} {match.team_a_score} x {match.team_b_score} {match.teams_b?.name}</strong>
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
                         scheduled_at: match.match_date ? new Date(match.match_date).toISOString().slice(0, 16) : '',
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
                          scheduled_at: match.match_date ? new Date(match.match_date).toISOString().slice(0, 16) : '',
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
                      {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Equipe B</label>
                    <select value={formData.team_b_id} onChange={e => setFormData({...formData, team_b_id: e.target.value})}>
                      {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Data/Hora</label>
                    <input type="datetime-local" value={formData.scheduled_at} onChange={e => setFormData({...formData, scheduled_at: e.target.value})} />
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
            {match.status === 'ao_vivo' && (
              <div className="admin-match-mvp-section glass mt-2">
                <MatchMvpVotingAdmin matchId={match.id} teamAName={match.teams_a.name} teamBName={match.teams_b.name} />
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
  const [eventType, setEventType] = useState<'gol' | 'amarelo' | 'vermelho' | 'substituicao' | 'comentario'>('gol');
  const [goalType, setGoalType] = useState<'normal' | 'penalti' | 'contra'>('normal');
  const [selectedMinute, setSelectedMinute] = useState<number>(0);
  const [assistantId, setAssistantId] = useState<string>('');
  const [commentaryText, setCommentaryText] = useState('');
  const [mvpData, setMvpData] = useState({ 
    player_id: match.match_mvp_player_id || '', 
    description: match.match_mvp_description || '' 
  });
  const [mvpSaved, setMvpSaved] = useState(false);

  const addEvent = async (playerId: string, team: 'a' | 'b') => {
    try {
      const eventData: any = {
        match_id: match.id,
        player_id: playerId,
        event_type: eventType,
        minute: selectedMinute || 0,
        metadata: eventType === 'gol' ? { goal_type: goalType } : null
      };

      if (eventType === 'gol' && assistantId) {
        eventData.assistant_id = assistantId;
      }

      if (eventType === 'comentario') {
        eventData.commentary = commentaryText;
      }

      const { error } = await supabase.from('match_events').insert([eventData]);
      if (error) throw error;
      
      // Se for gol, atualiza o placar da partida
      if (eventType === 'gol') {
        let newScore = {};
        if (goalType === 'contra') {
          // Gol contra: oponente ganha o ponto
          newScore = team === 'a' ? { team_b_score: match.team_b_score + 1 } : { team_a_score: match.team_a_score + 1 };
        } else {
          newScore = team === 'a' ? { team_a_score: match.team_a_score + 1 } : { team_b_score: match.team_b_score + 1 };
        }
        await supabase.from('matches').update(newScore).eq('id', match.id);
      }
      
      // Atualiza estatísticas do jogador
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
      }

      setAssistantId('');
      setCommentaryText('');
      refreshEvents();
      
      if (eventType === 'gol') {
        const player = [...playersA, ...playersB].find(p => p.id === playerId);
        const teamName = team === 'a' ? match.teams_a.name : match.teams_b.name;
        sendPushNotification(
          '⚽ GOOOOOOL!', 
          `Gol de ${player?.name || 'alguém'} para o ${teamName}!`,
          '/central-da-partida'
        );
      }
      
      alert('Evento registrado!');
    } catch (err: any) { alert(err.message); }
  };

  const removeEvent = async (event: any) => {
    if (!confirm('Deseja realmente excluir este lance? Isso reverterá placares e estatísticas.')) return;
    
    try {
      // 1. Reverter placar se foi gol
      if (event.event_type === 'gol') {
        const isTeamA = playersA.some(p => p.id === event.player_id);
        const newScore = isTeamA 
          ? { team_a_score: Math.max(0, match.team_a_score - 1) } 
          : { team_b_score: Math.max(0, match.team_b_score - 1) };
        await supabase.from('matches').update(newScore).eq('id', match.id);
        
        // Decrementar gols do jogador
        const { data: p } = await supabase.from('players').select('goals_count').eq('id', event.player_id).single();
        await supabase.from('players').update({ goals_count: Math.max(0, (p?.goals_count || 0) - 1) }).eq('id', event.player_id);

        // Decrementar assistência se houver
        if (event.assistant_id) {
          const { data: ast } = await supabase.from('players').select('assists').eq('id', event.assistant_id).single();
          await supabase.from('players').update({ assists: Math.max(0, (ast?.assists || 0) - 1) }).eq('id', event.assistant_id);
        }
      }

      // 2. Reverter cartões
      if (event.event_type === 'amarelo') {
        const { data: p } = await supabase.from('players').select('yellow_cards').eq('id', event.player_id).single();
        await supabase.from('players').update({ yellow_cards: Math.max(0, (p?.yellow_cards || 0) - 1) }).eq('id', event.player_id);
      } else if (event.event_type === 'vermelho') {
        const { data: p } = await supabase.from('players').select('red_cards').eq('id', event.player_id).single();
        await supabase.from('players').update({ red_cards: Math.max(0, (p?.red_cards || 0) - 1) }).eq('id', event.player_id);
      }

      // 3. Deletar o evento
      await supabase.from('match_events').delete().eq('id', event.id);
      refreshEvents();
    } catch (err: any) { alert(err.message); }
  };

  return (
    <>
      <div className="live-control-grid">
        <div className="event-selector">
          <button className={eventType === 'gol' ? 'active' : ''} onClick={() => setEventType('gol')}>⚽ Gol</button>
          <button className={eventType === 'amarelo' ? 'active yellow' : 'yellow'} onClick={() => setEventType('amarelo')}>🟨 Cartão</button>
          <button className={eventType === 'vermelho' ? 'active red' : 'red'} onClick={() => setEventType('vermelho')}>🟥 Vermelho</button>
          <button className={eventType === 'comentario' ? 'active commentary' : 'commentary'} onClick={() => setEventType('comentario')}>📝 Texto</button>
        </div>

        {eventType === 'gol' && (
          <div className="goal-type-selector">
             <label>Tipo de Gol:</label>
             <div className="goal-type-btns">
                <button className={goalType === 'normal' ? 'active' : ''} onClick={() => setGoalType('normal')}>Normal</button>
                <button className={goalType === 'penalti' ? 'active' : ''} onClick={() => setGoalType('penalti')}>Pênalti</button>
                <button className={goalType === 'contra' ? 'active red' : ''} onClick={() => setGoalType('contra')}>Contra</button>
             </div>
          </div>
        )}

        <div className="event-controls-row">
          <div className="form-group-mini">
            <label>Minuto</label>
            <input type="number" value={selectedMinute} onChange={e => setSelectedMinute(parseInt(e.target.value))} />
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

          {eventType === 'comentario' && (
            <div className="form-group-full">
              <input 
                type="text" 
                placeholder="Digite o comentário do jogo..." 
                value={commentaryText} 
                onChange={e => setCommentaryText(e.target.value)} 
              />
              <button className="btn-send-msg" onClick={() => addEvent('', 'a')}>Enviar</button>
            </div>
          )}
        </div>
        
        <div className="teams-lanes">
          <div className="lane">
             <h5>{match.teams_a?.name}</h5>
             <div className="admin-player-btns">
                {playersA.map(p => <button key={p.id} onClick={() => addEvent(p.id, 'a')}>{p.number}. {p.name}</button>)}
             </div>
          </div>
          <div className="divider">VS</div>
          <div className="lane">
             <h5>{match.teams_b?.name}</h5>
             <div className="admin-player-btns">
                {playersB.map(p => <button key={p.id} onClick={() => addEvent(p.id, 'b')}>{p.number}. {p.name}</button>)}
             </div>
          </div>
        </div>

        {/* Lista de últimos lances para DESFAZER */}
        <div className="recent-events-undo">
          <h6>Lances Recentes (Desfazer)</h6>
          <div className="undo-list">
            {events.slice(0, 5).map((ev: any) => (
              <div key={ev.id} className="undo-item">
                <div className="undo-info">
                  <strong>{ev.minute}'</strong>
                  <span>{ev.event_type.toUpperCase()} - {ev.players?.name}</span>
                </div>
                <button className="btn-undo" onClick={() => removeEvent(ev)} title="Excluir Lance">
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
            {events.length === 0 && <p className="empty-msg">Nenhum lance registrado.</p>}
          </div>
        </div>
      </div>

      {/* Craque do Jogo - NOVO */}
      <div className="mvp-selection-admin">
        <h6>⭐ Definir Craque do Jogo</h6>
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
            } catch (err: any) { alert(err.message); }
          }}
        >
          {mvpSaved ? <><CheckCircle size={18} /> Salvo!</> : <><Save size={18} /> Salvar Craque do Jogo</>}
        </button>
      </div>
    </>
  );
}

const TeamManagement = () => {
  const { teams, loading, refresh } = useTeams();
  const [isAdding, setIsAdding] = useState(false);
  const [expandedTeamId, setExpandedTeamId] = useState<string | null>(null);
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [editGroupValue, setEditGroupValue] = useState('');
  const [formData, setFormData] = useState({ name: '', group: '', leader: '', badge_url: '' });

  const handleSaveGroup = async (teamId: string) => {
    try {
      const { error } = await supabase.from('teams').update({ group: editGroupValue }).eq('id', teamId);
      if (error) throw error;
      setEditingGroupId(null);
      refresh();
    } catch (err: any) {
      alert(err.message);
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
      alert(err.message);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Deseja realmente excluir esta equipe? Todos os jogadores também serão removidos.')) return;
    try {
      const { error } = await supabase.from('teams').delete().eq('id', id);
      if (error) throw error;
      refresh();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleUpdateTeam = async (teamId: string, data: any) => {
    try {
      const { error } = await supabase.from('teams').update(data).eq('id', teamId);
      if (error) throw error;
      refresh();
      alert('Equipe atualizada!');
    } catch (err: any) {
      alert(err.message);
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
              <label>URL do Escudo (Opcional)</label>
              <input 
                type="url" 
                value={formData.badge_url}
                onChange={(e) => setFormData({...formData, badge_url: e.target.value})}
              />
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
                          <input 
                            placeholder="Nome da Equipe"
                            value={formData.name || team.name}
                            onChange={e => setFormData({...formData, name: e.target.value})}
                          />
                          <input 
                            placeholder="Líder"
                            value={formData.leader || team.leader}
                            onChange={e => setFormData({...formData, leader: e.target.value})}
                          />
                          <input 
                            placeholder="Escudo URL"
                            value={formData.badge_url || team.badge_url}
                            onChange={e => setFormData({...formData, badge_url: e.target.value})}
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
  const [formData, setFormData] = useState({ 
    name: '', number: '', position: 'Ala', photo_url: '', bio: '',
    goals_count: '0', assists: '0', yellow_cards: '0', red_cards: '0', clean_sheets: '0'
  });

  const handleAddPlayer = async (e: React.FormEvent) => {
    e.preventDefault();
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
      refresh();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Excluir atleta?')) return;
    try {
      const { error } = await supabase.from('players').delete().eq('id', id);
      if (error) throw error;
      refresh();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleUpdatePlayer = async (playerId: string, data: any) => {
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
      refresh();
      alert('Atleta atualizado!');
    } catch (err: any) {
      alert(err.message);
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
              <label>Foto URL</label>
              <input type="url" placeholder="https://..." value={formData.photo_url} onChange={e => setFormData({...formData, photo_url: e.target.value})} />
            </div>
            <div className="player-form-field">
              <label>Bio/Histórico</label>
              <input type="text" placeholder="Breve bio..." value={formData.bio} onChange={e => setFormData({...formData, bio: e.target.value})} />
            </div>
          </div>

          <div className="player-stats-editor-grid mt-2 glass-light">
             <div className="stat-input">
                <label>Gols</label>
                <input type="number" value={formData.goals_count} onChange={e => setFormData({...formData, goals_count: e.target.value})} />
             </div>
             <div className="stat-input">
                <label>Assist.</label>
                <input type="number" value={formData.assists} onChange={e => setFormData({...formData, assists: e.target.value})} />
             </div>
             <div className="stat-input">
                <label>Amarelos</label>
                <input type="number" value={formData.yellow_cards} onChange={e => setFormData({...formData, yellow_cards: e.target.value})} />
             </div>
             <div className="stat-input">
                <label>Vermelhos</label>
                <input type="number" value={formData.red_cards} onChange={e => setFormData({...formData, red_cards: e.target.value})} />
             </div>
             <div className="stat-input">
                <label>Clean Sheets</label>
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
          <span className="loading-players">Carregando...</span>
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
                    <input value={formData.photo_url} onChange={e => setFormData({...formData, photo_url: e.target.value})} placeholder="Foto URL" />
                    <input value={formData.bio} onChange={e => setFormData({...formData, bio: e.target.value})} placeholder="Bio" />
                  </div>
                  <div className="player-stats-edit-strip mt-2">
                    <div className="s-field">
                       <label>G</label>
                       <input type="number" value={formData.goals_count} onChange={e => setFormData({...formData, goals_count: e.target.value})} />
                    </div>
                    <div className="s-field">
                       <label>A</label>
                       <input type="number" value={formData.assists} onChange={e => setFormData({...formData, assists: e.target.value})} />
                    </div>
                    <div className="s-field">
                       <label>CA</label>
                       <input type="number" value={formData.yellow_cards} onChange={e => setFormData({...formData, yellow_cards: e.target.value})} />
                    </div>
                    <div className="s-field">
                       <label>CV</label>
                       <input type="number" value={formData.red_cards} onChange={e => setFormData({...formData, red_cards: e.target.value})} />
                    </div>
                    <div className="s-field">
                       <label>CS</label>
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
  const { news, loading, refresh } = useNews();
  const [isAdding, setIsAdding] = useState(false);
  const [editingNewsId, setEditingNewsId] = useState<string | null>(null);
  const [formData, setFormData] = useState({ title: '', summary: '', content: '', image_url: '' });

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
      alert(err.message);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Deseja excluir este comunicado?')) return;
    try {
      const { error } = await supabase.from('news').delete().eq('id', id);
      if (error) throw error;
      refresh();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleUpdateNews = async (id: string, data: any) => {
    try {
      const { error } = await supabase.from('news').update(data).eq('id', id);
      if (error) throw error;
      setEditingNewsId(null);
      refresh();
      alert('Notícia atualizada!');
    } catch (err: any) { alert(err.message); }
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
              <label>URL da Imagem (Opcional)</label>
              <input 
                type="url" 
                value={formData.image_url}
                onChange={(e) => setFormData({...formData, image_url: e.target.value})}
              />
            </div>
          </div>
          <button type="submit" className="btn-save"><Save size={18} /> Publicar Notícia</button>
        </form>
      )}

      {loading ? <p>Carregando...</p> : (
        <div className="admin-list">
          {news.map(item => (
            <div key={item.id} className="admin-list-item-wrapper">
              <div className="admin-list-item">
                <div className="item-main">
                  <Newspaper size={24} className="icon-subtle" />
                  <div className="item-info">
                    <strong>{item.title}</strong>
                    <span>{new Date(item.published_at).toLocaleDateString()}</span>
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
                      <label>Imagem URL</label>
                      <input type="url" value={formData.image_url} onChange={(e) => setFormData({...formData, image_url: e.target.value})} />
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

  // Sincronizar form com config quando carregar
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
      alert(err.message);
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
      alert(err.message);
    } finally {
      setLoading(false);
    }
  };

  React.useEffect(() => {
    fetchPolls();
  }, []);

  const handleCreatePoll = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      // Valida opções
      const validOptions = formData.options.filter(o => o.trim() !== '');
      if (validOptions.length < 2) return alert('Adicione pelo menos 2 opções válidas!');

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
    } catch (err: any) { alert(err.message); }
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
      alert('Enquete atualizada!');
    } catch (err: any) { alert(err.message); }
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
    } catch (err: any) { alert(err.message); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Excluir enquete?')) return;
    try {
      const { error } = await supabase.from('polls').delete().eq('id', id);
      if (error) throw error;
      fetchPolls();
    } catch (err: any) { alert(err.message); }
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

const MatchMvpVotingAdmin: React.FC<{ matchId: string, teamAName: string, teamBName: string }> = ({ matchId, teamAName, teamBName }) => {
  const { voteCounts, loading } = useMatchMvpVoting(matchId);
  const { players: playersA } = usePlayers(''); // Need to get players for teams A and B
  const [teamAPlayers, setTeamAPlayers] = useState<any[]>([]);
  const [teamBPlayers, setTeamBPlayers] = useState<any[]>([]);

  React.useEffect(() => {
    const fetchPlayers = async () => {
      // Logic to fetch team players since usePlayers hook needs teamId
      // We can get them from match data if available or fetch now
      const { data: match } = await supabase.from('matches').select('team_a_id, team_b_id').eq('id', matchId).single();
      if (match) {
        const { data: pa } = await supabase.from('players').select('*').eq('team_id', match.team_a_id);
        const { data: pb } = await supabase.from('players').select('*').eq('team_id', match.team_b_id);
        setTeamAPlayers(pa || []);
        setTeamBPlayers(pb || []);
      }
    };
    fetchPlayers();
  }, [matchId]);

  if (loading) return <span className="admin-mvp-loading">Carregando votos...</span>;

  const totalVotes = Object.values(voteCounts).reduce((acc: number, val) => acc + (Number(val) || 0), 0);

  return (
    <div className="admin-mvp-review">
      <div className="mvp-review-header">
        <strong><Vote size={14} /> Votos da Galera ({totalVotes})</strong>
      </div>
      <div className="mvp-results-grid">
        <div className="mvp-team-column">
          <small>{teamAName}</small>
          {teamAPlayers.filter(p => voteCounts[p.id]).sort((a,b) => (voteCounts[b.id] || 0) - (voteCounts[a.id] || 0)).map(p => (
            <div key={p.id} className="mvp-vote-row">
              <span className="mvp-v-name">{p.name}</span>
              <span className="mvp-v-count">{voteCounts[p.id]}</span>
            </div>
          ))}
        </div>
        <div className="mvp-team-divider"></div>
        <div className="mvp-team-column">
          <small>{teamBName}</small>
          {teamBPlayers.filter(p => voteCounts[p.id]).sort((a,b) => (voteCounts[b.id] || 0) - (voteCounts[a.id] || 0)).map(p => (
            <div key={p.id} className="mvp-vote-row">
              <span className="mvp-v-name">{p.name}</span>
              <span className="mvp-v-count">{voteCounts[p.id]}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

const GlobalPlayerManagement = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [allPlayers, setAllPlayers] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const { teams } = useTeams();

  const fetchAllPlayers = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('players')
        .select('*, teams(name)')
        .order('name');
      if (error) throw error;
      setAllPlayers(data || []);
    } catch (err: any) { alert(err.message); }
    finally { setLoading(false); }
  };

  React.useEffect(() => { fetchAllPlayers(); }, []);

  const filteredPlayers = allPlayers.filter(p => 
    p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (p.teams?.name || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="admin-section glass">
      <div className="section-header">
        <h2>Gestão Global de Atletas</h2>
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

      <div className="admin-list">
        {loading ? <p>Carregando...</p> : (
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
