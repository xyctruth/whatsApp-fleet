import React from 'react';
import { Loader2 } from 'lucide-react';

const LoadingSpinner = ({ size = 'medium', className = '' }) => {
  const sizeClasses = {
    small: 'w-4 h-4',
    medium: 'w-6 h-6',
    large: 'w-8 h-8',
    xl: 'w-12 h-12'
  };

  return (
    <div className={`flex items-center justify-center ${className}`}>
      <Loader2 className={`animate-spin text-whatsapp-green ${sizeClasses[size]}`} />
    </div>
  );
};

export default LoadingSpinner;
