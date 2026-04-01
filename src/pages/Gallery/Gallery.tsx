import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Heart, MessageCircle, Send, ArrowLeft, Trash2 } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { supabase } from '../../lib/supabase';
import { useGallery } from '../../hooks/useGallery';
import { useAuthContext } from '../../contexts/AuthContext';
import './Gallery.css';

type GalleryLikeRow = {
  gallery_id: string;
  user_id: string;
};

type GalleryCommentRow = {
  id: string;
  gallery_id: string;
  user_id: string;
  comment: string;
  created_at: string;
};

const Gallery: React.FC = () => {
  const { items, loading, refresh, unavailable } = useGallery();
  const { user, role } = useAuthContext();

  const [likesByItem, setLikesByItem] = useState<Record<string, number>>({});
  const [likedByMe, setLikedByMe] = useState<Record<string, boolean>>({});
  const [commentsByItem, setCommentsByItem] = useState<Record<string, GalleryCommentRow[]>>({});
  const [commentInputByItem, setCommentInputByItem] = useState<Record<string, string>>({});
  const [busyLikeId, setBusyLikeId] = useState<string | null>(null);
  const [busyCommentId, setBusyCommentId] = useState<string | null>(null);
  const [interactionsUnavailable, setInteractionsUnavailable] = useState(false);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [likeBurstId, setLikeBurstId] = useState<string | null>(null);
  const [mediaLikeBurstId, setMediaLikeBurstId] = useState<string | null>(null);
  const likeBurstTimeoutRef = useRef<number | null>(null);
  const mediaLikeBurstTimeoutRef = useRef<number | null>(null);
  const lastTapRef = useRef<{ id: string; timestamp: number } | null>(null);
  const modalSwipeStartRef = useRef<{ x: number; y: number } | null>(null);

  const itemIds = useMemo(() => (items || []).map((item) => item.id), [items]);
  const selectedItem = useMemo(
    () => (selectedItemId ? items.find((item) => item.id === selectedItemId) ?? null : null),
    [items, selectedItemId],
  );
  const selectedIndex = useMemo(
    () => (selectedItemId ? items.findIndex((item) => item.id === selectedItemId) : -1),
    [items, selectedItemId],
  );
  const canNavigate = items.length > 1 && selectedIndex >= 0;

  const loadInteractions = async () => {
    if (itemIds.length === 0) {
      setLikesByItem({});
      setLikedByMe({});
      setCommentsByItem({});
      return;
    }

    try {
      const { data: likesData, error: likesError } = await supabase
        .from('gallery_likes')
        .select('gallery_id,user_id')
        .in('gallery_id', itemIds);

      if (likesError) {
        if (likesError.code === '42P01') {
          setInteractionsUnavailable(true);
          return;
        }
        throw likesError;
      }

      const likesRows = (likesData || []) as GalleryLikeRow[];
      const likesCounter: Record<string, number> = {};
      const myLikes: Record<string, boolean> = {};

      for (const row of likesRows) {
        likesCounter[row.gallery_id] = (likesCounter[row.gallery_id] || 0) + 1;
        if (user?.id && row.user_id === user.id) {
          myLikes[row.gallery_id] = true;
        }
      }

      const { data: commentsData, error: commentsError } = await supabase
        .from('gallery_comments')
        .select('id,gallery_id,user_id,comment,created_at')
        .in('gallery_id', itemIds)
        .order('created_at', { ascending: false });

      if (commentsError) {
        if (commentsError.code === '42P01') {
          setInteractionsUnavailable(true);
          return;
        }
        throw commentsError;
      }

      const commentsRows = (commentsData || []) as GalleryCommentRow[];
      const commentsMap: Record<string, GalleryCommentRow[]> = {};

      for (const row of commentsRows) {
        if (!commentsMap[row.gallery_id]) commentsMap[row.gallery_id] = [];
        commentsMap[row.gallery_id].push(row);
      }

      setInteractionsUnavailable(false);
      setLikesByItem(likesCounter);
      setLikedByMe(myLikes);
      setCommentsByItem(commentsMap);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Erro ao carregar interações da galeria';
      toast.error(message);
    }
  };

  useEffect(() => {
    void loadInteractions();
  }, [user?.id, itemIds.join('|')]);

  useEffect(() => {
    if (!selectedItemId) return;
    document.body.classList.add('gallery-modal-open');
    return () => {
      document.body.classList.remove('gallery-modal-open');
    };
  }, [selectedItemId]);

  const goToAdjacentItem = (direction: 'prev' | 'next') => {
    if (!canNavigate) return;

    const delta = direction === 'next' ? 1 : -1;
    const nextIndex = (selectedIndex + delta + items.length) % items.length;
    const nextItem = items[nextIndex];
    if (!nextItem) return;

    setSelectedItemId(nextItem.id);
  };

  useEffect(() => {
    if (!selectedItemId) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setSelectedItemId(null);
        return;
      }
      if (event.key === 'ArrowRight') {
        event.preventDefault();
        goToAdjacentItem('next');
      }
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        goToAdjacentItem('prev');
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selectedItemId, selectedIndex, items]);

  useEffect(() => {
    return () => {
      document.body.classList.remove('gallery-modal-open');
      if (likeBurstTimeoutRef.current !== null) {
        window.clearTimeout(likeBurstTimeoutRef.current);
      }
      if (mediaLikeBurstTimeoutRef.current !== null) {
        window.clearTimeout(mediaLikeBurstTimeoutRef.current);
      }
    };
  }, []);

  const triggerMediaBurst = (galleryId: string) => {
    setMediaLikeBurstId(galleryId);
    if (mediaLikeBurstTimeoutRef.current !== null) {
      window.clearTimeout(mediaLikeBurstTimeoutRef.current);
    }
    mediaLikeBurstTimeoutRef.current = window.setTimeout(() => {
      setMediaLikeBurstId(null);
    }, 620);
  };

  const toggleLike = async (
    galleryId: string,
    options?: {
      forceLike?: boolean;
      source?: 'button' | 'gesture';
    },
  ) => {
    if (!user) {
      toast.error('Faça login para curtir.');
      return;
    }

    if (interactionsUnavailable || busyLikeId) return;

    try {
      setBusyLikeId(galleryId);
      const wasLiked = Boolean(likedByMe[galleryId]);
      const forceLike = Boolean(options?.forceLike);
      const source = options?.source || 'button';

      if (forceLike && wasLiked) {
        if (source === 'gesture') {
          triggerMediaBurst(galleryId);
        }
        return;
      }

      if (wasLiked) {
        const { error } = await supabase
          .from('gallery_likes')
          .delete()
          .eq('gallery_id', galleryId)
          .eq('user_id', user.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('gallery_likes')
          .insert([{ gallery_id: galleryId, user_id: user.id }]);
        if (error) throw error;
      }

      await loadInteractions();

      if (!wasLiked) {
        if (source === 'gesture') {
          triggerMediaBurst(galleryId);
        } else {
          setLikeBurstId(galleryId);
          if (likeBurstTimeoutRef.current !== null) {
            window.clearTimeout(likeBurstTimeoutRef.current);
          }
          likeBurstTimeoutRef.current = window.setTimeout(() => {
            setLikeBurstId(null);
          }, 520);
        }
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Erro ao curtir item';
      toast.error(message);
    } finally {
      setBusyLikeId(null);
    }
  };

  const handleMediaDoubleLike = (galleryId: string) => {
    void toggleLike(galleryId, { forceLike: true, source: 'gesture' });
  };

  const handleMediaTouchEnd = (galleryId: string, event: React.TouchEvent<HTMLElement>) => {
    const now = Date.now();
    const lastTap = lastTapRef.current;
    if (lastTap && lastTap.id === galleryId && now - lastTap.timestamp < 320) {
      event.preventDefault();
      lastTapRef.current = null;
      handleMediaDoubleLike(galleryId);
      return;
    }
    lastTapRef.current = { id: galleryId, timestamp: now };
  };

  const handleModalSwipeStart = (event: React.TouchEvent<HTMLElement>) => {
    const touch = event.changedTouches[0];
    if (!touch) return;
    modalSwipeStartRef.current = { x: touch.clientX, y: touch.clientY };
  };

  const handleModalSwipeEnd = (event: React.TouchEvent<HTMLElement>) => {
    const start = modalSwipeStartRef.current;
    modalSwipeStartRef.current = null;
    if (!start || !canNavigate) return;

    const touch = event.changedTouches[0];
    if (!touch) return;

    const deltaX = touch.clientX - start.x;
    const deltaY = touch.clientY - start.y;
    if (Math.abs(deltaX) < 48 || Math.abs(deltaX) <= Math.abs(deltaY)) return;

    if (deltaX < 0) {
      goToAdjacentItem('next');
    } else {
      goToAdjacentItem('prev');
    }
  };

  const submitComment = async (galleryId: string) => {
    const content = (commentInputByItem[galleryId] || '').trim();

    if (!user) {
      toast.error('Faça login para comentar.');
      return;
    }

    if (interactionsUnavailable || busyCommentId || content.length < 2) {
      return;
    }

    try {
      setBusyCommentId(galleryId);
      const { error } = await supabase
        .from('gallery_comments')
        .insert([{ gallery_id: galleryId, user_id: user.id, comment: content }]);
      if (error) throw error;

      setCommentInputByItem((prev) => ({ ...prev, [galleryId]: '' }));
      await loadInteractions();
      toast.success('Comentário enviado!');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Erro ao comentar';
      toast.error(message);
    } finally {
      setBusyCommentId(null);
    }
  };

  const deleteComment = async (galleryId: string, commentId: string) => {
    if (role !== 'admin' || interactionsUnavailable || busyCommentId) return;

    try {
      setBusyCommentId(galleryId);
      const { error } = await supabase
        .from('gallery_comments')
        .delete()
        .eq('id', commentId)
        .eq('gallery_id', galleryId);

      if (error) throw error;
      await loadInteractions();
      toast.success('Comentário excluído.');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Erro ao excluir comentário';
      toast.error(message);
    } finally {
      setBusyCommentId(null);
    }
  };

  return (
    <section className="gallery-page animate-fade-in">
      <header className="gallery-header glass">
        <div>
          <h1>Galeria</h1>
          <p>Fotos e vídeos da copa. Curta e comente com a galera.</p>
        </div>
        <button className="gallery-refresh" onClick={() => void refresh()}>
          Atualizar
        </button>
      </header>

      {interactionsUnavailable && (
        <div className="gallery-warning glass">
          Curtidas e comentários ainda não estão ativos no banco. A mídia da galeria já está funcionando.
        </div>
      )}

      {unavailable && (
        <div className="gallery-warning glass">
          A tabela principal da Galeria ainda não existe no banco. Execute o SQL de setup para ativar as postagens.
        </div>
      )}

      {loading ? (
        <div className="gallery-empty glass">
          <p>Carregando galeria...</p>
        </div>
      ) : items.length === 0 ? (
        <div className="gallery-empty glass">
          <p>Nenhuma mídia publicada ainda.</p>
        </div>
      ) : (
        <div className="gallery-grid">
          {items.map((item) => {
            const comments = commentsByItem[item.id] || [];
            const likesCount = likesByItem[item.id] || 0;
            const myLike = Boolean(likedByMe[item.id]);

            return (
              <article key={item.id} className="gallery-card glass">
                <div
                  className="gallery-media-wrap"
                  role="button"
                  tabIndex={0}
                  onClick={() => setSelectedItemId(item.id)}
                  onDoubleClick={() => handleMediaDoubleLike(item.id)}
                  onTouchEnd={(event) => handleMediaTouchEnd(item.id, event)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      setSelectedItemId(item.id);
                    }
                  }}
                  aria-label={`Abrir ${item.title}`}
                >
                  {item.media_type === 'video' ? (
                    <video className="gallery-media gallery-media-video" controls preload="metadata" src={item.media_url} />
                  ) : (
                    <img className="gallery-media gallery-media-image" src={item.media_url} alt={item.title} loading="lazy" decoding="async" />
                  )}
                  <span
                    className={`gallery-media-like-burst ${mediaLikeBurstId === item.id ? 'active' : ''}`}
                    aria-hidden="true"
                  >
                    <Heart size={54} />
                  </span>
                </div>

                <div className="gallery-content">
                  <h3>{item.title}</h3>
                  {item.description && <p>{item.description}</p>}
                  <span className="gallery-date">{new Date(item.created_at).toLocaleString('pt-BR')}</span>

                  <div className="gallery-actions">
                    <button
                      className={`gallery-like-btn ${myLike ? 'liked' : ''} ${likeBurstId === item.id ? 'like-burst' : ''}`}
                      onClick={() => void toggleLike(item.id)}
                      disabled={!user || busyLikeId === item.id || interactionsUnavailable}
                    >
                      <Heart size={16} />
                      <span>{likesCount}</span>
                    </button>
                    <div className="gallery-comments-count">
                      <MessageCircle size={16} />
                      <span>{comments.length}</span>
                    </div>
                  </div>

                  <div className="gallery-comment-box">
                    <input
                      type="text"
                      placeholder={user ? 'Escreva um comentário...' : 'Faça login para comentar'}
                      value={commentInputByItem[item.id] || ''}
                      onChange={(e) => setCommentInputByItem((prev) => ({ ...prev, [item.id]: e.target.value }))}
                      disabled={!user || interactionsUnavailable}
                      maxLength={240}
                    />
                    <button
                      onClick={() => void submitComment(item.id)}
                      disabled={!user || interactionsUnavailable || busyCommentId === item.id}
                      aria-label="Enviar comentário"
                    >
                      <Send size={16} />
                    </button>
                  </div>

                  <div className="gallery-comments-list">
                    {comments.slice(0, 4).map((comment) => (
                      <div key={comment.id} className="gallery-comment-item">
                        <div className="gallery-comment-head">
                          <strong>{comment.user_id === user?.id ? 'Você' : 'Torcedor'}</strong>
                          {role === 'admin' && (
                            <button
                              className="gallery-comment-delete"
                              onClick={() => void deleteComment(item.id, comment.id)}
                              disabled={busyCommentId === item.id}
                              aria-label="Excluir comentário"
                            >
                              <Trash2 size={14} />
                            </button>
                          )}
                        </div>
                        <span>{comment.comment}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {selectedItem && (
        <div className="gallery-modal" role="dialog" aria-modal="true" aria-label="Visualização da mídia" onClick={() => setSelectedItemId(null)}>
          <div className="gallery-modal__panel glass" onClick={(e) => e.stopPropagation()}>

            <div className="gallery-modal__media-wrap">
              <div
                className="gallery-modal__media-like-zone"
                onDoubleClick={() => handleMediaDoubleLike(selectedItem.id)}
                onTouchStart={handleModalSwipeStart}
                onTouchEnd={(event) => {
                  handleMediaTouchEnd(selectedItem.id, event);
                  handleModalSwipeEnd(event);
                }}
                aria-label="Dar like com duplo toque"
              >
              <button
                className="gallery-modal__back"
                onClick={() => setSelectedItemId(null)}
                aria-label="Voltar"
                title="Voltar"
              >
                <ArrowLeft size={18} />
                <span>Voltar</span>
              </button>
              {canNavigate && (
                <>
                  <button
                    className="gallery-modal__nav gallery-modal__nav--prev"
                    onClick={() => goToAdjacentItem('prev')}
                    aria-label="Postagem anterior"
                    title="Postagem anterior"
                  >
                    <ArrowLeft size={18} />
                  </button>
                  <button
                    className="gallery-modal__nav gallery-modal__nav--next"
                    onClick={() => goToAdjacentItem('next')}
                    aria-label="Próxima postagem"
                    title="Próxima postagem"
                  >
                    <ArrowLeft size={18} />
                  </button>
                </>
              )}
              {selectedItem.media_type === 'video' ? (
                <video className="gallery-modal__media" controls autoPlay preload="metadata" src={selectedItem.media_url} />
              ) : (
                <img className="gallery-modal__media" src={selectedItem.media_url} alt={selectedItem.title} loading="eager" decoding="async" />
              )}
              <span
                className={`gallery-media-like-burst gallery-media-like-burst-modal ${mediaLikeBurstId === selectedItem.id ? 'active' : ''}`}
                aria-hidden="true"
              >
                <Heart size={66} />
              </span>
              </div>
            </div>

            <div className="gallery-modal__info">
              <h3>{selectedItem.title}</h3>
              {selectedItem.description && <p>{selectedItem.description}</p>}
              <span className="gallery-date">{new Date(selectedItem.created_at).toLocaleString('pt-BR')}</span>
              <div className="gallery-actions">
                <button
                  className={`gallery-like-btn ${likedByMe[selectedItem.id] ? 'liked' : ''} ${likeBurstId === selectedItem.id ? 'like-burst' : ''}`}
                  onClick={() => void toggleLike(selectedItem.id)}
                  disabled={!user || busyLikeId === selectedItem.id || interactionsUnavailable}
                  aria-label="Curtidas"
                >
                  <Heart size={16} />
                  <span>{likesByItem[selectedItem.id] || 0}</span>
                </button>
                <div className="gallery-comments-count" aria-label="Comentários">
                  <MessageCircle size={16} />
                  <span>{(commentsByItem[selectedItem.id] || []).length}</span>
                </div>
              </div>

              <div className="gallery-comment-box gallery-comment-box-modal">
                <input
                  type="text"
                  placeholder={user ? 'Escreva um comentário...' : 'Faça login para comentar'}
                  value={commentInputByItem[selectedItem.id] || ''}
                  onChange={(e) => setCommentInputByItem((prev) => ({ ...prev, [selectedItem.id]: e.target.value }))}
                  disabled={!user || interactionsUnavailable}
                  maxLength={240}
                />
                <button
                  onClick={() => void submitComment(selectedItem.id)}
                  disabled={!user || interactionsUnavailable || busyCommentId === selectedItem.id}
                  aria-label="Enviar comentário"
                >
                  <Send size={16} />
                </button>
              </div>

              <div className="gallery-modal__comments" aria-label="Lista de comentários">
                {(commentsByItem[selectedItem.id] || []).length === 0 ? (
                  <p className="gallery-modal__comments-empty">Ainda sem comentários. Seja o primeiro.</p>
                ) : (
                  (commentsByItem[selectedItem.id] || []).map((comment) => (
                    <div key={comment.id} className="gallery-comment-item gallery-comment-item-modal">
                      <div className="gallery-comment-head">
                        <strong>{comment.user_id === user?.id ? 'Você' : 'Torcedor'}</strong>
                        {role === 'admin' && (
                          <button
                            className="gallery-comment-delete"
                            onClick={() => void deleteComment(selectedItem.id, comment.id)}
                            disabled={busyCommentId === selectedItem.id}
                            aria-label="Excluir comentário"
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                      <span>{comment.comment}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};

export default Gallery;
