import React from 'react';

export function Badge({ children, color = 'gray' }: { children: React.ReactNode, color?: 'green' | 'yellow' | 'red' | 'gray' | 'blue' | 'purple' }) {
  const colors = {
    green: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20 shadow-[0_0_10px_rgba(52,211,153,0.1)]',
    yellow: 'bg-amber-500/10 text-amber-400 border-amber-500/20 shadow-[0_0_10px_rgba(245,158,11,0.1)]',
    red: 'bg-rose-500/10 text-rose-400 border-rose-500/20 shadow-[0_0_10px_rgba(244,63,94,0.1)]',
    gray: 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20',
    blue: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20 shadow-[0_0_10px_rgba(6,182,212,0.1)]',
    purple: 'bg-purple-500/10 text-purple-400 border-purple-500/20 shadow-[0_0_10px_rgba(168,85,247,0.1)]',
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] uppercase tracking-wider font-semibold border ${colors[color]}`}>
      {children}
    </span>
  );
}
