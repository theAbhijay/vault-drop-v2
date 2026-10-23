'use client';

import { HardDrive } from 'lucide-react';
import { formatBytes } from '@/lib/file-helpers';

interface StorageMeterProps {
  usedBytes: number;
  totalCapMb?: number;
}

export function StorageMeter({ usedBytes, totalCapMb = 50 }: StorageMeterProps) {
  const capBytes = totalCapMb * 1024 * 1024;
  const safeUsed = Number.isFinite(usedBytes) && usedBytes > 0 ? usedBytes : 0;
  // Guard against a 0/NaN cap so the bar can never render `width: NaN%`.
  const percentage = capBytes > 0 ? Math.min(100, Math.round((safeUsed / capBytes) * 100)) : 0;

  // Threshold colors: >95% red, >80% amber, normal navy
  const barColor = percentage >= 95 ? 'bg-[#C8102E]' : percentage >= 80 ? 'bg-[#B8860B]' : 'bg-[#014BAA]';

  return (
    <div className="flex flex-col gap-1 min-w-[150px] sm:min-w-[180px] bg-white/90 px-3.5 py-2 rounded-xl border border-[#E5DCD4]/90 shadow-sm">
      <div className="flex items-center justify-between text-[12px] font-mono">
        <span className="text-[#6B6B6B] flex items-center gap-1.5 font-sans font-medium text-[11px] uppercase tracking-wider">
          <HardDrive className="w-3.5 h-3.5 text-[#014BAA]" />
          Storage
        </span>
        <span className="text-[#1A1A1A] font-medium">
          {formatBytes(safeUsed)} <span className="text-[#9B9B9B]">/ {totalCapMb}MB</span>
        </span>
      </div>

      <div
        className="w-full bg-[#E5DCD4]/60 h-1.5 rounded-full overflow-hidden"
        role="progressbar"
        aria-valuenow={safeUsed}
        aria-valuemin={0}
        aria-valuemax={capBytes > 0 ? capBytes : 1}
        aria-label={`Vault storage: ${formatBytes(safeUsed)} of ${totalCapMb} MB used`}
      >
        <div
          className={`h-full rounded-full transition-all duration-300 ease-out ${barColor}`}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}
