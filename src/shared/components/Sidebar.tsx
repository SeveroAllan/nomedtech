'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  FileText,
  Calendar,
  Users,
  Settings,
  LayoutDashboard,
  MessageSquare,
  Sparkles,
  ChevronRight,
} from 'lucide-react';
import { cn } from '@/components/ui/button';

const NAV_ITEMS = [
  { label: 'Visão Geral', href: '/', icon: LayoutDashboard },
  { label: 'Notas Fiscais', href: '/notas', icon: FileText },
  { label: 'Agenda & Slots', href: '/agenda', icon: Calendar },
  { label: 'Pacientes', href: '/pacientes', icon: Users },
  { label: 'Integrações', href: '/integracoes', icon: Settings },
  { label: 'Onboarding', href: '/onboarding', icon: Sparkles },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-64 border-r border-ds-hairline bg-ds-white flex flex-col justify-between p-4 shrink-0 h-full overflow-y-auto">
      <div>
        {/* Brand Header */}
        <div className="flex items-center gap-3 px-3 py-4 mb-6 border-b border-ds-hairline">
          <div className="h-8 w-8 rounded-[var(--radius)] bg-ds-ink flex items-center justify-center text-ds-white shadow-control">
            <MessageSquare className="h-4 w-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-display font-medium text-ds-ink tracking-tight text-base">NotoWhats</span>
              <span className="text-[10px] uppercase font-mono tracking-wider px-1.5 py-0.5 rounded-[var(--radius)] bg-ds-raised text-ds-ink border border-ds-hairline">
                SaaS
              </span>
            </div>
            <p className="text-[11px] text-ds-ink-4">NFS-e & WhatsApp</p>
          </div>
        </div>

        {/* Navigation items */}
        <nav className="space-y-1">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex items-center justify-between px-3 py-2 rounded-[var(--radius)] text-xs font-medium transition-colors group',
                  isActive
                    ? 'bg-ds-raised text-ds-ink font-semibold'
                    : 'text-ds-ink-2 hover:bg-[var(--hover)] hover:text-ds-ink'
                )}
              >
                <div className="flex items-center gap-2.5">
                  <Icon
                    className={cn(
                      'h-4 w-4 transition-colors',
                      isActive ? 'text-ds-ink' : 'text-ds-ink-4 group-hover:text-ds-ink'
                    )}
                  />
                  <span>{item.label}</span>
                </div>
                {isActive && <ChevronRight className="h-3.5 w-3.5 text-ds-ink-4" />}
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Footer Info */}
      <div className="pt-4 border-t border-ds-hairline px-3 text-[11px] text-ds-ink-4 font-mono">
        v2.0 · Multi-tenant
      </div>
    </aside>
  );
}
