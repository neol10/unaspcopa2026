import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './Teams.css';
import { Shield, Search } from 'lucide-react';
import { useTeams } from '../../hooks/useTeams';
import Skeleton from '../../components/Skeleton/Skeleton';
import { useAuthContext } from '../../contexts/AuthContext';

const Teams: React.FC = () => {
  const navigate = useNavigate();
  const { teams, loading, error, refresh } = useTeams();
  const { role } = useAuthContext();
  const [stuck, setStuck] = useState(false);
  const [brokenBadgeMap, setBrokenBadgeMap] = useState<Record<string, true>>({});
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedGroup, setSelectedGroup] = useState('all');
  const isAdmin = role === 'admin';

  const markBadgeBroken = (teamId: string) => {
    setBrokenBadgeMap((prev) => (prev[teamId] ? prev : { ...prev, [teamId]: true }));
  };

  const normalizeImageSrc = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return '';
    if (trimmed.startsWith('data:') || trimmed.startsWith('blob:')) return trimmed;
    try {
      return encodeURI(trimmed);
    } catch {
      return trimmed;
    }
  };

  useEffect(() => {
    if (!loading) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setStuck(false);
      return;
    }
    const id = setTimeout(() => setStuck(true), 15000);
    return () => clearTimeout(id);
  }, [loading]);

  if ((stuck || (!navigator.onLine && loading)) && teams.length === 0) {
    return (
      <div className="error-state glass" style={{ margin: '2rem auto', maxWidth: 720 }}>
        <p style={{ marginBottom: '0.75rem' }}>
          {!navigator.onLine
            ? 'Sem conexão no momento. As equipes vão carregar assim que a internet voltar.'
            : 'Demorou muito para carregar as equipes.'}
        </p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button className="glass" style={{ padding: '10px 14px', cursor: 'pointer' }} onClick={() => refresh()}>
            Tentar novamente
          </button>
          <button className="glass" style={{ padding: '10px 14px', cursor: 'pointer' }} onClick={() => window.location.reload()}>
            Recarregar página
          </button>
        </div>
      </div>
    );
  }

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
  
  if (error && teams.length === 0) {
    return (
      <div className="error-state glass" style={{ margin: '2rem auto', maxWidth: 720 }}>
        <p style={{ marginBottom: '0.75rem' }}>Erro ao carregar equipes: {error}</p>
        <button className="glass" style={{ padding: '10px 14px', cursor: 'pointer' }} onClick={() => refresh()}>
          Tentar novamente
        </button>
      </div>
    );
  }

  const normalize = (value: string) => value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  const isTestGroup = (groupName?: string | null) => {
    const clean = (groupName || '').trim().toUpperCase().replace(/\s+/g, '');
    return clean === 'C' || clean === 'GRUPOC';
  };

  const visibleTeamsBase = isAdmin
    ? teams
    : teams.filter((team) => !isTestGroup(team.group));

  const groupNames = Array.from(new Set(visibleTeamsBase.map((team) => (team.group || 'Sem Grupo').trim()))).sort((a, b) => a.localeCompare(b));
  const normalizedSearch = normalize(searchTerm.trim());

  const visibleTeams = visibleTeamsBase.filter((team) => {
    const groupName = (team.group || 'Sem Grupo').trim();
    if (selectedGroup !== 'all' && groupName !== selectedGroup) return false;
    if (!normalizedSearch) return true;
    const inName = normalize(team.name || '').includes(normalizedSearch);
    const inLeader = normalize(team.leader || '').includes(normalizedSearch);
    const inGroup = normalize(groupName).includes(normalizedSearch);
    return inName || inLeader || inGroup;
  });

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
              <strong>{visibleTeams.length}</strong>
              <span>{visibleTeams.length === teams.length ? 'Equipes' : 'Resultados'}</span>
            </div>
          </div>
        </div>
      </header>

      <section className="teams-filter-bar glass">
        <label className="teams-search-wrap" htmlFor="teams-search-input">
          <Search size={15} />
          <input
            id="teams-search-input"
            type="search"
            placeholder="Buscar equipe, capitão ou grupo"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </label>

        <div className="teams-group-filters" role="tablist" aria-label="Filtro por grupo">
          <button
            type="button"
            className={`teams-filter-chip ${selectedGroup === 'all' ? 'active' : ''}`}
            onClick={() => setSelectedGroup('all')}
          >
            Todos
          </button>
          {groupNames.map((group) => (
            <button
              key={group}
              type="button"
              className={`teams-filter-chip ${selectedGroup === group ? 'active' : ''}`}
              onClick={() => setSelectedGroup(group)}
            >
              {group}
            </button>
          ))}
        </div>
      </section>

      <div className="teams-grid-v2">
        {visibleTeams.map((team) => (
          <div
            key={team.id}
            className="team-card-v2 glass"
            onClick={() => navigate(`/equipes/${team.id}`)}
            role="button"
            tabIndex={0}
            aria-label={`Abrir equipe ${team.name}`}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                navigate(`/equipes/${team.id}`);
              }
            }}
          >
            <div className="card-top">
              <span className="team-pill">{team.group || 'Sem Grupo'}</span>
            </div>
            
            <div className="card-badge">
              <div className="badge-glow"></div>
              {team.badge_url && !brokenBadgeMap[team.id] ? (
                <img 
                  src={normalizeImageSrc(team.badge_url)} 
                  alt={team.name} 
                  width="48" 
                  height="48" 
                  loading="lazy"
                  style={{ objectFit: 'contain' }}
                  onError={() => markBadgeBroken(team.id)}
                />
              ) : (
                <Shield size={40} color="var(--secondary)" />
              )}
            </div>
            
            <div className="card-body">
              <h3>{team.name}</h3>
              <div className="leader-info">
                <span>Capitão: {team.leader || 'A definir'}</span>
              </div>
            </div>

            <div className="card-footer">
              <button className="btn-explore" type="button">
                Ver Elenco Completo
              </button>
            </div>
          </div>
        ))}
      </div>

      {visibleTeams.length === 0 && (
        <div className="teams-empty-state glass">
          <p>Nenhuma equipe encontrada com os filtros atuais.</p>
        </div>
      )}
    </div>
  );
};

export default Teams;
