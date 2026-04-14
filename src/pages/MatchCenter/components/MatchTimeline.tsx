import React from 'react';
import { Trophy, ArrowRightLeft, Zap } from 'lucide-react';
import { MatchEvent } from '../../../hooks/useMatchEvents';

interface Player {
  id: string;
  name: string;
  photo_url?: string;
}

interface MatchTimelineProps {
  events: MatchEvent[];
  players: Player[];
  user: any;
  onSendComment: (e: React.FormEvent<HTMLFormElement>) => void;
  onDeleteComment: (ev: MatchEvent) => void;
  canDeleteComment: (ev: MatchEvent) => boolean;
  newComment: string;
  setNewComment: (val: string) => void;
  isSendingComment: boolean;
}

export const MatchTimeline: React.FC<MatchTimelineProps> = ({
  events,
  players,
  user,
  onSendComment,
  onDeleteComment,
  canDeleteComment,
  newComment,
  setNewComment,
  isSendingComment
}) => {
  const importantEvents = events.filter(e => 
    ['gol', 'amarelo', 'vermelho', 'substituicao'].includes(e.event_type)
  );

  const commentaryEvents = events.filter(e => 
    e.event_type === 'comentario' || e.event_type === 'momento'
  );

  return (
    <div className="match-body-grid">
      <section className="match-timeline">
        <div className="section-header">
          <History size={18} color="var(--secondary)" />
          <h3>Principais Lances</h3>
        </div>
        
        <div className="timeline-container">
          {importantEvents.length > 0 ? (
            importantEvents.map(event => (
              <div key={event.id} className={`t-item ${event.event_type} animate-slide-up`}>
                <div className="t-icon glass">
                  {event.event_type === 'gol' && <Trophy size={14} color="var(--secondary)" />}
                  {event.event_type === 'amarelo' && <div className="card-yellow"></div>}
                  {event.event_type === 'vermelho' && <div className="card-red"></div>}
                  {event.event_type === 'substituicao' && <ArrowRightLeft size={14} color="#fff" />}
                </div>
                <div className="t-content glass">
                  <div className="t-header">
                    <span className="t-type">
                      {event.event_type === 'gol' ? 'GOL!' : 
                       event.event_type === 'amarelo' ? 'Cartão Amarelo' :
                       event.event_type === 'vermelho' ? 'Cartão Vermelho' :
                       event.event_type === 'substituicao' ? 'Substituição' :
                       'Informação'}
                    </span>
                  </div>
                  <p>
                    <strong>{event.players?.name}</strong>
                    {event.event_type === 'gol' && event.assistant_id && (
                      <span className="assistant">
                         Assistência: {players.find(p => p.id === event.assistant_id)?.name}
                      </span>
                    )}
                    {event.event_type === 'substituicao' && (
                      <span className="assistant" style={{ color: '#94a3b8' }}>
                        <ArrowRightLeft size={12} style={{ display: 'inline', marginRight: 4 }} />
                        Entra: {players.find(p => p.id === event.assistant_id)?.name}
                      </span>
                    )}
                  </p>
                </div>
              </div>
            ))
          ) : (
            <p className="empty-msg">Nenhum lance importante registrado.</p>
          )}
        </div>

        <div className="live-commentary-feed glass">
          <div className="feed-header">
            <div className="live-indicator"></div>
            <h3>Comentários ao Vivo</h3>
          </div>
          <div className="feed-content">
            {commentaryEvents.map(ev => (
              <div key={ev.id} className="comment-bubble animate-slide-up">
                <div className="comment-meta">
                  <span className="comment-time">{ev.minute}'</span>
                  <span className="comment-author">{ev.author_name || 'Torcedor'}</span>
                  {canDeleteComment(ev) && (
                    <button
                      type="button"
                      className="comment-delete"
                      onClick={() => onDeleteComment(ev)}
                      title="Excluir comentário"
                    >
                      Excluir
                    </button>
                  )}
                </div>
                <p className="commentary-text">{ev.commentary}</p>
              </div>
            ))}
            {commentaryEvents.length === 0 && (
              <p className="empty-feed">Aguardando lances da partida...</p>
            )}
          </div>
          
          <div className="comment-input-area">
            {user ? (
              <form className="comment-form" onSubmit={onSendComment}>
                <input 
                  type="text" 
                  placeholder="Escreva um comentário..." 
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  disabled={isSendingComment}
                />
                <button type="submit" disabled={isSendingComment || !newComment.trim()}>
                  {isSendingComment ? <div className="spinner-mini"></div> : <Zap size={16} />}
                </button>
              </form>
            ) : (
              <div className="login-to-comment">
                <span style={{ fontSize: '1.1rem' }}>🔒</span>
                <p>Faça login para participar dos comentários ao vivo!</p>
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
};

// Internal icon import for this component which was missing in view
import { History } from 'lucide-react';
