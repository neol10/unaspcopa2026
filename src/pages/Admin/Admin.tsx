import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { supabase, supabaseStorage } from '../../lib/supabase';
import { Trophy, Users, Calendar, Plus, Save, Trash2, Shield, ChevronDown, ChevronUp, Newspaper, CheckCircle, Play, Camera, Search, Settings2, Vote, ShieldAlert, Bell, Star, CreditCard, Target, Square, ArrowRightLeft, MessageSquare, Zap, Clock, Pause, RotateCcw, Coffee } from 'lucide-react';
import { useTeams, type Team } from '../../hooks/useTeams';
import { usePlayers } from '../../hooks/usePlayers';
import { useQueryClient } from '@tanstack/react-query';
import { useNews, type News } from '../../hooks/useNews';
import { useMatches, type Match } from '../../hooks/useMatches';
import { useMatchEvents, type MatchEvent } from '../../hooks/useMatchEvents';
import { useTournamentConfig, type TournamentConfig } from '../../hooks/useTournamentConfig';
import { usePolls, type Poll, type PollOption } from '../../hooks/usePolls';
import { useAuthContext } from '../../contexts/AuthContext';
import { withTimeout } from '../../lib/withTimeout';
import { toast } from 'react-hot-toast';
import { useConfirm } from '../../hooks/useConfirm';
import './Admin.css';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

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

const MAX_IMAGE_SIZE_MB = 5;
const COMPRESS_MIN_BYTES = 350 * 1024; // 350KB
const COMPRESS_MAX_DIM = 1024;
const COMPRESS_QUALITY = 0.82;

const validateImageFile = (file: File): string | null => {
  if (!file.type.startsWith('image/')) return 'Arquivo invalido. Envie uma imagem.';
  const maxBytes = MAX_IMAGE_SIZE_MB * 1024 * 1024;
  if (file.size > maxBytes) return `Imagem muito grande. Maximo: ${MAX_IMAGE_SIZE_MB}MB.`;
  return null;
};

const prepareImageForUpload = async (file: File): Promise<File> => {
  if (!file.type.startsWith('image/')) return file;

  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = (err) => {
      URL.revokeObjectURL(url);
      reject(err);
    };
    img.src = url;
  });

  const maxDim = Math.max(image.width, image.height);
  const scale = Math.min(1, COMPRESS_MAX_DIM / maxDim);
  const shouldResize = scale < 1;
  const shouldReencode = file.size >= COMPRESS_MIN_BYTES;
  if (!shouldResize && !shouldReencode) return file;

  const canvas = document.createElement('canvas');
  canvas.width = Math.round(image.width * scale);
  canvas.height = Math.round(image.height * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) return file;
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

  // Preferimos WebP para reduzir payload e acelerar carregamento no app.
  const outputType = 'image/webp';
  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, outputType, COMPRESS_QUALITY);
  });
  if (!blob) return file;
  if (blob.size >= file.size && !shouldResize) return file;

  const ext = 'webp';
  const baseName = file.name.replace(/\.[^.]+$/, '');
  const fileName = `${baseName}_optimized.${ext}`;
  return new File([blob], fileName, { type: outputType });
};

const sanitizeFileBaseName = (name: string) => {
  const normalized = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return normalized
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
};

const fileToDataUrl = async (file: File): Promise<string | null> => {
  try {
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  } catch {
    return null;
  }
};

