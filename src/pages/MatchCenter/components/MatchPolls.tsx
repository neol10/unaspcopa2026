import React from 'react';
import { HelpCircle } from 'lucide-react';
import { motion } from 'framer-motion';
import { supabase } from '../../../lib/supabase';

interface MatchPollsProps {
  match: {
    id: string;
    status: string;
    teams_a?: { name: string };
    teams_b?: { name: string };
  };
  user: any | null;
  isAdmin?: boolean;
  winnerVotes: { team_a: number; draw: number; team_b: number; total: number };
  winnerUserVote: string | null;
  winnerVotesError: string | null;
  onCastWinnerVote: (option: 'team_a' | 'draw' | 'team_b') => void;
  onShowAuthModal: () => void;
  getPollQuestion: () => string;
  isKnockout: boolean;
}

export const MatchPolls: React.FC<MatchPollsProps> = ({
  match,
  user,
  isAdmin,
  winnerVotes,
  winnerUserVote,
  winnerVotesError,
  onCastWinnerVote,
  onShowAuthModal,
  getPollQuestion,
  isKnockout
}) => {
  const [showDetails, setShowDetails] = React.useState(false);
  const [voters, setVoters] = React.useState<any[]>([]);
  const [loadingVoters, setLoadingVoters] = React.useState(false);

  const fetchVoters = async () => {
    if (!isAdmin) return;
    setLoadingVoters(true);
    try {
      // Busca os votos primeiro
      const { data: votesData, error: votesError } = await supabase
        .from('match_winner_votes')
        .select('vote, user_id')
        .eq('match_id', match.id);
      
      if (votesError) throw votesError;
      if (!votesData || votesData.length === 0) {
        setVoters([]);
        return;
      }

      // Busca os perfis para esses user_ids
      const userIds = Array.from(new Set(votesData.map(v => v.user_id)));
      const { data: profilesData, error: profilesError } = await supabase
        .from('profiles')
        .select('id, email')
        .in('id', userIds);

      if (profilesError) throw profilesError;

      // Mapeia os dados
      const combined = votesData.map(v => ({
        ...v,
        profiles: profilesData?.find(p => p.id === v.user_id) || { email: 'Anônimo' }
      }));

      setVoters(combined);
    } catch (err) {
      console.error('Erro ao buscar votantes:', err);
    } finally {
      setLoadingVoters(false);
    }
  };

  const handleVote = (option: 'team_a' | 'draw' | 'team_b') => {
    if (!user) {
      onShowAuthModal();
      return;
    }
    if (navigator.vibrate) navigator.vibrate(50);
    onCastWinnerVote(option);
  };

  const getPercentage = (count: number) => {
    if (winnerVotes.total === 0) return 0;
    return Math.round((count / winnerVotes.total) * 100);
  };

  return (
    <div className="match-winner-poll glass animate-slide-up">
      <div className="poll-header-v2">
        <HelpCircle size={20} color="var(--secondary)" />
        <div className="poll-titles">
          <h3>{getPollQuestion()}</h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span className="poll-subtitle">{winnerVotes.total} votos registrados</span>
            {isAdmin && (
              <button 
                className="admin-view-details-btn"
                onClick={() => {
                  if (!showDetails) fetchVoters();
                  setShowDetails(!showDetails);
                }}
              >
                {showDetails ? 'Ocultar Detalhes' : 'Ver Detalhes'}
              </button>
            )}
          </div>
        </div>
      </div>
      
      {showDetails && isAdmin && (
        <div className="poll-admin-details animate-slide-down">
          {loadingVoters ? (
            <p>Carregando votantes...</p>
          ) : voters.length === 0 ? (
            <p>Nenhum voto detalhado encontrado.</p>
          ) : (
            <div className="voters-list-mini">
              {voters.map((v, i) => (
                <div key={i} className="voter-mini-row">
                  <span className="v-email">{v.profiles?.email || 'Anônimo'}</span>
                  <span className={`v-choice ${v.vote}`}>
                    {v.vote === 'team_a' ? 'A' : v.vote === 'team_b' ? 'B' : 'E'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="winner-options-v2">
        {winnerVotesError ? (
          <div className="empty-state glass" style={{ padding: '12px' }}>
            Erro ao carregar enquete: {winnerVotesError}
          </div>
        ) : (
          <>
            {/* Team A Option */}
            <button 
              className={`w-opt-v2 ${winnerUserVote === 'team_a' ? 'selected' : ''}`}
              onClick={() => handleVote('team_a')}
              disabled={!!winnerUserVote}
            >
              <div className="w-label-group">
                <span className="w-name">{match.teams_a?.name}</span>
                {winnerUserVote && (
                  <span className="w-perc">{getPercentage(winnerVotes.team_a)}%</span>
                )}
              </div>
              {winnerUserVote && (
                <div className="w-bar-container">
                  <motion.div 
                    className="w-bar" 
                    initial={{ width: 0 }}
                    animate={{ width: `${getPercentage(winnerVotes.team_a)}%` }}
                  />
                </div>
              )}
            </button>

            {/* Draw Option (only if not knockout) */}
            {!isKnockout && (
              <button 
                className={`w-opt-v2 draw ${winnerUserVote === 'draw' ? 'selected' : ''}`}
                onClick={() => handleVote('draw')}
                disabled={!!winnerUserVote}
              >
                <div className="w-label-group">
                  <span className="w-name">Empate</span>
                  {winnerUserVote && (
                    <span className="w-perc">{getPercentage(winnerVotes.draw)}%</span>
                  )}
                </div>
                {winnerUserVote && (
                  <div className="w-bar-container">
                    <motion.div 
                      className="w-bar" 
                      initial={{ width: 0 }}
                      animate={{ width: `${getPercentage(winnerVotes.draw)}%` }}
                    />
                  </div>
                )}
              </button>
            )}

            {/* Team B Option */}
            <button 
              className={`w-opt-v2 ${winnerUserVote === 'team_b' ? 'selected' : ''}`}
              onClick={() => handleVote('team_b')}
              disabled={!!winnerUserVote}
            >
              <div className="w-label-group">
                <span className="w-name">{match.teams_b?.name}</span>
                {winnerUserVote && (
                  <span className="w-perc">{getPercentage(winnerVotes.team_b)}%</span>
                )}
              </div>
              {winnerUserVote && (
                <div className="w-bar-container">
                  <motion.div 
                    className="w-bar" 
                    initial={{ width: 0 }}
                    animate={{ width: `${getPercentage(winnerVotes.team_b)}%` }}
                  />
                </div>
              )}
            </button>
          </>
        )}
      </div>
    </div>
  );
};
