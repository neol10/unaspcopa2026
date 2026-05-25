import React, { useState, useMemo } from 'react';
import { X, Search, Shield, User } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

// Mock Player type to avoid strict imports, or you can import from your hooks
type Player = any; 

interface MvpVotingModalProps {
  isOpen: boolean;
  onClose: () => void;
  players: Player[];
  onCastVote: (playerId: string) => Promise<void>;
  userVote: string | null;
  onShowAuthModal?: () => void;
  user: any;
}

export const MvpVotingModal: React.FC<MvpVotingModalProps> = ({
  isOpen,
  onClose,
  players,
  onCastVote,
  userVote,
  onShowAuthModal,
  user
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const normalize = (val: string) => val.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  const filteredPlayers = useMemo(() => {
    const term = normalize(searchTerm.trim());
    let list = players;
    if (term) {
      list = list.filter(p => normalize(p.name).includes(term) || normalize(p.team_name || '').includes(term));
    }
    return list.slice(0, 50); // Show max 50 to avoid lag
  }, [players, searchTerm]);

  const handleVoteClick = async (playerId: string) => {
    if (!user && onShowAuthModal) {
      onShowAuthModal();
      return;
    }
    if (userVote) return; // already voted
    setIsSubmitting(true);
    try {
      await onCastVote(playerId);
      setTimeout(() => {
        onClose(); // Fechar após sucesso
      }, 1000);
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div 
      className="modal-overlay" 
      onClick={onClose} 
      style={{ 
        position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', 
        alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.8)',
        padding: '20px'
      }}
    >
      <AnimatePresence>
        <motion.div 
          className="glass"
          style={{
            position: 'relative',
            width: '100%',
            maxWidth: '500px',
            maxHeight: '80vh',
            display: 'flex',
            flexDirection: 'column',
            padding: '24px',
            borderRadius: '24px',
            background: '#0a0f1d',
            border: '1px solid rgba(255, 255, 255, 0.1)'
          }}
          onClick={e => e.stopPropagation()}
          initial={{ opacity: 0, scale: 0.9, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9, y: 20 }}
        >
          <button 
            onClick={onClose}
            style={{ position: 'absolute', top: 20, right: 20, background: 'none', border: 'none', color: '#fff', cursor: 'pointer' }}
          >
            <X size={24} />
          </button>

          <h2 style={{ fontSize: '1.5rem', marginBottom: '8px' }}>Craque da Galera</h2>
          <p style={{ color: 'var(--text-dim)', marginBottom: '20px', fontSize: '0.9rem' }}>
            {userVote ? 'Você já registrou seu voto.' : 'Pesquise o nome do atleta e deixe seu voto.'}
          </p>

          <div style={{ display: 'flex', alignItems: 'center', background: 'rgba(255, 255, 255, 0.05)', padding: '12px 16px', borderRadius: '12px', marginBottom: '20px' }}>
            <Search size={18} color="var(--text-dim)" style={{ marginRight: '10px' }} />
            <input 
              type="text" 
              placeholder="Ex: João da Silva" 
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              style={{ background: 'transparent', border: 'none', color: '#fff', width: '100%', outline: 'none' }}
              disabled={!!userVote || isSubmitting}
            />
          </div>

          <div style={{ overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {filteredPlayers.length === 0 ? (
              <p style={{ textAlign: 'center', padding: '20px', color: 'var(--text-dim)' }}>Atleta não encontrado.</p>
            ) : (
              filteredPlayers.map(p => {
                const isSelected = userVote === p.id;
                return (
                  <div 
                    key={p.id} 
                    style={{ 
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px', 
                      background: isSelected ? 'rgba(var(--secondary-rgb), 0.1)' : 'rgba(255, 255, 255, 0.03)', 
                      border: isSelected ? '1px solid var(--secondary)' : '1px solid rgba(255, 255, 255, 0.05)',
                      borderRadius: '12px',
                      cursor: (userVote || isSubmitting) ? 'default' : 'pointer',
                      opacity: (userVote && !isSelected) ? 0.5 : 1
                    }}
                    onClick={() => handleVoteClick(p.id)}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'rgba(255, 255, 255, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                        {p.photo_url ? <img src={p.photo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <User size={20} />}
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <strong style={{ fontSize: '1rem' }}>{p.name}</strong>
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-dim)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <Shield size={12} /> {p.team_name}
                        </span>
                      </div>
                    </div>
                    {isSelected ? (
                      <span style={{ color: 'var(--secondary)', fontWeight: 'bold', fontSize: '0.85rem' }}>SEU VOTO</span>
                    ) : (
                      <button 
                        style={{ 
                          background: 'rgba(255, 255, 255, 0.1)', border: 'none', padding: '6px 12px', borderRadius: '8px', color: '#fff', fontSize: '0.8rem', fontWeight: 'bold', cursor: 'pointer' 
                        }}
                        disabled={!!userVote || isSubmitting}
                      >
                        {isSubmitting ? '...' : 'VOTAR'}
                      </button>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
};
