'use client';

import React from 'react';
import { Activity } from 'lucide-react';

interface NavbarProps {
  title: string;
  subtitle?: string;
}

export function Navbar({ title, subtitle }: NavbarProps) {
  return (
    <header className="h-14 border-b border-ds-hairline bg-ds-white px-8 flex items-center justify-between shrink-0">
      <div>
        <h1 className="font-display text-lg font-normal text-ds-ink tracking-tight">{title}</h1>
        {subtitle && <p className="text-xs text-ds-ink-2">{subtitle}</p>}
      </div>

      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5 py-1 px-2.5 rounded-[var(--radius)] border border-ds-hairline bg-ds-raised text-xs text-ds-ink shadow-control">
          <Activity className="h-3 w-3 text-ds-teal" />
          <span className="font-mono text-[11px]">Evolution API v2</span>
        </div>
      </div>
    </header>
  );
}
