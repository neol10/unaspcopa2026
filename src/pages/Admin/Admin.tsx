import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { supabase, supabaseStorage } from '../../lib/supabase';
import { Trophy, Users, Calendar, Plus, Save, Trash2, Shield, ChevronDown, ChevronUp, Newspaper, CheckCircle, Play, Camera, Search, Settings2, Vote, ShieldAlert, Bell, Star, CreditCard, Target, Square, ArrowRightLeft, MessageSquare, Zap, Clock, Pause, RotateCcw, Coffee, Flag } from 'lucide-react';
import { useTeams, type Team } from '../../hooks/useTeams';
import { usePlayers } from '../../hooks/usePlayers';
import { useQueryClient } from '@tanstack/react-query';
import { useNews, type News } from '../../hooks/useNews';
import { useGallery, type GalleryItem } from '../../hooks/useGallery';
import { useMatches, type Match } from '../../hooks/useMatches';
import { useMatchEvents, type MatchEvent } from '../../hooks/useMatchEvents';
import { useTournamentConfig, type TournamentConfig } from '../../hooks/useTournamentConfig';
import { type Poll, type PollOption } from '../../hooks/usePolls';
import { useAuthContext } from '../../contexts/AuthContext';
import { withTimeout } from '../../lib/withTimeout';
import { detectTournamentPhase, KNOCKOUT_PHASE_BY_ROUND, KNOCKOUT_ROUND_LABELS } from '../../lib/tournamentRules';
import { getPendingSuspension } from '../../lib/discipline';
import { DEFAULT_GROUP_C_VISIBILITY, normalizeGroupCVisibility, type GroupCVisibilityConfig } from '../../hooks/useTournamentConfig';
import { toast } from 'react-hot-toast';
import { useConfirm } from '../../hooks/useConfirm';
import { AnimatePresence, motion } from 'framer-motion';
import { useDivisionContext } from '../../contexts/DivisionContext';
import { isMissingColumnError as isMissingDivisionColumnError, markDivisionColumnMissing, markNightColumnMissing } from '../../lib/supabaseOptionalColumns';
import { clearPhotoCropFromUrl, parsePhotoCropFromUrl, setPhotoCropOnUrl } from '../../lib/photoCrop';
import './Admin.css';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const vibrate = (pattern: number | number[]) => {
  if (typeof window !== 'undefined' && window.navigator && window.navigator.vibrate) {
    window.navigator.vibrate(pattern);
  }
};

const maskPlayerName = (value: unknown) => {
  return String(value ?? '').toUpperCase();
};

const normalizePlayerName = (value: unknown) => {
  return maskPlayerName(value).trim().replace(/\s+/g, ' ');
};

const getPhotoCropXY = (photoUrl: string) => {
  const parsed = parsePhotoCropFromUrl(photoUrl);
  const x = typeof parsed.crop?.x === 'number' && Number.isFinite(parsed.crop.x) ? parsed.crop.x : 50;
  const y = typeof parsed.crop?.y === 'number' && Number.isFinite(parsed.crop.y) ? parsed.crop.y : 50;
  const z = typeof parsed.crop?.z === 'number' && Number.isFinite(parsed.crop.z) ? parsed.crop.z : 100;
  const cx = Math.min(100, Math.max(0, x));
  const cy = Math.min(100, Math.max(0, y));
  const cz = Math.max(50, Math.min(300, z));
  return {
    x: cx,
    y: cy,
    z: cz,
    scale: cz / 100,
    objectPosition: `${cx}% ${cy}%`,
    src: parsed.src || clearPhotoCropFromUrl(photoUrl),
  };
};

async function withRetry<T>(operation: () => Promise<T>, attempts: number = 2): Promise<T> {
  let lastError: unknown;
  for (let i = 0; i < attempts; i += 1) {
    try {
      return await operation();
    } catch (err) {
      lastError = err;
      if (i < attempts - 1) await sleep(600 * (i + 1));
    }
  }
  throw lastError;
}

import { 
  prepareImageForUpload, 
  validateImageFile, 
  validatePreparedImageFile, 
  sanitizeFileBaseName, 
  fileToDataUrl 
} from '../../lib/imageUtils';

const uploadToStorage = async (file: File, bucket: string = 'images', folder: string = 'team-badges'): Promise<string | null> => {
  try {
    const fileToUpload = await prepareImageForUpload(file);
    const validationError = validateImageFile(file) || validatePreparedImageFile(fileToUpload);
    if (validationError) {
      toast.error(validationError);
      return null;
    }
    const fileExt = fileToUpload.name.split('.').pop() || 'jpg';
    const baseName = sanitizeFileBaseName(fileToUpload.name.replace(/\.[^.]+$/, '')) || 'imagem';
    const fileName = `${baseName}_${Math.random().toString(36).substring(2)}_${Date.now()}.${fileExt}`;
    const filePath = `${folder}/${fileName}`;

    // Retry curto para reduzir falhas intermitentes em rede móvel.
    const { error: uploadError } = await withRetry(async () => {
      return await supabaseStorage.storage
        .from(bucket)
        .upload(filePath, fileToUpload, {
          cacheControl: '3600',
          upsert: false,
        });
    }, 2);

    if (uploadError) throw uploadError;

    const { data } = supabaseStorage.storage
      .from(bucket)
      .getPublicUrl(filePath);

    return data.publicUrl;
  } catch (err: unknown) {
    console.error('Upload error:', err);
    const message =
      typeof (err as { message?: unknown })?.message === 'string'
        ? String((err as { message: string }).message)
        : null;

    const fallbackDataUrl = await fileToDataUrl(file);
    if (fallbackDataUrl) {
      toast.success('Upload externo indisponivel. Imagem aplicada localmente.');
      return fallbackDataUrl;
    }

    toast.error(message ? `Erro no upload: ${message}` : 'Erro no upload');
    return null;
  }
};

const formatDatetimeLocal = (dateStr: string | null) => {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};

const getErrorMessage = (err: unknown, fallback: string = 'Ocorreu um erro') => {
  if (typeof (err as { message?: unknown })?.message === 'string') return String((err as { message: string }).message);
  if (typeof err === 'string') return err;
  return fallback;
};

const getPostgresCode = (err: unknown): string | null => {
  if (typeof (err as { code?: unknown })?.code === 'string') return String((err as { code: string }).code);
  return null;
};

const getDeleteMatchErrorMessage = (err: unknown): string => {
  const code = getPostgresCode(err);
  const details = typeof (err as { details?: unknown })?.details === 'string'
    ? String((err as { details: string }).details)
    : '';

  if (code === '23503') {
    const table = details.match(/table\s+"([^"]+)"/i)?.[1];
    if (table) return `Nao foi possivel excluir: existem registros vinculados em ${table}.`;
    return 'Nao foi possivel excluir: a partida ainda possui registros vinculados.';
  }

  if (code === '42501') return 'Sem permissao para excluir esta partida.';
  return getErrorMessage(err, 'Erro ao excluir partida');
};


