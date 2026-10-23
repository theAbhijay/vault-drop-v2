'use client';

import { useEffect, useRef } from 'react';
import { X, Download, FileText, Code, FileArchive, File as FileIcon, ExternalLink } from 'lucide-react';
import { VaultFile } from '@/lib/types';
import { formatBytes } from '@/lib/file-helpers';

interface FilePreviewModalProps {
  file: VaultFile | null;
  onClose: () => void;
  onDownload: (file: VaultFile) => void;
}

export function FilePreviewModal({ file, onClose, onDownload }: FilePreviewModalProps) {
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const downloadButtonRef = useRef<HTMLButtonElement | null>(null);
  // onClose in a ref: parents pass inline lambdas whose identity changes on
  // every render (the dashboard re-renders each second with the TTL ticker).
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!file) return;

    previousFocusRef.current = document.activeElement as HTMLElement | null;
    document.body.dataset.vaultdropModalOpen = String(
      (Number(document.body.dataset.vaultdropModalOpen) || 0) + 1
    );
    downloadButtonRef.current?.focus?.();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onCloseRef.current();
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);

    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
      const openCount = Number(document.body.dataset.vaultdropModalOpen || 1) - 1;
      if (openCount <= 0) delete document.body.dataset.vaultdropModalOpen;
      else document.body.dataset.vaultdropModalOpen = String(openCount);
      previousFocusRef.current?.focus?.();
    };
  }, [file]);

  if (!file) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Preview of ${file.name}`}
        className="relative w-full max-w-3xl bg-white rounded-3xl border border-[#E5DCD4] shadow-apple-lg overflow-hidden flex flex-col max-h-[85vh] animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4.5 border-b border-[#E5DCD4] flex items-center justify-between bg-[#F8F3F0]/60">
          <div className="flex items-center gap-3 overflow-hidden">
            <span className="text-[13px] uppercase font-bold tracking-wider px-2.5 py-0.5 rounded bg-[#014BAA]/10 text-[#014BAA] font-mono">
              {file.category}
            </span>
            <h3 className="text-[15px] font-semibold text-[#1A1A1A] truncate" title={file.name}>
              {file.name}
            </h3>
            <span className="text-[13px] text-[#6B6B6B] font-mono hidden sm:inline-block">
              ({formatBytes(file.size)})
            </span>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              ref={downloadButtonRef}
              onClick={() => onDownload(file)}
              className="p-2 sm:px-3 sm:py-2 text-[#014BAA] hover:bg-[#014BAA]/10 rounded-xl transition-all tap-spring cursor-pointer flex items-center gap-1.5 text-[13px] font-semibold"
            >
              <Download className="w-4 h-4" />
              <span className="hidden sm:inline">Download</span>
            </button>
            <button
              onClick={onClose}
              aria-label="Close preview"
              className="p-2 text-[#6B6B6B] hover:text-[#1A1A1A] hover:bg-black/5 rounded-xl transition-colors tap-spring cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-auto p-6 bg-white min-h-[300px] flex items-center justify-center">
          {file.category === 'image' && file.url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={file.url}
              alt={file.name}
              className="max-h-[60vh] max-w-full rounded-xl object-contain shadow-apple"
            />
          ) : file.category === 'pdf' && file.url ? (
            <iframe
              src={file.url}
              title={file.name}
              // Sandboxed: user-supplied content can never script the app origin.
              sandbox="allow-same-origin"
              className="w-full h-[60vh] rounded-xl border border-[#E5DCD4]"
            />
          ) : (file.category === 'code' || file.category === 'doc') && file.content ? (
            <pre className="w-full h-full max-h-[60vh] p-4 bg-[#F8F3F0] rounded-xl border border-[#E5DCD4] text-[13px] font-mono text-[#1A1A1A] overflow-auto whitespace-pre-wrap">
              {file.content}
            </pre>
          ) : (
            /* Fallback for Archives & Office docs without inline render */
            <div className="text-center py-12 space-y-4 max-w-sm">
              <div className="w-16 h-16 rounded-2xl bg-[#014BAA]/5 text-[#014BAA] flex items-center justify-center mx-auto">
                {file.category === 'archive' ? (
                  <FileArchive className="w-8 h-8" />
                ) : file.category === 'code' ? (
                  <Code className="w-8 h-8" />
                ) : file.category === 'doc' ? (
                  <FileText className="w-8 h-8" />
                ) : (
                  <FileIcon className="w-8 h-8" />
                )}
              </div>
              <div>
                <h4 className="text-[17px] font-bold text-[#1A1A1A]">{file.name}</h4>
                <p className="text-[13px] text-[#6B6B6B] mt-1 font-mono">
                  {formatBytes(file.size)} • {file.type || 'Binary Archive'}
                </p>
                <p className="text-[13px] text-[#9B9B9B] mt-2">
                  Inline preview is disabled for this format to ensure zero client-bundle bloat in shared labs.
                </p>
              </div>
              <button
                onClick={() => onDownload(file)}
                className="px-6 py-3 bg-[#014BAA] hover:bg-[#013A85] text-white text-[13px] font-semibold rounded-xl shadow-apple transition-all tap-spring cursor-pointer inline-flex items-center gap-2"
              >
                <Download className="w-4 h-4" />
                Download File
              </button>
            </div>
          )}
        </div>

        {/* Footer info */}
        <div className="px-6 py-3.5 bg-[#F8F3F0] border-t border-[#E5DCD4] flex items-center justify-between text-[12px] text-[#6B6B6B]">
          <span className="font-mono">ID: {file.id}</span>
          {file.url && (
            <a
              href={file.url}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-[#014BAA] flex items-center gap-1 font-medium tap-spring"
            >
              Open in new tab <ExternalLink className="w-3.5 h-3.5" />
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
