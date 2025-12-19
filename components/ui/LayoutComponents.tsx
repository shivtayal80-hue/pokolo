import React from 'react';
import { LucideIcon } from 'lucide-react';
import { safeString } from '../../lib/utils';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  title?: string;
  action?: React.ReactNode;
}

export const Card: React.FC<CardProps> = ({ children, className = '', title, action }) => (
  <div className={`bg-white rounded-2xl shadow-card ${className}`}>
    {(title || action) && (
      <div className="px-6 py-5 flex justify-between items-center">
        {title && <h3 className="text-base font-semibold text-gray-900 tracking-tight">{safeString(title)}</h3>}
        {action && <div>{action}</div>}
      </div>
    )}
    <div className="p-6 pt-0">{children}</div>
  </div>
);

interface StatCardProps {
  title: string;
  value: string;
  subValue?: string;
  icon: LucideIcon;
  trend?: 'up' | 'down' | 'neutral';
  colorClass?: string;
}

export const StatCard: React.FC<StatCardProps> = ({ title, value, subValue, icon: Icon, colorClass = "text-brand-600" }) => (
  <div className="bg-white p-6 rounded-2xl shadow-card flex flex-col justify-between h-full hover:shadow-lg transition-shadow duration-300">
    <div className="flex justify-between items-start mb-4">
      <div className={`p-2.5 rounded-xl bg-opacity-10 ${colorClass.replace('text-', 'bg-')}`}>
        <Icon size={20} className={colorClass} />
      </div>
    </div>
    <div>
      <h4 className="text-3xl font-bold text-gray-900 tracking-tight">{safeString(value)}</h4>
      <div className="flex items-center gap-2 mt-1">
        <p className="text-sm font-medium text-gray-500">{safeString(title)}</p>
        {subValue && <span className="text-xs text-gray-400">• {safeString(subValue)}</span>}
      </div>
    </div>
  </div>
);

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  isLoading?: boolean;
}

export const Button: React.FC<ButtonProps> = ({ children, variant = 'primary', isLoading, className = '', ...props }) => {
  const baseStyles = "inline-flex items-center justify-center px-4 py-2.5 text-sm font-semibold rounded-xl transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-1 disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98]";
  
  const variants = {
    primary: "bg-gray-900 text-white hover:bg-black focus:ring-gray-800 shadow-sm",
    secondary: "bg-white text-gray-700 border border-gray-200 hover:bg-gray-50 hover:border-gray-300 focus:ring-gray-200 shadow-sm",
    danger: "bg-white text-red-600 border border-red-200 hover:bg-red-50 focus:ring-red-100",
    ghost: "text-gray-600 hover:bg-gray-100 hover:text-gray-900",
  };

  return (
    <button className={`${baseStyles} ${variants[variant]} ${className}`} disabled={isLoading} {...props}>
      {isLoading ? (
        <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-current" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
      ) : null}
      {children}
    </button>
  );
};