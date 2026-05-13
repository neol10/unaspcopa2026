import React, { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X, Flag } from 'lucide-react';
import toast from 'react-hot-toast';
import { supabase } from '../../lib/supabase';
import { useAuthContext } from '../../contexts/AuthContext';
import './FeedbackModal.css';

type FeedbackCategory = 'problema' | 'melhoria' | 'outro';

interface FeedbackModalProps {
  open: boolean;
  pagePath?: string;
  onClose: () => void;
}

const FeedbackModal: React.FC<FeedbackModalProps> = ({ open, pagePath, onClose }) => {
  const { user } = useAuthContext();
  const [category, setCategory] = useState<FeedbackCategory>('problema');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);

  const trimmed = useMemo(() => message.trim(), [message]);
  const canSend = trimmed.length >= 5 && trimmed.length <= 1000 && !sending;

  useEffect(() => {
    if (!open) return;

    const html = document.documentElement;
    const body = document.body;
    const prevHtmlOverflow = html.style.overflow;
    const prevBodyOverflow = body.style.overflow;
    const prevBodyPaddingRight = body.style.paddingRight;
    const scrollbarGap = window.innerWidth - document.documentElement.clientWidth;

    html.style.overflow = 'hidden';
    body.style.overflow = 'hidden';
    if (scrollbarGap > 0) {
      body.style.paddingRight = `${scrollbarGap}px`;
    }

    return () => {
      html.style.overflow = prevHtmlOverflow;
      body.style.overflow = prevBodyOverflow;
      body.style.paddingRight = prevBodyPaddingRight;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  const resetForm = () => {
    setCategory('problema');
    setMessage('');
  };

  const handleSubmit = async () => {
    if (!canSend) return;

    setSending(true);
    try {
      const payload = {
        category,
        message: trimmed,
        page_path: pagePath || null,
        user_id: user ? user.id : null,
        user_email: user?.email || null,
        user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
      };

      const { error } = await supabase.from('feedback_reports').insert(payload);
      if (error) throw error;

      toast.success('Relato enviado. Obrigado!');
      resetForm();
      onClose();
    } catch (err: unknown) {
      const raw =
        err && typeof err === 'object' && 'message' in err && typeof (err as { message?: unknown }).message === 'string'
          ? String((err as { message: string }).message)
          : '';
      const msg = raw.includes('RATE_LIMIT')
        ? 'Muitas mensagens em pouco tempo. Aguarde alguns minutos e tente novamente.'
        : (raw || 'Erro ao enviar relato');
      toast.error(msg);
    } finally {
      setSending(false);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="feedback-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            className="feedback-modal glass"
            initial={{ scale: 0.95, opacity: 0, y: 18 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: 18 }}
            transition={{ type: 'spring', stiffness: 380, damping: 28 }}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Enviar relato"
          >
            <button className="feedback-close" onClick={onClose} aria-label="Fechar">
              <X size={18} />
            </button>

            <div className="feedback-head">
              <div className="feedback-icon">
                <Flag size={22} />
              </div>
              <div>
                <h3 className="feedback-title">Reportar problema ou melhoria</h3>
                <p className="feedback-subtitle">Isso vai direto para o admin concluir.</p>
              </div>
            </div>

            <div className="feedback-form">
              <label className="feedback-label">
                Tipo
                <select
                  className="feedback-select"
                  value={category}
                  onChange={(e) => setCategory(e.target.value as FeedbackCategory)}
                  disabled={sending}
                >
                  <option value="problema">Problema</option>
                  <option value="melhoria">Melhoria</option>
                  <option value="outro">Outro</option>
                </select>
              </label>

              <label className="feedback-label">
                Mensagem
                <textarea
                  className="feedback-textarea"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Descreva o que aconteceu ou o que você gostaria de ver..."
                  rows={6}
                  maxLength={1000}
                  disabled={sending}
                />
                <div className="feedback-meta">
                  <span>{trimmed.length}/1000</span>
                  {pagePath ? <span className="feedback-path">{pagePath}</span> : <span />}
                </div>
              </label>

              <div className="feedback-actions">
                <button className="feedback-cancel" onClick={onClose} disabled={sending}>
                  Cancelar
                </button>
                <button
                  className="feedback-send"
                  onClick={() => void handleSubmit()}
                  disabled={!canSend}
                >
                  {sending ? 'Enviando...' : 'Enviar'}
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default FeedbackModal;
