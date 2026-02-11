
import React from 'react';
import { LucideIcon } from 'lucide-react';

interface StatsCardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  color: 'teal' | 'blue' | 'indigo' | 'orange';
}

export const StatsCard: React.FC<StatsCardProps> = ({ title, value, icon: Icon, color }) => {
  const styles = {
    teal: { bg: 'bg-teal-50', icon: 'text-teal-600', border: 'border-teal-100', accent: 'bg-teal-600' },
    blue: { bg: 'bg-blue-50', icon: 'text-blue-600', border: 'border-blue-100', accent: 'bg-blue-600' },
    indigo: { bg: 'bg-indigo-50', icon: 'text-indigo-600', border: 'border-indigo-100', accent: 'bg-indigo-600' },
    orange: { bg: 'bg-orange-50', icon: 'text-orange-600', border: 'border-orange-100', accent: 'bg-orange-600' },
  };

  const current = styles[color];

  return (
    <div className={`flex items-center gap-3.5 pl-3.5 pr-6 py-2.5 rounded-2xl border ${current.border} ${current.bg} transition-all hover:shadow-lg hover:shadow-black/5 group cursor-default relative overflow-hidden`}>
      <div className={`absolute top-0 left-0 w-1 h-full ${current.accent} opacity-20`}></div>
      <div className="p-2.5 rounded-xl bg-white shadow-sm group-hover:scale-110 transition-transform duration-300">
        <Icon size={16} className={current.icon} strokeWidth={2.5} />
      </div>
      <div className="flex flex-col">
        <span className="text-[9px] font-extrabold text-slate-400 uppercase tracking-widest leading-none mb-1">{title}</span>
        <span className="text-sm font-black text-slate-900 tabular-nums leading-none tracking-tight">{value}</span>
      </div>
    </div>
  );
};