const uploadToStorage = async (file: File, bucket: string = 'images', folder: string = 'team-badges'): Promise<string | null> => {
  try {
    const validationError = validateImageFile(file);
    if (validationError) {
      toast.error(validationError);
      return null;
    }

    const fileToUpload = await prepareImageForUpload(file);
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
  const { ConfirmElement } = useConfirm();

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

  const payload = typeof options === 'string'
    ? { title: safeTitle, body: safeBody, message: safeBody, url: options }
    : {
        title: safeTitle,
        body: safeBody,
        message: safeBody,
        url: options.url || '/',
        category: options.category || 'general',
        important: Boolean(options.important),
        teamIds: options.teamIds || [],
        team_ids: options.teamIds || [],
      };

  const endpoint = resolvePushApiEndpoint();

  try {
    const endpoints = buildPushEndpointCandidates(endpoint);
    let lastStatus = 0;
    let lastDetail = '';

    for (const candidate of endpoints) {
      const response = await fetch(candidate, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
      const rawDetail = await response.text().catch(() => '');
      lastDetail = rawDetail;

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
            {(items || []).map((it) => (
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
  const queryClient = useQueryClient();
  const { confirm: confirmAction, ConfirmElement } = useConfirm();
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
  };

  const [formData, setFormData] = useState<MatchFormData>({ 
    team_a_id: '', 
    team_b_id: '', 
    match_date: '', 
    location: 'Ginásio Principal',
    status: 'agendado',
    round: '1' 
  });
  const [searchTerm, setSearchTerm] = useState('');

  const invalidateCompetitionData = () => {
    void queryClient.invalidateQueries({ queryKey: ['matches'] });
    void queryClient.invalidateQueries({ queryKey: ['standings'] });
    void queryClient.invalidateQueries({ queryKey: ['rankings'] });
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

    setIsSubmittingMatch(true);
    try {
      const { error } = await withTimeout(
        supabase.from('matches').insert([{
          ...formData,
          match_date: formData.match_date ? new Date(formData.match_date).toISOString() : null,
          round: currentRound
        }]),
        30000,
        'Tempo limite ao criar partida'
      );
      if (error) throw error;
      setFormData({ team_a_id: '', team_b_id: '', match_date: '', location: 'Ginásio Principal', status: 'agendado', round: '1' });
      setIsAdding(false);
      void refresh();
      invalidateCompetitionData();
      toast.success('Partida criada com sucesso!');
    } catch (err: unknown) {
      toast.error(getErrorMessage(err, 'Erro ao criar partida'));
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
    if (!(await confirmAction({
      title: 'Excluir Partida',
      description: 'ATENÇÃO: Apagar esta partida removerá permanentemente todos os eventos e REVERTERÁ as estatísticas dos jogadores (gols, cartões e assistências). Deseja continuar?',
      variant: 'danger'
    }))) return;
    
    const loadingToast = toast.loading('Processando reversão e exclusão...');
    try {
      // 1. Buscar todos os eventos desta partida em uma única chamada
      const { data: events, error: eventsError } = await supabase
        .from('match_events')
        .select('event_type, player_id, assistant_id')
        .eq('match_id', id);

      if (eventsError) throw eventsError;

      // 2. Agrupar as reversões por jogador para otimizar as chamadas ao banco
      if (events && events.length > 0) {
        const deltas: Record<string, { goals: number; assists: number; yellows: number; reds: number }> = {};
        
        events.forEach(event => {
          if (event.player_id) {
            if (!deltas[event.player_id]) deltas[event.player_id] = { goals: 0, assists: 0, yellows: 0, reds: 0 };
            if (event.event_type === 'gol') deltas[event.player_id].goals += 1;
            else if (event.event_type === 'amarelo') deltas[event.player_id].yellows += 1;
            else if (event.event_type === 'vermelho') deltas[event.player_id].reds += 1;
          }
          if (event.assistant_id) {
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
    } catch (err: unknown) {
      console.error('Delete match error:', err);
      toast.error(getDeleteMatchErrorMessage(err), { id: loadingToast });
    }
  };

  const [editingMatchId, setEditingMatchId] = useState<string | null>(null);

  const sendLivePhaseNotification = (match: Match, phase: 'pausa' | 'intervalo' | 'retomada') => {
    const teamA = match.teams_a?.name || 'Equipe A';
    const teamB = match.teams_b?.name || 'Equipe B';

    if (phase === 'pausa') {
      sendPushNotification('⏸️ Jogo Pausado', `${teamA} x ${teamB} está em pausa técnica.`, {
        url: '/central-da-partida',
        category: 'live',
        teamIds: [match.team_a_id, match.team_b_id],
      });
      toast.success('Alerta de pausa enviado.');
      return;
    }

    if (phase === 'intervalo') {
      sendPushNotification('🕒 Intervalo de Jogo', `${teamA} x ${teamB} foi para o intervalo.`, {
        url: '/central-da-partida',
        category: 'live',
        important: true,
        teamIds: [match.team_a_id, match.team_b_id],
      });
      toast.success('Alerta de intervalo enviado.');
      return;
    }

    sendPushNotification('▶️ Bola Rolando de Novo', `${teamA} x ${teamB} voltou para o segundo tempo.`, {
      url: '/central-da-partida',
      category: 'live',
      important: true,
      teamIds: [match.team_a_id, match.team_b_id],
    });
    toast.success('Alerta de retomada enviado.');
  };

  const handleUpdateMatch = async (id: string, data: MatchFormData) => {
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
      const { error } = await withTimeout(
        supabase.from('matches').update({
          team_a_id: data.team_a_id,
          team_b_id: data.team_b_id,
          match_date: data.match_date ? new Date(data.match_date).toISOString() : null,
          location: data.location,
          status: data.status,
          round: currentRound
        }).eq('id', id),
        30000,
        'Tempo limite ao atualizar partida'
      );
      if (error) throw error;
      setEditingMatchId(null);
      void refresh();
      invalidateCompetitionData();
      toast.success('Partida atualizada!');
    } catch (err: unknown) {
      toast.error(getErrorMessage(err, 'Erro ao atualizar partida'));
    }
  };

  const filteredMatches = (matches || []).filter(m => 
    m.teams_a?.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    m.teams_b?.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    String(m.round).includes(searchTerm)
  );

  // Times ocupados na rodada selecionada (Nova Partida)
  const busyTeamIdsInRound = new Set(
    (matches || [])
      .filter(m => m.round === (parseInt(formData.round) || 1))
      .flatMap(m => [m.team_a_id, m.team_b_id])
  );

  // Times ocupados na rodada da partida sendo editada (Ignorando a própria partida)
  const getBusyTeamIdsForEdit = (matchId: string, round: number) => {
    return new Set(
      (matches || [])
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
                    const availableTeamsInGroup = (groupedTeams[group] || []).filter((t) => !busyTeamIdsInRound.has(t.id) || t.id === formData.team_a_id);
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
                    const availableTeamsInGroup = (groupedTeams[group] || []).filter((t) => !busyTeamIdsInRound.has(t.id) || t.id === formData.team_b_id);
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
                 <label>Rodada (Apenas número)</label>
                 <input type="number" placeholder="Ex: 1, 2..." required value={formData.round} onChange={e => setFormData({...formData, round: e.target.value})} />
               </div>
           </div>
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
            placeholder="Buscar por equipe ou rodada..." 
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
                        <span>{match.teams_a?.name} {match.team_a_score} x {match.team_b_score} {match.teams_b?.name}</span>
                        {match.teams_b?.badge_url ? (
                          <img src={match.teams_b.badge_url} alt="" style={{ width: 24, height: 24, objectFit: 'contain' }} />
                        ) : (
                          <Shield size={20} />
                        )}
                      </strong>
                      <div className="match-meta-admin">
                        <span className="round-badge">{match.round}ª Rodada</span>
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
                        {selectedMatchId === match.id ? 'Fechar Painel' : 'Gerenciar (AO VIVO)'}
                      </button>
                      <button className="btn-icon finish" title="Finalizar Jogo" onClick={() => updateStatus(match.id, 'finalizado', match)}><CheckCircle size={18} /></button>
                    </>
                  )}
                  <button className="btn-icon delete" onClick={() => handleDeleteMatch(match.id)} title="Excluir Partida"><Trash2 size={18} /></button>
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
                        <span className="round-badge">{match.round}ª Rodada</span>
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
                        round: String(match.round)
                      });
                  }}><Settings2 size={16} /></button>
                  <button className="btn-icon delete" onClick={() => handleDeleteMatch(match.id)} title="Excluir do Histórico"><Trash2 size={16} /></button>
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
      {ConfirmElement}
    </div>
  );
};

const LiveMatchControl: React.FC<{ match: Match }> = ({ match }) => {
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
    description: match.match_mvp_description || '' 
  });
  const [mvpSaved, setMvpSaved] = useState(false);
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [editEventMinute, setEditEventMinute] = useState<number>(0);

  // --- Cronômetro Sincronizado (DB) ---
  const [seconds, setSeconds] = useState(0);
  const isActive = match.is_timer_running;

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

      const { error } = await supabase.from('matches').update({
        is_timer_running: false,
        timer_started_at: null,
        timer_offset_seconds: finalOffset
      }).eq('id', match.id);
      
      if (error) throw error;

      if (isTechnical) {
        await supabase.from('match_events').insert({
          match_id: match.id,
          event_type: 'comentario',
          minute: Math.floor(finalOffset / 60),
          commentary: '⏱️ Pausa Técnica',
          player_id: null
        });
        toast.success('Pausa Técnica registrada');
      }
    } catch (err: unknown) {
      toast.error('Erro ao pausar cronômetro');
    }
  };

  const handleIntervalo = async () => {
    if (!(await confirmAction({
      title: 'Iniciar Intervalo',
      description: 'O tempo será pausado e o fim do 1º tempo será registrado.',
      variant: 'warning'
    }))) return;
    try {
      const start = match.timer_started_at ? new Date(match.timer_started_at).getTime() : Date.now();
      const now = Date.now();
      const diff = Math.floor((now - start) / 1000);
      const newOffset = match.timer_offset_seconds + diff;

      await supabase.from('matches').update({
        is_timer_running: false,
        timer_started_at: null,
        timer_offset_seconds: newOffset
      }).eq('id', match.id);

      await supabase.from('match_events').insert({
        match_id: match.id,
        event_type: 'comentario',
        minute: Math.floor(newOffset / 60),
        commentary: '🏁 Fim do 1º Tempo',
        player_id: null
      });

      toast.success('Intervalo Iniciado');
    } catch (err: unknown) {
      toast.error('Erro ao iniciar intervalo');
    }
  };

  const handleRetomar = async () => {
    try {
      // Verificar se o último evento foi fim do 1º tempo para mudar a mensagem
      const isPostInterval = events.some(e => e.event_type === 'comentario' && e.commentary?.includes('Fim do 1º Tempo'));
      const alreadyResumedStage2 = events.some(e => e.event_type === 'comentario' && e.commentary?.includes('Início do 2º Tempo'));

      const { error } = await supabase.from('matches').update({
        is_timer_running: true,
        timer_started_at: new Date().toISOString()
      }).eq('id', match.id);

      if (error) throw error;

      if (isPostInterval && !alreadyResumedStage2) {
        await supabase.from('match_events').insert({
          match_id: match.id,
          event_type: 'comentario',
          minute: Math.floor(match.timer_offset_seconds / 60),
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

  const handleResetTimer = async () => {
    if (!confirm('Zerar o cronômetro?')) return;
    try {
      const { error } = await supabase.from('matches').update({
        is_timer_running: false,
        timer_started_at: null,
        timer_offset_seconds: 0
      }).eq('id', match.id);
      if (error) throw error;
      setSeconds(0);
    } catch (err: unknown) {
      toast.error('Erro ao zerar cronômetro');
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

  useEffect(() => {
    if ((playersA || []).length > 0 && onFieldA.length === 0) {
      setOnFieldA((playersA || []).slice(0, 5).map(p => p.id)); 
    }
    if ((playersB || []).length > 0 && onFieldB.length === 0) {
      setOnFieldB((playersB || []).slice(0, 5).map(p => p.id));
    }
  }, [playersA, playersB, onFieldA.length, onFieldB.length]);

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
        if (isActive) handlePauseTimer(false); // Pausa normal via atalho
        else handleRetomar();
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
        if (!event.player_id) throw new Error('Evento de cartão sem jogador vinculado');
        const { data: p } = await supabase.from('players').select('yellow_cards').eq('id', event.player_id).single();
        await supabase.from('players').update({ yellow_cards: Math.max(0, (p?.yellow_cards || 0) - 1) }).eq('id', event.player_id);
      } else if (event.event_type === 'vermelho') {
        if (!event.player_id) throw new Error('Evento de cartão sem jogador vinculado');
        const { data: p } = await supabase.from('players').select('red_cards').eq('id', event.player_id).single();
        await supabase.from('players').update({ red_cards: Math.max(0, (p?.red_cards || 0) - 1) }).eq('id', event.player_id);
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
        
        await supabase.from('matches').update(updateData).eq('id', match.id);
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

  return (
    <div className="live-event-panel-wrapper">
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
      <div className="admin-scoreboard-pro glass">
        <div className="sb-pro-main">
          {/* Equipe A */}
          <div className="sb-pro-team team-a">
             <div className="sb-pro-score-box">
                <button className="score-adjust-btn minus" onClick={() => handleManualScore('a', -1)}>-</button>
                <div className="score-number-display">{match.team_a_score}</div>
                <button className="score-adjust-btn plus" onClick={() => handleManualScore('a', 1)}>+</button>
             </div>
             <span className="sb-pro-team-name">{match.teams_a?.name || 'Equipe A'}</span>
          </div>

          {/* Centro: Cronômetro e VS */}
          <div className="sb-pro-center">
             <div className="sb-pro-timer-display glass">
                <span className={isActive ? 'timer-running' : ''}>{formatTime(seconds)}</span>
             </div>
              <div className="sb-pro-timer-controls">
                {!match.is_timer_running ? (
                  <button className="timer-btn start" onClick={handleRetomar}>
                    <Play size={16} /> RETOMAR
                  </button>
                ) : (
                  <>
                    <button className="timer-btn pause" onClick={() => handlePauseTimer(true)}>
                      <Pause size={16} /> PAUSA TÉCNICA
                    </button>
                    <button className="timer-btn interval" onClick={handleIntervalo} style={{ background: 'rgba(168, 85, 247, 0.1)', color: '#a855f7', borderColor: 'rgba(168, 85, 247, 0.3)' }}>
                      <Coffee size={16} /> INTERVALO
                    </button>
                  </>
                )}
                <button className="timer-btn reset" onClick={handleResetTimer}>
                  <RotateCcw size={16} /> ZERAR
                </button>
              </div>
          </div>

          {/* Equipe B */}
          <div className="sb-pro-team team-b">
             <div className="sb-pro-score-box">
                <button className="score-adjust-btn minus" onClick={() => handleManualScore('b', -1)}>-</button>
                <div className="score-number-display">{match.team_b_score}</div>
                <button className="score-adjust-btn plus" onClick={() => handleManualScore('b', 1)}>+</button>
             </div>
             <span className="sb-pro-team-name">{match.teams_b?.name || 'Equipe B'}</span>
          </div>
        </div>
        
        <div className="sb-pro-footer">
           <button className="btn-undo-last-pro" onClick={undoLastEvent} disabled={events.length === 0}>
             <RotateCcw size={14} /> DESFAZER ÚLTIMA AÇÃO
           </button>
        </div>
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
        
      <div className={`teams-lanes event-selector-active-${eventType}`}>
        <div className="lane">
          <h5>{match.teams_a?.name || 'Equipe A'}</h5>
          
          <div className="roster-section">
            <span className="roster-label"><Zap size={12} /> Em Campo</span>
            <div className="admin-player-btns">
              {(playersA || []).filter(p => onFieldA.includes(p.id)).map(p => (
                <button 
                  key={p.id} 
                  onClick={() => eventType === 'gol' ? setGoalWizard({ team: 'a', open: true, pId: p.id }) : addEvent(p.id, 'a')} 
                  className="p-btn active-field"
                >
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
              {(playersA || []).filter(p => !onFieldA.includes(p.id)).map(p => (
                <button 
                  key={p.id} 
                  onClick={() => eventType === 'gol' ? setGoalWizard({ team: 'a', open: true, pId: p.id }) : togglePlayerStatus(p.id, 'a')} 
                  className="p-btn bench"
                >
                  <span className="p-num">{p.number}</span>
                  <span className="p-name">{p.name.split(' ')[0]}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="divider-vertical"></div>

        <div className="lane">
          <h5>{match.teams_b?.name || 'Equipe B'}</h5>
          
          <div className="roster-section">
            <span className="roster-label"><Zap size={12} /> Em Campo</span>
            <div className="admin-player-btns">
                <button 
                  key={p.id} 
                  onClick={() => eventType === 'gol' ? setGoalWizard({ team: 'b', open: true, pId: p.id }) : addEvent(p.id, 'b')} 
                  className="p-btn active-field"
                >
                  <span className="p-num">{p.number}</span>
                  <span className="p-name">{p.name.split(' ')[0]}</span>
                  <ChevronDown size={10} className="btn-status-toggle" onClick={(e) => { e.stopPropagation(); togglePlayerStatus(p.id, 'b'); }} />
                </button>
            </div>
          </div>

          <div className="roster-section">
            <span className="roster-label"><Users size={12} /> Banco</span>
            <div className="admin-player-btns">
              {(playersB || []).filter(p => !onFieldB.includes(p.id)).map(p => (
                <button 
                  key={p.id} 
                  onClick={() => eventType === 'gol' ? setGoalWizard({ team: 'b', open: true, pId: p.id }) : togglePlayerStatus(p.id, 'b')} 
                  className="p-btn bench"
                >
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
                  if (!ev.player_id) return;
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
                  {(playersA || []).map(p => <option key={p.id} value={p.id}>{p.number}. {p.name}</option>)}
                </optgroup>
              )}
              {playersB.length > 0 && (
                <optgroup label={match.teams_b?.name}>
                  {(playersB || []).map(p => <option key={p.id} value={p.id}>{p.number}. {p.name}</option>)}
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
            } catch (err: unknown) {
              toast.error(getErrorMessage(err, 'Erro ao salvar craque do jogo'));
            }
          }}

        >
          {mvpSaved ? <><CheckCircle size={18} /> Salvo!</> : <><Save size={18} /> Salvar Craque do Jogo</>}
        </button>
      </div>
      {ConfirmElement}
    </div>
  );
};

const TeamManagement = () => {
  const { teams, loading, refresh } = useTeams();
  const queryClient = useQueryClient();
  const [isAdding, setIsAdding] = useState(false);
  const [isSubmittingTeam, setIsSubmittingTeam] = useState(false);
  const [expandedTeamId, setExpandedTeamId] = useState<string | null>(null);
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [editGroupValue, setEditGroupValue] = useState('');
  type TeamFormData = { name: string; group: string; leader: string; badge_url: string };
  const [newTeamData, setNewTeamData] = useState<TeamFormData>({ name: '', group: '', leader: '', badge_url: '' });
  const [editTeamData, setEditTeamData] = useState<TeamFormData>({ name: '', group: '', leader: '', badge_url: '' });
  const [uploading, setUploading] = useState(false);

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
      const payload = {
        name: newTeamData.name.trim(),
        group: newTeamData.group.trim(),
        leader: newTeamData.leader.trim(),
        badge_url: newTeamData.badge_url?.trim() || null,
      };

      const { error } = await withRetry(async () => {
        return await withTimeout(
          supabase.from('teams').insert([payload]),
          15000,
          'Tempo limite ao criar equipe'
        );
      }, 2);
      if (error) throw error;
      setNewTeamData({ name: '', group: '', leader: '', badge_url: '' });
      setIsAdding(false);
      void queryClient.invalidateQueries({ queryKey: ['teams'] });
      void queryClient.invalidateQueries({ queryKey: ['standings'] });
      void queryClient.invalidateQueries({ queryKey: ['rankings'] });
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
      void queryClient.invalidateQueries({ queryKey: ['teams'] });
      void queryClient.invalidateQueries({ queryKey: ['players'] });
      void queryClient.invalidateQueries({ queryKey: ['standings'] });
      void queryClient.invalidateQueries({ queryKey: ['rankings'] });
      void refresh();
      toast.success('Equipe excluída com sucesso!', { id: loadingToast });
    } catch (err: unknown) {
      toast.error(getErrorMessage(err, 'Erro ao excluir equipe'), { id: loadingToast });
    }
  };

  const handleUpdateTeam = async (teamId: string, data: Partial<Team>) => {
    const loadingToast = toast.loading('Atualizando equipe...');
    try {
      const { error } = await withTimeout(
        supabase.from('teams').update(data).eq('id', teamId),
        30000,
        'Tempo limite ao atualizar equipe'
      );
      if (error) throw error;
      void queryClient.invalidateQueries({ queryKey: ['teams'] });
      void queryClient.invalidateQueries({ queryKey: ['standings'] });
      void queryClient.invalidateQueries({ queryKey: ['rankings'] });
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
                                <img src={editTeamData.badge_url || team.badge_url} alt="Badge" className="image-preview-badge" />
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
                            placeholder="URL do escudo"
                            value={editTeamData.badge_url}
                            onChange={e => setEditTeamData({ ...editTeamData, badge_url: e.target.value })}
                          />
                          <input 
                            placeholder="Grupo"
                            value={editGroupValue}
                            onChange={e => setEditGroupValue(e.target.value)}
                          />
                        </div>
                        <div className="form-actions-mini">
                          <button type="button" className="btn-save-mini" onClick={() => {
                            handleUpdateTeam(team.id, { 
                              name: editTeamData.name || team.name, 
                              leader: editTeamData.leader || team.leader,
                              badge_url: editTeamData.badge_url || team.badge_url,
                              group: editGroupValue 
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
                      setEditTeamData({ name: team.name, leader: team.leader, badge_url: team.badge_url || '', group: team.group || '' });
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
  const [isAdding, setIsAdding] = useState(false);
  const [isSubmittingPlayer, setIsSubmittingPlayer] = useState(false);
  const [isUpdatingPlayer, setIsUpdatingPlayer] = useState(false);
  const [editingPlayerId, setEditingPlayerId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [formData, setFormData] = useState({ 
    name: '', number: '', position: 'Ala', photo_url: '', bio: '',
    goals_count: '0', assists: '0', yellow_cards: '0', red_cards: '0', clean_sheets: '0'
  });
  const [editFormData, setEditFormData] = useState({
    name: '', number: '', position: 'Ala', photo_url: '', bio: '',
    goals_count: '0', assists: '0', yellow_cards: '0', red_cards: '0', clean_sheets: '0'
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
      const { error } = await withTimeout(
        supabase.from('players').insert([{
          ...formData,
          team_id: teamId,
          number: parseInt(formData.number) || 0
        }]),
        30000,
        'Tempo limite ao adicionar atleta'
      );
      if (error) throw error;
      setFormData({ 
        name: '', number: '', position: 'Ala', photo_url: '', bio: '',
        goals_count: '0', assists: '0', yellow_cards: '0', red_cards: '0', clean_sheets: '0'
      });
      setIsAdding(false);
      void queryClient.invalidateQueries({ queryKey: ['players', teamId] });
      void queryClient.invalidateQueries({ queryKey: ['players', 'all'] });
      void queryClient.invalidateQueries({ queryKey: ['rankings'] });
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
      void queryClient.invalidateQueries({ queryKey: ['players', teamId] });
      void queryClient.invalidateQueries({ queryKey: ['players', 'all'] });
      void queryClient.invalidateQueries({ queryKey: ['rankings'] });
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
          number: parseInt(editFormData.number) || 0,
          goals_count: parseInt(editFormData.goals_count) || 0,
          assists: parseInt(editFormData.assists) || 0,
          yellow_cards: parseInt(editFormData.yellow_cards) || 0,
          red_cards: parseInt(editFormData.red_cards) || 0,
          clean_sheets: parseInt(editFormData.clean_sheets) || 0
        }).eq('id', playerId),
        30000,
        'Tempo limite ao atualizar atleta'
      );
      if (error) throw error;
      setEditingPlayerId(null);
      void queryClient.invalidateQueries({ queryKey: ['players', teamId] });
      void queryClient.invalidateQueries({ queryKey: ['players', 'all'] });
      void queryClient.invalidateQueries({ queryKey: ['rankings'] });
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
                  <input type="text" required value={editFormData.name} onChange={e => setEditFormData({ ...editFormData, name: e.target.value })} />
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
                        <img src={editFormData.photo_url} alt="Preview" className="image-preview-badge" />
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

// ===== Gerenciamento do Torneio =====
const TournamentManagement = () => {
  const { config, loading, saveConfig } = useTournamentConfig();

  type ConfigForm = Pick<TournamentConfig, 'total_rounds' | 'matches_per_round' | 'current_phase' | 'current_round'>;

  const [form, setForm] = useState<ConfigForm>({
    total_rounds: 5,
    matches_per_round: 4,
    current_phase: 'grupos',
    current_round: 1,
  });
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
  }, [
    loading,
    config.id,
    config.total_rounds,
    config.matches_per_round,
    config.current_phase,
    config.current_round,
  ]);

  const handleSave = async () => {
    try {
      await saveConfig(form);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err: unknown) {
      toast.error(getErrorMessage(err, 'Erro ao salvar configurações'));
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
              onChange={e => setForm({ ...form, current_phase: e.target.value as TournamentConfig['current_phase'] })}
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
  const [polls, setPolls] = useState<Poll[]>([]);
  const [loading, setLoading] = useState(true);
  const { confirm: confirmAction, ConfirmElement } = useConfirm();
  const queryClient = useQueryClient();
  type PollFormData = { question: string; options: string[] };

  const [isAdding, setIsAdding] = useState(false);
  const [editingPollId, setEditingPollId] = useState<string | null>(null);
  const [formData, setFormData] = useState<PollFormData>({ 
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
      setPolls(((data || []) as Poll[]) || []);
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
    } catch (err: unknown) {
      toast.error(getErrorMessage(err, 'Erro ao criar enquete'));
    }
  };

  const handleUpdatePoll = async (id: string, data: PollFormData) => {
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
        {loading ? (
          <div className="loading-box"><p>Carregando enquetes...</p></div>
        ) : (polls || []).map(poll => (
          <React.Fragment key={poll.id}>
            <div className={`admin-list-item poll-item ${poll.active ? 'active-poll' : ''}`}>
              <div className="item-main">
                <Shield size={24} className={poll.active ? 'icon-active' : 'icon-subtle'} />
                <div className="item-info">
                  <strong>{poll.question}</strong>
                  <span>{(poll.options || []).length} opções • Total: {(poll.options || []).reduce((acc: number, o: PollOption) => acc + o.votes, 0)} votos</span>
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
                  setFormData({ question: poll.question, options: (poll.options || []).map((o) => o.text) });
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
        {(!polls || polls.length === 0) && !loading && <p className="empty-msg">Nenhuma enquete cadastrada.</p>}
      </div>
      {ConfirmElement}
    </div>
  );
};

const GlobalPlayerManagement = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [isSubmittingGlobalPlayer, setIsSubmittingGlobalPlayer] = useState(false);
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

    queryClient.setQueryData(['players', 'all'], (oldData: unknown) => {
      const list = Array.isArray(oldData) ? oldData : [];
      return [normalizedPlayer, ...list.filter((item: unknown) => (item as { id?: string })?.id !== player.id)];
    });

    queryClient.setQueryData(['players', player.team_id], (oldData: unknown) => {
      const list = Array.isArray(oldData) ? oldData : [];
      return [normalizedPlayer, ...list.filter((item: unknown) => (item as { id?: string })?.id !== player.id)];
    });

    if (previousTeamId && previousTeamId !== player.team_id) {
      queryClient.setQueryData(['players', previousTeamId], (oldData: unknown) => {
        const list = Array.isArray(oldData) ? oldData : [];
        return list.filter((item: unknown) => (item as { id?: string })?.id !== player.id);
      });
    }
  };

  const removePlayerFromCache = (playerId: string, teamId?: string) => {
    queryClient.setQueryData(['players', 'all'], (oldData: unknown) => {
      const list = Array.isArray(oldData) ? oldData : [];
      return list.filter((item: unknown) => (item as { id?: string })?.id !== playerId);
    });

    if (teamId) {
      queryClient.setQueryData(['players', teamId], (oldData: unknown) => {
        const list = Array.isArray(oldData) ? oldData : [];
        return list.filter((item: unknown) => (item as { id?: string })?.id !== playerId);
      });
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
        number: parseInt(formData.number) || 0,
        goals_count: parseInt(formData.goals_count) || 0,
        assists: parseInt(formData.assists) || 0,
        yellow_cards: parseInt(formData.yellow_cards) || 0,
        red_cards: parseInt(formData.red_cards) || 0,
        clean_sheets: parseInt(formData.clean_sheets) || 0,
      };

      const { data, error } = await withTimeout(
        supabase
          .from('players')
          .insert([payload])
          .select('id, team_id, name, number, position, photo_url, bio, goals_count, assists, yellow_cards, red_cards, clean_sheets, teams(name)')
          .single(),
        30000,
        'Tempo limite ao cadastrar atleta'
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
        });
      }

      setFormData({ 
        name: '', number: '', position: 'Ala', team_id: '', photo_url: '', bio: '',
        goals_count: '0', assists: '0', yellow_cards: '0', red_cards: '0', clean_sheets: '0'
      });
      setIsAdding(false);
      void queryClient.invalidateQueries({ queryKey: ['players'] });
      void queryClient.invalidateQueries({ queryKey: ['rankings'] });
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
      name: p.name,
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
            name: editFormData.name,
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
      void queryClient.invalidateQueries({ queryKey: ['players'] });
      void queryClient.invalidateQueries({ queryKey: ['rankings'] });
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
      void queryClient.invalidateQueries({ queryKey: ['players'] });
      void queryClient.invalidateQueries({ queryKey: ['rankings'] });
      toast.success('Atleta excluido com sucesso!', { id: loadingToast });
    } catch (err: unknown) {
      toast.error(getErrorMessage(err, 'Erro ao excluir atleta'), { id: loadingToast });
    }
  };

  const filteredPlayers = React.useMemo(() => {
    return (allPlayers || []).filter(p => 
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
                {[...(teams || [])].sort((a,b) => a.name.localeCompare(b.name)).map(t => (
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
              <label>URL da Foto</label>
              <input
                type="url"
                placeholder="cole a URL da foto"
                value={formData.photo_url}
                onChange={e => setFormData({ ...formData, photo_url: e.target.value })}
              />
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
                    <span>{p.teams?.name} • {p.position}</span>
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
                  <input type="text" required value={editFormData.name} onChange={e => setEditFormData({ ...editFormData, name: e.target.value })} />
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
                        <img src={editFormData.photo_url} alt="Preview" className="image-preview-badge" />
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
