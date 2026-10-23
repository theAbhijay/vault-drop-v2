'use client';

import React, { useRef } from 'react';
import { Camera, UploadCloud, QrCode, LogOut } from 'lucide-react';
import Link from 'next/link';

interface MobileBottomBarProps {
  onFileUpload: (file: File) => Promise<void> | void;
  onLock: () => void;
  isUploading?: boolean;
}

export function MobileBottomBar({ onFileUpload, onLock, isUploading = false }: MobileBottomBarProps) {
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleCameraChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      onFileUpload(e.target.files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      Array.from(e.target.files).forEach((file) => onFileUpload(file));
    }
  };

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 p-3 bg-white/90 backdrop-blur-md border-t border-[#E5DCD4] shadow-apple-lg sm:hidden">
      {/* Hidden native camera trigger */}
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleCameraChange}
      />

      {/* Hidden file selector */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={handleFileChange}
      />

      <div className="max-w-md mx-auto grid grid-cols-4 gap-2">
        {/* 1. Camera Snap (Mobile Exclusive) */}
        <button
          type="button"
          onClick={() => cameraInputRef.current?.click()}
          disabled={isUploading}
          className="flex flex-col items-center justify-center py-2 px-1 text-[#014BAA] hover:bg-[#F8F3F0] rounded-2xl transition-all tap-spring cursor-pointer"
        >
          <div className="w-10 h-10 rounded-full bg-[#014BAA]/10 flex items-center justify-center mb-1">
            <Camera className="w-5 h-5 text-[#014BAA]" />
          </div>
          <span className="text-[11px] font-semibold text-[#1A1A1A]">Camera</span>
        </button>

        {/* 2. Upload Files */}
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={isUploading}
          className="flex flex-col items-center justify-center py-2 px-1 text-[#014BAA] hover:bg-[#F8F3F0] rounded-2xl transition-all tap-spring cursor-pointer"
        >
          <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-[#0071E3] to-[#AF52DE] flex items-center justify-center mb-1 text-white shadow-xs">
            <UploadCloud className="w-5 h-5 text-white" />
          </div>
          <span className="text-[11px] font-semibold text-[#1A1A1A]">Add Files</span>
        </button>

        {/* 3. Pair Lab PC */}
        <Link
          href="/pair"
          className="flex flex-col items-center justify-center py-2 px-1 text-[#6B6B6B] hover:text-[#014BAA] hover:bg-[#F8F3F0] rounded-2xl transition-all tap-spring"
        >
          <div className="w-10 h-10 rounded-full bg-[#F8F3F0] border border-[#E5DCD4] flex items-center justify-center mb-1">
            <QrCode className="w-5 h-5 text-[#014BAA]" />
          </div>
          <span className="text-[11px] font-semibold text-[#1A1A1A]">Pair PC</span>
        </Link>

        {/* 4. Lock Vault */}
        <button
          type="button"
          onClick={onLock}
          className="flex flex-col items-center justify-center py-2 px-1 text-[#6B6B6B] hover:text-[#C8102E] hover:bg-red-50 rounded-2xl transition-all tap-spring cursor-pointer"
        >
          <div className="w-10 h-10 rounded-full bg-[#F8F3F0] border border-[#E5DCD4] flex items-center justify-center mb-1">
            <LogOut className="w-5 h-5 text-[#6B6B6B]" />
          </div>
          <span className="text-[11px] font-semibold text-[#1A1A1A]">Lock</span>
        </button>
      </div>
    </div>
  );
}