const Admin: React.FC = () => {
  const { user, role, loading: authLoading } = useAuthContext();
  const [activeTab, setActiveTab] = useState<'matches' | 'teams' | 'players' | 'news' | 'gallery' | 'tournament' | 'polls' | 'notifications' | 'errors' | 'users' | 'feedback'>('matches');
  const [feedbackOpenCount, setFeedbackOpenCount] = useState(0);
  const tabLabels: Record<typeof activeTab, string> = {
    matches: 'Partidas',
    teams: 'Equipes',
    players: 'Atletas',
    news: 'Noticias',
    gallery: 'Galeria',
    tournament: 'Torneio',
    polls: 'Enquetes',
    notifications: 'Alertas Push',
    errors: 'Erros',
    users: 'Usuarios',
    feedback: 'Relatos',
  };

  const tabHints: Record<typeof activeTab, string> = {
    matches: 'Criacao, edicao e operacao de partidas em tempo real.',
    teams: 'Cadastro e ajustes de equipes participantes.',
    players: 'Gestao global de atletas e vinculacao aos times.',
    news: 'Publicacao de comunicados e noticias oficiais.',
    gallery: 'Postagens de fotos e videos para o app.',
    tournament: 'Configuracoes gerais da competicao e fase atual.',
    polls: 'Perguntas, opcoes e acompanhamento das votacoes.',
    notifications: 'Disparo de push segmentado para engajar torcedores.',
    errors: 'Triagem de erros e eventos de performance do cliente.',
    users: 'Auditoria de usuarios que acessaram o aplicativo.',
    feedback: 'Relatos enviados pelos usuarios para voce concluir.',
  };

  type FeedbackReport = {
    id: string;
    category: 'problema' | 'melhoria' | 'outro';
    message: string;
    page_path: string | null;
    user_email: string | null;
    user_id: string | null;
    status: 'aberto' | 'concluido';
    created_at: string;
    concluded_at: string | null;
    concluded_by: string | null;
  };

  const FeedbackReportsPanel: React.FC = () => {
    const [items, setItems] = useState<FeedbackReport[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const { data, error } = await supabase
          .from('feedback_reports')
          .select('id, category, message, page_path, user_email, user_id, status, created_at, concluded_at, concluded_by')
          .eq('status', 'aberto')
          .order('created_at', { ascending: false });

        if (error) throw error;
        const next = (data as FeedbackReport[]) || [];
        setItems(next);
        setFeedbackOpenCount(next.length);
      } catch (err: any) {
        setError(err?.message || 'Erro ao carregar relatos');
      } finally {
        setLoading(false);
      }
    };

    useEffect(() => {
      void load();
    }, []);

    const conclude = async (id: string) => {
      try {
        const { error } = await supabase
          .from('feedback_reports')
          .update({
            status: 'concluido',
            concluded_at: new Date().toISOString(),
            concluded_by: user?.id || null,
          })
          .eq('id', id);
        if (error) throw error;

        toast.success('Relato concluido');
        setItems((prev) => prev.filter((r) => r.id !== id));
        setFeedbackOpenCount((prev) => Math.max(0, prev - 1));
      } catch (err: any) {
        toast.error(err?.message || 'Erro ao concluir relato');
      }
    };

    return (
      <div className="admin-section glass animate-fade-in">
        <div className="section-header">
          <h2>Relatos</h2>
          <p className="section-subtitle">Mensagens enviadas pelos usuarios (apenas pendentes).</p>
          <button className="btn-add" onClick={() => void load()} disabled={loading}>
            <RotateCcw size={18} /> {loading ? 'Atualizando...' : 'Atualizar'}
          </button>
        </div>

        {error ? (
          <div className="admin-empty-state"><p>{error}</p></div>
        ) : items.length === 0 ? (
          <div className="admin-empty-state"><p>Nenhum relato pendente.</p></div>
        ) : (
          <div className="users-list-table">
            <table>
              <thead>
                <tr>
                  <th>Tipo</th>
                  <th>Mensagem</th>
                  <th>Pagina</th>
                  <th>Usuario</th>
                  <th>Data</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {items.map((r) => (
                  <tr key={r.id}>
                    <td style={{ textTransform: 'capitalize' }}>{r.category}</td>
                    <td style={{ maxWidth: 520 }}>
                      <div style={{ whiteSpace: 'pre-wrap' }}>{r.message}</div>
                    </td>
                    <td>{r.page_path || <span style={{ color: '#aaa' }}>—</span>}</td>
                    <td>{r.user_email || <span style={{ color: '#aaa' }}>Anon</span>}</td>
                    <td>{new Date(r.created_at).toLocaleString('pt-BR')}</td>
                    <td>
                      <button className="btn-save" onClick={() => void conclude(r.id)}>
                        <CheckCircle size={16} /> Concluir
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  };

  useEffect(() => {
    if (role !== 'admin') return;
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await supabase
          .from('feedback_reports')
          .select('id')
          .eq('status', 'aberto');
        if (error) throw error;
        const count = Array.isArray(data) ? data.length : 0;
        if (!cancelled) setFeedbackOpenCount(count);
      } catch {
        // se der erro de rede, não trava o admin; o panel recalcula ao abrir
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [role]);
  // --- Listagem de Usuários Logados ---
  type UserProfile = {
    id: string;
    email: string | null;
    created_at: string;
  };

  const UsersPanel: React.FC = () => {
    const [users, setUsers] = useState<UserProfile[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const loadUsers = async () => {
      setLoading(true);
      setError(null);
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('id, email, created_at')
          .order('created_at', { ascending: false });
        if (error) throw error;
        setUsers(data || []);
      } catch (err: any) {
        setError(err?.message || 'Erro ao carregar usuários');
      } finally {
        setLoading(false);
      }
    };

    useEffect(() => {
      loadUsers();
    }, []);

    return (
      <div className="admin-section glass animate-fade-in">
        <div className="section-header">
          <h2>Usuários Logados</h2>
          <p className="section-subtitle">Lista de todos que já fizeram login pelo app.</p>
          <button className="btn-add" onClick={loadUsers} disabled={loading}>
            <RotateCcw size={18} /> {loading ? 'Atualizando...' : 'Atualizar'}
          </button>
        </div>
        {error ? (
          <div className="admin-empty-state"><p>{error}</p></div>
        ) : users.length === 0 ? (
          <div className="admin-empty-state"><p>Nenhum usuário encontrado.</p></div>
        ) : (
          <div className="users-list-table">
            <table>
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>Email</th>
                  <th>Primeiro Login</th>
                </tr>
              </thead>
              <tbody>
                {users.map(u => {
                  const displayName = u.email ? u.email.split('@')[0] : null;
                  return (
                    <tr key={u.id}>
                      <td>{displayName || <span style={{color:'#aaa'}}>—</span>}</td>
                      <td>{u.email || <span style={{color:'#aaa'}}>—</span>}</td>
                      <td>{new Date(u.created_at).toLocaleString('pt-BR')}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  };
  
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
  const { ConfirmElement } = useConfirm();
  const { division, label: divisionLabel, toggleDivision } = useDivisionContext();

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

            <button
              className={`admin-division-toggle ${division === 'feminino' ? 'is-feminino' : 'is-masculino'}`}
              type="button"
              onClick={toggleDivision}
              title={`Categoria atual: ${divisionLabel}`}
              aria-label={`Alternar categoria (atual: ${divisionLabel})`}
            >
              <ArrowRightLeft size={18} />
              <span>{divisionLabel}</span>
            </button>
            
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
                className={`tab-btn ${activeTab === 'gallery' ? 'active' : ''}`}
                onClick={() => setActiveTab('gallery')}
              >
                <Camera size={18} />
                <span>Galeria</span>
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
              <button 
                className={`tab-btn ${activeTab === 'users' ? 'active' : ''}`} 
                onClick={() => setActiveTab('users')}
              >
                <Users size={18} />
                <span>Usuários</span>
              </button>
              <button
                className={`tab-btn ${activeTab === 'feedback' ? 'active' : ''}`}
                onClick={() => setActiveTab('feedback')}
              >
                <MessageSquare size={18} />
                <span>Relatos{feedbackOpenCount > 0 ? ` (${feedbackOpenCount})` : ''}</span>
              </button>
            </nav>
          </header>

          <section className="admin-quick-strip glass" aria-label="Acoes rapidas do admin">
            <div className="admin-quick-strip__context">
              <span className="admin-quick-strip__label">Modulo ativo</span>
              <strong>{tabLabels[activeTab]}</strong>
              <p>{tabHints[activeTab]}</p>
            </div>
            <div className="admin-quick-strip__actions" role="group" aria-label="Atalhos para modulos criticos">
              <button
                className={`admin-quick-btn ${activeTab === 'matches' ? 'active' : ''}`}
                onClick={() => setActiveTab('matches')}
              >
                <Calendar size={15} />
                <span>Partidas</span>
              </button>
              <button
                className={`admin-quick-btn ${activeTab === 'tournament' ? 'active' : ''}`}
                onClick={() => setActiveTab('tournament')}
              >
                <Settings2 size={15} />
                <span>Torneio</span>
              </button>
              <button
                className={`admin-quick-btn ${activeTab === 'notifications' ? 'active' : ''}`}
                onClick={() => setActiveTab('notifications')}
              >
                <Bell size={15} />
                <span>Alertas</span>
              </button>
              <button
                className={`admin-quick-btn ${activeTab === 'errors' ? 'active' : ''}`}
                onClick={() => setActiveTab('errors')}
              >
                <ShieldAlert size={15} />
                <span>Erros</span>
              </button>
            </div>
          </section>

          <main className="admin-viewport">
            {activeTab === 'matches' && <MatchManagement />}
            {activeTab === 'teams' && <TeamManagement />}
            {activeTab === 'players' && <GlobalPlayerManagement />}
            {activeTab === 'news' && <NewsManagement />}
            {activeTab === 'gallery' && <GalleryManagement />}
            {activeTab === 'tournament' && <TournamentManagement />}
            {activeTab === 'polls' && <PollManagement />}
            {activeTab === 'notifications' && (
              <>
                <NotificationBroadcast />
                <PushSubscribersPanel />
              </>
            )}
            {activeTab === 'errors' && <ClientErrorsPanel />}
            {activeTab === 'users' && <UsersPanel />}
            {activeTab === 'feedback' && <FeedbackReportsPanel />}
          </main>
          {ConfirmElement}
        </>
      )}
    </div>
  );
};

// --- Helpers ---
type PushSendOptions = {
  url?: string;
  category?: 'live' | 'results' | 'news' | 'polls' | 'standings' | 'general';
  important?: boolean;
  teamIds?: string[];
  division?: import('../../lib/division').Division;
};

let lastPushErrorMessage = '';

const resolvePushApiEndpoint = () => {
  const raw = (import.meta.env.VITE_PUSH_API_URL as string | undefined)?.trim();
  const host = typeof window !== 'undefined' ? window.location.hostname : '';
  const isLocal = host === 'localhost' || host === '127.0.0.1';

  // Em localhost, forçamos rota relativa para usar proxy do Vite e evitar CORS.
  if (isLocal) return '/api/notify-push';

  if (raw) {
    return raw.includes('notify-push')
      ? raw
      : `${raw.replace(/\/$/, '')}/api/notify-push`;
  }

  // Fallback padrão: funciona em produção (Vercel) e também em localhost via vercel dev/proxy.
  return '/api/notify-push';
};

const buildPushEndpointCandidates = (endpoint: string) => {
  return [endpoint];
};

const sendPushNotification = async (title: string, body: string, options: PushSendOptions | string = '/'): Promise<boolean> => {
  lastPushErrorMessage = '';
  const safeTitle = String(title || '').trim();
  const safeBody = String(body || '').trim();

  if (!safeTitle || !safeBody) {
    lastPushErrorMessage = 'Payload inválido: título/corpo vazios.';
    console.error(lastPushErrorMessage);
    return false;
  }

  const { readStoredDivision } = await import('../../lib/division');
  const currentDivision = readStoredDivision();

  const payload = typeof options === 'string'
    ? { title: safeTitle, body: safeBody, message: safeBody, url: options, division: currentDivision }
    : {
        title: safeTitle,
        body: safeBody,
        message: safeBody,
        url: options.url || '/',
        category: options.category || 'general',
        important: Boolean(options.important),
        teamIds: options.teamIds || [],
        team_ids: options.teamIds || [],
        division: options.division || currentDivision,
      };

  const endpoint = resolvePushApiEndpoint();

  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;

  try {
    const endpoints = buildPushEndpointCandidates(endpoint);
    let lastStatus = 0;
    let lastDetail = '';

    for (const candidate of endpoints) {
      const response = await fetch(candidate, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ ...payload, sound: 'default' }),
      });

      if (response.ok) {
        const contentType = response.headers.get('content-type') || '';
        // Em localhost com Vite sem proxy, /api/* pode devolver HTML do index com 200.
        if (contentType.includes('text/html')) {
          lastStatus = 502;
          lastDetail = 'Resposta HTML recebida no endpoint de push (provavel dev server sem proxy/api).';
          continue;
        }

        const bodyJson = await response.json().catch(() => ({} as Record<string, unknown>));
        const apiMessage = typeof bodyJson.message === 'string' ? bodyJson.message : '';
        const apiResults = Array.isArray(bodyJson.results)
          ? (bodyJson.results as Array<{ success?: boolean; error?: string; statusCode?: number }>)
          : [];

        if (apiMessage.toLowerCase().includes('no subscriptions')) {
          lastPushErrorMessage = 'Nenhum dispositivo inscrito para receber push.';
          lastStatus = 200;
          lastDetail = apiMessage;
          continue;
        }

        if (apiMessage.toLowerCase().includes('no eligible subscriptions')) {
          lastPushErrorMessage = 'Nenhum inscrito elegível para este alerta (filtros atuais).';
          lastStatus = 200;
          lastDetail = apiMessage;
          continue;
        }

        if (apiResults.length > 0) {
          const successCount = apiResults.filter((r) => r.success).length;
          if (successCount === 0) {
            const firstFail = apiResults.find((r) => !r.success);
            lastPushErrorMessage = firstFail?.error
              ? `Nenhum push entregue. Detalhe: ${firstFail.error}`
              : 'Nenhum push foi entregue para os inscritos.';
            lastStatus = firstFail?.statusCode || 200;
            lastDetail = lastPushErrorMessage;
            continue;
          }
        }

        lastPushErrorMessage = '';
        return true;
      }

      lastStatus = response.status;
      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        const json = (await response.json().catch(() => null)) as { error?: unknown } | null;
        lastDetail = typeof json?.error === 'string' ? json.error : JSON.stringify(json || {});
      } else {
        const rawDetail = await response.text().catch(() => '');
        lastDetail = rawDetail;
      }

      if (response.status === 404) {
        const fallbackCandidates = endpoint.includes('notify-push')
          ? [endpoint.replace('notify-push', 'notify_push')]
          : endpoint.includes('notify_push')
            ? [endpoint.replace('notify_push', 'notify-push')]
            : [];

        for (const fallback of fallbackCandidates) {
          const fallbackResp = await fetch(fallback, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...payload, sound: 'default' }),
          });

          if (fallbackResp.ok) return true;

          lastStatus = fallbackResp.status;
          lastDetail = await fallbackResp.text().catch(() => '');
        }
      }

      // Tenta próximo candidato mesmo para 4xx para cobrir diferenças de rota/contrato.
      if (response.status >= 500) {
        console.error(`Push endpoint returned ${response.status}: ${lastDetail}`);
      }
    }

    if (lastStatus && lastStatus !== 200) {
      if (lastStatus === 400) {
        lastPushErrorMessage = `API retornou 400. Detalhe: ${lastDetail || 'requisição inválida'}`;
      } else if (lastStatus === 401) {
        lastPushErrorMessage = 'API de push sem permissão (401). Verifique variáveis do backend no deploy.';
      } else if (lastStatus === 403) {
        const low = String(lastDetail || '').toLowerCase();
        if (low.includes('unexpected response code') || low.includes('nenhum push entregue')) {
          lastPushErrorMessage = 'Inscrições push antigas/inválidas detectadas. Desative e ative as notificações no dispositivo para reinscrever.';
        } else {
          lastPushErrorMessage = 'API de push sem permissão (403). Verifique variáveis do backend no deploy.';
        }
      } else if (lastStatus === 404) {
        lastPushErrorMessage = 'Endpoint de push não encontrado (404).';
      } else if (lastStatus === 502) {
        lastPushErrorMessage = 'No dev local, /api/notify-push está retornando HTML. Use vercel dev ou configure VITE_PUSH_API_URL com URL absoluta.';
      } else {
        lastPushErrorMessage = `Falha no endpoint de push (${lastStatus}).`;
      }
      console.error(`Push endpoint returned ${lastStatus}: ${lastDetail}`);
    }

    return false;
  } catch (err) {
    lastPushErrorMessage = 'Falha de rede ao chamar endpoint de push.';
    console.error('Push notification error:', err);
    return false;
  }
};

// --- Alertas Push em Massa ---
const NotificationBroadcast = () => {
  const { teams } = useTeams();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [url, setUrl] = useState('/');
  const [category, setCategory] = useState<PushSendOptions['category']>('general');
  const [important, setImportant] = useState(false);
  const [targetTeamId, setTargetTeamId] = useState('');
  const [sending, setSending] = useState(false);
  const [selectedPresetId, setSelectedPresetId] = useState<string | null>(null);

  const presets: Array<{
    id: string;
    label: string;
    title: string;
    body: string;
    url: string;
    category: PushSendOptions['category'];
    important: boolean;
  }> = [
    {
      id: 'goal',
      label: 'Gol no jogo',
      title: 'Gol na Copa!',
      body: 'A rede balancou agora. Veja o lance na Central da Partida.',
      url: '/central-da-partida',
      category: 'live',
      important: true,
    },
    {
      id: 'kickoff',
      label: 'Inicio de jogo',
      title: 'Bola rolando!',
      body: 'A partida comecou. Acompanhe em tempo real na Central da Partida.',
      url: '/central-da-partida',
      category: 'live',
      important: false,
    },
    {
      id: 'halftime',
      label: 'Intervalo',
      title: 'Fim do 1 tempo',
      body: 'Intervalo de jogo. Confira o placar parcial no app.',
      url: '/central-da-partida',
      category: 'live',
      important: false,
    },
    {
      id: 'fulltime',
      label: 'Resultado final',
      title: 'Partida encerrada',
      body: 'O jogo terminou. Veja o resultado e os destaques da partida.',
      url: '/jogos',
      category: 'results',
      important: true,
    },
    {
      id: 'news',
      label: 'Comunicado',
      title: 'Novo comunicado oficial',
      body: 'Publicamos uma nova atualizacao. Confira os detalhes agora.',
      url: '/noticias',
      category: 'news',
      important: false,
    },
  ];

  const applyPreset = (presetId: string) => {
    const preset = presets.find((item) => item.id === presetId);
    if (!preset) return;

    setSelectedPresetId(preset.id);
    setTitle(preset.title);
    setBody(preset.body);
    setUrl(preset.url);
    setCategory(preset.category);
    setImportant(preset.important);
    toast.success(`Modelo aplicado: ${preset.label}`);
  };

  const handleBroadcast = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !body) return toast.error('Preencha título e corpo!');
    
    setSending(true);
    try {
      const sent = await sendPushNotification(title, body, {
        url,
        category,
        important,
        teamIds: targetTeamId ? [targetTeamId] : [],
      });

      if (!sent) {
        const msg = lastPushErrorMessage || 'Não foi possível enviar o push.';
        const isNoSubscribers =
          msg.toLowerCase().includes('nenhum dispositivo inscrito') ||
          msg.toLowerCase().includes('nenhum inscrito elegível');

        if (isNoSubscribers) {
          toast.error(msg);
          return;
        }

        throw new Error(msg);
      }

      toast.success('Alerta push enviado para todos os inscritos! 📢');
      setTitle('');
      setBody('');
      setUrl('/');
      setCategory('general');
      setImportant(false);
      setTargetTeamId('');
      setSelectedPresetId(null);
    } catch (err: unknown) {
      const message =
        typeof (err as { message?: unknown })?.message === 'string'
          ? String((err as { message: string }).message)
          : null;
      toast.error(message ? `Erro ao enviar broadcast: ${message}` : 'Erro ao enviar broadcast');
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

      <div className="broadcast-presets glass">
        <div className="broadcast-presets-head">
          <strong>Modelos rapidos</strong>
          <span>Preencha o formulario com um clique e ajuste antes de enviar.</span>
        </div>
        <div className="broadcast-presets-grid" role="group" aria-label="Modelos de alerta push">
          {presets.map((preset) => (
            <button
              key={preset.id}
              type="button"
              className={`broadcast-preset-btn ${selectedPresetId === preset.id ? 'active' : ''}`}
              onClick={() => applyPreset(preset.id)}
            >
              {preset.label}
            </button>
          ))}
        </div>
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

        <div className="form-group">
          <label>Categoria do Alerta</label>
          <select value={category} onChange={(e) => setCategory(e.target.value as PushSendOptions['category'])}>
            <option value="general">Geral</option>
            <option value="live">Ao vivo (gols e lances)</option>
            <option value="results">Resultados</option>
            <option value="news">Notícias</option>
            <option value="polls">Enquetes</option>
            <option value="standings">Classificação</option>
          </select>
        </div>

        <div className="form-group">
          <label>Segmentar por Time (Opcional)</label>
          <select value={targetTeamId} onChange={(e) => setTargetTeamId(e.target.value)}>
            <option value="">Todos os times</option>
            {(teams || []).map((team) => (
              <option key={team.id} value={team.id}>{team.name}</option>
            ))}
          </select>
          <small>Quando selecionado, envia só para quem escolheu esse time como favorito.</small>
        </div>

        <div className="form-group" style={{ marginTop: '-0.25rem' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
            <input type="checkbox" checked={important} onChange={(e) => setImportant(e.target.checked)} />
            Marcar como alerta importante
          </label>
          <small>Usuários com modo "apenas importantes" só recebem alertas com esta opção ativa.</small>
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

type PushSubscriberRow = {
  id?: string;
  user_id: string | null;
  endpoint?: string | null;
  created_at?: string | null;
};

type PushSubscriberView = {
  key: string;
  userId: string | null;
  email: string | null;
  devices: number;
  lastCreatedAt: string | null;
};

const isMissingColumnError = (err: unknown, column: string) => {
  if (!err || typeof err !== 'object') return false;
  const message = String((err as { message?: unknown }).message || '').toLowerCase();
  return message.includes('column') && message.includes(column.toLowerCase());
};

const PushSubscribersPanel: React.FC = () => {
  const [subscribers, setSubscribers] = useState<PushSubscriberView[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadSubscribers = async () => {
    setLoading(true);
    setError(null);

    try {
      let data: PushSubscriberRow[] = [];
      let rows = await supabase
        .from('push_subscriptions')
        .select('id, user_id, endpoint, created_at')
        .order('created_at', { ascending: false });

      if (rows.error && isMissingColumnError(rows.error, 'created_at')) {
        rows = await supabase
          .from('push_subscriptions')
          .select('id, user_id, endpoint');
      }

      if (rows.error) throw rows.error;
      data = (rows.data as PushSubscriberRow[]) || [];

      const userIds = Array.from(new Set(data.map((row) => row.user_id).filter(Boolean))) as string[];
      let profileMap: Record<string, string | null> = {};

      if (userIds.length > 0) {
        const { data: profiles, error: profilesError } = await supabase
          .from('profiles')
          .select('id, email')
          .in('id', userIds);

        if (profilesError) throw profilesError;
        profileMap = Object.fromEntries(
          (profiles || []).map((p) => [String(p.id), typeof p.email === 'string' ? p.email : null])
        );
      }

      const grouped = new Map<string, { userId: string | null; endpoints: Set<string>; lastCreatedAt: string | null }>;

      data.forEach((row, idx) => {
        const endpointKey = row.endpoint || row.id || `row-${idx}`;
        const groupKey = row.user_id || `anon:${endpointKey}`;
        const existing = grouped.get(groupKey);
        const nextCreatedAt = row.created_at || null;

        if (existing) {
          existing.endpoints.add(endpointKey);
          if (!existing.lastCreatedAt || (nextCreatedAt && nextCreatedAt > existing.lastCreatedAt)) {
            existing.lastCreatedAt = nextCreatedAt;
          }
          return;
        }

        grouped.set(groupKey, {
          userId: row.user_id || null,
          endpoints: new Set([endpointKey]),
          lastCreatedAt: nextCreatedAt,
        });
      });

      const mapped: PushSubscriberView[] = Array.from(grouped.entries()).map(([key, value]) => ({
        key,
        userId: value.userId,
        email: value.userId ? profileMap[value.userId] || null : null,
        devices: value.endpoints.size,
        lastCreatedAt: value.lastCreatedAt || null,
      }));

      mapped.sort((a, b) => {
        const aTime = a.lastCreatedAt ? Date.parse(a.lastCreatedAt) : 0;
        const bTime = b.lastCreatedAt ? Date.parse(b.lastCreatedAt) : 0;
        if (aTime !== bTime) return bTime - aTime;
        return b.devices - a.devices;
      });

      setSubscribers(mapped);
    } catch (err: any) {
      setError(err?.message || 'Erro ao carregar inscritos de push');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSubscribers();
  }, []);

  return (
    <div className="admin-section glass animate-fade-in">
      <div className="section-header">
        <h2>Inscritos em Notificações</h2>
        <p className="section-subtitle">Quem ativou alertas push e quantos dispositivos estão inscritos.</p>
        <button className="btn-add" onClick={loadSubscribers} disabled={loading}>
          <RotateCcw size={18} /> {loading ? 'Atualizando...' : 'Atualizar'}
        </button>
      </div>

      {error ? (
        <div className="admin-empty-state"><p>{error}</p></div>
      ) : subscribers.length === 0 ? (
        <div className="admin-empty-state"><p>Nenhum inscrito encontrado.</p></div>
      ) : (
        <div className="users-list-table">
          <table>
            <thead>
              <tr>
                <th>Usuário</th>
                <th>Email</th>
                <th>Dispositivos</th>
                <th>Última Ativação</th>
              </tr>
            </thead>
            <tbody>
              {subscribers.map((row) => (
                <tr key={row.key}>
                  <td>{row.userId ? row.userId.slice(0, 8) : <span style={{ color: '#aaa' }}>Sem login</span>}</td>
                  <td>{row.email || <span style={{ color: '#aaa' }}>—</span>}</td>
                  <td>{row.devices}</td>
                  <td>{row.lastCreatedAt ? new Date(row.lastCreatedAt).toLocaleString('pt-BR') : <span style={{ color: '#aaa' }}>—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
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
  extra: unknown;
};

const formatDateTime = (value: string) => {
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
};

const isClientErrorsUnavailable = (err: unknown) => {
  const raw = err as { code?: unknown; message?: unknown; details?: unknown; status?: unknown };
  const code = typeof raw?.code === 'string' ? raw.code : '';
  const status = typeof raw?.status === 'number' ? raw.status : null;
  const message = typeof raw?.message === 'string' ? raw.message.toLowerCase() : '';
  const details = typeof raw?.details === 'string' ? raw.details.toLowerCase() : '';

  if (status === 400 || status === 401 || status === 403 || status === 404) return true;
  if (code === '42501' || code === '42P01' || code.startsWith('PGRST')) return true;

  return (
    message.includes('permission denied') ||
    message.includes('row-level security') ||
    message.includes('does not exist') ||
    message.includes('schema cache') ||
    message.includes('could not find the table') ||
    details.includes('row-level security')
  );
};

const ClientErrorsPanel = () => {
  const [items, setItems] = useState<ClientErrorRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'errors' | 'performance' | 'all'>('errors');
  const [groupByFingerprint, setGroupByFingerprint] = useState(false);

  const classifyItem = React.useCallback((item: ClientErrorRow) => {
    return item.source.toLowerCase() === 'performance' ? 'performance' : 'error';
  }, []);

  const counters = React.useMemo(() => {
    const performanceCount = items.filter((it) => classifyItem(it) === 'performance').length;
    const errorCount = items.length - performanceCount;
    return {
      all: items.length,
      errors: errorCount,
      performance: performanceCount,
    };
  }, [items, classifyItem]);

  const filteredItems = React.useMemo(() => {
    if (viewMode === 'all') return items;
    if (viewMode === 'performance') return items.filter((it) => classifyItem(it) === 'performance');
    return items.filter((it) => classifyItem(it) === 'error');
  }, [items, viewMode, classifyItem]);

  const normalizeMessage = React.useCallback((message: string) => {
    return message
      .toLowerCase()
      .replace(/\d+/g, '#')
      .replace(/[a-f0-9]{8,}/g, '#')
      .trim();
  }, []);

  const getSeverity = React.useCallback((item: ClientErrorRow) => {
    const source = item.source.toLowerCase();
    const message = item.message.toLowerCase();
    if (source === 'performance') {
      const metricMatch = /:(\d+)ms/.exec(message);
      const ms = metricMatch ? Number(metricMatch[1]) : 0;
      if (ms >= 15000) return 'warning';
      return 'info';
    }

    if (message.includes('loading chunk') || message.includes('failed to fetch dynamically imported module')) {
      return 'critical';
    }
    if (message.includes('timeout') || message.includes('network')) {
      return 'warning';
    }
    return 'error';
  }, []);

  const listedItems = React.useMemo(() => {
    const enriched = filteredItems.map((item) => ({
      item,
      severity: getSeverity(item),
      fingerprint: `${item.source.toLowerCase()}::${normalizeMessage(item.message)}`,
      count: 1,
    }));

    if (!groupByFingerprint) return enriched;

    const grouped = new Map<string, (typeof enriched)[number]>();
    for (const entry of enriched) {
      const existing = grouped.get(entry.fingerprint);
      if (!existing) {
        grouped.set(entry.fingerprint, entry);
        continue;
      }
      const existingTs = new Date(existing.item.created_at).getTime();
      const currentTs = new Date(entry.item.created_at).getTime();
      const latest = currentTs > existingTs ? entry.item : existing.item;
      grouped.set(entry.fingerprint, {
        ...entry,
        item: latest,
        count: existing.count + 1,
      });
    }

    return Array.from(grouped.values()).sort(
      (a, b) => new Date(b.item.created_at).getTime() - new Date(a.item.created_at).getTime(),
    );
  }, [filteredItems, getSeverity, normalizeMessage, groupByFingerprint]);

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
    } catch (err: unknown) {
      const unavailable = isClientErrorsUnavailable(err);
      if (!isClientErrorsUnavailable(err)) {
        console.error('Error loading client_errors:', err);
      }
      const msg =
        typeof (err as { message?: unknown })?.message === 'string'
          ? String((err as { message: string }).message)
          : 'Falha ao carregar erros';
      setLoadError(
        unavailable
          ? 'Observabilidade não configurada neste ambiente (tabela client_errors ausente ou sem permissão).'
          : msg,
      );
      if (!unavailable) {
        toast.error(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  React.useEffect(() => {
    void load();
  }, []);

  return (
    <div className="admin-section glass animate-fade-in">
      <div className="section-header">
        <div>
          <h2>Erros do App (Client)</h2>
          <p className="section-subtitle">Observabilidade dos últimos 50 eventos do app (erros reais e métricas de performance).</p>
        </div>
        <button className="btn-add" onClick={() => void load()} disabled={loading}>
          <RotateCcw size={18} /> {loading ? 'Atualizando...' : 'Atualizar'}
        </button>
      </div>

      <div className="client-errors-body">
        <div className="client-errors-filterbar">
          <button
            className={`client-errors-filter ${viewMode === 'errors' ? 'active' : ''}`}
            type="button"
            onClick={() => setViewMode('errors')}
          >
            Erros reais ({counters.errors})
          </button>
          <button
            className={`client-errors-filter ${viewMode === 'performance' ? 'active' : ''}`}
            type="button"
            onClick={() => setViewMode('performance')}
          >
            Performance ({counters.performance})
          </button>
          <button
            className={`client-errors-filter ${viewMode === 'all' ? 'active' : ''}`}
            type="button"
            onClick={() => setViewMode('all')}
          >
            Todos ({counters.all})
          </button>
          <label className="client-errors-group-toggle">
            <input
              type="checkbox"
              checked={groupByFingerprint}
              onChange={(e) => setGroupByFingerprint(e.target.checked)}
            />
            Agrupar por fingerprint
          </label>
        </div>

        {loadError ? (
          <div className="admin-empty-state">
            <p>Não foi possível carregar: {loadError}</p>
            <button className="btn-add" onClick={() => void load()} disabled={loading}>
              <RotateCcw size={18} /> Tentar novamente
            </button>
          </div>
        ) : listedItems.length === 0 ? (
          <div className="admin-empty-state">
            <p>
              {items.length === 0
                ? 'Nenhum evento registrado ainda.'
                : viewMode === 'errors'
                  ? 'Sem erros reais no recorte atual.'
                  : viewMode === 'performance'
                    ? 'Sem métricas de performance no recorte atual.'
                    : 'Sem eventos no recorte atual.'}
            </p>
          </div>
        ) : (
          <div className="client-errors-list">
            {(listedItems || []).map(({ item: it, severity, count, fingerprint }) => (
              <div key={groupByFingerprint ? fingerprint : it.id} className={`client-error-item glass ${classifyItem(it) === 'performance' ? 'is-performance' : 'is-error'}`}>
                <div className="client-error-head">
                  <strong>
                    {it.source}
                    <span className={`client-error-severity sev-${severity}`}>{severity}</span>
                    {groupByFingerprint && count > 1 ? <span className="client-error-count">x{count}</span> : null}
                  </strong>
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
  const queryClient = useQueryClient();
  const { division } = useDivisionContext();
  const { config } = useTournamentConfig();
  const groupUnit = config?.group_unit === 'round' ? 'round' : 'night';
  const groupUnitLabel = groupUnit === 'round' ? 'Rodada' : 'Noite';
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);

  useEffect(() => {
    if (confirmingDeleteId) {
      const timer = setTimeout(() => {
        setConfirmingDeleteId(null);
      }, 4000);
      return () => clearTimeout(timer);
    }
  }, [confirmingDeleteId]);

  const [isAdding, setIsAdding] = useState(false);
  const [isSubmittingMatch, setIsSubmittingMatch] = useState(false);
  const [selectedMatchId, setSelectedMatchId] = useState<string | null>(null);

  type MatchFormData = {
    team_a_id: string;
    team_b_id: string;
    match_date: string;
    location: string;
    status: Match['status'];
    round: string;
    night: string;
  };

  const [formData, setFormData] = useState<MatchFormData>({ 
    team_a_id: '', 
    team_b_id: '', 
    match_date: '', 
    location: 'Ginásio Principal',
    status: 'agendado',
    round: '1',
    night: ''
  });
  const [searchTerm, setSearchTerm] = useState('');

  const KO_ROUND_CODES: Record<string, number> = {
    oitavas: 1000,
    quartas: 1001,
    semi: 1002,
    final: 1003,
    terceiro: 1004,
  };

  const KO_ROUND_LABELS: Record<number, string> = {
    ...KNOCKOUT_ROUND_LABELS,
  };

  const parseRoundInput = (value: string): number | null => {
    const raw = value.trim();
    if (!raw) return null;
    const lower = raw.toLowerCase();
    if (KO_ROUND_CODES[lower]) return KO_ROUND_CODES[lower];
    const parsed = Number(raw);
    if (Number.isFinite(parsed) && parsed > 0) return Math.floor(parsed);
    return null;
  };

  const parseNightInput = (value: string): number | null => {
    const raw = value.trim();
    if (!raw) return null;
    const parsed = Number(raw);
    if (Number.isFinite(parsed) && parsed > 0) return Math.floor(parsed);
    return null;
  };

  const formatRoundLabel = (value: number) => {
    if (KO_ROUND_LABELS[value]) return KO_ROUND_LABELS[value];
    if (value >= 1000) return `Fase ${value}`;
    return `${value}ª Rodada`;
  };

  const formatRoundInput = (value: number) => KO_ROUND_LABELS[value] || String(value);

  const invalidateCompetitionData = () => {
    void queryClient.invalidateQueries({ queryKey: ['matches', division] });
    void queryClient.invalidateQueries({ queryKey: ['standings', division] });
    void queryClient.invalidateQueries({ queryKey: ['rankings', division] });
  };

  // Agrupar equipes por grupo
  const groupedTeams = (teams || []).reduce<Record<string, Team[]>>((acc, team) => {
    const group = team.group || 'Sem Grupo';
    if (!acc[group]) acc[group] = [];
    acc[group].push(team);
    return acc;
  }, {});


  const handleCreateMatch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmittingMatch) return;
    if (formData.team_a_id === formData.team_b_id) return toast.error('Selecione times diferentes!');
    
    // Regra de conflito:
    // - Fase de grupos: time nao pode jogar 2x na mesma Unidade (Noite/Rodada)
    // - Mata-mata (round >= 1000): continua por fase/round
    const parsedRound = parseRoundInput(formData.round) || 0;
    if (!parsedRound) {
      return toast.error('Fase/Rodada inválida. Use um número ou: Oitavas, Quartas, Semi, Final, 3o Lugar.');
    }
    const isKnockout = parsedRound >= 1000;

    let currentRound = 0;
    let nightValue: number | null = null;
    let slotLabel = groupUnitLabel;
    let slotValue: number | null = null;

    if (isKnockout) {
      currentRound = parsedRound;
      slotLabel = 'Fase';
      slotValue = parsedRound;
      nightValue = null;
    } else if (groupUnit === 'night') {
      const currentNight = parseNightInput(formData.night);
      if (!currentNight) {
        return toast.error('Noite inválida. Use um número: 1, 2, 3...');
      }
      currentRound = currentNight;
      nightValue = currentNight;
      slotValue = currentNight;
    } else {
      // groupUnit === 'round'
      currentRound = parsedRound;
      nightValue = null;
      slotValue = parsedRound;
    }

    const teamACollision = isKnockout
      ? matches.find(m => m.round === currentRound && (m.team_a_id === formData.team_a_id || m.team_b_id === formData.team_a_id))
      : (groupUnit === 'night'
          ? matches.find(m => (m as Match).night === nightValue && (m.team_a_id === formData.team_a_id || m.team_b_id === formData.team_a_id))
          : matches.find(m => (m.round || 0) < 1000 && m.round === currentRound && (m.team_a_id === formData.team_a_id || m.team_b_id === formData.team_a_id)));
    const teamBCollision = isKnockout
      ? matches.find(m => m.round === currentRound && (m.team_a_id === formData.team_b_id || m.team_b_id === formData.team_b_id))
      : (groupUnit === 'night'
          ? matches.find(m => (m as Match).night === nightValue && (m.team_a_id === formData.team_b_id || m.team_b_id === formData.team_b_id))
          : matches.find(m => (m.round || 0) < 1000 && m.round === currentRound && (m.team_a_id === formData.team_b_id || m.team_b_id === formData.team_b_id)));

    if (teamACollision) {
      const teamName = teams.find(t => t.id === formData.team_a_id)?.name;
      return toast.error(
        isKnockout
          ? `Erro: O time ${teamName} já possui uma partida na fase ${formatRoundLabel(currentRound)}!`
          : `Erro: O time ${teamName} já possui uma partida na ${slotLabel.toLowerCase()} ${slotValue}!`
      );
    }
    if (teamBCollision) {
      const teamName = teams.find(t => t.id === formData.team_b_id)?.name;
      return toast.error(
        isKnockout
          ? `Erro: O time ${teamName} já possui uma partida na fase ${formatRoundLabel(currentRound)}!`
          : `Erro: O time ${teamName} já possui uma partida na ${slotLabel.toLowerCase()} ${slotValue}!`
      );
    }

    setIsSubmittingMatch(true);
    try {
      const payload = {
        team_a_id: formData.team_a_id,
        team_b_id: formData.team_b_id,
        match_date: formData.match_date ? new Date(formData.match_date).toISOString() : null,
        location: formData.location,
        status: formData.status,
        division,
        round: currentRound,
        night: nightValue,
      } as Record<string, unknown>;

      const doInsert = async (payloadToInsert: Record<string, unknown>) => {
        return await withTimeout(
          supabase.from('matches').insert([payloadToInsert]),
          30000,
          'Tempo limite ao criar partida'
        );
      };

      const res = await doInsert(payload);
      if (res.error) {
        const missingDivision = isMissingDivisionColumnError(res.error as any, 'division');
        const missingNight = isMissingDivisionColumnError(res.error as any, 'night');

        if (missingDivision || missingNight) {
          if (missingDivision) markDivisionColumnMissing();
          if (missingNight) markNightColumnMissing();

          const base = payload as { division?: unknown; night?: unknown } & Record<string, unknown>;
          const { division: _ignoredDivision, night: _ignoredNight, ...rest } = base;
          const retryPayload: Record<string, unknown> = {
            ...rest,
            ...(missingDivision ? {} : { division: base.division }),
            ...(missingNight ? {} : { night: base.night }),
          };

          const retry = await doInsert(retryPayload);
          if (retry.error) throw retry.error;
        } else {
          throw res.error;
        }
      }
      setFormData({ team_a_id: '', team_b_id: '', match_date: '', location: 'Ginásio Principal', status: 'agendado', round: '1', night: '' });
      setIsAdding(false);
      void refresh();
      invalidateCompetitionData();
      toast.success('Partida criada com sucesso!');
    } catch (err: any) {
      const code = err?.code ? ` (código: ${err.code})` : '';
      const details = err?.message || err?.details || '';
      toast.error(`Erro ao criar partida${code}: ${details || getErrorMessage(err, '')}`);
    } finally {
      setIsSubmittingMatch(false);
    }
  };

  const updateStatus = async (id: string, status: Match['status'], match?: Match) => {
    try {
      const { error } = await withTimeout(
        supabase.from('matches').update({ status }).eq('id', id),
        30000,
        'Tempo limite ao atualizar status'
      );
      if (error) throw error;
      
      if (status === 'ao_vivo' && match) {
        sendPushNotification(
          '🍿 Jogo Iniciado!', 
          `${match.teams_a?.name || 'Equipe A'} vs ${match.teams_b?.name || 'Equipe B'} acaba de começar!`,
          {
            url: '/central-da-partida',
            category: 'live',
            important: true,
            teamIds: [match.team_a_id, match.team_b_id],
          }
        );
      }

      if (status === 'finalizado' && match) {
        sendPushNotification(
          '🏁 Partida Finalizada!', 
          `Placar Final: ${match.teams_a?.name || 'Equipe A'} ${match.team_a_score} x ${match.team_b_score} ${match.teams_b?.name || 'Equipe B'}`,
          {
            url: '/central-da-partida',
            category: 'results',
            important: true,
            teamIds: [match.team_a_id, match.team_b_id],
          }
        );
      }
      
      void refresh();
      invalidateCompetitionData();
    } catch (err: unknown) {
      toast.error(getErrorMessage(err, 'Erro ao atualizar status'));
    }
  };

  const handleDeleteMatch = async (id: string) => {
    const loadingToast = toast.loading('Processando reversão e exclusão...');
    try {
      // 1. Buscar todos os eventos desta partida em uma única chamada
      const { data: events, error: eventsError } = await supabase
        .from('match_events')
        .select('event_type, player_id, assistant_id, commentary')
        .eq('match_id', id);

      if (eventsError) throw eventsError;

      // 2. Agrupar as reversões por jogador para otimizar as chamadas ao banco
      if (events && events.length > 0) {
        const deltas: Record<string, { goals: number; assists: number; yellows: number; reds: number }> = {};
        
        events.forEach(event => {
          const isOwnGoal =
            event.event_type === 'gol' &&
            typeof event.commentary === 'string' &&
            event.commentary.toUpperCase().includes('[CONTRA]');

          if (event.player_id) {
            if (!deltas[event.player_id]) deltas[event.player_id] = { goals: 0, assists: 0, yellows: 0, reds: 0 };
            if (event.event_type === 'gol' && !isOwnGoal) deltas[event.player_id].goals += 1;
            else if (event.event_type === 'amarelo') deltas[event.player_id].yellows += 1;
            else if (event.event_type === 'vermelho') deltas[event.player_id].reds += 1;
          }

          // `assistant_id` também é usado em substituição (ENTRA). Só conta assistência em gols não-contra.
          if (event.event_type === 'gol' && !isOwnGoal && event.assistant_id) {
            if (!deltas[event.assistant_id]) deltas[event.assistant_id] = { goals: 0, assists: 0, yellows: 0, reds: 0 };
            deltas[event.assistant_id].assists += 1;
          }
        });

        const playerIds = Object.keys(deltas);
        if (playerIds.length > 0) {
          // Buscar todos os jogadores afetados de uma vez
          const { data: playersData, error: playersError } = await supabase
            .from('players')
            .select('id, goals_count, assists, yellow_cards, red_cards')
            .in('id', playerIds);

          if (playersError) throw playersError;

          // Executar atualizações em paralelo (Promise.all) em vez de um loop sequencial com await
          if (playersData) {
            await Promise.all((playersData || []).map(p => {
              const d = deltas[p.id];
              return supabase.from('players').update({
                goals_count: Math.max(0, (p.goals_count || 0) - d.goals),
                assists: Math.max(0, (p.assists || 0) - d.assists),
                yellow_cards: Math.max(0, (p.yellow_cards || 0) - d.yellows),
                red_cards: Math.max(0, (p.red_cards || 0) - d.reds)
              }).eq('id', p.id);
            }));
          }
        }
      }

      // 3. Limpar dependencias da partida (Votações e Eventos)
      await Promise.all([
        supabase.from('match_winner_votes').delete().eq('match_id', id),
        supabase.from('match_mvp_votes').delete().eq('match_id', id),
        supabase.from('match_events').delete().eq('match_id', id),
      ]).catch(err => {
        // Ignorar erros de tabela inexistente (42P01) mas logar outros
        if (err?.code !== '42P01') console.warn('Clean sub-tables warn:', err);
      });

      // 4. Excluir a partida com timeout de segurança
      const { error } = await withTimeout(
        supabase.from('matches').delete().eq('id', id),
        20000,
        'Tempo limite ao excluir partida'
      );
      if (error) throw error;
      
      void refresh();
      invalidateCompetitionData();
      toast.success('Partida excluída e estatísticas revertidas!', { id: loadingToast });
    } catch (err: any) {
      console.error('Delete match error:', err);
      const code = err?.code ? ` (código: ${err.code})` : '';
      const details = err?.message || err?.details || '';
      toast.error(`Erro ao excluir partida${code}: ${details || getDeleteMatchErrorMessage(err)}`, { id: loadingToast });
    }
  };

  const [editingMatchId, setEditingMatchId] = useState<string | null>(null);

  const handleUpdateMatch = async (id: string, data: MatchFormData) => {
    const parsedRound = parseRoundInput(data.round) || 0;
    if (!parsedRound) {
      return toast.error('Fase/Rodada inválida. Use um número ou: Oitavas, Quartas, Semi, Final, 3o Lugar.');
    }
    const isKnockout = parsedRound >= 1000;

    let currentRound = 0;
    let nightValue: number | null = null;
    let slotLabel = groupUnitLabel;
    let slotValue: number | null = null;

    if (isKnockout) {
      currentRound = parsedRound;
      slotLabel = 'Fase';
      slotValue = parsedRound;
      nightValue = null;
    } else if (groupUnit === 'night') {
      const currentNight = parseNightInput(data.night);
      if (!currentNight) {
        return toast.error('Noite inválida. Use um número: 1, 2, 3...');
      }
      currentRound = currentNight;
      nightValue = currentNight;
      slotValue = currentNight;
    } else {
      currentRound = parsedRound;
      nightValue = null;
      slotValue = parsedRound;
    }

    const teamACollision = isKnockout
      ? matches.find(m => m.id !== id && m.round === currentRound && (m.team_a_id === data.team_a_id || m.team_b_id === data.team_a_id))
      : (groupUnit === 'night'
          ? matches.find(m => m.id !== id && (m as Match).night === nightValue && (m.team_a_id === data.team_a_id || m.team_b_id === data.team_a_id))
          : matches.find(m => m.id !== id && (m.round || 0) < 1000 && m.round === currentRound && (m.team_a_id === data.team_a_id || m.team_b_id === data.team_a_id)));
    const teamBCollision = isKnockout
      ? matches.find(m => m.id !== id && m.round === currentRound && (m.team_a_id === data.team_b_id || m.team_b_id === data.team_b_id))
      : (groupUnit === 'night'
          ? matches.find(m => m.id !== id && (m as Match).night === nightValue && (m.team_a_id === data.team_b_id || m.team_b_id === data.team_b_id))
          : matches.find(m => m.id !== id && (m.round || 0) < 1000 && m.round === currentRound && (m.team_a_id === data.team_b_id || m.team_b_id === data.team_b_id)));

    if (teamACollision) {
      const teamName = teams.find(t => t.id === data.team_a_id)?.name;
      return toast.error(
        isKnockout
          ? `Erro: O time ${teamName} já possui outra partida na fase ${formatRoundLabel(currentRound)}!`
          : `Erro: O time ${teamName} já possui outra partida na ${slotLabel.toLowerCase()} ${slotValue}!`
      );
    }
    if (teamBCollision) {
      const teamName = teams.find(t => t.id === data.team_b_id)?.name;
      return toast.error(
        isKnockout
          ? `Erro: O time ${teamName} já possui outra partida na fase ${formatRoundLabel(currentRound)}!`
          : `Erro: O time ${teamName} já possui outra partida na ${slotLabel.toLowerCase()} ${slotValue}!`
      );
    }

    try {
      const updatePayload = {
        team_a_id: data.team_a_id,
        team_b_id: data.team_b_id,
        match_date: data.match_date ? new Date(data.match_date).toISOString() : null,
        location: data.location,
        status: data.status,
        round: currentRound,
        night: nightValue,
      } as Record<string, unknown>;

      const doUpdate = async (payloadToUpdate: Record<string, unknown>) => {
        return await withTimeout(
          supabase.from('matches').update(payloadToUpdate).eq('id', id),
          30000,
          'Tempo limite ao atualizar partida'
        );
      };

      const res = await doUpdate(updatePayload);
      if (res.error) {
        if (isMissingDivisionColumnError(res.error as any, 'night')) {
          markNightColumnMissing();
          const { night: _ignored, ...noNight } = updatePayload as { night?: unknown } & Record<string, unknown>;
          const retry = await doUpdate(noNight);
          if (retry.error) throw retry.error;
        } else {
          throw res.error;
        }
      }
      setEditingMatchId(null);
      void refresh();
      invalidateCompetitionData();
      toast.success('Partida atualizada!');
    } catch (err: unknown) {
      toast.error(getErrorMessage(err, 'Erro ao atualizar partida'));
    }
  };

  const filteredMatches = (matches || []).filter(m => {
    const s = searchTerm.toLowerCase();
    const teamA = (m.teams_a?.name || '').toLowerCase();
    const teamB = (m.teams_b?.name || '').toLowerCase();
    const round = String(m.round || '');
    const night = String((m as Match).night || '');
    return teamA.includes(s) || teamB.includes(s) || round.includes(s) || night.includes(s);
  });

  const isKnockoutForm = (parseRoundInput(formData.round) || 0) >= 1000;

  // Times ocupados na noite selecionada (grupos) ou na fase/rodada selecionada (mata-mata)
  const busyTeamIdsInSlot = (() => {
    const inputRound = parseRoundInput(formData.round) || 0;
    const isKnockout = inputRound >= 1000;
    const roundValue = inputRound || 1;

    if (isKnockout) {
      return new Set(
        (matches || [])
          .filter((m) => m.round === roundValue)
          .flatMap((m) => [m.team_a_id, m.team_b_id])
      );
    }

    if (groupUnit === 'night') {
      const nightValue = parseNightInput(formData.night);
      if (!nightValue) return new Set<string>();
      return new Set(
        (matches || [])
          .filter((m) => (m as Match).night === nightValue)
          .flatMap((m) => [m.team_a_id, m.team_b_id])
      );
    }

    return new Set(
      (matches || [])
        .filter((m) => (m.round || 0) < 1000)
        .filter((m) => m.round === roundValue)
        .flatMap((m) => [m.team_a_id, m.team_b_id])
    );
  })();

  // Times ocupados na noite/fase da partida sendo editada (Ignorando a própria partida)
  const getBusyTeamIdsForEdit = (matchId: string, round: number, night: number | null) => {
    const isKnockout = round >= 1000;
    return new Set(
      (matches || [])
        .filter((m) => {
          if (m.id === matchId) return false;
          if (isKnockout) return m.round === round;
          if (groupUnit === 'night') {
            if (!night) return false;
            return (m as Match).night === night;
          }
          return (m.round || 0) < 1000 && m.round === round;
        })
        .flatMap((m) => [m.team_a_id, m.team_b_id])
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
            onClick={async () => {
              const sent = await sendPushNotification('🔔 Teste de Alerta', 'Se você recebeu isso, as notificações estão funcionando! 🚀');
              if (sent) {
                toast.success('Teste de push enviado com sucesso.');
              } else {
                toast.error('Falha ao enviar push de teste. Verifique o endpoint configurado.');
              }
            }}
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
                    const availableTeamsInGroup = (groupedTeams[group] || []).filter((t) => !busyTeamIdsInSlot.has(t.id) || t.id === formData.team_a_id);
                    if (availableTeamsInGroup.length === 0) return null;
                    return (
                      <optgroup key={group} label={`Grupo ${group}`}>
                        {(availableTeamsInGroup || []).sort((a, b) => a.name.localeCompare(b.name)).map((t) => (
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
                    const availableTeamsInGroup = (groupedTeams[group] || []).filter((t) => !busyTeamIdsInSlot.has(t.id) || t.id === formData.team_b_id);
                    if (availableTeamsInGroup.length === 0) return null;
                    return (
                      <optgroup key={group} label={`Grupo ${group}`}>
                        {(availableTeamsInGroup || []).sort((a, b) => a.name.localeCompare(b.name)).map((t) => (
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
                 <label>Fase/Rodada</label>
                 <input
                   type="text"
                   placeholder="Ex: 1, 2, Oitavas"
                   required
                   value={formData.round}
                   onChange={e => {
                     const next = e.target.value;
                     const nextRound = parseRoundInput(next) || 0;
                     const nextIsKnockout = nextRound >= 1000;
                     setFormData(prev => ({
                       ...prev,
                       round: next,
                        night: groupUnit === 'night' && nextIsKnockout ? '' : prev.night,
                     }));
                   }}
                   list="round-options"
                 />
               </div>
                 {groupUnit === 'night' && (
                   <div className="form-group">
                     <label>Noite</label>
                     <input
                       type="text"
                       placeholder={isKnockoutForm ? 'Nao se aplica no mata-mata' : 'Ex: 1, 2, 3'}
                       value={isKnockoutForm ? '' : formData.night}
                       disabled={isKnockoutForm}
                       required={!isKnockoutForm}
                       onChange={e => {
                         const nextNight = e.target.value;
                         setFormData(prev => {
                           const nextNightNum = parseNightInput(nextNight);
                           // Na fase de grupos, round acompanha a Noite para manter consistencia no sistema.
                           return {
                             ...prev,
                             night: nextNight,
                             round: nextNightNum ? String(nextNightNum) : prev.round,
                           };
                         });
                       }}
                     />
                   </div>
                 )}
           </div>
           <datalist id="round-options">
             <option value="1" />
             <option value="2" />
             <option value="3" />
             <option value="4" />
             <option value="5" />
             <option value="6" />
             <option value="7" />
             <option value="8" />
             <option value="Oitavas" />
             <option value="Quartas" />
             <option value="Semi" />
             <option value="Final" />
             <option value="3o Lugar" />
           </datalist>
           <button type="submit" className="btn-save" disabled={isSubmittingMatch}>
             <Save size={18} /> {isSubmittingMatch ? 'Criando...' : 'Criar Partida'}
           </button>
        </form>
      )}

      <div className="admin-filters-bar">
        <div className="search-input-wrapper">
          <Search size={18} />
          <input 
            type="text" 
            placeholder={`Buscar por equipe, fase/rodada ou ${groupUnit === 'night' ? 'noite' : 'rodada'}...`} 
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      <div className="admin-list-sections">
        {/* === PARTIDAS ATIVAS / AGENDADAS === */}
        <div className="admin-list-group">
          <h3 className="list-group-title"><Clock size={16} /> Partidas Ativas / Agendadas</h3>
          {loading ? <p>Carregando...</p> : (filteredMatches || []).filter(m => m.status !== 'finalizado').length === 0 ? (
            <div className="admin-empty-state"><p>Nenhuma partida agendada.</p></div>
          ) : (filteredMatches || []).filter(m => m.status !== 'finalizado').map(match => (
            <React.Fragment key={match.id}>
              <div className={`admin-list-item match-admin-card ${match.status}`}>
                <div className="match-status-info">
                    <span className={`status-dot ${match.status}`}></span>
                    <div className="match-info-main">
                      <strong style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        {match.teams_a?.badge_url ? (
                          <img src={match.teams_a.badge_url} alt="" style={{ width: 24, height: 24, objectFit: 'contain' }} />
                        ) : (
                          <Shield size={20} />
                        )}
                        <span>{(match.teams_a?.name || '---')} {match.team_a_score} x {match.team_b_score} {(match.teams_b?.name || '---')}</span>
                        {match.teams_b?.badge_url ? (
                          <img src={match.teams_b.badge_url} alt="" style={{ width: 24, height: 24, objectFit: 'contain' }} />
                        ) : (
                          <Shield size={20} style={{ opacity: 0.5 }} />
                        )}
                      </strong>
                      <div className="match-meta-admin">
                        {match.round >= 1000 ? (
                          <span className="round-badge">{formatRoundLabel(match.round)}</span>
                        ) : (groupUnit === 'round' ? (
                          <span className="round-badge">Rodada {match.round}</span>
                        ) : ((match as Match).night ? (
                          <span className="round-badge">Noite {(match as Match).night}</span>
                        ) : (
                          <span className="round-badge">Sem Noite</span>
                        )))}
                        <span className="match-date">{new Date(match.match_date).toLocaleString('pt-BR')}</span>
                      </div>
                    </div>
                </div>
                <div className="item-actions">
                  {match.status === 'agendado' && (
                    <>
                      <button className="btn-icon edit" title="Editar Partida" onClick={() => {
                         vibrate(40);
                         setEditingMatchId(match.id);
                         setFormData({
                           team_a_id: match.team_a_id,
                           team_b_id: match.team_b_id,
                           match_date: formatDatetimeLocal(match.match_date),
                           location: match.location,
                           status: match.status,
                           round: formatRoundInput(match.round),
                           night: match.round >= 1000 || groupUnit === 'round' ? '' : String((match as Match).night || '')
                         });
                      }}><Settings2 size={18} /></button>
                      <button className="btn-icon play" title="Começar Jogo" onClick={() => { vibrate(60); updateStatus(match.id, 'ao_vivo', match); }}><Play size={18} /></button>
                    </>
                  )}
                  {match.status === 'ao_vivo' && (
                    <>
                      <button className="btn-live-control" onClick={() => { vibrate(40); setSelectedMatchId(selectedMatchId === match.id ? null : match.id); }}>
                        {selectedMatchId === match.id ? 'Fechar Painel' : 'Gerenciar (AO VIVO)'}
                      </button>
                      <button className="btn-icon finish" title="Finalizar Jogo" onClick={() => { vibrate(60); updateStatus(match.id, 'finalizado', match); }}><CheckCircle size={18} /></button>
                    </>
                  )}
                  <button 
                    className={`btn-icon delete ${confirmingDeleteId === match.id ? 'confirming' : ''}`} 
                    onClick={(e) => {
                      e.stopPropagation();
                      if (confirmingDeleteId === match.id) {
                        vibrate(100);
                        setConfirmingDeleteId(null);
                        handleDeleteMatch(match.id); 
                      } else {
                        vibrate(40);
                        setConfirmingDeleteId(match.id);
                      }
                    }} 
                    title={confirmingDeleteId === match.id ? "Confimar Exclusão" : "Excluir Partida"}
                  >
                    {confirmingDeleteId === match.id ? (
                      <span className="confirm-text">CONFIRMAR?</span>
                    ) : (
                      <Trash2 size={18} />
                    )}
                  </button>
                </div>
              </div>

              {editingMatchId === match.id && (
                <div className="admin-form glass animate-slide-down" style={{ margin: '1rem 0' }}>
                  <div className="form-grid">
                    <div className="form-group">
                      <label>Equipe A</label>
                      <select value={formData.team_a_id} onChange={e => setFormData({...formData, team_a_id: e.target.value})}>
                        {teams
                          .filter(t => !getBusyTeamIdsForEdit(match.id, parseRoundInput(formData.round) || 1, groupUnit === 'night' ? parseNightInput(formData.night) : null).has(t.id) || t.id === match.team_a_id)
                          .map(t => <option key={t.id} value={t.id}>{t.name}</option>)
                        }
                      </select>
                    </div>
                    <div className="form-group">
                      <label>Equipe B</label>
                      <select value={formData.team_b_id} onChange={e => setFormData({...formData, team_b_id: e.target.value})}>
                        {teams
                          .filter(t => !getBusyTeamIdsForEdit(match.id, parseRoundInput(formData.round) || 1, groupUnit === 'night' ? parseNightInput(formData.night) : null).has(t.id) || t.id === match.team_b_id)
                          .map(t => <option key={t.id} value={t.id}>{t.name}</option>)
                        }
                      </select>
                    </div>
                    <div className="form-group">
                      <label>Data/Hora</label>
                      <input type="datetime-local" value={formData.match_date} onChange={e => setFormData({...formData, match_date: e.target.value})} />
                    </div>
                    <div className="form-group">
                      <label>Fase/Rodada</label>
                      <input
                        type="text"
                        value={formData.round}
                        onChange={e => {
                          const next = e.target.value;
                          const nextRound = parseRoundInput(next) || 0;
                          const nextIsKnockout = nextRound >= 1000;
                          setFormData(prev => ({
                            ...prev,
                            round: next,
                            night: groupUnit === 'night' && nextIsKnockout ? '' : prev.night,
                          }));
                        }}
                        list="round-options"
                      />
                    </div>
                    {groupUnit === 'night' && (
                      <div className="form-group">
                        <label>Noite</label>
                        <input
                          type="text"
                          value={(parseRoundInput(formData.round) || 0) >= 1000 ? '' : formData.night}
                          disabled={(parseRoundInput(formData.round) || 0) >= 1000}
                          required={(parseRoundInput(formData.round) || 0) < 1000}
                          onChange={e => {
                            const nextNight = e.target.value;
                            setFormData(prev => {
                              const nextNightNum = parseNightInput(nextNight);
                              return {
                                ...prev,
                                night: nextNight,
                                round: nextNightNum ? String(nextNightNum) : prev.round,
                              };
                            });
                          }}
                        />
                      </div>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: '1rem' }}>
                    <button className="btn-save" onClick={() => handleUpdateMatch(match.id, formData)}><Save size={18} /> Atualizar</button>
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

        {/* === HISTÓRICO DE PARTIDAS === */}
        <div className="admin-list-group" style={{ marginTop: '3rem' }}>
          <h3 className="list-group-title history"><RotateCcw size={16} /> Histórico de Partidas</h3>
          {loading ? <p>Carregando...</p> : (filteredMatches || []).filter(m => m.status === 'finalizado').length === 0 ? (
            <div className="admin-empty-state"><p>Nenhum histórico disponível.</p></div>
          ) : (filteredMatches || []).filter(m => m.status === 'finalizado').map(match => (
            <React.Fragment key={match.id}>
              <div className={`admin-list-item match-admin-card ${match.status} history-item`}>
                <div className="match-status-info">
                    <span className={`status-dot ${match.status}`}></span>
                    <div className="match-info-main">
                      <strong style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {match.teams_a?.badge_url && <img src={match.teams_a.badge_url} alt="" style={{ width: 22, height: 22, objectFit: 'contain' }} />}
                        <span style={{ opacity: 0.9 }}>{match.teams_a?.name} {match.team_a_score} x {match.team_b_score} {match.teams_b?.name}</span>
                        {match.teams_b?.badge_url && <img src={match.teams_b.badge_url} alt="" style={{ width: 22, height: 22, objectFit: 'contain' }} />}
                      </strong>
                      <div className="match-meta-admin">
                        {match.round >= 1000 ? (
                          <span className="round-badge">{formatRoundLabel(match.round)}</span>
                        ) : (groupUnit === 'round' ? (
                          <span className="round-badge">Rodada {match.round}</span>
                        ) : ((match as Match).night ? (
                          <span className="round-badge">Noite {(match as Match).night}</span>
                        ) : (
                          <span className="round-badge">Sem Noite</span>
                        )))}
                        <span className="match-date">{new Date(match.match_date).toLocaleDateString('pt-BR')}</span>
                      </div>
                    </div>
                </div>
                <div className="item-actions">
                  <button className="btn-live-control history" onClick={() => setSelectedMatchId(selectedMatchId === match.id ? null : match.id)}>
                    {selectedMatchId === match.id ? 'Ocultar Eventos' : 'Gerenciar Eventos'}
                  </button>
                  <button className="btn-icon edit" title="Editar Metadados" onClick={() => {
                      setEditingMatchId(match.id);
                      setFormData({
                        team_a_id: match.team_a_id,
                        team_b_id: match.team_b_id,
                        match_date: formatDatetimeLocal(match.match_date),
                        location: match.location,
                        status: match.status,
                        round: formatRoundInput(match.round),
                        night: match.round >= 1000 || groupUnit === 'round' ? '' : String((match as Match).night || '')
                      });
                  }}><Settings2 size={16} /></button>
                  <button 
                    className={`btn-icon delete ${confirmingDeleteId === match.id ? 'confirming' : ''}`} 
                    onClick={(e) => {
                      e.stopPropagation();
                      if (confirmingDeleteId === match.id) {
                        vibrate(100);
                        setConfirmingDeleteId(null);
                        handleDeleteMatch(match.id); 
                      } else {
                        vibrate(40);
                        setConfirmingDeleteId(match.id);
                      }
                    }} 
                    title={confirmingDeleteId === match.id ? "Confirmar Exclusão" : "Excluir do Histórico"}
                  >
                    {confirmingDeleteId === match.id ? (
                      <span className="confirm-text" style={{ fontSize: '0.7rem' }}>CONFIRMAR?</span>
                    ) : (
                      <Trash2 size={16} />
                    )}
                  </button>
                </div>
              </div>

              {editingMatchId === match.id && (
                <div className="admin-form glass animate-slide-down" style={{ margin: '1rem 0' }}>
                  {/* Reuse same edit form as above */}
                  <div className="form-grid">
                    <div className="form-group">
                      <label>Status</label>
                      <select value={formData.status} onChange={e => setFormData({...formData, status: e.target.value as Match['status']})}>
                         <option value="agendado">Agendado</option>
                         <option value="ao_vivo">Ao vivo</option>
                         <option value="finalizado">Finalizado</option>
                      </select>
                    </div>
                    <div className="form-group">
                      <label>Partida / Data</label>
                      <input type="datetime-local" value={formData.match_date} onChange={e => setFormData({...formData, match_date: e.target.value})} />
                    </div>
                    {groupUnit === 'night' && (
                      <div className="form-group">
                        <label>Noite</label>
                        <input
                          type="text"
                          value={(parseRoundInput(formData.round) || 0) >= 1000 ? '' : formData.night}
                          disabled={(parseRoundInput(formData.round) || 0) >= 1000}
                          required={(parseRoundInput(formData.round) || 0) < 1000}
                          onChange={e => {
                            const nextNight = e.target.value;
                            setFormData(prev => {
                              const nextNightNum = parseNightInput(nextNight);
                              return {
                                ...prev,
                                night: nextNight,
                                round: nextNightNum ? String(nextNightNum) : prev.round,
                              };
                            });
                          }}
                        />
                      </div>
                    )}
                    {groupUnit === 'round' && (parseRoundInput(formData.round) || 0) < 1000 && (
                      <div className="form-group">
                        <label>Rodada (grupos)</label>
                        <input
                          type="text"
                          value={formData.round}
                          onChange={(e) => setFormData((prev) => ({ ...prev, round: e.target.value }))}
                        />
                      </div>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: '1rem' }}>
                    <button className="btn-save" onClick={() => handleUpdateMatch(match.id, formData)}><Save size={16} /> Salvar Alterações</button>
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
    </div>
  );
};

const LiveMatchControl: React.FC<{ match: Match }> = ({ match }) => {
  const queryClient = useQueryClient();
  const { players: playersA } = usePlayers(match.team_a_id);
  const { players: playersB } = usePlayers(match.team_b_id);
  const { events, refresh: refreshEvents } = useMatchEvents(match.id);
  const { confirm: confirmAction, ConfirmElement } = useConfirm();
  const [eventType, setEventType] = useState<'gol' | 'amarelo' | 'vermelho' | 'substituicao' | 'comentario' | 'momento'>('gol');
  const [goalType, setGoalType] = useState<'normal' | 'penalti' | 'contra'>('normal');
  const [selectedMinute, setSelectedMinute] = useState<number>(0);
  const [assistantId, setAssistantId] = useState<string>('');
  const [playerOutId, setPlayerOutId] = useState<string>('');
  const [commentaryText, setCommentaryText] = useState('');
  const [mvpData, setMvpData] = useState({
    player_id: match.match_mvp_player_id || '',
    description: match.match_mvp_description || '',
  });

  type EndMatchMvpChoice =
    | { action: 'cancel' }
    | { action: 'save'; player_id: string | null; description: string };

  const [endMatchMvpOpen, setEndMatchMvpOpen] = useState(false);
  const endMatchMvpResolveRef = useRef<null | ((choice: EndMatchMvpChoice) => void)>(null);
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [editEventMinute, setEditEventMinute] = useState<number>(0);
  const [isSwapped, setIsSwapped] = useState(false);

  const vibrate = (pattern: number | number[] = 50) => {
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate(pattern);
    }
  };

  const updateOptimisticMatch = (updates: Partial<Match>) => {
    // Atualiza qualquer cache de `useMatches()` (chaves: ['matches', division, limit])
    // para refletir mudanças imediatas no painel.
    queryClient.setQueriesData({ queryKey: ['matches'] }, (old) => {
      if (!Array.isArray(old)) return old;
      return (old as Match[]).map((m) => (m.id === match.id ? { ...m, ...updates } : m));
    });
  };

  const suggestMvpFromEvents = useCallback(() => {
    const stats: Record<string, { participations: number; goals: number; assists: number; firstEvent: number }> = {};

    (events || []).forEach((ev) => {
      if (ev.event_type !== 'gol') return;

      const goalType = (ev as any)?.metadata?.goal_type;
      const isOwnGoal = goalType === 'contra' || Boolean(ev.commentary && String(ev.commentary).toUpperCase().includes('[CONTRA]'));

      if (ev.player_id && !isOwnGoal) {
        if (!stats[ev.player_id]) stats[ev.player_id] = { participations: 0, goals: 0, assists: 0, firstEvent: ev.minute || 9999 };
        stats[ev.player_id].participations += 1;
        stats[ev.player_id].goals += 1;
        stats[ev.player_id].firstEvent = Math.min(stats[ev.player_id].firstEvent, ev.minute || 9999);
      }

      if (ev.assistant_id && !isOwnGoal) {
        if (!stats[ev.assistant_id]) stats[ev.assistant_id] = { participations: 0, goals: 0, assists: 0, firstEvent: ev.minute || 9999 };
        stats[ev.assistant_id].participations += 1;
        stats[ev.assistant_id].assists += 1;
        stats[ev.assistant_id].firstEvent = Math.min(stats[ev.assistant_id].firstEvent, ev.minute || 9999);
      }
    });

    const sorted = Object.entries(stats)
      .map(([playerId, s]) => ({ playerId, ...s }))
      .sort((a, b) => {
        if (b.participations !== a.participations) return b.participations - a.participations;
        if (b.goals !== a.goals) return b.goals - a.goals;
        if (b.assists !== a.assists) return b.assists - a.assists;
        return a.firstEvent - b.firstEvent;
      });

    if (sorted.length === 0) return null;
    const best = sorted[0];
    return {
      player_id: best.playerId,
      description: `${best.participations} participações (${best.goals}G, ${best.assists}A)`,
    };
  }, [events]);

  const promptEndMatchMvp = useCallback((initial: { player_id: string; description: string }) => {
    setMvpData(initial);
    setEndMatchMvpOpen(true);
    return new Promise<EndMatchMvpChoice>((resolve) => {
      endMatchMvpResolveRef.current = resolve;
    });
  }, []);

  const closeEndMatchMvp = useCallback((choice: EndMatchMvpChoice) => {
    setEndMatchMvpOpen(false);
    const resolve = endMatchMvpResolveRef.current;
    endMatchMvpResolveRef.current = null;
    resolve?.(choice);
  }, []);

  // --- Cronômetro Sincronizado (DB) ---
  const [seconds, setSeconds] = useState(0);
  const isActive = match.is_timer_running;
  const hasStarted = Boolean(match.timer_started_at) || match.timer_offset_seconds > 0;

  // Sincronizar segundos locais com o estado do banco (com Fresh Fetch no mount)
  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | null = null;
    
    const syncTime = async (isInitial = false) => {
      let currentMatch = match;
      
      // No mount inicial, buscamos o estado mais fresco do DB para evitar cache estático
      if (isInitial) {
        const { data } = await supabase.from('matches').select('*').eq('id', match.id).single();
        if (data) currentMatch = data;
      }

      if (currentMatch.is_timer_running && currentMatch.timer_started_at) {
        const start = new Date(currentMatch.timer_started_at).getTime();
        const now = Date.now();
        const diff = Math.floor((now - start) / 1000);
        setSeconds(currentMatch.timer_offset_seconds + diff);
      } else {
        setSeconds(currentMatch.timer_offset_seconds || 0);
      }
    };

    syncTime(true); // Inicial e Fresco

    if (match.is_timer_running) {
      interval = setInterval(() => syncTime(false), 1000);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [match.is_timer_running, match.timer_started_at, match.timer_offset_seconds, match.id]);

  const handlePauseTimer = async (isTechnical = false) => {
    try {
      const start = match.timer_started_at ? new Date(match.timer_started_at).getTime() : Date.now();
      const now = Date.now();
      const diff = Math.floor((now - start) / 1000);
      const newOffset = match.timer_offset_seconds + diff;

      // Se já estava pausado, não atualizamos o offset novamente para não acumular erro
      const finalOffset = match.is_timer_running ? newOffset : match.timer_offset_seconds;

      updateOptimisticMatch({ is_timer_running: false, timer_started_at: null, timer_offset_seconds: finalOffset });
      const { error } = await supabase.from('matches').update({
        is_timer_running: false,
        timer_started_at: null,
        timer_offset_seconds: finalOffset
      }).eq('id', match.id);
      
      if (error) throw error;

      vibrate(60);
      if (isTechnical) {
        await supabase.from('match_events').insert({
          match_id: match.id,
          event_type: 'comentario',
          minute: Math.floor(finalOffset / 60),
          author_name: 'Jogo',
          commentary: '⏱️ Pausa Técnica',
          player_id: null
        });
        toast.success('Pausa Técnica registrada');
      } else {
        toast.success('Tempo pausado');
      }
    } catch (err: unknown) {
      toast.error('Erro ao pausar cronômetro');
    }
  };

  const handleStartTimer = async () => {
    try {
      const nowStr = new Date().toISOString();
      // Atualiza UI imediatamente (evita "segundos passando" mas status/placar não mudando)
      updateOptimisticMatch({ is_timer_running: true, timer_started_at: nowStr, status: 'ao_vivo' });

      const { error } = await supabase.from('matches').update({
        is_timer_running: true,
        timer_started_at: nowStr,
        status: 'ao_vivo'
      }).eq('id', match.id);

      if (error) throw error;

      await supabase.from('match_events').insert({
        match_id: match.id,
        event_type: 'comentario',
        minute: Math.max(1, Math.floor(match.timer_offset_seconds / 60) || 1),
        author_name: 'Jogo',
        commentary: '▶️ Início de Jogo',
        player_id: null
      });

      toast.success('Partida iniciada');
      refreshEvents();
    } catch (err: unknown) {
      toast.error('Erro ao iniciar partida');
    }
  };

  const handleIntervalo = async () => {
    try {
      const start = match.timer_started_at ? new Date(match.timer_started_at).getTime() : Date.now();
      const now = Date.now();
      const diff = Math.floor((now - start) / 1000);
      const newOffset = match.timer_offset_seconds + diff;

      updateOptimisticMatch({ is_timer_running: false, timer_started_at: null, timer_offset_seconds: newOffset });
      await supabase.from('matches').update({
        is_timer_running: false,
        timer_started_at: null,
        timer_offset_seconds: newOffset
      }).eq('id', match.id);

      await supabase.from('match_events').insert({
        match_id: match.id,
        event_type: 'comentario',
        minute: Math.floor(newOffset / 60),
        author_name: 'Jogo',
        commentary: '🏁 Fim do 1º Tempo',
        player_id: null
      });

      vibrate(100);
      toast.success('Intervalo Iniciado');
      refreshEvents();
    } catch (err: unknown) {
      toast.error('Erro ao iniciar intervalo');
    }
  };


  const handleRetomar = async () => {
    try {
      // Verificar se o último evento foi fim do 1º tempo para mudar a mensagem
      const isPostInterval = events.some(e => e.event_type === 'comentario' && e.commentary?.includes('Fim do 1º Tempo'));
      const alreadyResumedStage2 = events.some(e => e.event_type === 'comentario' && e.commentary?.includes('Início do 2º Tempo'));

      const nowStr = new Date().toISOString();
      updateOptimisticMatch({ is_timer_running: true, timer_started_at: nowStr });
      const { error } = await supabase.from('matches').update({
        is_timer_running: true,
        timer_started_at: nowStr
      }).eq('id', match.id);

      vibrate(60);
      if (error) throw error;

      if (isPostInterval && !alreadyResumedStage2) {
        await supabase.from('match_events').insert({
          match_id: match.id,
          event_type: 'comentario',
          minute: Math.floor(match.timer_offset_seconds / 60),
          author_name: 'Jogo',
          commentary: '⚽ Início do 2º Tempo',
          player_id: null
        });
        toast.success('Segundo tempo iniciado!');
      } else {
        toast.success('Cronômetro retomado');
      }
    } catch (err: unknown) {
      toast.error('Erro ao retomar cronômetro');
    }
  };

  const handleEndMatch = async () => {
    if (!(await confirmAction({
      title: 'Finalizar Partida',
      description: 'O cronômetro será pausado e a partida será encerrada.',
      variant: 'warning'
    }))) return;
    if (!(await confirmAction({
      title: 'Confirmar Fim de Jogo',
      description: 'Esta acao encerra a partida e deve ser usada somente ao final. Deseja continuar?',
      variant: 'warning'
    }))) return;

    // Escolha do craque do jogo (simples) – aparece somente aqui.
    let chosenMvp: { player_id: string | null; description: string } | null = null;
    if (!match.match_mvp_player_id) {
      const suggested = suggestMvpFromEvents();
      const initial = suggested ?? { player_id: '', description: '' };
      const choice = await promptEndMatchMvp(initial);
      if (choice.action === 'cancel') return;
      chosenMvp = { player_id: choice.player_id, description: choice.description };
    }

    try {
      const start = match.timer_started_at ? new Date(match.timer_started_at).getTime() : Date.now();
      const now = Date.now();
      const diff = Math.floor((now - start) / 1000);
      const newOffset = match.timer_offset_seconds + diff;
      const finalOffset = match.is_timer_running ? newOffset : match.timer_offset_seconds;

      const updates: Record<string, unknown> = {
        is_timer_running: false,
        timer_started_at: null,
        timer_offset_seconds: finalOffset,
        status: 'finalizado'
      };
      if (chosenMvp) {
        updates.match_mvp_player_id = chosenMvp.player_id;
        updates.match_mvp_description = chosenMvp.description;
      }

      const { error } = await supabase.from('matches').update(updates).eq('id', match.id);
      updateOptimisticMatch(updates as Partial<Match>);
      if (error) throw error;

      await supabase.from('match_events').insert({
        match_id: match.id,
        event_type: 'comentario',
        minute: Math.max(1, Math.floor(finalOffset / 60) || 1),
        author_name: 'Jogo',
        commentary: '🏁 Fim de Jogo',
        player_id: null
      });

      vibrate([100, 50, 100]);
      toast.success('Partida finalizada');
      refreshEvents();
    } catch (err: unknown) {
      toast.error('Erro ao finalizar partida');
    }
  };

  const formatTime = (s: number) => {
    const mins = Math.floor(s / 60);
    const secs = s % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // --- Escalação / Roster ---
  const [onFieldA, setOnFieldA] = useState<string[]>([]);
  const [onFieldB, setOnFieldB] = useState<string[]>([]);
  const rosterMatchIdRef = useRef<string | null>(null);

  const rosterKeyA = `copa_unasp_roster_onfield_v1_${match.id}_a`;
  const rosterKeyB = `copa_unasp_roster_onfield_v1_${match.id}_b`;

  const loadRoster = (key: string) => {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return [] as string[];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [] as string[];
      return parsed.filter((v) => typeof v === 'string' && v.length > 0) as string[];
    } catch {
      return [] as string[];
    }
  };

  const saveRoster = (key: string, ids: string[]) => {
    try {
      localStorage.setItem(key, JSON.stringify(ids));
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    if (rosterMatchIdRef.current !== match.id) {
      rosterMatchIdRef.current = match.id;
      setOnFieldA([]);
      setOnFieldB([]);
    }
  }, [match.id]);

  useEffect(() => {
    if ((playersA || []).length > 0 && onFieldA.length === 0) {
      const saved = loadRoster(rosterKeyA);
      const valid = saved.filter((id) => (playersA || []).some((p) => p.id === id));
      if (valid.length > 0) setOnFieldA(valid.slice(0, 5));
    }
    if ((playersB || []).length > 0 && onFieldB.length === 0) {
      const saved = loadRoster(rosterKeyB);
      const valid = saved.filter((id) => (playersB || []).some((p) => p.id === id));
      if (valid.length > 0) setOnFieldB(valid.slice(0, 5));
    }
  }, [playersA, playersB, onFieldA.length, onFieldB.length, rosterKeyA, rosterKeyB]);

  useEffect(() => {
    saveRoster(rosterKeyA, onFieldA);
  }, [rosterKeyA, onFieldA]);

  useEffect(() => {
    saveRoster(rosterKeyB, onFieldB);
  }, [rosterKeyB, onFieldB]);

  const normalizePosition = (value?: string | null) => (value || '').trim().toLowerCase();
  const isGoalkeeper = (p?: { position?: string | null }) => normalizePosition(p?.position) === 'goleiro';

  // Pre-jogo aqui significa: cronometro ainda nao iniciou (independente do status estar 'agendado' ou 'ao_vivo').
  // Isso garante que a escalação seja exigida antes do apito inicial.
  const isPreGame = match.status !== 'finalizado' && !hasStarted;

  const isSuspendedForNextMatch = (player?: { yellow_cards?: number | null; red_cards?: number | null; suspensions_served?: number | null }) => {
    if (!player) return false;
    const pending = getPendingSuspension({
      yellow_cards: player.yellow_cards ?? 0,
      red_cards: player.red_cards ?? 0,
      suspensions_served: player.suspensions_served ?? 0,
    });
    return pending.isSuspended && pending.pendingGames > 0;
  };

  const renderSuspendedChip = (player: { yellow_cards?: number | null; red_cards?: number | null; suspensions_served?: number | null }) => {
    if (!isSuspendedForNextMatch(player)) return null;
    return <span className="p-susp-chip">SUSPENSO</span>;
  };

  const computeLineupMeta = (roster: typeof playersA, ids: string[]) => {
    const selected = (roster || []).filter((p) => ids.includes(p.id));
    const goalkeepers = selected.filter(isGoalkeeper).length;
    return {
      selectedCount: selected.length,
      goalkeepers,
      ok: selected.length === 5 && goalkeepers === 1,
    };
  };

  const lineupMetaA = useMemo(() => computeLineupMeta(playersA, onFieldA), [playersA, onFieldA]);
  const lineupMetaB = useMemo(() => computeLineupMeta(playersB, onFieldB), [playersB, onFieldB]);

  const getLineupError = (teamName: string, roster: typeof playersA, ids: string[]) => {
    const list = roster || [];

    if (list.length < 5) {
      return `${teamName}: cadastre 5 atletas (4 linha + 1 goleiro) para iniciar.`;
    }

    if (!list.some(isGoalkeeper)) {
      return `${teamName}: cadastre 1 goleiro (posição = Goleiro) para iniciar.`;
    }

    // Regra de suspensao: 2 amarelos ou 1 vermelho => nao pode jogar o proximo jogo.
    // Antes de iniciar o jogo, bloqueamos qualquer suspenso na escalação.
    const suspendedSelected = list
      .filter((p) => ids.includes(p.id))
      .find((p) => isSuspendedForNextMatch(p));
    if (suspendedSelected) {
      return `${teamName}: ${suspendedSelected.name} está suspenso (2 amarelos ou 1 vermelho).`;
    }

    if (ids.length !== 5) {
      return `${teamName}: selecione 5 em campo (4 linha + 1 goleiro).`;
    }

    const selected = list.filter((p) => ids.includes(p.id));
    const goalkeepers = selected.filter(isGoalkeeper).length;
    if (goalkeepers !== 1) {
      return `${teamName}: precisa ter exatamente 1 goleiro em campo.`;
    }

    return null;
  };

  const startBlockReason = useMemo(() => {
    if (!isPreGame) return null;

    const errA = getLineupError(match.teams_a?.name || 'Equipe A', playersA, onFieldA);
    if (errA) return errA;

    const errB = getLineupError(match.teams_b?.name || 'Equipe B', playersB, onFieldB);
    if (errB) return errB;

    return null;
  }, [isPreGame, match.teams_a?.name, match.teams_b?.name, playersA, playersB, onFieldA, onFieldB]);

  const lineupAnchorRef = useRef<HTMLDivElement | null>(null);
  const [lineupNudge, setLineupNudge] = useState(false);

  const scrollToLineup = () => {
    lineupAnchorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setLineupNudge(true);
    window.setTimeout(() => setLineupNudge(false), 1200);
  };

  const handleStartTimerWithLineup = async () => {
    if (startBlockReason) {
      toast.error(`Escalação obrigatória: ${startBlockReason}`);
      scrollToLineup();
      return;
    }
    await handleStartTimer();
  };

  // Atalhos (Admin produtivo): Alt+1..6 troca tipo, Ctrl+Espaço inicia/pausa/retoma cronômetro
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
        if (isActive) handlePauseTimer(false); // Pausa normal via atalho
        else if (hasStarted) handleRetomar();
        else handleStartTimerWithLineup();
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
  }, [hasStarted, isActive]);

  const togglePlayerStatus = (playerId: string, team: 'a' | 'b') => {
    const roster = team === 'a' ? (playersA || []) : (playersB || []);
    const targetName = team === 'a' ? (match.teams_a?.name || 'Equipe A') : (match.teams_b?.name || 'Equipe B');
    const player = roster.find((p) => p.id === playerId);
    if (!player) {
      toast.error('Atleta inválido');
      return;
    }

    type ValidateRes = { ok: true; next: string[] } | { ok: false; reason: string };

    const validateNext = (prev: string[]): ValidateRes => {
      if (prev.includes(playerId)) {
        return { ok: true, next: prev.filter((id) => id !== playerId) };
      }

      if (isPreGame && isSuspendedForNextMatch(player)) {
        return { ok: false, reason: `${targetName}: ${player.name} está suspenso (2 amarelos ou 1 vermelho).` };
      }

      if (prev.length >= 5) {
        return { ok: false, reason: `${targetName}: máximo de 5 em campo.` };
      }

      const next = [...prev, playerId];
      const selected = roster.filter((p) => next.includes(p.id));
      const goalkeepers = selected.filter(isGoalkeeper).length;

      if (goalkeepers > 1) {
        return { ok: false, reason: `${targetName}: apenas 1 goleiro em campo.` };
      }

      if (next.length === 5 && goalkeepers !== 1) {
        return { ok: false, reason: `${targetName}: para iniciar, precisa fechar 5 com 1 goleiro.` };
      }

      return { ok: true, next };
    };

    if (team === 'a') {
      setOnFieldA((prev) => {
        const res = validateNext(prev);
        if (!res.ok) {
          toast.error(res.reason);
          return prev;
        }
        return res.next;
      });
    } else {
      setOnFieldB((prev) => {
        const res = validateNext(prev);
        if (!res.ok) {
          toast.error(res.reason);
          return prev;
        }
        return res.next;
      });
    }
  };

  const addEvent = async (playerId: string, team: 'a' | 'b', overrides?: { goalType?: string, assistantId?: string }) => {
    try {
      const eventMinute = selectedMinute > 0 ? selectedMinute : Math.floor(seconds / 60) || 1;
      const finalGoalType = overrides?.goalType || goalType;
      const finalAssistantId = overrides?.assistantId || assistantId;

      type InsertMatchEvent = {
        match_id: string;
        event_type: MatchEvent['event_type'];
        minute: number;
        player_id: string | null;
        assistant_id?: string | null;
        commentary?: string;
        metadata?: any;
      };

      const eventData: InsertMatchEvent = {
        match_id: match.id,
        event_type: eventType,
        minute: eventMinute,
        player_id: null,
      };

      if (eventType === 'comentario' || eventType === 'momento') {
        eventData.player_id = null;
      } else {
        eventData.player_id = playerId;
      }

      if (eventType === 'gol') {
        eventData.commentary = finalGoalType === 'normal' ? '' : `[${finalGoalType.toUpperCase()}]`;
        if (finalAssistantId) eventData.assistant_id = finalAssistantId;
        eventData.metadata = { goal_type: finalGoalType };
      }
      
      if (eventType === 'substituicao' && finalAssistantId) {
        eventData.assistant_id = finalAssistantId; // IN
        // Lógica de troca automática de status
        if (team === 'a') {
          setOnFieldA(prev => prev.filter(id => id !== playerId).concat(finalAssistantId));
        } else {
          setOnFieldB(prev => prev.filter(id => id !== playerId).concat(finalAssistantId));
        }
      }

      if (eventType === 'comentario' || eventType === 'momento') {
        eventData.commentary = commentaryText;
      }

      const { error } = await supabase.from('match_events').insert([eventData]);
      if (error) throw error;
      
      if (eventType === 'gol') {
        let newScore = {};
        if (finalGoalType === 'contra') {
          newScore = team === 'a' ? { team_b_score: (match.team_b_score || 0) + 1 } : { team_a_score: (match.team_a_score || 0) + 1 };
        } else {
          newScore = team === 'a' ? { team_a_score: (match.team_a_score || 0) + 1 } : { team_b_score: (match.team_b_score || 0) + 1 };
        }
        updateOptimisticMatch(newScore);
        await supabase.from('matches').update(newScore).eq('id', match.id);
      }
      
      if (eventType === 'gol' && finalGoalType !== 'contra') {
        const { data: p } = await supabase.from('players').select('goals_count').eq('id', playerId).single();
        await supabase.from('players').update({ goals_count: (p?.goals_count || 0) + 1 }).eq('id', playerId);
        
        if (finalAssistantId) {
          const { data: ast } = await supabase.from('players').select('assists').eq('id', finalAssistantId).single();
          await supabase.from('players').update({ assists: (ast?.assists || 0) + 1 }).eq('id', finalAssistantId);
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
        const teamName = team === 'a' ? (match.teams_a?.name || 'Equipe A') : (match.teams_b?.name || 'Equipe B');
        let title = '⚽ GOOOOOOL!';
        let body = `Gol de ${player?.name || 'alguém'} para o ${teamName}!`;
        
        if (finalGoalType === 'penalti') body = `[PÊNALTI] ${body}`;
        if (finalGoalType === 'contra') {
          title = '⚽ GOL CONTRA!';
          body = `Gol contra de ${player?.name}!`;
        }

        sendPushNotification(title, body, {
          url: '/central-da-partida',
          category: 'live',
          important: true,
          teamIds: [match.team_a_id, match.team_b_id],
        });
      } else if (eventType === 'amarelo' || eventType === 'vermelho') {
        const player = [...playersA, ...playersB].find(p => p.id === playerId);
        const teamName = team === 'a' ? (match.teams_a?.name || 'Equipe A') : (match.teams_b?.name || 'Equipe B');
        sendPushNotification(
          eventType === 'amarelo' ? '🟨 Cartão Amarelo' : '🟥 Cartão Vermelho',
          `${player?.name} (${teamName}) ${eventMinute}'`,
          {
            url: '/central-da-partida',
            category: 'live',
            important: eventType === 'vermelho',
            teamIds: [match.team_a_id, match.team_b_id],
          }
        );
      } else if (eventType === 'substituicao') {
        const pOut = [...playersA, ...playersB].find(p => p.id === playerId);
        const pIn = [...playersA, ...playersB].find(p => p.id === assistantId);
        const teamName = team === 'a' ? (match.teams_a?.name || 'Equipe A') : (match.teams_b?.name || 'Equipe B');
        sendPushNotification(
          '🔄 Substituição',
          `${teamName}: Sai ${pOut?.name}, Entra ${pIn?.name}`,
          {
            url: '/central-da-partida',
            category: 'live',
            teamIds: [match.team_a_id, match.team_b_id],
          }
        );
      } else if (eventType === 'comentario') {
        sendPushNotification('📝 Atualização', commentaryText, {
          url: '/central-da-partida',
          category: 'live',
          teamIds: [match.team_a_id, match.team_b_id],
        });
      } else if (eventType === 'momento') {
        sendPushNotification('🔥 Momento da Partida', commentaryText, {
          url: '/central-da-partida',
          category: 'live',
          important: true,
          teamIds: [match.team_a_id, match.team_b_id],
        });
      }
      
      // Feedback visual rápido
      toast.success('Evento registrado!');
    } catch (err: unknown) {
      toast.error(getErrorMessage(err, 'Erro ao registrar evento'));
    }
  };

  const removeEvent = async (event: MatchEvent) => {
    if (!confirm('Deseja realmente excluir este lance? Isso reverterá placares e estatísticas.')) return;

    try {
      if (event.event_type === 'gol') {
        if (!event.player_id) throw new Error('Evento de gol sem jogador vinculado');

        const isOwnGoal = typeof event.commentary === 'string' && event.commentary.toUpperCase().includes('[CONTRA]');
        const playerIsTeamA = playersA.some(p => p.id === event.player_id);
        const creditedTeamIsA = isOwnGoal ? !playerIsTeamA : playerIsTeamA;

        const newScore = creditedTeamIsA
          ? { team_a_score: Math.max(0, match.team_a_score - 1) }
          : { team_b_score: Math.max(0, match.team_b_score - 1) };

        updateOptimisticMatch(newScore);
        await supabase.from('matches').update(newScore).eq('id', match.id);

        // Gol contra não incrementa `goals_count` (e nem assistência) — não reverte.
        if (!isOwnGoal) {
          const { data: p } = await supabase.from('players').select('goals_count').eq('id', event.player_id).single();
          await supabase
            .from('players')
            .update({ goals_count: Math.max(0, (p?.goals_count || 0) - 1) })
            .eq('id', event.player_id);

          if (event.assistant_id) {
            const { data: ast } = await supabase.from('players').select('assists').eq('id', event.assistant_id).single();
            await supabase
              .from('players')
              .update({ assists: Math.max(0, (ast?.assists || 0) - 1) })
              .eq('id', event.assistant_id);
          }
        }
      }

      if (event.event_type === 'amarelo') {
        if (!event.player_id) throw new Error('Evento de cartão sem jogador vinculado');
        const { data: p } = await supabase.from('players').select('yellow_cards').eq('id', event.player_id).single();
        await supabase
          .from('players')
          .update({ yellow_cards: Math.max(0, (p?.yellow_cards || 0) - 1) })
          .eq('id', event.player_id);
      } else if (event.event_type === 'vermelho') {
        if (!event.player_id) throw new Error('Evento de cartão sem jogador vinculado');
        const { data: p } = await supabase.from('players').select('red_cards').eq('id', event.player_id).single();
        await supabase
          .from('players')
          .update({ red_cards: Math.max(0, (p?.red_cards || 0) - 1) })
          .eq('id', event.player_id);
      }

      await supabase.from('match_events').delete().eq('id', event.id);
      refreshEvents();
      toast.success('Evento removido e revertido.');
    } catch (err: unknown) {
      toast.error(getErrorMessage(err, 'Erro ao remover evento'));
    }
  };

  const undoLastEvent = () => {
    if (events.length === 0) return;
    vibrate(40);
    const lastEvent = events[0];
    removeEvent(lastEvent);
  };

  const [goalWizard, setGoalWizard] = useState<{ team: 'a' | 'b', open: boolean, pId?: string }>({ team: 'a', open: false });

  const handleManualScore = async (team: 'a' | 'b', increment: number) => {
    if (increment > 0) {
      setGoalWizard({ team, open: true });
      setEventType('gol'); // Pré-selecionar gol
    } else {
      try {
        const currentScore = team === 'a' ? (match.team_a_score || 0) : (match.team_b_score || 0);
        const newScoreValue = Math.max(0, currentScore + increment);
        const updateData = team === 'a' ? { team_a_score: newScoreValue } : { team_b_score: newScoreValue };

        updateOptimisticMatch(updateData);
        await supabase.from('matches').update(updateData).eq('id', match.id);
        vibrate(40);
        toast.success(`Placar ${team === 'a' ? 'A' : 'B'} ajustado!`);
      } catch (err: unknown) {
        toast.error('Erro ao ajustar placar');
      }
    }
  };

  const handleGoalWizardSubmit = async (playerId: string, goalTypeVal: 'normal' | 'penalti' | 'contra', assistantIdVal: string) => {
    try {
      await addEvent(playerId, goalWizard.team, { goalType: goalTypeVal, assistantId: assistantIdVal });
      setGoalWizard({ ...goalWizard, open: false });
    } catch (err) {
      console.error(err);
    }
  };

  const finalStats = useMemo(() => {
    const stats = {
      a: {
        goals: match.team_a_score || 0,
        assists: 0,
        yellows: 0,
        reds: 0,
        ownGoals: 0
      },
      b: {
        goals: match.team_b_score || 0,
        assists: 0,
        yellows: 0,
        reds: 0,
        ownGoals: 0
      }
    };

    const teamByPlayer = new Map<string, 'a' | 'b'>();
    (playersA || []).forEach(player => teamByPlayer.set(player.id, 'a'));
    (playersB || []).forEach(player => teamByPlayer.set(player.id, 'b'));

    (events || []).forEach(event => {
      if (event.event_type === 'gol') {
        if (event.commentary?.includes('[CONTRA]') && event.player_id) {
          const team = teamByPlayer.get(event.player_id);
          if (team) stats[team].ownGoals += 1;
        }
        if (event.assistant_id) {
          const team = teamByPlayer.get(event.assistant_id);
          if (team) stats[team].assists += 1;
        }
      }

      if (event.event_type === 'amarelo' && event.player_id) {
        const team = teamByPlayer.get(event.player_id);
        if (team) stats[team].yellows += 1;
      }

      if (event.event_type === 'vermelho' && event.player_id) {
        const team = teamByPlayer.get(event.player_id);
        if (team) stats[team].reds += 1;
      }
    });

    return stats;
  }, [events, match.team_a_score, match.team_b_score, playersA, playersB]);

  const liveStatus = useMemo(() => {
    if (match.status === 'finalizado') return { label: 'Finalizado', tone: 'final' };
    if (isActive) return { label: 'Em jogo', tone: 'live' };
    const endedFirstHalf = events.some(e => e.event_type === 'comentario' && e.commentary?.includes('Fim do 1º Tempo'));
    const startedSecondHalf = events.some(e => e.event_type === 'comentario' && e.commentary?.includes('Início do 2º Tempo'));
    if (endedFirstHalf && !startedSecondHalf) return { label: 'Intervalo', tone: 'break' };
    if (hasStarted) return { label: 'Pausado', tone: 'paused' };
    return { label: 'Aguardando', tone: 'idle' };
  }, [events, hasStarted, isActive, match.status]);

  const isPostInterval = useMemo(() =>
    events.some(e => e.event_type === 'comentario' && e.commentary?.includes('Fim do 1º Tempo')),
  [events]);

  const alreadyResumedStage2 = useMemo(() =>
    events.some(e => e.event_type === 'comentario' && e.commentary?.includes('Início do 2º Tempo')),
  [events]);

  const formatEventSummary = (event?: MatchEvent) => {
    if (!event) return 'Nenhum lance ainda';
    if (event.event_type === 'gol') {
      const suffix = event.commentary?.includes('[CONTRA]')
        ? ' (contra)'
        : event.commentary?.includes('[PENALTI]')
          ? ' (penalti)'
          : '';
      return `Gol ${event.players?.name || ''}${suffix}`.trim();
    }
    if (event.event_type === 'amarelo') return `Cartao amarelo ${event.players?.name || ''}`.trim();
    if (event.event_type === 'vermelho') return `Cartao vermelho ${event.players?.name || ''}`.trim();
    if (event.event_type === 'substituicao') return `Substituicao ${event.players?.name || ''}`.trim();
    if (event.event_type === 'momento') return event.commentary || 'Momento da partida';
    if (event.event_type === 'comentario') return event.commentary || 'Comentario';
    return event.event_type;
  };

  const lastEvent = events[0];
  const lastEventSummary = formatEventSummary(lastEvent);

  return (
    <div className="live-event-panel-wrapper">
      {endMatchMvpOpen && (
        <div className="confirm-overlay">
          <div className="confirm-modal glass mvp-auto-modal" onClick={(e) => e.stopPropagation()}>
            <h3 className="confirm-title">⭐ Craque do Jogo</h3>
            <p className="confirm-desc">Selecione o craque antes de finalizar a partida.</p>

            <div className="form-grid" style={{ width: '100%' }}>
              <div className="form-group">
                <label>Jogador</label>
                <select
                  className="mvp-player-select"
                  value={mvpData.player_id}
                  onChange={(e) => setMvpData((prev) => ({ ...prev, player_id: e.target.value }))}
                >
                  <option value="">Selecione...</option>
                  {playersA.length > 0 && (
                    <optgroup label={match.teams_a?.name}>
                      {(playersA || []).map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.number}. {p.name}
                        </option>
                      ))}
                    </optgroup>
                  )}
                  {playersB.length > 0 && (
                    <optgroup label={match.teams_b?.name}>
                      {(playersB || []).map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.number}. {p.name}
                        </option>
                      ))}
                    </optgroup>
                  )}
                </select>
              </div>

              <div className="form-group">
                <label>Observação (opcional)</label>
                <input
                  type="text"
                  className="mvp-desc-input"
                  placeholder="Ex: 2 gols"
                  value={mvpData.description}
                  onChange={(e) => setMvpData((prev) => ({ ...prev, description: e.target.value }))}
                />
              </div>
            </div>

            <div className="confirm-actions" style={{ width: '100%' }}>
              <button className="btn-cancel" onClick={() => closeEndMatchMvp({ action: 'cancel' })}>
                Cancelar
              </button>
              <button className="btn-cancel" onClick={() => closeEndMatchMvp({ action: 'save', player_id: null, description: '' })}>
                Pular
              </button>
              <button
                className="btn-save"
                disabled={!mvpData.player_id}
                onClick={() =>
                  closeEndMatchMvp({
                    action: 'save',
                    player_id: mvpData.player_id || null,
                    description: mvpData.description,
                  })
                }
              >
                Salvar e finalizar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Goal Wizard Modal */}
      <AnimatePresence>
        {goalWizard.open && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="modal-overlay-admin"
            onClick={() => setGoalWizard({ ...goalWizard, open: false })}
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className="goal-wizard-modal glass"
              onClick={e => e.stopPropagation()}
            >
              <div className="wizard-header">
                <h3>⚽ Registrar Gol - {goalWizard.team === 'a' ? (match.teams_a?.name) : (match.teams_b?.name)}</h3>
                <button className="btn-close-wizard" onClick={() => setGoalWizard({ ...goalWizard, open: false })}>×</button>
              </div>
              
              <div className="wizard-body">
                <div className="form-group">
                  <label>Quem fez o gol?</label>
                  <div className="player-grid-wizard">
                    {((goalWizard.team === 'a' ? playersA : playersB) || []).map(p => (
                      <button 
                        key={p.id} 
                        className={`p-wizard-btn ${onFieldA.includes(p.id) || onFieldB.includes(p.id) ? 'on-field' : ''} ${goalWizard.pId === p.id ? 'pre-selected' : ''}`}
                        onClick={() => handleGoalWizardSubmit(p.id, goalType, assistantId)}
                      >
                        <span className="p-num">{p.number}</span>
                        <span className="p-name">{p.name}</span>
                        {goalWizard.pId === p.id && <Zap size={10} style={{ color: 'var(--secondary)' }} />}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="wizard-footer-controls">
                  <div className="form-group">
                    <label>Assistência (Opcional)</label>
                    <select value={assistantId} onChange={e => setAssistantId(e.target.value)}>
                      <option value="">Ninguém</option>
                      {((goalWizard.team === 'a' ? playersA : playersB) || [])
                        .map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </div>
                  
                  <div className="form-group">
                    <label>Tipo</label>
                    <div className="goal-type-btns">
                      <button className={goalType === 'normal' ? 'active' : ''} onClick={() => setGoalType('normal')}>Normal</button>
                      <button className={goalType === 'penalti' ? 'active' : ''} onClick={() => setGoalType('penalti')}>Pênalti</button>
                      <button className={goalType === 'contra' ? 'active red' : ''} onClick={() => setGoalType('contra')}>Contra</button>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Placar Profissional Centralizado */}
      <div className={`admin-scoreboard-pro glass ${isSwapped ? 'is-swapped' : ''}`}>
        <button 
          className="btn-swap-sides" 
          onClick={() => { setIsSwapped(!isSwapped); vibrate(30); }}
          title="Inverter Lados (Campo Visual)"
        >
          <RotateCcw size={14} style={{ transform: isSwapped ? 'scaleX(-1)' : 'none' }} />
        </button>
        <div className="sb-pro-main">
          {/* Equipe A */}
          <div className="sb-pro-team team-a">
             <div className="sb-pro-score-box">
                <button className="score-adjust-btn minus" onClick={() => handleManualScore('a', -1)}>-</button>
                <div className="score-number-display">
                  <AnimatePresence mode="wait">
                    <motion.span
                      key={match.team_a_score}
                      initial={{ y: 20, opacity: 0 }}
                      animate={{ y: 0, opacity: 1 }}
                      exit={{ y: -20, opacity: 0 }}
                      transition={{ duration: 0.3, ease: "backOut" }}
                    >
                      {match.team_a_score}
                    </motion.span>
                  </AnimatePresence>
                </div>
                <button className="score-adjust-btn plus" onClick={() => handleManualScore('a', 1)}>+</button>
             </div>
             <span className="sb-pro-team-name">{match.teams_a?.name || 'Equipe A'}</span>
          </div>

          {/* Centro: Cronômetro e VS */}
          <div className="sb-pro-center">
             <div className="sb-pro-timer-display glass">
                <span className={isActive ? 'timer-running' : ''}>{formatTime(seconds)}</span>
             </div>
             <div className={`live-status-badge ${liveStatus.tone}`}>
              {liveStatus.label}
             </div>
              <div className="sb-pro-timer-controls">
                  {!match.is_timer_running ? (
                    <button
                      className="timer-btn start"
                      onClick={hasStarted ? handleRetomar : handleStartTimerWithLineup}
                      disabled={match.status === 'finalizado'}
                      title={!hasStarted && startBlockReason ? startBlockReason : undefined}
                    >
                      <Play size={16} /> {isPostInterval && !alreadyResumedStage2 ? 'INICIAR 2º TEMPO' : (hasStarted ? 'RETOMAR' : 'COMEÇAR')}
                    </button>
                  ) : (
                    <button className="timer-btn pause" onClick={() => handlePauseTimer(false)}>
                      <Pause size={16} /> PARAR TEMPO
                    </button>
                  )}

                  {/* Fim do 1º Tempo: Visível se o jogo está AO VIVO e ainda não teve o comentário de fim de 1º tempo */}
                  {match.status === 'ao_vivo' && !events.some(e => e.event_type === 'comentario' && e.commentary?.includes('Fim do 1º Tempo')) && (
                    <button className="timer-btn interval" onClick={handleIntervalo}>
                      <Coffee size={16} /> FIM DO 1º TEMPO
                    </button>
                  )}

                  <button className="timer-btn end" onClick={handleEndMatch} disabled={match.status === 'finalizado'}>
                    <Flag size={16} /> FIM DE JOGO
                  </button>
              </div>

              {!hasStarted && startBlockReason && (
                <div className="lineup-required-banner" role="alert">
                  <div className="lineup-required-text">
                    <strong>Defina os titulares</strong>
                    <span>{startBlockReason}</span>
                  </div>
                  <button type="button" className="lineup-required-action" onClick={scrollToLineup}>
                    Escolher titulares
                  </button>
                </div>
              )}

              <div className="live-shortcuts-tip">
                Ctrl+Espaco: iniciar/pausar/retomar | Alt+1..6: tipos de evento
              </div>
          </div>

          {/* Equipe B */}
          <div className="sb-pro-team team-b">
             <div className="sb-pro-score-box">
                <button className="score-adjust-btn minus" onClick={() => handleManualScore('b', -1)}>-</button>
                <div className="score-number-display">
                  <AnimatePresence mode="wait">
                    <motion.span
                      key={match.team_b_score}
                      initial={{ y: 20, opacity: 0 }}
                      animate={{ y: 0, opacity: 1 }}
                      exit={{ y: -20, opacity: 0 }}
                      transition={{ duration: 0.3, ease: "backOut" }}
                    >
                      {match.team_b_score}
                    </motion.span>
                  </AnimatePresence>
                </div>
                <button className="score-adjust-btn plus" onClick={() => handleManualScore('b', 1)}>+</button>
             </div>
             <span className="sb-pro-team-name">{match.teams_b?.name || 'Equipe B'}</span>
          </div>
        </div>
        
        <div className="sb-pro-footer">
           <button className="btn-undo-last-pro" onClick={undoLastEvent} disabled={events.length === 0}>
             <RotateCcw size={14} />
             <span className="btn-undo-text">
               <span className="btn-undo-title">Desfazer ultima acao</span>
               <span className="btn-undo-preview">{lastEventSummary}</span>
             </span>
           </button>
        </div>
      </div>

      {match.status === 'finalizado' && (
        <div className="live-mini-summary glass">
          <div className="live-mini-header">
            <h6>Resumo final</h6>
            <span className="live-mini-score">{match.team_a_score} x {match.team_b_score}</span>
          </div>
          <div className="live-mini-grid">
            <div className="live-mini-col">
              <span className="live-mini-team">{match.teams_a?.name || 'Equipe A'}</span>
              <div className="live-mini-row"><span>Gols</span><strong>{finalStats.a.goals}</strong></div>
              <div className="live-mini-row"><span>Assistencias</span><strong>{finalStats.a.assists}</strong></div>
              <div className="live-mini-row"><span>Amarelos</span><strong>{finalStats.a.yellows}</strong></div>
              <div className="live-mini-row"><span>Vermelhos</span><strong>{finalStats.a.reds}</strong></div>
              <div className="live-mini-row"><span>Gols contra</span><strong>{finalStats.a.ownGoals}</strong></div>
            </div>
            <div className="live-mini-col">
              <span className="live-mini-team">{match.teams_b?.name || 'Equipe B'}</span>
              <div className="live-mini-row"><span>Gols</span><strong>{finalStats.b.goals}</strong></div>
              <div className="live-mini-row"><span>Assistencias</span><strong>{finalStats.b.assists}</strong></div>
              <div className="live-mini-row"><span>Amarelos</span><strong>{finalStats.b.yellows}</strong></div>
              <div className="live-mini-row"><span>Vermelhos</span><strong>{finalStats.b.reds}</strong></div>
              <div className="live-mini-row"><span>Gols contra</span><strong>{finalStats.b.ownGoals}</strong></div>
            </div>
          </div>
        </div>
      )}


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
              {[...(playersA || []), ...(playersB || [])].map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
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
          <div className="substitution-grid-admin">
            {/* Equipe A */}
            <div className="sub-team-box glass">
              <span className="sub-team-title">{match.teams_a?.name}</span>
              <div className="sub-controls">
                <div className="form-group-mini">
                  <label>SAI (OUT)</label>
                  <select value={playerOutId} onChange={e => { setPlayerOutId(e.target.value); setAssistantId(''); }}>
                    <option value="">Selecione...</option>
                    {(playersA || []).filter(p => onFieldA.includes(p.id)).map(p => <option key={`out-a-${p.id}`} value={p.id}>{p.number}. {p.name}</option>)}
                  </select>
                </div>
                <div className="form-group-mini">
                  <label>ENTRA (IN)</label>
                  <select value={assistantId} onChange={e => setAssistantId(e.target.value)}>
                    <option value="">Selecione...</option>
                    {(playersA || []).filter(p => !onFieldA.includes(p.id)).map(p => <option key={`in-a-${p.id}`} value={p.id}>{p.number}. {p.name}</option>)}
                  </select>
                </div>
                <button 
                  className="btn-confirm-sub" 
                  onClick={() => addEvent(playerOutId, 'a')}
                  disabled={!playerOutId || !assistantId}
                >
                  Substituir
                </button>
              </div>
            </div>

            {/* Equipe B */}
            <div className="sub-team-box glass">
              <span className="sub-team-title">{match.teams_b?.name}</span>
              <div className="sub-controls">
                <div className="form-group-mini">
                  <label>SAI (OUT)</label>
                  <select value={playerOutId} onChange={e => { setPlayerOutId(e.target.value); setAssistantId(''); }}>
                    <option value="">Selecione...</option>
                    {(playersB || []).filter(p => onFieldB.includes(p.id)).map(p => <option key={`out-b-${p.id}`} value={p.id}>{p.number}. {p.name}</option>)}
                  </select>
                </div>
                <div className="form-group-mini">
                  <label>ENTRA (IN)</label>
                  <select value={assistantId} onChange={e => setAssistantId(e.target.value)}>
                    <option value="">Selecione...</option>
                    {(playersB || []).filter(p => !onFieldB.includes(p.id)).map(p => <option key={`in-b-${p.id}`} value={p.id}>{p.number}. {p.name}</option>)}
                  </select>
                </div>
                <button 
                  className="btn-confirm-sub btn-team-b" 
                  onClick={() => addEvent(playerOutId, 'b')}
                  disabled={!playerOutId || !assistantId}
                >
                  Substituir
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
        
      <div
        ref={lineupAnchorRef}
        className={`teams-lanes event-selector-active-${eventType} ${lineupNudge ? 'lineup-nudge' : ''}`}
      >
        <div className="lane">
          <h5>{match.teams_a?.name || 'Equipe A'}</h5>
          
          <div className="roster-section">
            <span className="roster-label"><Zap size={12} /> Em Campo ({lineupMetaA.selectedCount}/5 • GK {lineupMetaA.goalkeepers}/1)</span>
            <div className="admin-player-btns">
              {(playersA || []).filter(p => onFieldA.includes(p.id)).map(p => (
                <button 
                  key={p.id} 
                  onClick={() => {
                    if (isPreGame) {
                      togglePlayerStatus(p.id, 'a');
                      return;
                    }
                    if (eventType === 'gol') setGoalWizard({ team: 'a', open: true, pId: p.id });
                    else addEvent(p.id, 'a');
                  }} 
                  className="p-btn active-field"
                >
                  <span className="p-num">{p.number}</span>
                  <span className="p-name">{p.name.split(' ')[0]}</span>
                  {renderSuspendedChip(p)}
                  <ChevronDown size={10} className="btn-status-toggle" onClick={(e) => { e.stopPropagation(); togglePlayerStatus(p.id, 'a'); }} />
                </button>
              ))}
            </div>
          </div>

          <div className="roster-section">
            <span className="roster-label"><Users size={12} /> Banco</span>
            <div className="admin-player-btns">
              {(playersA || []).filter(p => !onFieldA.includes(p.id)).map(p => (
                <button 
                  key={p.id} 
                  onClick={() => {
                    if (isPreGame) {
                      togglePlayerStatus(p.id, 'a');
                      return;
                    }
                    if (eventType === 'gol') {
                      setGoalWizard({ team: 'a', open: true, pId: p.id });
                      return;
                    }
                    if (eventType === 'amarelo' || eventType === 'vermelho') {
                      addEvent(p.id, 'a');
                      return;
                    }
                    togglePlayerStatus(p.id, 'a');
                  }} 
                  className={`p-btn bench${isPreGame && isSuspendedForNextMatch(p) ? ' is-suspended' : ''}`}
                  disabled={isPreGame && isSuspendedForNextMatch(p)}
                  title={isPreGame && isSuspendedForNextMatch(p) ? 'Suspenso por 2 amarelos ou 1 vermelho' : undefined}
                >
                  <span className="p-num">{p.number}</span>
                  <span className="p-name">{p.name.split(' ')[0]}</span>
                  {renderSuspendedChip(p)}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="divider-vertical"></div>

        <div className="lane">
          <h5>{match.teams_b?.name || 'Equipe B'}</h5>
          
          <div className="roster-section">
            <span className="roster-label"><Zap size={12} /> Em Campo ({lineupMetaB.selectedCount}/5 • GK {lineupMetaB.goalkeepers}/1)</span>
            <div className="admin-player-btns">
              {(playersB || []).filter(p => onFieldB.includes(p.id)).map(p => (
                <button 
                  key={p.id} 
                  onClick={() => {
                    if (isPreGame) {
                      togglePlayerStatus(p.id, 'b');
                      return;
                    }
                    if (eventType === 'gol') setGoalWizard({ team: 'b', open: true, pId: p.id });
                    else addEvent(p.id, 'b');
                  }} 
                  className="p-btn active-field"
                >
                  <span className="p-num">{p.number}</span>
                  <span className="p-name">{p.name.split(' ')[0]}</span>
                  {renderSuspendedChip(p)}
                  <ChevronDown size={10} className="btn-status-toggle" onClick={(e) => { e.stopPropagation(); togglePlayerStatus(p.id, 'b'); }} />
                </button>
              ))}
            </div>
          </div>

          <div className="roster-section">
            <span className="roster-label"><Users size={12} /> Banco</span>
            <div className="admin-player-btns">
              {(playersB || []).filter(p => !onFieldB.includes(p.id)).map(p => (
                <button 
                  key={p.id} 
                  onClick={() => {
                    if (isPreGame) {
                      togglePlayerStatus(p.id, 'b');
                      return;
                    }
                    if (eventType === 'gol') {
                      setGoalWizard({ team: 'b', open: true, pId: p.id });
                      return;
                    }
                    if (eventType === 'amarelo' || eventType === 'vermelho') {
                      addEvent(p.id, 'b');
                      return;
                    }
                    togglePlayerStatus(p.id, 'b');
                  }} 
                  className={`p-btn bench${isPreGame && isSuspendedForNextMatch(p) ? ' is-suspended' : ''}`}
                  disabled={isPreGame && isSuspendedForNextMatch(p)}
                  title={isPreGame && isSuspendedForNextMatch(p) ? 'Suspenso por 2 amarelos ou 1 vermelho' : undefined}
                >
                  <span className="p-num">{p.number}</span>
                  <span className="p-name">{p.name.split(' ')[0]}</span>
                  {renderSuspendedChip(p)}
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
          {(events || []).slice(0, 8).map(event => (
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
                        } catch (err: unknown) {
                          toast.error(getErrorMessage(err, 'Erro ao atualizar tempo'));
                        }
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

      {match.status === 'finalizado' && (
        <div className="final-stats-panel glass">
          <div className="final-stats-header">
            <h6>Estatisticas finais</h6>
            <span className="final-stats-score">{match.team_a_score} x {match.team_b_score}</span>
          </div>
          <div className="final-stats-grid">
            <div className="final-stats-col">
              <span className="final-stats-team">{match.teams_a?.name || 'Equipe A'}</span>
              <div className="final-stats-row"><span>Gols</span><strong>{finalStats.a.goals}</strong></div>
              <div className="final-stats-row"><span>Assistencias</span><strong>{finalStats.a.assists}</strong></div>
              <div className="final-stats-row"><span>Amarelos</span><strong>{finalStats.a.yellows}</strong></div>
              <div className="final-stats-row"><span>Vermelhos</span><strong>{finalStats.a.reds}</strong></div>
              <div className="final-stats-row"><span>Gols contra</span><strong>{finalStats.a.ownGoals}</strong></div>
            </div>
            <div className="final-stats-col">
              <span className="final-stats-team">{match.teams_b?.name || 'Equipe B'}</span>
              <div className="final-stats-row"><span>Gols</span><strong>{finalStats.b.goals}</strong></div>
              <div className="final-stats-row"><span>Assistencias</span><strong>{finalStats.b.assists}</strong></div>
              <div className="final-stats-row"><span>Amarelos</span><strong>{finalStats.b.yellows}</strong></div>
              <div className="final-stats-row"><span>Vermelhos</span><strong>{finalStats.b.reds}</strong></div>
              <div className="final-stats-row"><span>Gols contra</span><strong>{finalStats.b.ownGoals}</strong></div>
            </div>
          </div>
        </div>
      )}
      {ConfirmElement}
    </div>
  );
};

const TeamManagement = () => {
  const { teams, loading, refresh } = useTeams();
  const queryClient = useQueryClient();
  const { division } = useDivisionContext();
  const [isAdding, setIsAdding] = useState(false);
  const [isSubmittingTeam, setIsSubmittingTeam] = useState(false);
  const [expandedTeamId, setExpandedTeamId] = useState<string | null>(null);
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [editGroupValue, setEditGroupValue] = useState('');
  const [supportsTeamPrimaryColor, setSupportsTeamPrimaryColor] = useState(true);
  type TeamFormData = { name: string; group: string; leader: string; badge_url: string; primary_color: string };
  const [newTeamData, setNewTeamData] = useState<TeamFormData>({ name: '', group: '', leader: '', badge_url: '', primary_color: '#E4002B' });
  const [editTeamData, setEditTeamData] = useState<TeamFormData>({ name: '', group: '', leader: '', badge_url: '', primary_color: '#E4002B' });
  const [uploading, setUploading] = useState(false);

  const isPrimaryColorMissingError = (err: unknown) => {
    const e = err as { message?: unknown; details?: unknown; code?: unknown } | null;
    const message = typeof e?.message === 'string' ? e.message : typeof err === 'string' ? err : '';
    const details = typeof e?.details === 'string' ? e.details : '';
    const code = typeof e?.code === 'string' ? e.code : '';
    const combined = `${message} ${details} ${code}`.toLowerCase();

    if (!combined.includes('primary_color')) return false;

    return (
      combined.includes('schema cache') ||
      combined.includes('does not exist') ||
      combined.includes('could not find') ||
      combined.includes('unknown field') ||
      combined.includes('unknown column') ||
      code.toLowerCase() === 'pgrst204'
    );
  };

  useEffect(() => {
    // Detecta se a coluna existe no banco; se não existir, escondemos o campo e não enviamos no payload
    let cancelled = false;
    const check = async () => {
      try {
        const { error } = await supabase.from('teams').select('id, primary_color').limit(1);
        if (!cancelled && error && isPrimaryColorMissingError(error)) {
          setSupportsTeamPrimaryColor(false);
        }
      } catch (err: unknown) {
        if (!cancelled && isPrimaryColorMissingError(err)) {
          setSupportsTeamPrimaryColor(false);
        }
      }
    };
    void check();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleBadgeUpload = async (
    e: React.ChangeEvent<HTMLInputElement>,
    setData: React.Dispatch<React.SetStateAction<TeamFormData>>,
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const url = await uploadToStorage(file, 'images', 'team-badges');
      if (url) setData(prev => ({ ...prev, badge_url: url }));
    } finally {
      setUploading(false);
      if (e.target) e.target.value = '';
    }
  };

  const handleAddTeam = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmittingTeam) return;
    if (uploading) {
      toast.error('Aguarde o upload terminar antes de salvar.');
      return;
    }
    setIsSubmittingTeam(true);
    const loadingToast = toast.loading('Criando equipe...');
    try {
      const payload: Record<string, unknown> = {
        name: newTeamData.name.trim(),
        group: newTeamData.group.trim(),
        leader: newTeamData.leader.trim(),
        badge_url: newTeamData.badge_url?.trim() || null,
        division,
      };

      if (supportsTeamPrimaryColor) {
        payload.primary_color = newTeamData.primary_color || null;
      }

      const insertTeam = async (payloadToInsert: Record<string, unknown>) => {
        const { error } = await withRetry(async () => {
          return await withTimeout(
            supabase.from('teams').insert([payloadToInsert]),
            15000,
            'Tempo limite ao criar equipe'
          );
        }, 2);
        if (error) throw error;
      };

      try {
        await insertTeam(payload);
      } catch (err: unknown) {
        if (supportsTeamPrimaryColor && isPrimaryColorMissingError(err)) {
          setSupportsTeamPrimaryColor(false);
          const { primary_color: _ignored, ...payloadNoColor } = payload as { primary_color?: unknown } & Record<string, unknown>;
          try {
            await insertTeam(payloadNoColor);
          } catch (err2: unknown) {
            if (isMissingDivisionColumnError(err2 as any, 'division')) {
              markDivisionColumnMissing();
              const { division: _ignoredDivision, ...payloadNoColorNoDivision } = payloadNoColor as { division?: unknown } & Record<string, unknown>;
              await insertTeam(payloadNoColorNoDivision);
            } else {
              throw err2;
            }
          }
        } else if (isMissingDivisionColumnError(err as any, 'division')) {
          markDivisionColumnMissing();
          const { division: _ignored, ...payloadNoDivision } = payload as { division?: unknown } & Record<string, unknown>;
          await insertTeam(payloadNoDivision);
        } else {
          throw err;
        }
      }
      setNewTeamData({ name: '', group: '', leader: '', badge_url: '', primary_color: '#E4002B' });
      setIsAdding(false);
      void queryClient.invalidateQueries({ queryKey: ['teams', division] });
      void queryClient.invalidateQueries({ queryKey: ['standings', division] });
      void queryClient.invalidateQueries({ queryKey: ['rankings', division] });
      void refresh();
      toast.success('Equipe criada com sucesso!', { id: loadingToast });
    } catch (err: unknown) {
      toast.error(getErrorMessage(err, 'Erro ao adicionar equipe'), { id: loadingToast });
    } finally {
      setIsSubmittingTeam(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Deseja realmente excluir esta equipe? Todos os jogadores também serão removidos.')) return;
    const loadingToast = toast.loading('Excluindo equipe...');
    try {
      const { error } = await withTimeout(
        supabase.from('teams').delete().eq('id', id),
        30000,
        'Tempo limite ao excluir equipe'
      );
      if (error) throw error;
      void queryClient.invalidateQueries({ queryKey: ['teams', division] });
      void queryClient.invalidateQueries({ queryKey: ['players', division] });
      void queryClient.invalidateQueries({ queryKey: ['standings', division] });
      void queryClient.invalidateQueries({ queryKey: ['rankings', division] });
      void refresh();
      toast.success('Equipe excluída com sucesso!', { id: loadingToast });
    } catch (err: unknown) {
      toast.error(getErrorMessage(err, 'Erro ao excluir equipe'), { id: loadingToast });
    }
  };

  const handleUpdateTeam = async (teamId: string, data: Partial<Team>) => {
    const loadingToast = toast.loading('Atualizando equipe...');
    try {
      const doUpdate = async (dataToUpdate: Partial<Team>) => {
        const { error } = await withTimeout(
          supabase.from('teams').update(dataToUpdate).eq('id', teamId),
          30000,
          'Tempo limite ao atualizar equipe'
        );
        if (error) throw error;
      };

      const filteredData = { ...data };
      if (!supportsTeamPrimaryColor) {
        delete (filteredData as Partial<Team> & { primary_color?: unknown }).primary_color;
      }

      try {
        await doUpdate(filteredData);
      } catch (err: unknown) {
        if (supportsTeamPrimaryColor && isPrimaryColorMissingError(err)) {
          setSupportsTeamPrimaryColor(false);
          const retryData = { ...filteredData };
          delete (retryData as Partial<Team> & { primary_color?: unknown }).primary_color;
          await doUpdate(retryData);
        } else {
          throw err;
        }
      }
      void queryClient.invalidateQueries({ queryKey: ['teams', division] });
      void queryClient.invalidateQueries({ queryKey: ['standings', division] });
      void queryClient.invalidateQueries({ queryKey: ['rankings', division] });
      void refresh();
      toast.success('Equipe atualizada!', { id: loadingToast });
    } catch (err: unknown) {
      toast.error(getErrorMessage(err, 'Erro ao atualizar equipe'), { id: loadingToast });
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
                value={newTeamData.name}
                onChange={(e) => setNewTeamData({ ...newTeamData, name: e.target.value })}
                placeholder="Ex: Fisioterapia FC"
              />
            </div>
            <div className="form-group">
              <label>Grupo / Categoria</label>
              <input 
                type="text"
                value={newTeamData.group}
                onChange={(e) => setNewTeamData({ ...newTeamData, group: e.target.value })}
                required
                placeholder="Ex: Grupo A, Feminino, etc."
              />
            </div>
            <div className="form-group">
              <label>Líder/Capitão</label>
              <input 
                type="text" 
                required 
                value={newTeamData.leader}
                onChange={(e) => setNewTeamData({ ...newTeamData, leader: e.target.value })}
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
                  ) : newTeamData.badge_url ? (
                    <img src={newTeamData.badge_url} alt="Preview" className="image-preview-badge" />
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
                    onChange={(e) => handleBadgeUpload(e, setNewTeamData)} 
                  />
                </label>
                {newTeamData.badge_url && (
                  <button type="button" className="btn-remove-photo" onClick={() => setNewTeamData({ ...newTeamData, badge_url: '' })}>Remover</button>
                )}
              </div>
              <input
                type="url"
                placeholder="ou cole a URL do escudo"
                value={newTeamData.badge_url}
                onChange={(e) => setNewTeamData({ ...newTeamData, badge_url: e.target.value })}
              />
            </div>
            {supportsTeamPrimaryColor && (
              <div className="form-group">
                <label>Cor de Identidade (Primária)</label>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                  <input 
                    type="color" 
                    value={newTeamData.primary_color}
                    onChange={(e) => setNewTeamData({ ...newTeamData, primary_color: e.target.value })}
                    style={{ width: '50px', height: '40px', padding: '2px', cursor: 'pointer' }}
                  />
                  <input 
                    type="text" 
                    value={newTeamData.primary_color}
                    onChange={(e) => setNewTeamData({ ...newTeamData, primary_color: e.target.value })}
                    placeholder="#HEX"
                    style={{ flex: 1 }}
                  />
                </div>
              </div>
            )}
          </div>
          <button type="submit" className="btn-save" disabled={isSubmittingTeam || uploading}>
            <Save size={18} /> {isSubmittingTeam ? 'Salvando...' : 'Salvar Equipe'}
          </button>
        </form>
      )}

      {loading ? <p>Carregando...</p> : (
        <div className="admin-list">
          {(teams || []).map(team => (
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
                                <img
                                  src={editTeamData.badge_url || team.badge_url || undefined}
                                  alt="Badge"
                                  className="image-preview-badge"
                                />
                              )}
                              <input type="file" accept="image/*" className="hidden-file-input" onChange={(e) => handleBadgeUpload(e, setEditTeamData)} />
                            </label>
                          </div>
                          <input 
                            placeholder="Nome da Equipe"
                            value={editTeamData.name}
                            onChange={e => setEditTeamData({ ...editTeamData, name: e.target.value })}
                          />
                          <input
                            placeholder="Líder/Capitão"
                            value={editTeamData.leader}
                            onChange={e => setEditTeamData({ ...editTeamData, leader: e.target.value })}
                          />
                          <input
                            placeholder="URL do escudo"
                            value={editTeamData.badge_url}
                            onChange={e => setEditTeamData({ ...editTeamData, badge_url: e.target.value })}
                          />
                          <input 
                            placeholder="Grupo"
                            value={editGroupValue}
                            onChange={e => setEditGroupValue(e.target.value)}
                          />
                          {supportsTeamPrimaryColor && (
                            <div className="form-group-mini">
                              <label style={{ fontSize: '0.75rem', opacity: 0.8 }}>Cor do Time</label>
                              <div style={{ display: 'flex', gap: '4px' }}>
                                <input 
                                  type="color" 
                                  value={editTeamData.primary_color}
                                  onChange={e => setEditTeamData({ ...editTeamData, primary_color: e.target.value })}
                                  style={{ width: '30px', height: '30px', cursor: 'pointer' }}
                                />
                                <input 
                                  type="text"
                                  style={{ fontSize: '0.8rem', width: '80px' }}
                                  value={editTeamData.primary_color}
                                  onChange={e => setEditTeamData({ ...editTeamData, primary_color: e.target.value })}
                                />
                              </div>
                            </div>
                          )}
                        </div>
                        <div className="form-actions-mini">
                          <button type="button" className="btn-save-mini" onClick={() => {
                            handleUpdateTeam(team.id, { 
                              name: editTeamData.name || team.name, 
                              leader: editTeamData.leader || team.leader,
                              badge_url: editTeamData.badge_url || team.badge_url,
                              group: editGroupValue,
                              ...(supportsTeamPrimaryColor ? { primary_color: editTeamData.primary_color || null } : {})
                            });
                            setEditingGroupId(null);
                          }}><Save size={14} /> Salvar</button>
                          <button type="button" className="btn-cancel-mini" onClick={() => setEditingGroupId(null)}>✕</button>
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
                      setEditTeamData({ 
                        name: team.name, 
                        leader: team.leader, 
                        badge_url: team.badge_url || '', 
                        group: team.group || '',
                        primary_color: team.primary_color || '#E4002B'
                      });
                    }}><Settings2 size={18} /></button>
                  )}
                  <button className="btn-icon delete" onClick={(e) => { e.stopPropagation(); handleDelete(team.id); }}><Trash2 size={18} /></button>
                </div>
              </div>
              {expandedTeamId === team.id && (
                <div className="team-players-admin glass">
                  <PlayerManagement teamId={team.id} />
                </div>
              )}
            </React.Fragment>
          ))}
        </div>
      )}
    </div>
  );
}

const PlayerManagement: React.FC<{ teamId: string }> = ({ teamId }) => {
  const { players, loading } = usePlayers(teamId);
  const queryClient = useQueryClient();
  const { division } = useDivisionContext();
  const [isAdding, setIsAdding] = useState(false);
  const [isSubmittingPlayer, setIsSubmittingPlayer] = useState(false);
  const [isUpdatingPlayer, setIsUpdatingPlayer] = useState(false);
  const [editingPlayerId, setEditingPlayerId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [formData, setFormData] = useState({ 
    name: '', number: '', position: 'Ala', photo_url: '', bio: '',
    goals_count: '0', assists: '0', yellow_cards: '0', red_cards: '0', clean_sheets: '0', suspensions_served: '0'
  });
  const [editFormData, setEditFormData] = useState({
    name: '', number: '', position: 'Ala', photo_url: '', bio: '',
    goals_count: '0', assists: '0', yellow_cards: '0', red_cards: '0', clean_sheets: '0', suspensions_served: '0'
  });

  useEffect(() => {
    if (!editingPlayerId) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [editingPlayerId]);

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
    if (isSubmittingPlayer) return;
    setIsSubmittingPlayer(true);
    const loadingToast = toast.loading('Adicionando atleta...');
    try {
      const payload = {
        ...formData,
        name: normalizePlayerName(formData.name),
        team_id: teamId,
        division,
        number: parseInt(formData.number) || 0,
        suspensions_served: Math.max(0, parseInt((formData as any).suspensions_served) || 0),
      } as Record<string, unknown>;

      const doInsert = async (payloadToInsert: Record<string, unknown>) => {
        return await withTimeout(
          supabase.from('players').insert([payloadToInsert]),
          30000,
          'Tempo limite ao adicionar atleta'
        );
      };

      const res = await doInsert(payload);
      if (res.error) {
        if (isMissingDivisionColumnError(res.error as any, 'division')) {
          markDivisionColumnMissing();
          const { division: _ignored, ...payloadNoDivision } = payload as { division?: unknown } & Record<string, unknown>;
          const retry = await doInsert(payloadNoDivision);
          if (retry.error) throw retry.error;
        } else {
          throw res.error;
        }
      }
      setFormData({ 
        name: '', number: '', position: 'Ala', photo_url: '', bio: '',
        goals_count: '0', assists: '0', yellow_cards: '0', red_cards: '0', clean_sheets: '0', suspensions_served: '0'
      });
      setIsAdding(false);
      void queryClient.invalidateQueries({ queryKey: ['players', division, teamId] });
      void queryClient.invalidateQueries({ queryKey: ['players', division, 'all'] });
      void queryClient.invalidateQueries({ queryKey: ['rankings', division] });
      toast.success('Atleta adicionado!', { id: loadingToast });
    } catch (err: unknown) {
      toast.error(getErrorMessage(err, 'Erro ao adicionar atleta'), { id: loadingToast });
    } finally {
      setIsSubmittingPlayer(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Excluir atleta?')) return;
    const loadingToast = toast.loading('Excluindo...');
    try {
      const { error } = await withTimeout(
        supabase.from('players').delete().eq('id', id),
        30000,
        'Tempo limite ao excluir atleta'
      );
      if (error) throw error;
      void queryClient.invalidateQueries({ queryKey: ['players', division, teamId] });
      void queryClient.invalidateQueries({ queryKey: ['players', division, 'all'] });
      void queryClient.invalidateQueries({ queryKey: ['rankings', division] });
      toast.success('Atleta excluído!', { id: loadingToast });
    } catch (err: unknown) {
      toast.error(getErrorMessage(err, 'Erro ao excluir atleta'), { id: loadingToast });
    }
  };

  const handleEditPhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const url = await uploadToStorage(file, 'images', 'player-photos');
    if (url) setEditFormData(prev => ({ ...prev, photo_url: url }));
    setUploading(false);
  };

  const handleUpdatePlayer = async (playerId: string) => {
    if (isUpdatingPlayer) return;
    if (uploading) {
      toast.error('Aguarde o upload terminar antes de salvar.');
      return;
    }

    setIsUpdatingPlayer(true);
    const loadingToast = toast.loading('Atualizando...');
    try {
      const { error } = await withTimeout(
        supabase.from('players').update({
          ...editFormData,
          name: normalizePlayerName(editFormData.name),
          number: parseInt(editFormData.number) || 0,
          goals_count: parseInt(editFormData.goals_count) || 0,
          assists: parseInt(editFormData.assists) || 0,
          yellow_cards: parseInt(editFormData.yellow_cards) || 0,
          red_cards: parseInt(editFormData.red_cards) || 0,
          clean_sheets: parseInt(editFormData.clean_sheets) || 0,
          suspensions_served: Math.max(0, parseInt((editFormData as any).suspensions_served) || 0),
        }).eq('id', playerId),
        30000,
        'Tempo limite ao atualizar atleta'
      );
      if (error) throw error;
      setEditingPlayerId(null);
      void queryClient.invalidateQueries({ queryKey: ['players', division, teamId] });
      void queryClient.invalidateQueries({ queryKey: ['players', division, 'all'] });
      void queryClient.invalidateQueries({ queryKey: ['rankings', division] });
      toast.success('Atleta atualizado!', { id: loadingToast });
    } catch (err: unknown) {
      toast.error(getErrorMessage(err, 'Erro ao atualizar atleta'), { id: loadingToast });
    } finally {
      setIsUpdatingPlayer(false);
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
                onChange={e => setFormData({ ...formData, name: maskPlayerName(e.target.value) })}
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
                    <img
                      src={clearPhotoCropFromUrl(formData.photo_url)}
                      alt="Preview"
                      className="image-preview-badge"
                      style={{ objectFit: 'cover', objectPosition: getPhotoCropXY(formData.photo_url).objectPosition, transform: getPhotoCropXY(formData.photo_url).scale !== 1 ? `scale(${getPhotoCropXY(formData.photo_url).scale})` : undefined, transformOrigin: getPhotoCropXY(formData.photo_url).objectPosition }}
                    />
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
              {formData.photo_url && (
                <div style={{ display: 'grid', gap: '0.5rem', marginTop: '0.5rem' }}>
                  <div style={{ display: 'grid', gap: '0.25rem' }}>
                    <small>Zoom: {Math.round(getPhotoCropXY(formData.photo_url).z)}%</small>
                    <input
                      type="range"
                      min={100}
                      max={250}
                      value={getPhotoCropXY(formData.photo_url).z}
                      onChange={(e) => {
                        const nextZ = Number(e.target.value);
                        setFormData((prev) => {
                          const current = getPhotoCropXY(prev.photo_url);
                          return { ...prev, photo_url: setPhotoCropOnUrl(prev.photo_url, current.x, current.y, nextZ) };
                        });
                      }}
                    />
                  </div>
                  <div style={{ display: 'grid', gap: '0.25rem' }}>
                    <small>Horizontal: {Math.round(getPhotoCropXY(formData.photo_url).x)}%</small>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={getPhotoCropXY(formData.photo_url).x}
                      onChange={(e) => {
                        const nextX = Number(e.target.value);
                        setFormData((prev) => {
                          const current = getPhotoCropXY(prev.photo_url);
                          return { ...prev, photo_url: setPhotoCropOnUrl(prev.photo_url, nextX, current.y, current.z) };
                        });
                      }}
                    />
                  </div>
                  <div style={{ display: 'grid', gap: '0.25rem' }}>
                    <small>Vertical: {Math.round(getPhotoCropXY(formData.photo_url).y)}%</small>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={getPhotoCropXY(formData.photo_url).y}
                      onChange={(e) => {
                        const nextY = Number(e.target.value);
                        setFormData((prev) => {
                          const current = getPhotoCropXY(prev.photo_url);
                          return { ...prev, photo_url: setPhotoCropOnUrl(prev.photo_url, current.x, nextY, current.z) };
                        });
                      }}
                    />
                  </div>
                  <div className="image-upload-container" style={{ width: '220px', height: '220px', overflow: 'hidden' }}>
                    <img
                      src={clearPhotoCropFromUrl(formData.photo_url)}
                      alt="Preview grande"
                      className="image-preview-badge"
                      style={{ objectFit: 'cover', objectPosition: getPhotoCropXY(formData.photo_url).objectPosition, transform: getPhotoCropXY(formData.photo_url).scale !== 1 ? `scale(${getPhotoCropXY(formData.photo_url).scale})` : undefined, transformOrigin: getPhotoCropXY(formData.photo_url).objectPosition }}
                    />
                  </div>
                </div>
              )}
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
             <div className="stat-input">
               <label>Susp. cumpridas</label>
               <input
                type="number"
                value={(formData as any).suspensions_served}
                onChange={e => setFormData({ ...(formData as any), suspensions_served: e.target.value })}
               />
             </div>
          </div>
          <button type="submit" className="btn-save-player" disabled={isSubmittingPlayer}>
            <Save size={14} /> {isSubmittingPlayer ? 'Salvando...' : 'Salvar Atleta'}
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
          (players || []).map(p => (
            <div key={p.id} className="player-admin-row-wrapper">
              <div className="player-row">
                <div className="player-number-badge">{p.number}</div>
                <div className="player-info">
                  <strong>{p.name}</strong>
                  <span className="player-position-tag">{p.position}</span>
                </div>
                <div className="player-actions">
                  <button className="btn-player-edit" type="button" onClick={() => {
                    setEditingPlayerId(p.id);
                    setEditFormData({ 
                      name: maskPlayerName(p.name), 
                      number: String(p.number), 
                      position: p.position, 
                      photo_url: p.photo_url || '', 
                      bio: p.bio || '',
                      goals_count: String(p.goals_count),
                      assists: String(p.assists),
                      yellow_cards: String(p.yellow_cards),
                      red_cards: String(p.red_cards),
                      clean_sheets: String(p.clean_sheets || 0),
                      suspensions_served: String((p as any).suspensions_served || 0)
                    });
                  }} title="Editar atleta">
                    <Settings2 size={13} />
                  </button>
                  <button className="btn-player-delete" type="button" onClick={() => handleDelete(p.id)} title="Remover atleta">
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {editingPlayerId && typeof document !== 'undefined' && createPortal(
        <div className="global-player-edit-modal-backdrop" onClick={() => setEditingPlayerId(null)}>
          <div className="global-player-edit-modal glass" onClick={(e) => e.stopPropagation()}>
            <div className="global-player-edit-modal-header">
              <h3>Editar Atleta</h3>
              <button type="button" className="btn-cancel" onClick={() => setEditingPlayerId(null)}>
                Fechar
              </button>
            </div>

            <form className="admin-form glass global-player-edit-form" onSubmit={(e) => { e.preventDefault(); void handleUpdatePlayer(editingPlayerId); }}>
              <div className="form-grid">
                <div className="form-group">
                  <label>Nome</label>
                  <input type="text" required value={editFormData.name} onChange={e => setEditFormData({ ...editFormData, name: maskPlayerName(e.target.value) })} />
                </div>
                <div className="form-group">
                  <label>Nº</label>
                  <input type="number" required value={editFormData.number} onChange={e => setEditFormData({ ...editFormData, number: e.target.value })} />
                </div>
                <div className="form-group">
                  <label>Posição</label>
                  <select value={editFormData.position} onChange={e => setEditFormData({ ...editFormData, position: e.target.value })}>
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
                      {uploading ? <div className="spinner"></div> : editFormData.photo_url ? (
                        <img
                          src={clearPhotoCropFromUrl(editFormData.photo_url)}
                          alt="Preview"
                          className="image-preview-badge"
                          style={{ objectFit: 'cover', objectPosition: getPhotoCropXY(editFormData.photo_url).objectPosition, transform: getPhotoCropXY(editFormData.photo_url).scale !== 1 ? `scale(${getPhotoCropXY(editFormData.photo_url).scale})` : undefined, transformOrigin: getPhotoCropXY(editFormData.photo_url).objectPosition }}
                        />
                      ) : (
                        <div className="upload-icon-box">
                          <Camera size={20} />
                          <span style={{ fontSize: '0.6rem' }}>Adicionar</span>
                        </div>
                      )}
                      <input type="file" accept="image/*" className="hidden-file-input" onChange={handleEditPhotoUpload} />
                    </label>
                  </div>
                  {editFormData.photo_url && (
                    <div style={{ display: 'grid', gap: '0.5rem', marginTop: '0.5rem' }}>
                      <div style={{ display: 'grid', gap: '0.25rem' }}>
                        <small>Zoom: {Math.round(getPhotoCropXY(editFormData.photo_url).z)}%</small>
                        <input
                          type="range"
                          min={100}
                          max={250}
                          value={getPhotoCropXY(editFormData.photo_url).z}
                          onChange={(e) => {
                            const nextZ = Number(e.target.value);
                            setEditFormData((prev) => {
                              const current = getPhotoCropXY(prev.photo_url);
                              return { ...prev, photo_url: setPhotoCropOnUrl(prev.photo_url, current.x, current.y, nextZ) };
                            });
                          }}
                        />
                      </div>
                      <div style={{ display: 'grid', gap: '0.25rem' }}>
                        <small>Horizontal: {Math.round(getPhotoCropXY(editFormData.photo_url).x)}%</small>
                        <input
                          type="range"
                          min={0}
                          max={100}
                          value={getPhotoCropXY(editFormData.photo_url).x}
                          onChange={(e) => {
                            const nextX = Number(e.target.value);
                            setEditFormData((prev) => {
                              const current = getPhotoCropXY(prev.photo_url);
                              return { ...prev, photo_url: setPhotoCropOnUrl(prev.photo_url, nextX, current.y, current.z) };
                            });
                          }}
                        />
                      </div>
                      <div style={{ display: 'grid', gap: '0.25rem' }}>
                        <small>Vertical: {Math.round(getPhotoCropXY(editFormData.photo_url).y)}%</small>
                        <input
                          type="range"
                          min={0}
                          max={100}
                          value={getPhotoCropXY(editFormData.photo_url).y}
                          onChange={(e) => {
                            const nextY = Number(e.target.value);
                            setEditFormData((prev) => {
                              const current = getPhotoCropXY(prev.photo_url);
                              return { ...prev, photo_url: setPhotoCropOnUrl(prev.photo_url, current.x, nextY, current.z) };
                            });
                          }}
                        />
                      </div>
                      <div className="image-upload-container" style={{ width: '220px', height: '220px', overflow: 'hidden' }}>
                        <img
                          src={clearPhotoCropFromUrl(editFormData.photo_url)}
                          alt="Preview grande"
                          className="image-preview-badge"
                          style={{ objectFit: 'cover', objectPosition: getPhotoCropXY(editFormData.photo_url).objectPosition, transform: getPhotoCropXY(editFormData.photo_url).scale !== 1 ? `scale(${getPhotoCropXY(editFormData.photo_url).scale})` : undefined, transformOrigin: getPhotoCropXY(editFormData.photo_url).objectPosition }}
                        />
                      </div>
                    </div>
                  )}
                </div>
                <div className="form-group">
                  <label>Bio/Histórico</label>
                  <input type="text" value={editFormData.bio} onChange={e => setEditFormData({ ...editFormData, bio: e.target.value })} />
                </div>
              </div>

              <div className="player-stats-editor-grid mt-2">
                <div className="stat-input">
                  <label><Trophy size={14} /> Gols</label>
                  <input type="number" value={editFormData.goals_count} onChange={e => setEditFormData({ ...editFormData, goals_count: e.target.value })} />
                </div>
                <div className="stat-input">
                  <label><Star size={14} /> Assist.</label>
                  <input type="number" value={editFormData.assists} onChange={e => setEditFormData({ ...editFormData, assists: e.target.value })} />
                </div>
                <div className="stat-input">
                  <label><CreditCard size={14} style={{ color: '#fbbf24' }} /> CA</label>
                  <input type="number" value={editFormData.yellow_cards} onChange={e => setEditFormData({ ...editFormData, yellow_cards: e.target.value })} />
                </div>
                <div className="stat-input">
                  <label><CreditCard size={14} style={{ color: '#ef4444' }} /> CV</label>
                  <input type="number" value={editFormData.red_cards} onChange={e => setEditFormData({ ...editFormData, red_cards: e.target.value })} />
                </div>
                <div className="stat-input">
                  <label><Shield size={14} /> Clean Sheets</label>
                  <input type="number" value={editFormData.clean_sheets} onChange={e => setEditFormData({ ...editFormData, clean_sheets: e.target.value })} />
                </div>
                <div className="stat-input">
                  <label>Susp. cumpridas</label>
                  <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                    <input
                      type="number"
                      value={(editFormData as any).suspensions_served}
                      onChange={e => setEditFormData({ ...(editFormData as any), suspensions_served: e.target.value })}
                      style={{ flex: 1 }}
                    />
                    <button
                      type="button"
                      className="btn-cancel"
                      onClick={() => {
                        const current = Math.max(0, parseInt((editFormData as any).suspensions_served) || 0);
                        setEditFormData({ ...(editFormData as any), suspensions_served: String(current + 1) });
                      }}
                      title="Marcar 1 jogo de suspensão cumprido"
                    >
                      +1
                    </button>
                  </div>
                </div>
              </div>

              <div className="global-player-edit-actions">
                <button type="submit" className="btn-save" disabled={isUpdatingPlayer}>
                  <Save size={16} /> {isUpdatingPlayer ? 'Salvando...' : 'Salvar Alterações'}
                </button>
                <button type="button" className="btn-cancel" onClick={() => setEditingPlayerId(null)}>
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

const NewsManagement = () => {
  const { news, loading, error, refresh } = useNews();
  const queryClient = useQueryClient();
  const [isAdding, setIsAdding] = useState(false);
  const [editingNewsId, setEditingNewsId] = useState<string | null>(null);
  const [formData, setFormData] = useState({ title: '', summary: '', content: '', image_url: '' });
  const [newsCategory, setNewsCategory] = useState<'geral' | 'rodada' | 'resultado' | 'bastidores' | 'aviso'>('geral');
  const [selectedNewsPresetId, setSelectedNewsPresetId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const newsPresets: Array<{
    id: string;
    label: string;
    category: 'geral' | 'rodada' | 'resultado' | 'bastidores' | 'aviso';
    title: string;
    summary: string;
    content: string;
  }> = [
    {
      id: 'rodada-confirmada',
      label: 'Noite confirmada',
      category: 'rodada',
      title: 'Noite confirmada para este fim de semana',
      summary: 'Horarios e confrontos oficiais ja estao definidos.',
      content: 'A organizacao confirmou os jogos da proxima noite. Confira os confrontos e acompanhe em tempo real no aplicativo.',
    },
    {
      id: 'resultado-oficial',
      label: 'Resultado oficial',
      category: 'resultado',
      title: 'Resultado oficial da noite publicado',
      summary: 'Classificacao e destaques atualizados.',
      content: 'Os resultados oficiais foram processados e a classificacao ja esta atualizada no app. Veja os destaques e estatisticas dos jogos.',
    },
    {
      id: 'bastidores',
      label: 'Bastidores',
      category: 'bastidores',
      title: 'Bastidores da noite: preparacao das equipes',
      summary: 'Veja momentos especiais antes do apito inicial.',
      content: 'Reunimos imagens e historias dos bastidores para aproximar os torcedores da experiencia da Copa.',
    },
    {
      id: 'aviso-operacional',
      label: 'Aviso operacional',
      category: 'aviso',
      title: 'Comunicado importante da organizacao',
      summary: 'Atualizacao relevante para equipes e torcedores.',
      content: 'Publicamos um comunicado oficial com orientacoes atualizadas. Leia com atencao e compartilhe com sua equipe.',
    },
  ];

  const titleLength = formData.title.trim().length;
  const titleWords = formData.title.trim().split(/\s+/).filter(Boolean).length;
  const titleQuality =
    titleLength < 18 || titleWords < 3
      ? { label: 'Muito curto', tone: 'low' as const }
      : titleLength > 72
        ? { label: 'Muito longo', tone: 'high' as const }
        : { label: 'Bom tamanho', tone: 'good' as const };

  const applyNewsPreset = (presetId: string) => {
    const preset = newsPresets.find((item) => item.id === presetId);
    if (!preset) return;

    setSelectedNewsPresetId(preset.id);
    setNewsCategory(preset.category);
    setFormData((prev) => ({
      ...prev,
      title: preset.title,
      summary: preset.summary,
      content: preset.content,
    }));
    toast.success(`Modelo aplicado: ${preset.label}`);
  };

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
      const payload = {
        ...formData,
        published_at: new Date().toISOString(),
      };

      const { data, error } = await supabase
        .from('news')
        .insert([payload])
        .select('*')
        .single();
      if (error) throw error;
      setFormData({ title: '', summary: '', content: '', image_url: '' });
      setNewsCategory('geral');
      setSelectedNewsPresetId(null);
      setIsAdding(false);

      if (data) {
        queryClient.setQueryData<News[]>(['news', 'all'], (prev = []) => [data as News, ...prev]);
      }
      await queryClient.invalidateQueries({ queryKey: ['news'] });
      
      // Notificar nova notícia
      sendPushNotification(
        '📰 Nova Notícia!', 
        formData.title,
        {
          url: '/jogadores',
          category: 'news',
          important: true,
        }
      );
      
      await refresh();
      toast.success('Notícia publicada com sucesso!');
    } catch (err: unknown) {
      toast.error(getErrorMessage(err, 'Erro ao publicar notícia'));
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Deseja excluir este comunicado?')) return;
    try {
      const { error } = await supabase.from('news').delete().eq('id', id);
      if (error) throw error;
      refresh();
    } catch (err: unknown) {
      toast.error(getErrorMessage(err, 'Erro ao excluir notícia'));
    }
  };

  const handleUpdateNews = async (id: string, data: Partial<News>) => {
    try {
      const { error } = await supabase.from('news').update(data).eq('id', id);
      if (error) throw error;
      setEditingNewsId(null);
      refresh();
      toast.success('Notícia atualizada!');
    } catch (err: unknown) {
      toast.error(getErrorMessage(err, 'Erro ao atualizar notícia'));
    }
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
          <div className="news-presets-panel glass">
            <div className="news-presets-head">
              <strong>Modelos de noticia</strong>
              <span>Preencha automaticamente titulo e texto base para acelerar publicacoes.</span>
            </div>
            <div className="news-presets-grid" role="group" aria-label="Modelos de noticia">
              {newsPresets.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  className={`news-preset-btn ${selectedNewsPresetId === preset.id ? 'active' : ''}`}
                  onClick={() => applyNewsPreset(preset.id)}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          <div className="form-grid-full">
            <div className="form-group">
              <label>Categoria Editorial (apoio interno)</label>
              <select value={newsCategory} onChange={(e) => setNewsCategory(e.target.value as typeof newsCategory)}>
                <option value="geral">Geral</option>
                <option value="rodada">Noite</option>
                <option value="resultado">Resultado</option>
                <option value="bastidores">Bastidores</option>
                <option value="aviso">Aviso</option>
              </select>
              <small>Usado para padronizar o texto antes da publicacao.</small>
            </div>
            <div className="form-group">
              <label>Título da Notícia</label>
              <input 
                type="text" 
                required 
                value={formData.title}
                onChange={(e) => setFormData({...formData, title: e.target.value})}
                placeholder="Ex: Noite 5 confirmada"
              />
              <div className="news-title-quality" aria-live="polite">
                <span className={`news-quality-chip ${titleQuality.tone}`}>{titleQuality.label}</span>
                <span>{titleLength} caracteres</span>
                <span>{titleWords} palavras</span>
              </div>
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
          {(news || []).map(item => (
            <div key={item.id} className="admin-list-item-wrapper">
              <div className="admin-list-item">
                <div className="item-main">
                  <Newspaper size={24} className="icon-subtle" />
                  <div className="item-info">
                    <strong>{item.title}</strong>
                    <span>{formatNewsDate(item.published_at)}</span>
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
          {news.length === 0 && !loading && <p className="empty-msg">Nenhuma notícia publicada.</p>}
        </div>
      )}
    </div>
  );
}

const GalleryManagement = () => {
  const { items, loading, refresh, unavailable } = useGallery();
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [formData, setFormData] = useState<Pick<GalleryItem, 'title' | 'description' | 'media_url' | 'media_type'>>({
    title: '',
    description: '',
    media_url: '',
    media_type: 'image',
  });

  const resetForm = () => {
    setFormData({
      title: '',
      description: '',
      media_url: '',
      media_type: 'image',
    });
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const url = await uploadToStorage(file, 'images', 'gallery');
    if (url) setFormData((prev) => ({ ...prev, media_url: url, media_type: 'image' }));
    setUploading(false);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload = {
        ...formData,
        description: formData.description || '',
      };

      const { error } = await supabase.from('gallery').insert([payload]);
      if (error) throw error;

      await sendPushNotification('📸 Nova publicação na Galeria!', formData.title, {
        url: '/galeria',
        category: 'general',
        important: true,
      });

      setIsAdding(false);
      resetForm();
      await refresh();
      toast.success('Item da galeria publicado!');
    } catch (err: unknown) {
      toast.error(getErrorMessage(err, 'Erro ao publicar na galeria'));
    }
  };

  const handleUpdate = async (id: string) => {
    try {
      const { error } = await supabase
        .from('gallery')
        .update({
          title: formData.title,
          description: formData.description,
          media_url: formData.media_url,
          media_type: formData.media_type,
        })
        .eq('id', id);
      if (error) throw error;
      setEditingId(null);
      resetForm();
      await refresh();
      toast.success('Publicação atualizada!');
    } catch (err: unknown) {
      toast.error(getErrorMessage(err, 'Erro ao atualizar publicação'));
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Deseja excluir esta publicação da galeria?')) return;
    try {
      const { error } = await supabase.from('gallery').delete().eq('id', id);
      if (error) throw error;
      await refresh();
      toast.success('Publicação removida!');
    } catch (err: unknown) {
      toast.error(getErrorMessage(err, 'Erro ao excluir publicação'));
    }
  };

  const startEdit = (item: GalleryItem) => {
    setEditingId(item.id);
    setFormData({
      title: item.title,
      description: item.description || '',
      media_url: item.media_url,
      media_type: item.media_type,
    });
  };

  return (
    <div className="admin-section glass">
      <div className="section-header">
        <h2>Galeria de Fotos e Vídeos</h2>
        <button
          className="btn-add"
          onClick={() => setIsAdding((prev) => !prev)}
          disabled={unavailable}
          title={unavailable ? 'Crie a tabela gallery no banco para habilitar publicações.' : 'Nova publicação'}
        >
          {isAdding ? 'Cancelar' : <><Plus size={18} /> Nova Publicação</>}
        </button>
      </div>

      {isAdding && (
        <form className="admin-form glass" onSubmit={handleCreate}>
          <div className="form-grid-full">
            <div className="form-group">
              <label>Título</label>
              <input
                type="text"
                required
                value={formData.title}
                onChange={(e) => setFormData((prev) => ({ ...prev, title: e.target.value }))}
                placeholder="Ex: Bastidores da noite"
              />
            </div>
            <div className="form-group">
              <label>Descrição</label>
              <textarea
                rows={3}
                value={formData.description}
                onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))}
                placeholder="Texto curto para acompanhar a mídia"
              />
            </div>
            <div className="form-group">
              <label>Tipo da Mídia</label>
              <select
                value={formData.media_type}
                onChange={(e) => setFormData((prev) => ({ ...prev, media_type: e.target.value as GalleryItem['media_type'] }))}
              >
                <option value="image">Foto</option>
                <option value="video">Vídeo</option>
              </select>
            </div>
            {formData.media_type === 'image' && (
              <div className="form-group">
                <label>Upload de Foto</label>
                <label className={`image-upload-container news-upload ${uploading ? 'uploading' : ''}`} style={{ width: '100%', height: '160px' }}>
                  {uploading ? (
                    <div className="upload-loading-overlay">
                      <div className="spinner"></div>
                    </div>
                  ) : formData.media_url ? (
                    <img src={formData.media_url} alt="Preview" className="image-preview-badge" style={{ objectFit: 'cover' }} />
                  ) : (
                    <div className="upload-icon-box">
                      <Camera size={32} />
                      <span>Upload da Foto</span>
                    </div>
                  )}
                  <input type="file" accept="image/*" className="hidden-file-input" onChange={handleImageUpload} />
                </label>
              </div>
            )}
            <div className="form-group">
              <label>URL da Mídia</label>
              <input
                type="url"
                required
                value={formData.media_url}
                onChange={(e) => setFormData((prev) => ({ ...prev, media_url: e.target.value }))}
                placeholder={formData.media_type === 'video' ? 'https://.../video.mp4' : 'https://.../imagem.jpg'}
              />
            </div>
          </div>
          <button className="btn-save" type="submit"><Save size={18} /> Publicar</button>
        </form>
      )}

      {unavailable && (
        <div className="admin-list">
          <p className="empty-msg">A tabela gallery ainda não existe no banco. Rode o SQL de setup da Galeria para publicar conteúdo.</p>
        </div>
      )}

      {loading ? (
        <div className="admin-list"><p>Carregando galeria...</p></div>
      ) : (
        <div className="admin-list">
          {items.map((item) => (
            <div key={item.id} className="admin-list-item-wrapper">
              <div className="admin-list-item">
                <div className="item-main">
                  <Camera size={22} className="icon-subtle" />
                  <div className="item-info">
                    <strong>{item.title}</strong>
                    <span>{item.media_type === 'video' ? 'Vídeo' : 'Foto'} • {new Date(item.created_at).toLocaleString('pt-BR')}</span>
                  </div>
                </div>
                <div className="item-actions">
                  <button className="btn-icon edit" onClick={() => startEdit(item)}><Settings2 size={18} /></button>
                  <button className="btn-icon delete" onClick={() => void handleDelete(item.id)}><Trash2 size={18} /></button>
                </div>
              </div>

              {editingId === item.id && (
                <form
                  className="admin-form glass animate-slide-down"
                  style={{ margin: '1rem 0' }}
                  onSubmit={(e) => {
                    e.preventDefault();
                    void handleUpdate(item.id);
                  }}
                >
                  <div className="form-grid-full">
                    <div className="form-group">
                      <label>Título</label>
                      <input
                        type="text"
                        required
                        value={formData.title}
                        onChange={(e) => setFormData((prev) => ({ ...prev, title: e.target.value }))}
                      />
                    </div>
                    <div className="form-group">
                      <label>Descrição</label>
                      <textarea
                        rows={3}
                        value={formData.description}
                        onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))}
                      />
                    </div>
                    <div className="form-group">
                      <label>Tipo</label>
                      <select
                        value={formData.media_type}
                        onChange={(e) => setFormData((prev) => ({ ...prev, media_type: e.target.value as GalleryItem['media_type'] }))}
                      >
                        <option value="image">Foto</option>
                        <option value="video">Vídeo</option>
                      </select>
                    </div>
                    <div className="form-group">
                      <label>URL da mídia</label>
                      <input
                        type="url"
                        required
                        value={formData.media_url}
                        onChange={(e) => setFormData((prev) => ({ ...prev, media_url: e.target.value }))}
                      />
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
                    <button type="submit" className="btn-save"><Save size={18} /> Salvar</button>
                    <button type="button" className="btn-cancel" onClick={() => setEditingId(null)}>Cancelar</button>
                  </div>
                </form>
              )}
            </div>
          ))}

          {!loading && items.length === 0 && <p className="empty-msg">Nenhuma publicação na galeria.</p>}
        </div>
      )}
    </div>
  );
};

// ===== Gerenciamento do Torneio =====
const TournamentManagement = () => {
  const { config, loading, saveConfig } = useTournamentConfig();
  const { matches } = useMatches();
  const { division } = useDivisionContext();

  type ConfigForm = Pick<TournamentConfig, 'total_rounds' | 'matches_per_round' | 'current_phase' | 'current_round' | 'group_unit'>;

  const [form, setForm] = useState<ConfigForm>({
    total_rounds: 5,
    matches_per_round: 4,
    current_phase: 'grupos',
    current_round: 1,
    group_unit: 'night',
  });
    const groupUnit = form.group_unit || 'night';
    const groupUnitLabel = groupUnit === 'night' ? 'Noite' : 'Rodada';
    const groupUnitLabelPlural = groupUnit === 'night' ? 'Noites' : 'Rodadas';
  const [saved, setSaved] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [manualPhaseOverride, setManualPhaseOverride] = useState(false);
  const [groupCVisibility, setGroupCVisibility] = useState<GroupCVisibilityConfig>(DEFAULT_GROUP_C_VISIBILITY);

  const groupMatches = React.useMemo(() => {
    return (matches || []).filter((match) => typeof match.round === 'number' && match.round > 0 && match.round < 1000);
  }, [matches]);

  const nightStats = React.useMemo(() => {
    const stats = new Map<number, { count: number; pending: boolean }>();

    groupMatches.forEach((match) => {
      const slot = groupUnit === 'night' ? (match.night ?? match.round) : match.round;
      const current = stats.get(slot) || { count: 0, pending: false };
      stats.set(slot, {
        count: current.count + 1,
        pending: current.pending || match.status !== 'finalizado',
      });
    });

    return stats;
  }, [groupMatches, groupUnit]);

  const autoRound = React.useMemo(() => {
    if (nightStats.size === 0) return 1;

    const pendingRounds = Array.from(nightStats.entries())
      .filter(([, data]) => data.pending)
      .map(([round]) => round)
      .sort((a, b) => a - b);

    if (pendingRounds.length > 0) return pendingRounds[0];

    const maxRound = Math.max(...Array.from(nightStats.keys()));
    if (maxRound >= (config.total_rounds || 1)) return Math.max(config.total_rounds || 1, 1);
    return maxRound + 1;
  }, [nightStats, config.total_rounds]);

  const autoMatchesPerRound = React.useMemo(() => {
    if (nightStats.size === 0) return Math.max(config.matches_per_round || 1, 1);
    const currentCount = nightStats.get(autoRound)?.count ?? 0;
    if (currentCount > 0) return Math.max(currentCount, 1);
    const maxCount = Math.max(...Array.from(nightStats.values()).map((data) => data.count));
    return Math.max(maxCount, 1);
  }, [nightStats, config.matches_per_round, autoRound]);

  const usedPhases = React.useMemo(() => {
    const used = new Set<TournamentConfig['current_phase']>();

    (matches || []).forEach((match) => {
      const round = match.round;
      if (typeof round !== 'number') return;
      if (round < 1000) {
        used.add('grupos');
        return;
      }
      if (round in KNOCKOUT_PHASE_BY_ROUND) {
        used.add(KNOCKOUT_PHASE_BY_ROUND[round]);
      }
    });

    return used;
  }, [matches]);

  const autoPhase = React.useMemo<TournamentConfig['current_phase']>(() => {
    return detectTournamentPhase((matches || []).map((m) => ({
      round: m.round,
      status: m.status,
    })));
  }, [matches]);

  React.useEffect(() => {
    if (!loading && config.id) {
      if (isDirty) return;
      setForm({
        total_rounds: config.total_rounds,
        matches_per_round: config.matches_per_round,
        current_phase: config.current_phase,
        current_round: config.current_round,
        group_unit: config.group_unit || 'night',
      });
      setGroupCVisibility(normalizeGroupCVisibility(config.group_c_visibility));
    }
  }, [
    loading,
    config.id,
    config.total_rounds,
    config.matches_per_round,
    config.current_phase,
    config.current_round,
    config.group_c_visibility,
    config.group_unit,
    isDirty,
  ]);

  React.useEffect(() => {
    try {
      const raw = localStorage.getItem('copa_unasp_admin_manual_phase_override');
      setManualPhaseOverride(raw === '1');
    } catch {
      setManualPhaseOverride(false);
    }
  }, []);

  React.useEffect(() => {
    try {
      localStorage.setItem('copa_unasp_admin_manual_phase_override', manualPhaseOverride ? '1' : '0');
    } catch {
      // ignore
    }
  }, [manualPhaseOverride]);

  React.useEffect(() => {
    setForm((prev) => {
      const maxRound = Math.max(1, prev.total_rounds || 1);
      if (prev.current_round <= maxRound) return prev;
      return { ...prev, current_round: maxRound };
    });
  }, [form.total_rounds]);

  React.useEffect(() => {
    if (manualPhaseOverride) return;
    setForm((prev) => {
      if (prev.current_phase === autoPhase) return prev;
      return { ...prev, current_phase: autoPhase };
    });
  }, [autoPhase, manualPhaseOverride]);

  React.useEffect(() => {
    if (loading) return;
    setForm((prev) => {
      let changed = false;
      let next = prev;

      if (!manualPhaseOverride && prev.current_round !== autoRound) {
        next = { ...next, current_round: autoRound };
        changed = true;
      }

      if (!manualPhaseOverride && prev.matches_per_round !== autoMatchesPerRound) {
        next = { ...next, matches_per_round: autoMatchesPerRound };
        changed = true;
      }

      if (!manualPhaseOverride && prev.current_phase !== autoPhase) {
        next = { ...next, current_phase: autoPhase };
        changed = true;
      }

      return changed ? next : prev;
    });
  }, [loading, autoRound, autoMatchesPerRound, autoPhase, manualPhaseOverride]);

  const lastAutoSave = React.useRef<string>('');

  React.useEffect(() => {
    if (loading) return;
    if (!config.id) return;

    const desiredPhase = manualPhaseOverride ? form.current_phase : autoPhase;
    const nextUpdates: Partial<TournamentConfig> = {};

    if (!manualPhaseOverride && config.current_phase !== desiredPhase) {
      nextUpdates.current_phase = desiredPhase;
    }

    if (!manualPhaseOverride && config.current_round !== autoRound) {
      nextUpdates.current_round = autoRound;
    }

    if (!manualPhaseOverride && config.matches_per_round !== autoMatchesPerRound) {
      nextUpdates.matches_per_round = autoMatchesPerRound;
    }

    if (Object.keys(nextUpdates).length === 0) return;

    const signature = JSON.stringify({ id: config.id, ...nextUpdates });
    if (lastAutoSave.current === signature) return;
    lastAutoSave.current = signature;

    void saveConfig(nextUpdates).catch((err) => {
      console.warn('Falha ao atualizar configuracao automaticamente:', err);
    });
  }, [
    loading,
    config.id,
    config.current_phase,
    config.current_round,
    config.matches_per_round,
    autoPhase,
    autoRound,
    autoMatchesPerRound,
    manualPhaseOverride,
    form.current_phase,
    saveConfig,
  ]);

  const handleSave = async () => {
    try {
      const payload = {
        ...form,
        current_phase: manualPhaseOverride ? form.current_phase : autoPhase,
        group_c_visibility: groupCVisibility,
      };

      await saveConfig(payload);
      
      // Update local storage as a quick-sync cache
      try {
        localStorage.setItem(`copa_unasp_group_c_visibility_v1_${division}`, JSON.stringify(groupCVisibility));
      } catch {
        // ignore local cache errors
      }
      
      toast.success('Configurações salvas com sucesso!');
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
      setIsDirty(false);
    } catch (err: unknown) {
      console.error('Failed to save tournament config:', err);
      toast.error(getErrorMessage(err, 'Erro ao salvar configurações no servidor.'));
    }
  };

  const phaseLabel: Record<string, string> = {
    grupos: 'Fase de Grupos',
    oitavas: 'Oitavas de Final',
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
        <div className="form-group" style={{ marginBottom: '1rem' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <input
              type="checkbox"
              checked={manualPhaseOverride}
              onChange={(e) => {
                setManualPhaseOverride(e.target.checked);
                setIsDirty(true);
              }}
            />
            Override manual de fase
          </label>
          <span className="form-hint">Use apenas em caso de emergencia. Desativado = fase automatica por partidas.</span>
        </div>

        <div className="tournament-config-grid">
          {/* Fase Atual (Automatica) */}
          <div className="form-group">
            <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem' }}>
              <span>{manualPhaseOverride ? 'Fase Atual (Manual)' : 'Fase Atual (Automática)'}</span>
              {!manualPhaseOverride ? (
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => {
                    setManualPhaseOverride(true);
                    setIsDirty(true);
                  }}
                >
                  Mudar fase
                </button>
              ) : (
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => {
                    setManualPhaseOverride(false);
                    setIsDirty(true);
                  }}
                >
                  Voltar p/ automático
                </button>
              )}
            </label>
            {manualPhaseOverride ? (
              <select
                value={form.current_phase}
                onChange={e => {
                  setForm({ ...form, current_phase: e.target.value as TournamentConfig['current_phase'] });
                  setIsDirty(true);
                }}
              >
                <option value="grupos" disabled={usedPhases.has('grupos') && form.current_phase !== 'grupos'}>
                  Fase de Grupos{usedPhases.has('grupos') && form.current_phase !== 'grupos' ? ' (ja usada)' : ''}
                </option>
                <option value="oitavas" disabled={usedPhases.has('oitavas') && form.current_phase !== 'oitavas'}>
                  Oitavas de Final{usedPhases.has('oitavas') && form.current_phase !== 'oitavas' ? ' (ja usada)' : ''}
                </option>
                <option value="quartas" disabled={usedPhases.has('quartas') && form.current_phase !== 'quartas'}>
                  Quartas de Final{usedPhases.has('quartas') && form.current_phase !== 'quartas' ? ' (ja usada)' : ''}
                </option>
                <option value="semifinal" disabled={usedPhases.has('semifinal') && form.current_phase !== 'semifinal'}>
                  Semifinal{usedPhases.has('semifinal') && form.current_phase !== 'semifinal' ? ' (ja usada)' : ''}
                </option>
                <option value="final" disabled={usedPhases.has('final') && form.current_phase !== 'final'}>
                  Final{usedPhases.has('final') && form.current_phase !== 'final' ? ' (ja usada)' : ''}
                </option>
              </select>
            ) : (
              <input type="text" value={phaseLabel[autoPhase]} readOnly />
            )}
            <span className="form-hint">
              {manualPhaseOverride
                ? 'Forcando fase manualmente para o sistema inteiro.'
                : 'Detectada automaticamente pelas partidas cadastradas (grupos e mata-mata).'}
            </span>
          </div>

          {/* Total de Noites */}
          <div className="form-group">
            <label>Total de {groupUnitLabelPlural} (Fase de Grupos)</label>
            <input
              type="number"
              min={1} max={20}
              value={form.total_rounds}
              onChange={e => {
                const parsed = parseInt(e.target.value);
                if (!Number.isFinite(parsed)) return;
                const nextTotal = Math.max(1, Math.min(20, parsed));
                setForm((prev) => ({
                  ...prev,
                  total_rounds: nextTotal,
                  current_round: Math.min(prev.current_round || 1, nextTotal),
                }));
                setIsDirty(true);
              }}
            />
            <span className="form-hint">Ex: 5 {groupUnitLabelPlural.toLowerCase()} → depois vai ao Mata-Mata</span>
          </div>

          {/* Unidade (Grupos): Noite x Rodada */}
          <div className="form-group">
            <label>Unidade (Fase de Grupos)</label>
            <select
              value={groupUnit}
              onChange={(e) => {
                setForm((prev) => ({ ...prev, group_unit: e.target.value as TournamentConfig['group_unit'] }));
                setIsDirty(true);
              }}
            >
              <option value="night">Noite</option>
              <option value="round">Rodada</option>
            </select>
            <span className="form-hint">Muda textos e a regra de agrupamento na fase de grupos.</span>
          </div>

          {/* Partidas por Noite */}
          <div className="form-group">
            <label>Partidas por {groupUnitLabel}</label>
            <input
              type="number"
              min={1} max={20}
              value={form.matches_per_round}
              readOnly={!manualPhaseOverride}
              aria-readonly={manualPhaseOverride ? 'false' : 'true'}
              onChange={(e) => {
                if (!manualPhaseOverride) return;
                const parsed = parseInt(e.target.value);
                if (!Number.isFinite(parsed)) return;
                const nextValue = Math.max(1, Math.min(20, parsed));
                setForm({ ...form, matches_per_round: nextValue });
                setIsDirty(true);
              }}
            />
            <span className="form-hint">
              {manualPhaseOverride
                ? 'Defina manualmente se precisar (emergencia).'
                : 'Atualizado automaticamente com base nas partidas da fase de grupos'}
            </span>
          </div>

          {/* Noite/Rodada Atual */}
          {(manualPhaseOverride ? form.current_phase : autoPhase) === 'grupos' && (
            <div className="form-group">
              <label>{groupUnitLabel} Atual</label>
              <select
                value={form.current_round}
                disabled={!manualPhaseOverride}
                onChange={(e) => {
                  setForm({ ...form, current_round: parseInt(e.target.value) || 1 });
                  setIsDirty(true);
                }}
              >
                {Array.from({ length: form.total_rounds }, (_, i) => i + 1).map(r => (
                  <option key={r} value={r}>{groupUnitLabel} {r}</option>
                ))}
              </select>
              <span className="form-hint">
                {manualPhaseOverride
                  ? `Defina manualmente a ${groupUnitLabel} Atual (emergencia).`
                  : `Avanca quando todos os jogos da ${groupUnitLabel.toLowerCase()} finalizam; se nao houver jogos, fica aguardando`}
              </span>
            </div>
          )}
        </div>

        <div className="poll-presets-panel glass" style={{ marginTop: '1rem' }}>
          <div className="poll-presets-head">
            <strong>Visibilidade do Grupo C (usuarios normais)</strong>
            <span>Escolha em quais menus/telas o Grupo C pode aparecer para quem nao e admin.</span>
          </div>
          <div className="push-pref-list" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.5rem' }}>
            <label className="push-pref-check">
              <input
                type="checkbox"
                checked={groupCVisibility.teams}
                onChange={(e) => {
                  setGroupCVisibility((prev) => ({ ...prev, teams: e.target.checked }));
                  setIsDirty(true);
                }}
              />
              <span>Menu Equipes</span>
            </label>
            <label className="push-pref-check">
              <input
                type="checkbox"
                checked={groupCVisibility.players}
                onChange={(e) => {
                  setGroupCVisibility((prev) => ({ ...prev, players: e.target.checked }));
                  setIsDirty(true);
                }}
              />
              <span>Menu Jogadores</span>
            </label>
            <label className="push-pref-check">
              <input
                type="checkbox"
                checked={groupCVisibility.standings}
                onChange={(e) => {
                  setGroupCVisibility((prev) => ({ ...prev, standings: e.target.checked }));
                  setIsDirty(true);
                }}
              />
              <span>Menu Classificacao</span>
            </label>
            <label className="push-pref-check">
              <input
                type="checkbox"
                checked={groupCVisibility.favorite_team_menu}
                onChange={(e) => {
                  setGroupCVisibility((prev) => ({ ...prev, favorite_team_menu: e.target.checked }));
                  setIsDirty(true);
                }}
              />
              <span>Seletor de Time Favorito</span>
            </label>
            <label className="push-pref-check">
              <input
                type="checkbox"
                checked={groupCVisibility.matches}
                onChange={(e) => setGroupCVisibility((prev) => ({ ...prev, matches: e.target.checked }))}
              />
              <span>Menu Jogos</span>
            </label>
          </div>
        </div>

        {/* Resumo Visual */}
        <div className="tournament-summary">
          <div className="t-summary-item">
            <span className="t-summary-label">Fase</span>
            <span className="t-summary-value">{phaseLabel[manualPhaseOverride ? form.current_phase : autoPhase]}</span>
          </div>
          {autoPhase === 'grupos' && (
            <>
              <div className="t-summary-item">
                <span className="t-summary-label">Noite</span>
                <span className="t-summary-value">{form.current_round} de {form.total_rounds}</span>
              </div>
              <div className="t-summary-item">
                <span className="t-summary-label">Jogos/Noite</span>
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
  const [polls, setPolls] = useState<Poll[]>([]);
  const [loading, setLoading] = useState(true);
  const { confirm: confirmAction, ConfirmElement } = useConfirm();
  const { config } = useTournamentConfig();
  const groupUnit = config?.group_unit === 'round' ? 'round' : 'night';
  const unitLabel = groupUnit === 'round' ? 'rodada' : 'noite';
  type PollFormOptionInput = { text: string; image_url: string };
  type PollFormData = { question: string; options: PollFormOptionInput[] };
  type PollVoteRow = {
    poll_id: string | null;
    option_id: string | null;
    user_id: string | null;
    created_at: string | null;
  };
  type PollVoteView = {
    optionId: string;
    userId: string | null;
    voterLabel: string;
    createdAt: string | null;
    optionText?: string;
  };

  const [isAdding, setIsAdding] = useState(false);
  const [editingPollId, setEditingPollId] = useState<string | null>(null);
  const [formData, setFormData] = useState<PollFormData>({ 
    question: '', 
    options: [{ text: '', image_url: '' }, { text: '', image_url: '' }]
  });
  const [selectedPollPresetId, setSelectedPollPresetId] = useState<string | null>(null);
  const [pollVotesByPollId, setPollVotesByPollId] = useState<Record<string, PollVoteView[]>>({});
  const [pollVotesLoading, setPollVotesLoading] = useState(false);
  const [pollVotesError, setPollVotesError] = useState<string | null>(null);
  const [uploadingOptionIndex, setUploadingOptionIndex] = useState<number | null>(null);

  const normalizePollOptions = (raw: unknown): PollOption[] => {
    if (Array.isArray(raw)) {
      return raw
        .map((opt, index) => {
          if (!opt || typeof opt !== 'object') return null;
          const candidate = opt as Partial<PollOption>;
          const text = typeof candidate.text === 'string' ? candidate.text.trim() : '';
          if (!text) return null;
          const normalized: PollOption = {
            id: typeof candidate.id === 'string' && candidate.id.trim() ? candidate.id : `opt_${index}`,
            text,
            votes: Number(candidate.votes || 0),
          };
          if (typeof candidate.image_url === 'string' && candidate.image_url.trim()) {
            normalized.image_url = candidate.image_url;
          }
          return normalized;
        })
        .filter((opt): opt is PollOption => opt !== null);
    }

    if (typeof raw === 'string') {
      try {
        const parsed = JSON.parse(raw) as unknown;
        return normalizePollOptions(parsed);
      } catch {
        return [];
      }
    }

    return [];
  };

  const pollPresets: Array<{ id: string; label: string; question: string; options: string[] }> = [
    {
      id: 'mvp-rodada',
      label: `Craque da ${unitLabel}`,
      question: `Quem foi o craque da ${unitLabel}?`,
      options: ['Jogador 1', 'Jogador 2', 'Jogador 3'],
    },
    {
      id: 'favorito-titulo',
      label: 'Favorito ao titulo',
      question: 'Quem e o favorito ao titulo da Copa?',
      options: ['Equipe A', 'Equipe B', 'Equipe C', 'Outra equipe'],
    },
    {
      id: 'melhor-jogo',
      label: 'Melhor jogo',
      question: `Qual foi o melhor jogo da ${unitLabel}?`,
      options: ['Jogo 1', 'Jogo 2', 'Jogo 3'],
    },
    {
      id: 'palpite-final',
      label: 'Palpite de placar',
      question: 'Qual seu palpite para a final?',
      options: ['Vitoria equipe A', 'Empate no tempo normal', 'Vitoria equipe B'],
    },
  ];

  const trimmedQuestion = formData.question.trim();
  const validOptionValues = formData.options.map((o) => o.text.trim()).filter((o) => o.length > 0);
  const uniqueOptionsCount = new Set(validOptionValues.map((o) => o.toLowerCase())).size;

  const questionQuality =
    trimmedQuestion.length < 12
      ? { label: 'Pergunta curta', tone: 'low' as const }
      : trimmedQuestion.length > 90
        ? { label: 'Pergunta longa', tone: 'high' as const }
        : { label: 'Pergunta boa', tone: 'good' as const };

  const optionsQuality =
    validOptionValues.length < 2
      ? { label: 'Adicione mais opcoes', tone: 'low' as const }
      : uniqueOptionsCount < validOptionValues.length
        ? { label: 'Opcoes duplicadas', tone: 'high' as const }
        : validOptionValues.length > 6
          ? { label: 'Muitas opcoes', tone: 'low' as const }
          : { label: 'Opcoes equilibradas', tone: 'good' as const };

  const applyPollPreset = (presetId: string) => {
    const preset = pollPresets.find((item) => item.id === presetId);
    if (!preset) return;

    setSelectedPollPresetId(preset.id);
    setFormData({
      question: preset.question,
      options: preset.options.map((text) => ({ text, image_url: '' })),
    });
    toast.success(`Modelo aplicado: ${preset.label}`);
  };

  const updateOptionField = (index: number, patch: Partial<PollFormOptionInput>) => {
    setFormData((prev) => ({
      ...prev,
      options: prev.options.map((option, idx) => (idx === index ? { ...option, ...patch } : option)),
    }));
  };

  const removeOptionAt = (index: number) => {
    setFormData((prev) => ({
      ...prev,
      options: prev.options.filter((_, idx) => idx !== index),
    }));
  };

  const addEmptyOption = () => {
    setFormData((prev) => ({
      ...prev,
      options: [...prev.options, { text: '', image_url: '' }],
    }));
  };

  const handleOptionImageUpload = async (index: number, event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploadingOptionIndex(index);
    const url = await uploadToStorage(file, 'images', 'poll-options');
    if (url) {
      updateOptionField(index, { image_url: url });
      toast.success('Imagem da opcao carregada com sucesso!');
    }
    setUploadingOptionIndex(null);
  };

  const totalVotesFromOptions = (poll: Poll) => {
    return (poll.options || []).reduce((acc, option) => acc + Number(option.votes || 0), 0);
  };

  const fetchPollVotes = async (pollList: Poll[]) => {
    const pollIds = pollList.map((poll) => poll.id).filter(Boolean);
    if (pollIds.length === 0) {
      setPollVotesByPollId({});
      setPollVotesError(null);
      return;
    }

    setPollVotesLoading(true);
    setPollVotesError(null);

    try {
      const { data: voteRows, error: votesError } = await supabase
        .from('poll_votes')
        .select('poll_id, option_id, user_id, created_at')
        .in('poll_id', pollIds);

      if (votesError) throw votesError;

      const rows = ((voteRows || []) as PollVoteRow[]).filter((row) => row.poll_id && row.option_id);
      const userIds = Array.from(new Set(rows.map((row) => row.user_id).filter(Boolean))) as string[];

      let voterLabelById: Record<string, string> = {};
      if (userIds.length > 0) {
        const { data: profiles, error: profilesError } = await supabase
          .from('profiles')
          .select('id, email')
          .in('id', userIds);

        if (profilesError) throw profilesError;

        voterLabelById = Object.fromEntries(
          (profiles || []).map((profile) => {
            const email = typeof profile.email === 'string' && profile.email.trim() ? profile.email : null;
            const label = email || `Usuario ${String(profile.id).slice(0, 8)}`;
            return [String(profile.id), label];
          })
        );
      }

      const grouped: Record<string, PollVoteView[]> = {};
      rows.forEach((row) => {
        const pollId = String(row.poll_id);
        if (!grouped[pollId]) grouped[pollId] = [];
        const voterLabel = row.user_id ? voterLabelById[row.user_id] || `Usuario ${row.user_id.slice(0, 8)}` : 'Usuario anonimo';
        grouped[pollId].push({
          optionId: String(row.option_id),
          userId: row.user_id,
          voterLabel,
          createdAt: row.created_at,
        });
      });

      setPollVotesByPollId(grouped);
    } catch (err: unknown) {
      console.warn('Nao foi possivel carregar votos detalhados de enquetes.', err);
      setPollVotesByPollId({});
      // O erro só será exibido se for algo crítico que impeça a experiência básica,
      // caso contrário, apenas escondemos a tabela detalhada silenciosamente.
      setPollVotesError(null);
    } finally {
      setPollVotesLoading(false);
    }
  };

  const fetchPolls = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('polls')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      const normalizedPolls = ((data || []) as Array<Partial<Poll> & { options?: unknown }>).map((poll) => ({
        id: String(poll.id || ''),
        question: String(poll.question || ''),
        active: Boolean(poll.active),
        options: normalizePollOptions(poll.options),
      }));
      setPolls(normalizedPolls);
      void fetchPollVotes(normalizedPolls);
    } catch (err: unknown) {
      toast.error(getErrorMessage(err, 'Erro ao carregar enquetes'));
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
      const validOptions = formData.options.filter((o) => o.text.trim() !== '');
      if (validOptions.length < 2) return toast.error('Adicione pelo menos 2 opções válidas!');

      const newPoll = {
        question: formData.question,
        options: validOptions.map((option, index) => ({
          id: `opt_${index}_${Date.now()}`,
          text: option.text.trim(),
          votes: 0,
          image_url: option.image_url?.trim() || undefined,
        })),
        active: false // Criada como inativa por padrão
      };

      const { error } = await supabase.from('polls').insert([newPoll]);
      if (error) throw error;
      
      setFormData({ question: '', options: [{ text: '', image_url: '' }, { text: '', image_url: '' }] });
      setSelectedPollPresetId(null);
      setIsAdding(false);
      fetchPolls();
    } catch (err: unknown) {
      toast.error(getErrorMessage(err, 'Erro ao criar enquete'));
    }
  };

  const handleUpdatePoll = async (id: string, data: PollFormData) => {
    try {
      const validOptions = data.options.filter((o: PollFormOptionInput) => o.text.trim() !== '');
      const { error } = await supabase.from('polls').update({
        question: data.question,
        options: validOptions.map((option: PollFormOptionInput, index: number) => ({
          id: `opt_${index}_${Date.now()}`,
          text: option.text.trim(),
          votes: 0,
          image_url: option.image_url?.trim() || undefined,
        }))
      }).eq('id', id);
      if (error) throw error;
      setEditingPollId(null);
      fetchPolls();
      toast.success('Enquete atualizada!');
    } catch (err: unknown) {
      toast.error(getErrorMessage(err, 'Erro ao atualizar enquete'));
    }
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
          {
            url: '/',
            category: 'polls',
            important: true,
          }
        );
      }
      
      fetchPolls();
    } catch (err: unknown) {
      toast.error(getErrorMessage(err, 'Erro ao atualizar enquete'));
    }
  };

  const handleDelete = async (id: string) => {
    if (!(await confirmAction({
      title: 'Excluir Enquete',
      description: 'Tem certeza que deseja excluir esta enquete permanentemente?',
      variant: 'danger'
    }))) return;
    try {
      const { error } = await supabase.from('polls').delete().eq('id', id);
      if (error) throw error;
      fetchPolls();
    } catch (err: unknown) {
      toast.error(getErrorMessage(err, 'Erro ao excluir enquete'));
    }
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
          <div className="poll-presets-panel glass">
            <div className="poll-presets-head">
              <strong>Modelos de enquete</strong>
              <span>Use um modelo para preencher pergunta e opcoes em um clique.</span>
            </div>
            <div className="poll-presets-grid" role="group" aria-label="Modelos de enquete">
              {pollPresets.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  className={`poll-preset-btn ${selectedPollPresetId === preset.id ? 'active' : ''}`}
                  onClick={() => applyPollPreset(preset.id)}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          <div className="form-group-full">
            <label>Pergunta da Enquete</label>
            <input 
              type="text" 
              required 
              value={formData.question}
              onChange={e => setFormData({...formData, question: e.target.value})}
              placeholder="Ex: Quem será o artilheiro?"
            />
            <div className="poll-quality-row" aria-live="polite">
              <span className={`poll-quality-chip ${questionQuality.tone}`}>{questionQuality.label}</span>
              <span>{trimmedQuestion.length} caracteres</span>
            </div>
          </div>
          
          <div className="poll-options-editor">
            <label>Opções de Resposta</label>
            {formData.options.map((option, idx) => (
              <div key={idx} className="option-input-row">
                <input 
                  type="text"
                  placeholder={`Opção ${idx + 1}`}
                  value={option.text}
                  onChange={e => updateOptionField(idx, { text: e.target.value })}
                  required={idx < 2}
                />
                <div className="poll-option-media-inputs">
                  <label className="poll-option-upload-btn">
                    {uploadingOptionIndex === idx ? 'Enviando...' : 'Upload imagem'}
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => void handleOptionImageUpload(idx, e)}
                      disabled={uploadingOptionIndex === idx}
                    />
                  </label>
                  <input
                    type="url"
                    placeholder="URL da imagem (opcional)"
                    value={option.image_url}
                    onChange={(e) => updateOptionField(idx, { image_url: e.target.value })}
                  />
                  {option.image_url && (
                    <img src={option.image_url} alt={`Opcao ${idx + 1}`} className="poll-option-admin-thumb" loading="lazy" decoding="async" />
                  )}
                </div>
                {formData.options.length > 2 && (
                  <button type="button" className="btn-remove-opt" onClick={() => removeOptionAt(idx)}>✕</button>
                )}
              </div>
            ))}
            <button type="button" className="btn-add-opt" onClick={addEmptyOption}>
              + Adicionar Opção
            </button>
            <div className="poll-quality-row" aria-live="polite">
              <span className={`poll-quality-chip ${optionsQuality.tone}`}>{optionsQuality.label}</span>
              <span>{validOptionValues.length} validas</span>
              <span>{uniqueOptionsCount} unicas</span>
            </div>
          </div>
          
          <button type="submit" className="btn-save"><Save size={18} /> Criar Enquete</button>
        </form>
      )}

      <div className="admin-list">
        {loading ? (
          <div className="loading-box"><p>Carregando enquetes...</p></div>
        ) : (polls || []).map(poll => (
          <React.Fragment key={poll.id}>
            {(() => {
              const detailedVotes = pollVotesByPollId[poll.id] || [];
              const hasDetailedVotes = detailedVotes.length > 0;
              const totalVotes = hasDetailedVotes ? detailedVotes.length : totalVotesFromOptions(poll);

              return (
            <div className={`admin-list-item poll-item ${poll.active ? 'active-poll' : ''}`}>
              <div className="item-main">
                <Shield size={24} className={poll.active ? 'icon-active' : 'icon-subtle'} />
                <div className="item-info">
                  <strong>{poll.question}</strong>
                  <span>{(poll.options || []).length} opções • Total: {totalVotes} votos</span>
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
                  setFormData({
                    question: poll.question,
                    options: (poll.options || []).map((o) => ({ text: o.text, image_url: o.image_url || '' })),
                  });
                }}><Settings2 size={18} /></button>
                <button className="btn-icon delete" onClick={() => handleDelete(poll.id)}><Trash2 size={18} /></button>
              </div>
            </div>
              );
            })()}

            <div className="poll-insights-card glass">
              <div className="poll-insights-header">
                <strong>Resumo de votos</strong>
                {pollVotesLoading ? <span>Atualizando votos...</span> : <span>Dados em tempo real</span>}
              </div>

              <div className="poll-insights-options">
                {(poll.options || []).map((option) => {
                  const detailedVotes = pollVotesByPollId[poll.id] || [];
                  const hasDetailedVotes = detailedVotes.length > 0;
                  const optionVotes = hasDetailedVotes
                    ? detailedVotes.filter((vote) => vote.optionId === option.id).length
                    : Number(option.votes || 0);
                  const totalVotes = hasDetailedVotes
                    ? detailedVotes.length
                    : totalVotesFromOptions(poll);
                  const percentage = totalVotes > 0 ? Math.round((optionVotes / totalVotes) * 100) : 0;
                  const voters = hasDetailedVotes
                    ? detailedVotes.filter((vote) => vote.optionId === option.id)
                    : [];

                  return (
                    <div key={option.id} className="poll-insight-option-row">
                      <div className="poll-insight-option-head">
                        <span className="poll-insight-option-label">
                          {option.image_url && (
                            <img src={option.image_url} alt={option.text} className="poll-option-admin-thumb" loading="lazy" decoding="async" />
                          )}
                          <span>{option.text}</span>
                        </span>
                        <strong>{optionVotes} votos • {percentage}%</strong>
                      </div>
                      <div className="poll-insight-option-bar-bg">
                        <div className="poll-insight-option-bar-fill" style={{ width: `${percentage}%` }} />
                      </div>
                      {voters.length > 0 && (
                        <div className="poll-voter-list">
                          {voters.map((vote, index) => (
                            <span key={`${option.id}-${vote.userId || index}-${index}`} className="poll-voter-chip">
                              {vote.voterLabel}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {(() => {
                const detailedVotes = pollVotesByPollId[poll.id] || [];
                if (detailedVotes.length === 0) return null;
                const optionTextById = Object.fromEntries((poll.options || []).map((opt) => [opt.id, opt.text]));
                const totalVotes = detailedVotes.length;
                const orderedVotes = [...detailedVotes].sort((a, b) => {
                  const aTime = a.createdAt ? Date.parse(a.createdAt) : 0;
                  const bTime = b.createdAt ? Date.parse(b.createdAt) : 0;
                  return bTime - aTime;
                });

                return (
                  <div className="poll-votes-table-wrap">
                    <div className="poll-insights-header" style={{ marginTop: '0.9rem' }}>
                      <strong>Votos por usuario</strong>
                      <span>{totalVotes} registros</span>
                    </div>
                    <table className="poll-votes-table">
                      <thead>
                        <tr>
                          <th>Usuario</th>
                          <th>Opcao</th>
                          <th>% da opcao</th>
                          <th>Data/Hora</th>
                        </tr>
                      </thead>
                      <tbody>
                        {orderedVotes.map((vote, index) => {
                          const optionId = vote.optionId;
                          const optionVotes = detailedVotes.filter((item) => item.optionId === optionId).length;
                          const optionPct = totalVotes > 0 ? Math.round((optionVotes / totalVotes) * 100) : 0;
                          return (
                            <tr key={`${optionId}-${vote.userId || 'anon'}-${index}`}>
                              <td>{vote.voterLabel}</td>
                              <td>{optionTextById[optionId] || optionId}</td>
                              <td>{optionPct}%</td>
                              <td>{vote.createdAt ? new Date(vote.createdAt).toLocaleString('pt-BR') : '-'}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                );
              })()}

              {pollVotesError && (
                <p className="poll-insights-warning">{pollVotesError}</p>
              )}
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
                      <input
                        type="text"
                        value={opt.text}
                        onChange={e => updateOptionField(idx, { text: e.target.value })}
                      />
                      <div className="poll-option-media-inputs">
                        <label className="poll-option-upload-btn">
                          {uploadingOptionIndex === idx ? 'Enviando...' : 'Upload imagem'}
                          <input
                            type="file"
                            accept="image/*"
                            onChange={(e) => void handleOptionImageUpload(idx, e)}
                            disabled={uploadingOptionIndex === idx}
                          />
                        </label>
                        <input
                          type="url"
                          placeholder="URL da imagem (opcional)"
                          value={opt.image_url}
                          onChange={(e) => updateOptionField(idx, { image_url: e.target.value })}
                        />
                        {opt.image_url && (
                          <img src={opt.image_url} alt={`Opcao ${idx + 1}`} className="poll-option-admin-thumb" loading="lazy" decoding="async" />
                        )}
                      </div>
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
        {(!polls || polls.length === 0) && !loading && <p className="empty-msg">Nenhuma enquete cadastrada.</p>}
      </div>
      {ConfirmElement}
    </div>
  );
};

const GlobalPlayerManagement = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [isBulkAdding, setIsBulkAdding] = useState(false);
  const [bulkText, setBulkText] = useState('');
  const [bulkTeamOverrideId, setBulkTeamOverrideId] = useState('');
  const [bulkImporting, setBulkImporting] = useState(false);
  const [fixingNamesUppercase, setFixingNamesUppercase] = useState(false);
  const [photoBulkImporting, setPhotoBulkImporting] = useState(false);
  const photoInputRef = useRef<HTMLInputElement | null>(null);
  const [isSubmittingGlobalPlayer, setIsSubmittingGlobalPlayer] = useState(false);
  const { division } = useDivisionContext();
  const { teams } = useTeams();
  const { players: allPlayers, loading, refresh: refreshPlayers } = usePlayers();
  const { confirm: confirmAction, ConfirmElement } = useConfirm();
  const [isUpdatingGlobalPlayer, setIsUpdatingGlobalPlayer] = useState(false);
  const [editingGlobalPlayerId, setEditingGlobalPlayerId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const queryClient = useQueryClient();
  
  const [formData, setFormData] = useState({ 
    name: '', number: '', position: 'Ala', team_id: '', photo_url: '', bio: '',
    goals_count: '0', assists: '0', yellow_cards: '0', red_cards: '0', clean_sheets: '0'
  });

  const [editFormData, setEditFormData] = useState({
    name: '', number: '', position: 'Ala', team_id: '', photo_url: '', bio: '',
    goals_count: '0', assists: '0', yellow_cards: '0', red_cards: '0', clean_sheets: '0'
  });

  const normalizeKey = (value: string) => {
    return (value || '')
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ');
  };

  const normalizePhotoFileKey = (fileName: string) => {
    const base = String(fileName || '').replace(/\.[^.]+$/, '');
    return normalizeKey(base).replace(/[^a-z0-9]/g, '');
  };

  const cleanTeamHeader = (value: string) => {
    return (value || '')
      .trim()
      .replace(/^\*+/, '')
      .replace(/\*+$/, '')
      .replace(/[:\-–—]+\s*$/, '')
      .trim();
  };

  const mapPositionToken = (raw: string | null) => {
    const key = normalizeKey(raw || '').replace(/[^a-z0-9]/g, '');
    if (!key) return 'Ala';
    if (key.startsWith('gol') || key.startsWith('gk') || key.startsWith('goleiro')) return 'Goleiro';
    if (key.startsWith('fix')) return 'Fixo';
    if (key.startsWith('ala')) return 'Ala';
    if (key.startsWith('piv')) return 'Pivô';
    return 'Ala';
  };

  const parseBulkText = (text: string) => {
    const rawLines = String(text || '').split(/\r?\n/);
    const lines = rawLines
      .map((l) => l.replace(/•/g, '').trim())
      .filter(Boolean);

    if (lines.length === 0) {
      return { teamName: null as string | null, rows: [] as Array<{ name: string; position: string }> };
    }

    const teamName = cleanTeamHeader(lines[0]);
    const rows: Array<{ name: string; position: string; raw: string }> = [];

    for (const rawLine of lines.slice(1)) {
      const line = rawLine.trim();
      if (!line) continue;

      const m = line.match(/^(.*?)\s*\(([^)]+)\)\s*$/);
      const name = normalizePlayerName((m ? m[1] : line).trim());
      const position = mapPositionToken(m ? m[2] : null);
      if (!name) continue;
      rows.push({ name, position, raw: rawLine });
    }

    return { teamName, rows };
  };

  const bulkParsed = useMemo(() => parseBulkText(bulkText), [bulkText]);

  const findTeamIdByName = (teamName: string | null) => {
    const key = normalizeKey(teamName || '');
    if (!key) return null;

    const list = teams || [];

    // 1) Match exato
    const exact = list.find((t) => normalizeKey(t.name) === key);
    if (exact?.id) return exact.id;

    // 2) Match por "contém" (se for único)
    const hits = list.filter((t) => {
      const tKey = normalizeKey(t.name);
      return tKey.includes(key) || key.includes(tKey);
    });
    if (hits.length === 1) return hits[0].id;

    return null;
  };

  const chunkArray = <T,>(arr: T[], size: number) => {
    const safe = Math.max(1, Math.floor(size || 1));
    const out: T[][] = [];
    for (let i = 0; i < arr.length; i += safe) out.push(arr.slice(i, i + safe));
    return out;
  };

  const bulkPlan = useMemo(() => {
    const { teamName, rows } = bulkParsed;
    const autoTeamId = findTeamIdByName(teamName);
    const resolvedTeamId = bulkTeamOverrideId || autoTeamId || '';

    const seenInPaste = new Set<string>();
    let duplicatesInPaste = 0;
    const uniqueRows = rows.filter((r) => {
      const key = normalizeKey(r.name);
      if (!key) return false;
      if (seenInPaste.has(key)) {
        duplicatesInPaste += 1;
        return false;
      }
      seenInPaste.add(key);
      return true;
    });

    const existingNames = new Set(
      resolvedTeamId
        ? (allPlayers || [])
            .filter((p) => p.team_id === resolvedTeamId)
            .map((p) => normalizeKey(p.name))
            .filter(Boolean)
        : []
    );

    let alreadyExists = 0;
    const toCreate = uniqueRows.filter((r) => {
      const key = normalizeKey(r.name);
      if (resolvedTeamId && existingNames.has(key)) {
        alreadyExists += 1;
        return false;
      }
      return true;
    });

    return {
      teamName,
      autoTeamId,
      resolvedTeamId,
      totalParsed: rows.length,
      duplicatesInPaste,
      alreadyExists,
      toCreate,
    };
  }, [bulkParsed, bulkTeamOverrideId, allPlayers, teams]);

  const handleBulkImport = async () => {
    if (bulkImporting) return;
    if (uploading) {
      toast.error('Aguarde uploads terminarem antes de importar.');
      return;
    }

    const { teamName } = bulkParsed;
    if (!teamName) {
      toast.error('Cole a lista com o nome da equipe na primeira linha.');
      return;
    }
    if (!bulkPlan.totalParsed || bulkPlan.totalParsed === 0) {
      toast.error('Nenhum atleta encontrado na lista.');
      return;
    }

    const teamId = bulkPlan.resolvedTeamId || null;
    if (!teamId) {
      toast.error(`Equipe \"${teamName}\" nao encontrada automaticamente. Selecione manualmente.`);
      return;
    }

    const toInsert = bulkPlan.toCreate.map((r) => ({
      division,
      team_id: teamId,
      name: normalizePlayerName(r.name),
      number: 0,
      position: r.position,
      photo_url: '',
      bio: '',
      goals_count: 0,
      assists: 0,
      yellow_cards: 0,
      red_cards: 0,
      clean_sheets: 0,
    })) as Array<Record<string, unknown>>;

    if (toInsert.length === 0) {
      toast('Nada para importar (todos ja existem ou sao duplicados).');
      return;
    }

    setBulkImporting(true);
    const chunks = chunkArray(toInsert, 50);
    const loadingToast = toast.loading(`Importando ${toInsert.length} atletas (0/${chunks.length} lotes)...`);

    try {
      const doInsertMany = async (payloadRows: Array<Record<string, unknown>>) => {
        return await withTimeout(
          supabase
            .from('players')
            .insert(payloadRows)
            .select('id, team_id, name, number, position, photo_url, bio, goals_count, assists, yellow_cards, red_cards, clean_sheets, teams(name)'),
          45000,
          'Tempo limite ao importar atletas'
        );
      };

      let insertedTotal = 0;
      const insertedRows: any[] = [];

      for (let i = 0; i < chunks.length; i += 1) {
        const chunk = chunks[i];
        let res = await withRetry(async () => await doInsertMany(chunk), 2);

        if (res.error && isMissingDivisionColumnError(res.error as any, 'division')) {
          markDivisionColumnMissing();
          const rowsNoDivision = chunk.map((row) => {
            const { division: _ignored, ...rest } = row as { division?: unknown } & Record<string, unknown>;
            return rest;
          });
          res = await withRetry(async () => await doInsertMany(rowsNoDivision), 2);
        }

        if (res.error) throw res.error;
        const data = Array.isArray(res.data) ? res.data : [];
        insertedTotal += data.length || chunk.length;
        insertedRows.push(...data);

        toast.loading(`Importando ${toInsert.length} atletas (${i + 1}/${chunks.length} lotes)...`, { id: loadingToast });
      }

      if (insertedRows.length > 0) {
        insertedRows.forEach((p) => upsertPlayerInCache(p as any));
      }

      void queryClient.invalidateQueries({ queryKey: ['players', division] });
      void queryClient.invalidateQueries({ queryKey: ['rankings', division] });
      void refreshPlayers();

      toast.success(`Importados ${insertedTotal} atletas!`, { id: loadingToast });
      setBulkText('');
      setBulkTeamOverrideId('');
      setIsBulkAdding(false);
    } catch (err: unknown) {
      toast.error(getErrorMessage(err, 'Erro ao importar atletas'), { id: loadingToast });
    } finally {
      setBulkImporting(false);
    }
  };

  useEffect(() => {
    if (!editingGlobalPlayerId) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [editingGlobalPlayerId]);

  const getTeamNameById = (teamId: string) => {
    return teams.find((t) => t.id === teamId)?.name || null;
  };

  const upsertPlayerInCache = (player: {
    id: string;
    team_id: string;
    name: string;
    number: number;
    position: string;
    photo_url?: string;
    bio?: string;
    goals_count?: number;
    assists?: number;
    yellow_cards?: number;
    red_cards?: number;
    clean_sheets?: number;
    teams?: { name?: string } | null;
  }, previousTeamId?: string) => {
    const teamName = player.teams?.name || getTeamNameById(player.team_id) || undefined;
    const normalizedPlayer = {
      ...player,
      teams: teamName ? { name: teamName } : undefined,
    };

    queryClient.setQueryData(['players', division, 'all'], (oldData: unknown) => {
      const list = Array.isArray(oldData) ? oldData : [];
      return [normalizedPlayer, ...list.filter((item: unknown) => (item as { id?: string })?.id !== player.id)];
    });

    queryClient.setQueryData(['players', division, player.team_id], (oldData: unknown) => {
      const list = Array.isArray(oldData) ? oldData : [];
      return [normalizedPlayer, ...list.filter((item: unknown) => (item as { id?: string })?.id !== player.id)];
    });

    if (previousTeamId && previousTeamId !== player.team_id) {
      queryClient.setQueryData(['players', division, previousTeamId], (oldData: unknown) => {
        const list = Array.isArray(oldData) ? oldData : [];
        return list.filter((item: unknown) => (item as { id?: string })?.id !== player.id);
      });
    }
  };

  const removePlayerFromCache = (playerId: string, teamId?: string) => {
    queryClient.setQueryData(['players', division, 'all'], (oldData: unknown) => {
      const list = Array.isArray(oldData) ? oldData : [];
      return list.filter((item: unknown) => (item as { id?: string })?.id !== playerId);
    });

    if (teamId) {
      queryClient.setQueryData(['players', division, teamId], (oldData: unknown) => {
        const list = Array.isArray(oldData) ? oldData : [];
        return list.filter((item: unknown) => (item as { id?: string })?.id !== playerId);
      });
    }
  };

  const handleFixNamesUppercase = async () => {
    if (fixingNamesUppercase) return;
    if (loading) {
      toast.error('Aguarde terminar de carregar os atletas.');
      return;
    }

    const list = Array.isArray(allPlayers) ? allPlayers : [];
    const toFix = list
      .map((p: any) => {
        const normalized = normalizePlayerName(p?.name);
        return {
          player: p,
          normalized,
          needsFix: Boolean(p?.id) && Boolean(normalized) && normalized !== p?.name,
        };
      })
      .filter((x) => x.needsFix);

    if (toFix.length === 0) {
      toast('Nenhum nome para corrigir.');
      return;
    }

    const ok = await confirmAction({
      title: 'Corrigir nomes para MAIÚSCULO',
      description: `Isso vai atualizar ${toFix.length} atleta(s) no banco. Deseja continuar?`,
      variant: 'danger',
    });
    if (!ok) return;

    setFixingNamesUppercase(true);
    const chunks = chunkArray(toFix, 10);
    const loadingToast = toast.loading(`Corrigindo nomes (0/${toFix.length})...`);

    try {
      let fixed = 0;
      for (let i = 0; i < chunks.length; i += 1) {
        const chunk = chunks[i];
        await Promise.all(
          chunk.map(async ({ player, normalized }) => {
            const { error } = await withTimeout(
              supabase
                .from('players')
                .update({ name: normalized })
                .eq('id', player.id),
              30000,
              'Tempo limite ao corrigir nome'
            );
            if (error) throw error;
            fixed += 1;
            upsertPlayerInCache({ ...(player as any), name: normalized } as any);
          })
        );

        toast.loading(`Corrigindo nomes (${fixed}/${toFix.length})...`, { id: loadingToast });
      }

      void queryClient.invalidateQueries({ queryKey: ['players', division] });
      void refreshPlayers();
      toast.success(`Corrigidos ${fixed} atleta(s)!`, { id: loadingToast });
    } catch (err: unknown) {
      toast.error(getErrorMessage(err, 'Erro ao corrigir nomes'), { id: loadingToast });
    } finally {
      setFixingNamesUppercase(false);
    }
  };

  const handlePickPhotos = () => {
    if (photoBulkImporting) return;
    photoInputRef.current?.click();
  };

  const handleAttachPhotosFromFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    if (photoBulkImporting) return;
    if (loading) {
      toast.error('Aguarde terminar de carregar os atletas.');
      return;
    }

    const playersList = Array.isArray(allPlayers) ? allPlayers : [];
    const playersByKey = new Map<string, any[]>();
    for (const p of playersList as any[]) {
      const key = normalizeKey(String(p?.name || '')).replace(/[^a-z0-9]/g, '');
      if (!key) continue;
      const arr = playersByKey.get(key) || [];
      arr.push(p);
      playersByKey.set(key, arr);
    }

    const selected = Array.from(files);
    const matches: Array<{ file: File; player: any }> = [];
    let skippedNoMatch = 0;
    let skippedAmbiguous = 0;

    for (const f of selected) {
      const key = normalizePhotoFileKey(f.name);
      const candidates = key ? playersByKey.get(key) : null;
      if (!candidates || candidates.length === 0) {
        skippedNoMatch += 1;
        continue;
      }
      if (candidates.length > 1) {
        skippedAmbiguous += 1;
        continue;
      }
      matches.push({ file: f, player: candidates[0] });
    }

    if (matches.length === 0) {
      toast('Nenhuma foto bateu com atletas pelo nome do arquivo.');
      return;
    }

    const ok = await confirmAction({
      title: 'Vincular fotos aos atletas',
      description:
        `Selecionadas: ${selected.length}. ` +
        `Vai vincular: ${matches.length}. ` +
        `Sem match: ${skippedNoMatch}. ` +
        `Ambiguas (nome repetido): ${skippedAmbiguous}. ` +
        'Continuar?',
      variant: 'warning',
    });
    if (!ok) return;

    setPhotoBulkImporting(true);
    const loadingToast = toast.loading(`Vinculando fotos (0/${matches.length})...`);

    try {
      const chunks = chunkArray(matches, 5);
      let done = 0;

      for (let i = 0; i < chunks.length; i += 1) {
        const chunk = chunks[i];
        await Promise.all(
          chunk.map(async ({ file, player }) => {
            const url = await uploadToStorage(file, 'images', 'player-photos');
            if (!url) throw new Error('Falha no upload da foto');

            const { error } = await withTimeout(
              supabase
                .from('players')
                .update({ photo_url: url })
                .eq('id', player.id),
              30000,
              'Tempo limite ao vincular foto'
            );
            if (error) throw error;

            done += 1;
            upsertPlayerInCache({ ...(player as any), photo_url: url } as any);
          })
        );

        toast.loading(`Vinculando fotos (${done}/${matches.length})...`, { id: loadingToast });
      }

      void queryClient.invalidateQueries({ queryKey: ['players', division] });
      void queryClient.invalidateQueries({ queryKey: ['rankings', division] });
      void refreshPlayers();
      toast.success(`Fotos vinculadas: ${done}!`, { id: loadingToast });
    } catch (err: unknown) {
      toast.error(getErrorMessage(err, 'Erro ao vincular fotos'), { id: loadingToast });
    } finally {
      setPhotoBulkImporting(false);
      if (photoInputRef.current) photoInputRef.current.value = '';
    }
  };

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
    if (isSubmittingGlobalPlayer) return;
    if (uploading) {
      toast.error('Aguarde o upload terminar antes de salvar.');
      return;
    }
    setIsSubmittingGlobalPlayer(true);
    const loadingToast = toast.loading('Salvando atleta...');
    try {
      const payload = {
        ...formData,
        name: normalizePlayerName(formData.name),
        division,
        number: parseInt(formData.number) || 0,
        goals_count: parseInt(formData.goals_count) || 0,
        assists: parseInt(formData.assists) || 0,
        yellow_cards: parseInt(formData.yellow_cards) || 0,
        red_cards: parseInt(formData.red_cards) || 0,
        clean_sheets: parseInt(formData.clean_sheets) || 0,
      } as Record<string, unknown>;

      const doInsert = async (payloadToInsert: Record<string, unknown>) => {
        return await withTimeout(
          supabase
            .from('players')
            .insert([payloadToInsert])
            .select('id, team_id, name, number, position, photo_url, bio, goals_count, assists, yellow_cards, red_cards, clean_sheets, teams(name)')
            .single(),
          30000,
          'Tempo limite ao cadastrar atleta'
        );
      };

      let res = await doInsert(payload);
      if (res.error) {
        if (isMissingDivisionColumnError(res.error as any, 'division')) {
          markDivisionColumnMissing();
          const { division: _ignored, ...payloadNoDivision } = payload as { division?: unknown } & Record<string, unknown>;
          res = await doInsert(payloadNoDivision);
        }
      }

      if (res.error) throw res.error;
      const data = res.data;

      if (data) {
        upsertPlayerInCache(data as {
          id: string;
          team_id: string;
          name: string;
          number: number;
          position: string;
          photo_url?: string;
          bio?: string;
          goals_count?: number;
          assists?: number;
          yellow_cards?: number;
          red_cards?: number;
          clean_sheets?: number;
          teams?: { name?: string } | null;
        });
      }

      setFormData({ 
        name: '', number: '', position: 'Ala', team_id: '', photo_url: '', bio: '',
        goals_count: '0', assists: '0', yellow_cards: '0', red_cards: '0', clean_sheets: '0'
      });
      setIsAdding(false);
      void queryClient.invalidateQueries({ queryKey: ['players', division] });
      void queryClient.invalidateQueries({ queryKey: ['rankings', division] });
      toast.success('Atleta cadastrado com sucesso!', { id: loadingToast });
    } catch (err: unknown) {
      toast.error(getErrorMessage(err, 'Erro ao cadastrar atleta'), { id: loadingToast });
    } finally {
      setIsSubmittingGlobalPlayer(false);
    }
  };

  const startEditPlayer = (p: {
    id: string;
    name: string;
    number: number;
    position: string;
    team_id: string;
    photo_url?: string;
    bio?: string;
    goals_count?: number;
    assists?: number;
    yellow_cards?: number;
    red_cards?: number;
    clean_sheets?: number;
  }) => {
    setEditingGlobalPlayerId(p.id);
    setEditFormData({
      name: maskPlayerName(p.name),
      number: String(p.number || 0),
      position: p.position || 'Ala',
      team_id: p.team_id || '',
      photo_url: p.photo_url || '',
      bio: p.bio || '',
      goals_count: String(p.goals_count || 0),
      assists: String(p.assists || 0),
      yellow_cards: String(p.yellow_cards || 0),
      red_cards: String(p.red_cards || 0),
      clean_sheets: String(p.clean_sheets || 0),
    });
  };

  const handleEditPhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const url = await uploadToStorage(file, 'images', 'player-photos');
    if (url) {
      setEditFormData(prev => ({ ...prev, photo_url: url }));
      toast.success('Foto carregada!');
    }
    setUploading(false);
  };

  const handleUpdatePlayer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingGlobalPlayerId) return;
    if (!editFormData.team_id) return toast.error('Selecione uma equipe!');
    if (isUpdatingGlobalPlayer) return;
    if (uploading) {
      toast.error('Aguarde o upload terminar antes de salvar.');
      return;
    }

    setIsUpdatingGlobalPlayer(true);
    const loadingToast = toast.loading('Atualizando atleta...');
    try {
      const previousTeamId = allPlayers.find((player) => player.id === editingGlobalPlayerId)?.team_id;

      const { data, error } = await withTimeout(
        supabase
          .from('players')
          .update({
            name: normalizePlayerName(editFormData.name),
            number: parseInt(editFormData.number) || 0,
            position: editFormData.position,
            team_id: editFormData.team_id,
            photo_url: editFormData.photo_url,
            bio: editFormData.bio,
            goals_count: parseInt(editFormData.goals_count) || 0,
            assists: parseInt(editFormData.assists) || 0,
            yellow_cards: parseInt(editFormData.yellow_cards) || 0,
            red_cards: parseInt(editFormData.red_cards) || 0,
            clean_sheets: parseInt(editFormData.clean_sheets) || 0,
          })
          .eq('id', editingGlobalPlayerId)
          .select('id, team_id, name, number, position, photo_url, bio, goals_count, assists, yellow_cards, red_cards, clean_sheets, teams(name)')
          .single(),
        30000,
        'Tempo limite ao atualizar atleta'
      );
      if (error) throw error;

      if (data) {
        upsertPlayerInCache(data as {
          id: string;
          team_id: string;
          name: string;
          number: number;
          position: string;
          photo_url?: string;
          bio?: string;
          goals_count?: number;
          assists?: number;
          yellow_cards?: number;
          red_cards?: number;
          clean_sheets?: number;
          teams?: { name?: string } | null;
        }, previousTeamId);
      }

      setEditingGlobalPlayerId(null);
      void queryClient.invalidateQueries({ queryKey: ['players', division] });
      void queryClient.invalidateQueries({ queryKey: ['rankings', division] });
      toast.success('Atleta atualizado com sucesso!', { id: loadingToast });
    } catch (err: unknown) {
      toast.error(getErrorMessage(err, 'Erro ao atualizar atleta'), { id: loadingToast });
    } finally {
      setIsUpdatingGlobalPlayer(false);
    }
  };

  const handleDeletePlayer = async (playerId: string) => {
    if (!(await confirmAction({
      title: 'Excluir Atleta',
      description: 'Tem certeza que deseja excluir este atleta permanentemente?',
      variant: 'danger'
    }))) return;
    const loadingToast = toast.loading('Excluindo atleta...');
    try {
      const playerToDelete = allPlayers.find((player) => player.id === playerId);
      const { error } = await withTimeout(
        supabase.from('players').delete().eq('id', playerId),
        30000,
        'Tempo limite ao excluir atleta'
      );
      if (error) throw error;

      if (editingGlobalPlayerId === playerId) {
        setEditingGlobalPlayerId(null);
      }
      removePlayerFromCache(playerId, playerToDelete?.team_id);
      void queryClient.invalidateQueries({ queryKey: ['players', division] });
      void queryClient.invalidateQueries({ queryKey: ['rankings', division] });
      toast.success('Atleta excluido com sucesso!', { id: loadingToast });
    } catch (err: unknown) {
      toast.error(getErrorMessage(err, 'Erro ao excluir atleta'), { id: loadingToast });
    }
  };

  const filteredPlayers = React.useMemo(() => {
    return (allPlayers || []).filter(p => 
      p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (((p as any).teams?.name || '') as string).toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [allPlayers, searchTerm]);

  return (
    <div className="admin-section glass">
      <div className="section-header">
        <div className="header-title-box">
          <h2>Gestão Global de Atletas</h2>
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            <input
              ref={photoInputRef}
              type="file"
              multiple
              accept="image/*"
              style={{ display: 'none' }}
              onChange={(e) => void handleAttachPhotosFromFiles(e.target.files)}
            />
            <button
              className="btn-add"
              type="button"
              disabled={photoBulkImporting || loading}
              onClick={handlePickPhotos}
              title="Selecione as fotos (pode selecionar a pasta toda). O sistema só vincula as que baterem com atletas pelo nome do arquivo."
            >
              {photoBulkImporting ? 'Vinculando fotos...' : 'Vincular fotos (lote)'}
            </button>
            <button
              className="btn-add"
              type="button"
              disabled={fixingNamesUppercase || loading}
              onClick={() => void handleFixNamesUppercase()}
            >
              {fixingNamesUppercase ? 'Corrigindo nomes...' : 'Corrigir nomes (MAIÚSCULO)'}
            </button>
            <button className="btn-add" type="button" onClick={() => {
              setIsBulkAdding((v) => {
                const next = !v;
                if (next) setIsAdding(false);
                return next;
              });
            }}>
              {isBulkAdding ? 'Cancelar importacao' : 'Importar lista'}
            </button>
            <button className="btn-add" type="button" onClick={() => {
              setIsAdding((v) => {
                const next = !v;
                if (next) setIsBulkAdding(false);
                return next;
              });
            }}>
              {isAdding ? 'Cancelar' : <><Plus size={18} /> Novo Atleta</>}
            </button>
          </div>
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

      {isBulkAdding && (
        <form
          className="admin-form glass mt-2 mb-2"
          onSubmit={(e) => {
            e.preventDefault();
            void handleBulkImport();
          }}
        >
          <div className="form-grid">
            <div className="form-group" style={{ gridColumn: '1 / -1' }}>
              <label>Lista (1ª linha = equipe)</label>
              <textarea
                rows={6}
                value={bulkText}
                onChange={(e) => setBulkText(e.target.value)}
                placeholder={
                  'ARGENTINA\n' +
                  'Asafhe Vieira (gol)\n' +
                  '• Leonardo Pauluk (ala)\n' +
                  '• Robson Gabriel (pivo)\n'
                }
              />
              <small style={{ opacity: 0.8 }}>
                Previa: {bulkPlan.totalParsed} atleta(s){bulkPlan.teamName ? ` • Equipe: ${bulkPlan.teamName}` : ''}
                {bulkPlan.duplicatesInPaste > 0 ? ` • Duplicados na lista: ${bulkPlan.duplicatesInPaste}` : ''}
                {bulkPlan.alreadyExists > 0 ? ` • Ja existem: ${bulkPlan.alreadyExists}` : ''}
                {bulkPlan.toCreate.length > 0 ? ` • Vai importar: ${bulkPlan.toCreate.length}` : ''}
              </small>
            </div>
            <div className="form-group">
              <label>Equipe (opcional: selecionar manualmente)</label>
              <select value={bulkTeamOverrideId} onChange={(e) => setBulkTeamOverrideId(e.target.value)}>
                <option value="">Auto: {bulkPlan.teamName || '---'}</option>
                {[...(teams || [])].sort((a, b) => a.name.localeCompare(b.name)).map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({t.group || 'Sem Grupo'})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <button
            type="submit"
            className="btn-save mt-3"
            disabled={bulkImporting || bulkPlan.totalParsed === 0 || bulkPlan.toCreate.length === 0 || !bulkPlan.teamName}
          >
            <Save size={18} /> {bulkImporting ? 'Importando...' : `Importar ${bulkPlan.toCreate.length} atleta(s)`}
          </button>
        </form>
      )}

      {isAdding && (
        <form className="admin-form glass mt-2 mb-2" onSubmit={handleAddPlayer}>
          <div className="form-grid">
            <div className="form-group">
              <label>Nome do Atleta</label>
              <input type="text" required value={formData.name} onChange={e => setFormData({ ...formData, name: maskPlayerName(e.target.value) })} placeholder="Ex: Lucas Silva" />
            </div>
            <div className="form-group">
              <label>Equipe</label>
              <select required value={formData.team_id} onChange={e => setFormData({...formData, team_id: e.target.value})}>
                <option value="">Selecione a equipe...</option>
                {[...(teams || [])].sort((a,b) => a.name.localeCompare(b.name)).map(t => (
                  <option key={t.id} value={t.id}>{t.name} ({t.group || 'Sem Grupo'})</option>
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
                    <img
                      src={clearPhotoCropFromUrl(formData.photo_url)}
                      alt="Preview"
                      className="image-preview-badge"
                      style={{ objectFit: 'cover', objectPosition: getPhotoCropXY(formData.photo_url).objectPosition, transform: getPhotoCropXY(formData.photo_url).scale !== 1 ? `scale(${getPhotoCropXY(formData.photo_url).scale})` : undefined, transformOrigin: getPhotoCropXY(formData.photo_url).objectPosition }}
                    />
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
              <label>URL da Foto</label>
              <input
                type="url"
                placeholder="cole a URL da foto"
                value={formData.photo_url}
                onChange={e => setFormData({ ...formData, photo_url: e.target.value })}
              />
            </div>
            {formData.photo_url && (
              <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                <label>Recorte (posicionamento)</label>
                <div style={{ display: 'grid', gap: '0.5rem' }}>
                  <div style={{ display: 'grid', gap: '0.25rem' }}>
                    <small>Zoom: {Math.round(getPhotoCropXY(formData.photo_url).z)}%</small>
                    <input
                      type="range"
                      min={100}
                      max={250}
                      value={getPhotoCropXY(formData.photo_url).z}
                      onChange={(e) => {
                        const nextZ = Number(e.target.value);
                        setFormData((prev) => {
                          const current = getPhotoCropXY(prev.photo_url);
                          return { ...prev, photo_url: setPhotoCropOnUrl(prev.photo_url, current.x, current.y, nextZ) };
                        });
                      }}
                    />
                  </div>
                  <div style={{ display: 'grid', gap: '0.25rem' }}>
                    <small>Horizontal: {Math.round(getPhotoCropXY(formData.photo_url).x)}%</small>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={getPhotoCropXY(formData.photo_url).x}
                      onChange={(e) => {
                        const nextX = Number(e.target.value);
                        setFormData((prev) => {
                          const current = getPhotoCropXY(prev.photo_url);
                          return { ...prev, photo_url: setPhotoCropOnUrl(prev.photo_url, nextX, current.y, current.z) };
                        });
                      }}
                    />
                  </div>
                  <div style={{ display: 'grid', gap: '0.25rem' }}>
                    <small>Vertical: {Math.round(getPhotoCropXY(formData.photo_url).y)}%</small>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={getPhotoCropXY(formData.photo_url).y}
                      onChange={(e) => {
                        const nextY = Number(e.target.value);
                        setFormData((prev) => {
                          const current = getPhotoCropXY(prev.photo_url);
                          return { ...prev, photo_url: setPhotoCropOnUrl(prev.photo_url, current.x, nextY, current.z) };
                        });
                      }}
                    />
                  </div>
                  <div className="image-upload-container" style={{ width: '220px', height: '220px', overflow: 'hidden' }}>
                    <img
                      src={clearPhotoCropFromUrl(formData.photo_url)}
                      alt="Preview grande"
                      className="image-preview-badge"
                      style={{ objectFit: 'cover', objectPosition: getPhotoCropXY(formData.photo_url).objectPosition, transform: getPhotoCropXY(formData.photo_url).scale !== 1 ? `scale(${getPhotoCropXY(formData.photo_url).scale})` : undefined, transformOrigin: getPhotoCropXY(formData.photo_url).objectPosition }}
                    />
                  </div>
                </div>
              </div>
            )}
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
          <button type="submit" className="btn-save mt-3" disabled={isSubmittingGlobalPlayer}>
            <Save size={18} /> {isSubmittingGlobalPlayer ? 'Salvando...' : 'Salvar Atleta no Sistema'}
          </button>
        </form>
      )}

      <div className="admin-list">
        {loading ? (
          <div className="admin-loading-placeholder">
            <div className="spinner"></div>
            <p>Buscando Atletas no Banco de Dados...</p>
          </div>
        ) : (
          (filteredPlayers || []).map(p => (
            <React.Fragment key={p.id}>
              <div className="admin-list-item player-search-row">
                <div className="item-main">
                  <img src={p.photo_url || '/favicon.svg'} alt={p.name} className="player-mini-photo" />
                  <div className="item-info">
                    <strong>{p.name} (#{p.number})</strong>
                    <span>{(p as any).teams?.name} • {p.position}</span>
                  </div>
                </div>
                <div className="item-actions">
                  <div className="item-stats-mini">
                    <span>⚽ {p.goals_count}</span>
                    <span>🎯 {p.assists}</span>
                  </div>
                  <button className="btn-player-edit" onClick={() => startEditPlayer(p)} title="Editar atleta">
                    <Settings2 size={14} />
                  </button>
                  <button className="btn-player-delete" onClick={() => handleDeletePlayer(p.id)} title="Excluir atleta">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            </React.Fragment>
          ))
        )}
        {!loading && filteredPlayers.length === 0 && <p className="empty-msg">Nenhum atleta encontrado.</p>}
      </div>

      {editingGlobalPlayerId && typeof document !== 'undefined' && createPortal(
        <div className="global-player-edit-modal-backdrop" onClick={() => setEditingGlobalPlayerId(null)}>
          <div className="global-player-edit-modal glass" onClick={(e) => e.stopPropagation()}>
            <div className="global-player-edit-modal-header">
              <h3>Editar Atleta</h3>
              <button type="button" className="btn-cancel" onClick={() => setEditingGlobalPlayerId(null)}>
                Fechar
              </button>
            </div>

            <form className="admin-form glass global-player-edit-form" onSubmit={handleUpdatePlayer}>
              <div className="form-grid">
                <div className="form-group">
                  <label>Nome do Atleta</label>
                  <input type="text" required value={editFormData.name} onChange={e => setEditFormData({ ...editFormData, name: maskPlayerName(e.target.value) })} />
                </div>
                <div className="form-group">
                  <label>Equipe</label>
                  <select required value={editFormData.team_id} onChange={e => setEditFormData({ ...editFormData, team_id: e.target.value })}>
                    <option value="">Selecione a equipe...</option>
                    {[...(teams || [])].sort((a, b) => a.name.localeCompare(b.name)).map(t => (
                      <option key={t.id} value={t.id}>{t.name} ({t.group || 'S/G'})</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>Nº Camisa</label>
                  <input type="number" required value={editFormData.number} onChange={e => setEditFormData({ ...editFormData, number: e.target.value })} />
                </div>
                <div className="form-group">
                  <label>Posição</label>
                  <select value={editFormData.position} onChange={e => setEditFormData({ ...editFormData, position: e.target.value })}>
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
                      {uploading ? <div className="spinner"></div> : editFormData.photo_url ? (
                        <img
                          src={clearPhotoCropFromUrl(editFormData.photo_url)}
                          alt="Preview"
                          className="image-preview-badge"
                          style={{ objectFit: 'cover', objectPosition: getPhotoCropXY(editFormData.photo_url).objectPosition, transform: getPhotoCropXY(editFormData.photo_url).scale !== 1 ? `scale(${getPhotoCropXY(editFormData.photo_url).scale})` : undefined, transformOrigin: getPhotoCropXY(editFormData.photo_url).objectPosition }}
                        />
                      ) : (
                        <div className="upload-icon-box">
                          <Camera size={20} />
                          <span style={{ fontSize: '0.6rem' }}>Adicionar</span>
                        </div>
                      )}
                      <input type="file" accept="image/*" className="hidden-file-input" onChange={handleEditPhotoUpload} />
                    </label>
                  </div>
                </div>
                <div className="form-group">
                  <label>URL da Foto</label>
                  <input type="url" value={editFormData.photo_url} onChange={e => setEditFormData({ ...editFormData, photo_url: e.target.value })} />
                </div>
                {editFormData.photo_url && (
                  <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                    <label>Recorte (posicionamento)</label>
                    <div style={{ display: 'grid', gap: '0.5rem' }}>
                      <div style={{ display: 'grid', gap: '0.25rem' }}>
                        <small>Zoom: {Math.round(getPhotoCropXY(editFormData.photo_url).z)}%</small>
                        <input
                          type="range"
                          min={100}
                          max={250}
                          value={getPhotoCropXY(editFormData.photo_url).z}
                          onChange={(e) => {
                            const nextZ = Number(e.target.value);
                            setEditFormData((prev) => {
                              const current = getPhotoCropXY(prev.photo_url);
                              return { ...prev, photo_url: setPhotoCropOnUrl(prev.photo_url, current.x, current.y, nextZ) };
                            });
                          }}
                        />
                      </div>
                      <div style={{ display: 'grid', gap: '0.25rem' }}>
                        <small>Horizontal: {Math.round(getPhotoCropXY(editFormData.photo_url).x)}%</small>
                        <input
                          type="range"
                          min={0}
                          max={100}
                          value={getPhotoCropXY(editFormData.photo_url).x}
                          onChange={(e) => {
                            const nextX = Number(e.target.value);
                            setEditFormData((prev) => {
                              const current = getPhotoCropXY(prev.photo_url);
                              return { ...prev, photo_url: setPhotoCropOnUrl(prev.photo_url, nextX, current.y, current.z) };
                            });
                          }}
                        />
                      </div>
                      <div style={{ display: 'grid', gap: '0.25rem' }}>
                        <small>Vertical: {Math.round(getPhotoCropXY(editFormData.photo_url).y)}%</small>
                        <input
                          type="range"
                          min={0}
                          max={100}
                          value={getPhotoCropXY(editFormData.photo_url).y}
                          onChange={(e) => {
                            const nextY = Number(e.target.value);
                            setEditFormData((prev) => {
                              const current = getPhotoCropXY(prev.photo_url);
                              return { ...prev, photo_url: setPhotoCropOnUrl(prev.photo_url, current.x, nextY, current.z) };
                            });
                          }}
                        />
                      </div>
                      <div className="image-upload-container" style={{ width: '220px', height: '220px', overflow: 'hidden' }}>
                        <img
                          src={clearPhotoCropFromUrl(editFormData.photo_url)}
                          alt="Preview grande"
                          className="image-preview-badge"
                          style={{ objectFit: 'cover', objectPosition: getPhotoCropXY(editFormData.photo_url).objectPosition, transform: getPhotoCropXY(editFormData.photo_url).scale !== 1 ? `scale(${getPhotoCropXY(editFormData.photo_url).scale})` : undefined, transformOrigin: getPhotoCropXY(editFormData.photo_url).objectPosition }}
                        />
                      </div>
                    </div>
                  </div>
                )}
                <div className="form-group">
                  <label>Bio / Observações</label>
                  <textarea rows={2} value={editFormData.bio} onChange={e => setEditFormData({ ...editFormData, bio: e.target.value })} />
                </div>
              </div>

              <div className="player-stats-editor-grid mt-2">
                <div className="stat-input">
                  <label><Trophy size={14} /> Gols</label>
                  <input type="number" value={editFormData.goals_count} onChange={e => setEditFormData({ ...editFormData, goals_count: e.target.value })} />
                </div>
                <div className="stat-input">
                  <label><Star size={14} /> Assist.</label>
                  <input type="number" value={editFormData.assists} onChange={e => setEditFormData({ ...editFormData, assists: e.target.value })} />
                </div>
                <div className="stat-input">
                  <label><CreditCard size={14} style={{ color: '#fbbf24' }} /> CA</label>
                  <input type="number" value={editFormData.yellow_cards} onChange={e => setEditFormData({ ...editFormData, yellow_cards: e.target.value })} />
                </div>
                <div className="stat-input">
                  <label><CreditCard size={14} style={{ color: '#ef4444' }} /> CV</label>
                  <input type="number" value={editFormData.red_cards} onChange={e => setEditFormData({ ...editFormData, red_cards: e.target.value })} />
                </div>
                <div className="stat-input">
                  <label><Shield size={14} /> CS</label>
                  <input type="number" value={editFormData.clean_sheets} onChange={e => setEditFormData({ ...editFormData, clean_sheets: e.target.value })} />
                </div>
              </div>

              <div className="global-player-edit-actions">
                <button type="submit" className="btn-save" disabled={isUpdatingGlobalPlayer}>
                  <Save size={16} /> {isUpdatingGlobalPlayer ? 'Salvando...' : 'Salvar Alterações'}
                </button>
                <button type="button" className="btn-cancel" onClick={() => setEditingGlobalPlayerId(null)}>
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {ConfirmElement}
    </div>
  );
};

export default Admin;
