import React from 'react';
import './Skeleton.css';

interface SkeletonProps {
  width?: string | number;
  height?: string | number;
  borderRadius?: string;
  className?: string;
  variant?: 'text' | 'rect' | 'circle';
}

const Skeleton: React.FC<SkeletonProps> = ({ 
  width, 
  height, 
  borderRadius, 
  className = '',
  variant = 'rect'
}) => {
  const styles: React.CSSProperties = {
    width,
    height,
    borderRadius: borderRadius || (variant === 'circle' ? '50%' : '8px'),
  };

  return (
    <div 
      className={`skeleton-base skeleton-${variant} ${className}`} 
      style={styles}
    />
  );
};

export const SkeletonCard: React.FC<{ lines?: number }> = ({ lines = 3 }) => (
  <div className="skeleton-card">
    <div className="skeleton-card-header">
      <Skeleton height="14px" width="40%" borderRadius="6px" />
      <Skeleton height="14px" width="20%" borderRadius="6px" />
    </div>
    {Array.from({ length: lines }).map((_, i) => (
      <Skeleton
        key={i}
        height="12px"
        width={i === lines - 1 ? '60%' : '100%'}
        borderRadius="6px"
      />
    ))}
  </div>
);

export const SkeletonMatchCard: React.FC = () => (
  <div className="skeleton-match-card">
    <div className="skeleton-teams-row">
      <div className="skeleton-team-col">
        <Skeleton height="52px" width="52px" borderRadius="50%" />
        <Skeleton height="12px" width="65px" borderRadius="6px" />
      </div>
      <div className="skeleton-score-box">
        <Skeleton height="38px" width="70px" borderRadius="10px" />
      </div>
      <div className="skeleton-team-col">
        <Skeleton height="52px" width="52px" borderRadius="50%" />
        <Skeleton height="12px" width="65px" borderRadius="6px" />
      </div>
    </div>
    <Skeleton height="10px" width="50%" borderRadius="6px" className="skeleton-center" />
  </div>
);

export const SkeletonStandingsRow: React.FC = () => (
  <div className="skeleton-standings-row">
    <Skeleton height="14px" width="20px" borderRadius="4px" />
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flex: 1 }}>
      <Skeleton height="30px" width="30px" borderRadius="8px" />
      <Skeleton height="13px" width="90px" borderRadius="5px" />
    </div>
    <Skeleton height="13px" width="22px" borderRadius="5px" />
    <Skeleton height="13px" width="22px" borderRadius="5px" />
    <Skeleton height="13px" width="22px" borderRadius="5px" />
    <Skeleton height="13px" width="22px" borderRadius="5px" />
    <Skeleton height="13px" width="28px" borderRadius="5px" />
  </div>
);

export const SkeletonRankingRow: React.FC = () => (
  <div className="skeleton-ranking-row">
    <Skeleton height="28px" width="28px" borderRadius="50%" />
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
      <Skeleton height="13px" width="120px" borderRadius="5px" />
      <Skeleton height="11px" width="70px" borderRadius="5px" />
    </div>
    <Skeleton height="24px" width="36px" borderRadius="8px" />
  </div>
);

export default Skeleton;

