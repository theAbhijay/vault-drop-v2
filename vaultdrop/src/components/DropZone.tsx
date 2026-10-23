'use client';

import { useState, useRef, useCallback } from 'react';
import { UploadCloud, FileUp, AlertTriangle, CheckCircle2 } from 'lucide-react';

interface DropZoneProps {
  onFileUpload: (file: File, onProgress?: (percent: number) => void) => Promise<void>;
  disabled?: boolean;
}

export function DropZone({ onFileUpload, disabled }: DropZoneProps) {
  const [isDragOver, setIsDragOver] = useState<boolean>(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [currentFileName, setCurrentFileName] = useState<string>('');
  const [uploadComplete, setUploadComplete] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFiles = useCallback(
    async (files: FileList | null) => {
      if (!files || files.length === 0) return;
      setUploadError(null);
      setIsUploading(true);
      setUploadComplete(false);

      try {
        for (let i = 0; i < files.length; i++) {
          const file = files[i];
          if (file.size > 20 * 1024 * 1024) {
            setUploadError(`"${file.name}" exceeds the 20 MB size limit.`);
            continue;
          }

          setCurrentFileName(file.name);
          setUploadProgress(10);

          await onFileUpload(file, (percent) => {
            setUploadProgress(percent);
          });

          setUploadProgress(100);
        }

        setUploadComplete(true);
        setTimeout(() => {
          setUploadComplete(false);
          setUploadProgress(0);
          setCurrentFileName('');
        }, 2200);
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
    if (!disabled && !isUploading) setIsDragOver(true);
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
    if (!disabled && !isUploading && e.dataTransfer.files) {
      handleFiles(e.dataTransfer.files);
    }
  };

  return (
    <div className="w-full">
      <input
        ref={fileInputRef}
        type="file"
        multiple
        disabled={disabled || isUploading}
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />

      <div
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        onClick={() => !disabled && !isUploading && fileInputRef.current?.click()}
        className={`relative w-full rounded-3xl border-2 border-dashed p-4 sm:p-8 transition-all duration-200 text-center flex flex-col items-center justify-center ${
          isUploading
            ? 'border-[#014BAA] bg-[#014BAA]/5 cursor-default'
            : isDragOver
            ? 'border-[#014BAA] bg-[#014BAA]/5 scale-[1.01] cursor-pointer'
            : 'border-[#E5DCD4] bg-white hover:border-[#014BAA]/50 hover:bg-[#F8F3F0]/40 cursor-pointer'
        } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
      >
        {isUploading ? (
          /* Live Apple Chromatic Upload Progress View */
          <div className="w-full max-w-md mx-auto py-2 flex flex-col items-center">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-[#0071E3] to-[#AF52DE] text-white flex items-center justify-center mb-3 shadow-md">
              <UploadCloud className="w-7 h-7 animate-bounce" />
            </div>

            <h3 className="text-[16px] sm:text-[17px] font-bold text-[#1A1A1A] tracking-tight">
              Uploading Payload into Vault
            </h3>
            
            <p className="text-[12px] font-mono text-[#6B6B6B] mt-0.5 truncate max-w-xs sm:max-w-sm">
              {currentFileName || 'Processing payload...'}
            </p>

            {/* Apple Chromatic Progress Bar */}
            <div className="w-full mt-4 space-y-1.5">
              <div className="flex items-center justify-between text-[11px] font-mono">
                <span className="text-[#6B6B6B] font-medium">Staging & Encrypting</span>
                <span className="font-bold text-[#014BAA]">{Math.round(uploadProgress)}%</span>
              </div>
              
              <div className="w-full h-3 bg-[#E5DCD4]/70 rounded-full overflow-hidden p-0.5 shadow-inner">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-[#0071E3] via-[#AF52DE] to-[#FF9500] transition-all duration-300 ease-out shadow-xs"
                  style={{ width: `${Math.max(6, Math.min(100, uploadProgress))}%` }}
                />
              </div>
            </div>

            <span className="text-[11px] text-[#9B9B9B] mt-2 font-mono">
              Zero keyboard strokes • 24-hour auto-destruction
            </span>
          </div>
        ) : uploadComplete ? (
          /* Upload Success Confirmation */
          <div className="py-3 flex flex-col items-center animate-in zoom-in-95 duration-200">
            <div className="w-12 h-12 rounded-2xl bg-emerald-500 text-white flex items-center justify-center mb-2 shadow-sm">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <h3 className="text-[16px] font-bold text-[#1A1A1A]">
              Payload Successfully Encrypted & Saved
            </h3>
            <p className="text-[12px] text-emerald-600 font-mono mt-0.5">
              Synced across all paired devices
            </p>
          </div>
        ) : (
          /* Standard Idle Drop View */
          <>
            <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-xl sm:rounded-2xl bg-[#014BAA]/5 text-[#014BAA] flex items-center justify-center mb-3 sm:mb-4 transition-transform duration-200 group-hover:scale-105">
              <FileUp className="w-6 h-6 sm:w-8 sm:h-8" />
            </div>

            <h3 className="text-[15px] sm:text-[18px] font-bold text-[#1A1A1A] tracking-tight">
              {isDragOver ? 'Drop to upload immediately' : 'Drop files to stage in vault'}
            </h3>

            <p className="text-[12px] sm:text-[13px] text-[#6B6B6B] mt-1 max-w-sm">
              or tap to browse from this device • Max 20 MB
            </p>

            <div className="flex items-center justify-center flex-wrap gap-1.5 sm:gap-2 mt-3 sm:mt-4 text-[10px] sm:text-[12px] text-[#9B9B9B] font-mono">
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
          </>
        )}
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
