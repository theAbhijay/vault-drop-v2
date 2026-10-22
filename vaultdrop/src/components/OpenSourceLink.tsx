'use client';

import React from 'react';
import { ExternalLink } from 'lucide-react';

interface OpenSourceLinkProps {
  className?: string;
  showLabelOnMobile?: boolean;
}

export function OpenSourceLink({ 
  className = '', 
  showLabelOnMobile = true 
}: OpenSourceLinkProps) {
  return (
    <a
      href="https://github.com/theAbhijayChauhan/vault-drop"
      target="_blank"
      rel="noopener noreferrer"
      className={`group inline-flex items-center gap-1.5 px-3 py-1.5 sm:px-3.5 sm:py-1.5 rounded-full bg-white hover:bg-[#F8F3F0] text-[#1A1A1A] hover:text-[#014BAA] border border-[#E5DCD4] text-[13px] font-medium shadow-sm transition-all duration-200 tap-spring cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#014BAA]/20 ${className}`}
      title="Open Source Vaultdrop by Abhijay Chauhan on GitHub"
      aria-label="Open Source Vaultdrop by Abhijay Chauhan on GitHub"
    >
      <svg
        className="w-3.5 h-3.5 flex-shrink-0 fill-current text-[#1A1A1A] group-hover:text-[#014BAA] transition-colors"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <path
          fillRule="evenodd"
          d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
          clipRule="evenodd"
        />
      </svg>
      <span className={showLabelOnMobile ? 'inline' : 'hidden sm:inline'}>
        Open Source
      </span>
      <ExternalLink className="w-3 h-3 text-[#9B9B9B] group-hover:text-[#014BAA] opacity-70 group-hover:opacity-100 transition-opacity flex-shrink-0" />
    </a>
  );
}
