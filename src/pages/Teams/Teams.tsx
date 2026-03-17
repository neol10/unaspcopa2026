import React from 'react';
import { useNavigate } from 'react-router-dom';
import './Teams.css';
import { Shield } from 'lucide-react';
import { useTeams } from '../../hooks/useTeams';
import Skeleton from '../../components/Skeleton/Skeleton';

const Teams: React.FC = () => {
  const navigate = useNavigate();
  const { teams, loading, error } = useTeams();

  if (loading && teams.length === 0) return (
    <div className="teams-page animate-fade-in">
      <header className="teams-hero-header">
        <div className="hero-content">
          <Skeleton width="200px" height="40px" className="mb-2" />
          <Skeleton width="300px" height="20px" />
        </div>
      </header>
      <div className="teams-grid-v2">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} className="team-card-v2 glass" style={{ cursor: 'default' }}>
            <div className="card-top">
              <Skeleton width="40px" height="15px" borderRadius="100px" />
            </div>
            <div className="card-badge">
              <Skeleton width="60px" height="60px" variant="circle" />
            </div>
            <div className="card-body">
              <Skeleton width="120px" height="24px" className="mb-2" />
              <Skeleton width="80px" height="16px" />
            </div>
            <div className="card-footer">
              <Skeleton width="100%" height="40px" borderRadius="10px" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
  
  if (error) return <div className="error-state glass">Erro ao carregar equipes: {error}</div>;

  return (
    <div className="teams-page animate-fade-in">
      <header className="teams-hero-header">
        <div className="hero-content">
          <h1 className="text-gradient">Elencos de Elite</h1>
          <p>Conheça as potências que lutam pela Copa Unasp 2026</p>
        </div>
        <div className="hero-stats glass">
          <div className="hero-stat">
            <Shield size={20} color="var(--secondary)" />
            <div>
              <strong>{teams.length}</strong>
              <span>Equipes</span>
            </div>
          </div>
        </div>
      </header>

      <div className="teams-grid-v2">
        {teams.map((team) => (
          <div key={team.id} className="team-card-v2 glass" onClick={() => navigate(`/equipes/${team.id}`)}>
            <div className="card-top">
              <span className="team-pill">{team.group}</span>
            </div>
            
            <div className="card-badge">
              <div className="badge-glow"></div>
              {team.badge_url ? (
                <img 
                  src={team.badge_url} 
                  alt={team.name} 
                  width="48" 
                  height="48" 
                  loading="lazy"
                  style={{ objectFit: 'contain' }} 
                />
              ) : (
                <Shield size={40} color="var(--secondary)" />
              )}
            </div>
            
            <div className="card-body">
              <h3>{team.name}</h3>
              <div className="leader-info">
                <span>Capitão: {team.leader}</span>
              </div>
            </div>

            <div className="card-footer">
              <button className="btn-explore">
                Ver Elenco Completo
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default Teams;
