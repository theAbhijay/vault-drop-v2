'use client';

import { useState, useRef, useCallback } from 'react';
import { UploadCloud, FileUp, AlertTriangle } from 'lucide-react';

interface DropZoneProps {
  onFileUpload: (file: File) => Promise<void>;
  disabled?: boolean;
}

export function DropZone({ onFileUpload, disabled }: DropZoneProps) {
  const [isDragOver, setIsDragOver] = useState<boolean>(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFiles = useCallback(
    async (files: FileList | null) => {
      if (!files || files.length === 0) return;
      setUploadError(null);
      setIsUploading(true);

      try {
        for (let i = 0; i < files.length; i++) {
          const file = files[i];
          if (file.size > 20 * 1024 * 1024) {
            setUploadError(`"${file.name}" exceeds the 20 MB size limit.`);
            continue;
          }
          await onFileUpload(file);
        }
      } catch (err: unknown) {
        if (err instanceof Error) {
          setUploadError(err.message);
        } else {
          setUploadError('Failed to upload file.');
        }
      } finally {
        setIsUploading(false);
      }
    },
    [onFileUpload]
  );

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!disabled) setIsDragOver(true);
  };

  const onDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    if (!disabled && e.dataTransfer.files) {
      handleFiles(e.dataTransfer.files);
    }
  };

  return (
    <div className="w-full">
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />

      <div
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        onClick={() => !disabled && fileInputRef.current?.click()}
        className={`relative w-full rounded-3xl border-2 border-dashed p-6 sm:p-10 transition-all duration-200 cursor-pointer flex flex-col items-center justify-center text-center ${
          isDragOver
            ? 'border-[#014BAA] bg-[#014BAA]/5 scale-[1.01]'
            : 'border-[#E5DCD4] bg-white hover:border-[#014BAA]/50 hover:bg-[#F8F3F0]/40'
        } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
      >
        <div className="w-16 h-16 rounded-2xl bg-[#014BAA]/5 text-[#014BAA] flex items-center justify-center mb-4 transition-transform duration-200 group-hover:scale-105">
          {isUploading ? (
            <UploadCloud className="w-8 h-8 animate-bounce" />
          ) : (
            <FileUp className="w-8 h-8" />
          )}
        </div>

        <h3 className="text-[17px] sm:text-[18px] font-bold text-[#1A1A1A] tracking-tight">
          {isUploading
            ? 'Staging file into private vault...'
            : isDragOver
            ? 'Drop to upload immediately'
            : 'Drop files to stage in ephemeral vault'}
        </h3>

        <p className="text-[13px] text-[#6B6B6B] mt-1 max-w-sm">
          or click to browse from this workstation • Max 20 MB per file
        </p>

        <div className="flex items-center gap-2 mt-4 text-[12px] text-[#9B9B9B] font-mono">
          <span>PDF</span>
          <span>•</span>
          <span>Images</span>
          <span>•</span>
          <span>Code</span>
          <span>•</span>
          <span>Docs</span>
          <span>•</span>
          <span>Archive</span>
        </div>
      </div>

      {uploadError && (
        <div className="mt-3 p-3.5 bg-red-50 border border-red-200 rounded-2xl flex items-center gap-2.5 text-[13px] text-[#C8102E]">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          <span>{uploadError}</span>
        </div>
      )}
    </div>
  );
}
