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

export default Skeleton;
