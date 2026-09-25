import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { LucideIcon } from 'lucide-react';
import { cn } from '@/components/ui/button';

interface StatCardProps {
  title: string;
  value: string | number;
  description?: string;
  icon: LucideIcon;
  trend?: string;
  trendPositive?: boolean;
}

export function StatCard({
  title,
  value,
  description,
  icon: Icon,
  trend,
  trendPositive,
}: StatCardProps) {
  return (
    <Card className="hover:border-white/20 transition-all">
      <CardContent className="p-5 flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-[#a0a0a0] uppercase tracking-wider">{title}</p>
          <div className="mt-2 flex items-baseline gap-2">
            <h4 className="font-display text-2xl font-bold text-white tracking-tight">{value}</h4>
            {trend && (
              <span
                className={cn(
                  'text-xs font-semibold px-1.5 py-0.5 rounded',
                  trendPositive ? 'bg-brand/15 text-brand' : 'bg-red-500/15 text-red-400'
                )}
              >
                {trend}
              </span>
            )}
          </div>
          {description && <p className="text-xs text-[#737373] mt-1">{description}</p>}
        </div>

        <div className="h-10 w-10 rounded-[8px] bg-white/5 border border-white/10 flex items-center justify-center text-brand">
          <Icon className="h-5 w-5" />
        </div>
      </CardContent>
    </Card>
  );
}
