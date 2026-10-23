'use client';

import React from 'react';

export function Footer() {
  return (
    <footer className="max-w-5xl w-full mx-auto px-4 md:px-8 py-6 text-center border-t border-[#E5DCD4]/60 space-y-1.5">
      <p className="text-[12px] sm:text-[13px] text-[#6B6B6B]">
        Crafted with <span className="text-[#C8102E]">❤️</span> and an absurd amount of cold coffee by{' '}
        <a
          href="https://github.com/theAbhijayChauhan"
          target="_blank"
          rel="noopener noreferrer"
          className="font-semibold text-[#014BAA] hover:underline"
        >
          Abhijay Chauhan
        </a>
        .
      </p>
      <p className="text-[11px] sm:text-[12px] text-[#9B9B9B] font-mono">
        © 2026 VaultDrop • All Rights Reserved • Built for Security, Engineered for Privacy
      </p>
    </footer>
  );
}
