import React, { useMemo } from 'react';
import { Match } from '../../../hooks/useMatches';
import { KNOCKOUT_ROUND_LABELS } from '../../lib/tournamentRules';
import { Shield, Trophy } from 'lucide-react';
import { deriveMatchStatus } from '../../lib/matchStatus';
import './KnockoutTeiaExport.css';

interface KnockoutTeiaExportProps {
  id?: string;
  matches: Match[];
  knockoutRounds: number[];
}

export const KnockoutTeiaExport: React.FC<KnockoutTeiaExportProps> = ({ id, matches, knockoutRounds }) => {
  const teiaColumns = useMemo(() => {
    return knockoutRounds.map((roundCode) => {
      const roundMatches = matches.filter((m) => Number(m.round) === Number(roundCode));
      // Sort so they pair up correctly visually (if needed, assumes order from DB is good)
      roundMatches.sort((a, b) => new Date(a.match_date).getTime() - new Date(b.match_date).getTime());
      return { roundCode, matches: roundMatches };
    });
  }, [matches, knockoutRounds]);

  const nowTs = Date.now();

  return (
    <div id={id} className="teia-export-container">
      <h2 className="teia-export-title">CHAVEAMENTO</h2>
      <div className="teia-export-wrapper">
        <div className="teia-columns">
          {teiaColumns.map((column, colIndex) => {
            // Se não tiver jogos nesta fase, vamos criar placeholders para manter a árvore!
            let renderMatches = column.matches;
            if (renderMatches.length === 0) {
              const count = column.roundCode === 1001 ? 4 : column.roundCode === 1002 ? 2 : column.roundCode === 1003 ? 1 : 0;
              renderMatches = Array.from({ length: count }).map((_, i) => ({
                id: `placeholder-${column.roundCode}-${i}`,
                round: column.roundCode,
                match_date: new Date().toISOString(),
                team_a_id: '',
                team_b_id: '',
                status: 'agendado',
                team_a_score: null,
                team_b_score: null,
                teams_a: { name: 'A definir' },
                teams_b: { name: 'A definir' }
              })) as Match[];
            }
            if (renderMatches.length === 0) return null;

            return (
              <div key={column.roundCode} className={`teia-column col-depth-${colIndex}`}>
                {renderMatches.map((match) => {
                  const effectiveStatus = deriveMatchStatus(match, nowTs);
                  const isTeamAWinner = effectiveStatus === 'finalizado' && (match.team_a_score ?? 0) > (match.team_b_score ?? 0);
                  const isTeamBWinner = effectiveStatus === 'finalizado' && (match.team_b_score ?? 0) > (match.team_a_score ?? 0);

                  const matchDateObj = new Date(match.match_date);
                  // Se for placeholder, esconde a data ou mostra "A definir"
                  const isPlaceholder = match.id.toString().startsWith('placeholder-');
                  const outcomeLabel = isPlaceholder ? 'A definir' : (matchDateObj.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) + ' às ' + matchDateObj.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }));

                  return (
                    <div key={match.id} className="teia-match">
                      <div className="teia-match-box">
                        <div className="match-preview">
                          <span className="match-round-chip">{KNOCKOUT_ROUND_LABELS[match.round as number] || `Fase ${column.roundCode}`}</span>
                          <span>{outcomeLabel}</span>
                        </div>

                        <div className={`teia-match-team ${isTeamAWinner ? 'winner' : ''}`}>
                          <div className="teia-team-info">
                            {match.teams_a?.badge_url ? (
                              <img src={match.teams_a.badge_url} alt="" width="28" height="28" />
                            ) : (
                              <Shield size={28} color="rgba(255,255,255,0.2)" />
                            )}
                            <span className="teia-team-name">{match.teams_a?.name || 'A definir'}</span>
                            {isTeamAWinner && <Trophy size={14} color="#fcd34d" />}
                          </div>
                          <div className="teia-team-score">{effectiveStatus !== 'agendado' ? match.team_a_score : '-'}</div>
                        </div>

                        <div className={`teia-match-team ${isTeamBWinner ? 'winner' : ''}`}>
                          <div className="teia-team-info">
                            {match.teams_b?.badge_url ? (
                              <img src={match.teams_b.badge_url} alt="" width="28" height="28" />
                            ) : (
                              <Shield size={28} color="rgba(255,255,255,0.2)" />
                            )}
                            <span className="teia-team-name">{match.teams_b?.name || 'A definir'}</span>
                            {isTeamBWinner && <Trophy size={14} color="#fcd34d" />}
                          </div>
                          <div className="teia-team-score">{effectiveStatus !== 'agendado' ? match.team_b_score : '-'}</div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
