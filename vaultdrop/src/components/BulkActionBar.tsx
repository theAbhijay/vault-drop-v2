'use client';

import { Download, Trash2, X, Archive } from 'lucide-react';
import { VaultFile } from '@/lib/types';
import { formatBytes } from '@/lib/file-helpers';

interface BulkActionBarProps {
  selectedFiles: VaultFile[];
  onDownloadAll: () => void;
  onDeleteAll: () => void;
  onClearSelection: () => void;
  isDownloading?: boolean;
}

export function BulkActionBar({
  selectedFiles,
  onDownloadAll,
  onDeleteAll,
  onClearSelection,
  isDownloading,
}: BulkActionBarProps) {
  if (selectedFiles.length === 0) return null;

  const totalSize = selectedFiles.reduce((acc, f) => acc + f.size, 0);

  return (
    <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-40 w-full max-w-md px-4 animate-in slide-in-from-bottom-8 duration-200">
      <div className="bg-[#1A1A1A] text-white px-5 py-3.5 rounded-2xl shadow-apple-lg border border-white/10 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            onClick={onClearSelection}
            className="p-1 rounded-lg hover:bg-white/10 text-[#9B9B9B] hover:text-white transition-colors tap-spring cursor-pointer"
            title="Deselect All"
          >
            <X className="w-4 h-4" />
          </button>
          <div>
            <div className="text-[13px] font-semibold text-white flex items-center gap-1.5">
              <span>{selectedFiles.length} file{selectedFiles.length > 1 ? 's' : ''} selected</span>
            </div>
            <div className="text-[11px] text-[#9B9B9B] font-mono">
              Total: {formatBytes(totalSize)}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={onDownloadAll}
            disabled={isDownloading}
            className="px-4 py-2.5 bg-[#014BAA] hover:bg-[#013A85] text-white text-[13px] font-semibold rounded-xl transition-all tap-spring cursor-pointer flex items-center gap-2 shadow-sm"
          >
            {isDownloading ? (
              <Archive className="w-4 h-4 animate-spin" />
            ) : (
              <Download className="w-4 h-4" />
            )}
            <span>Zip Download</span>
          </button>

          <button
            onClick={onDeleteAll}
            className="p-2.5 bg-red-500/20 hover:bg-red-500/30 text-red-400 hover:text-red-300 rounded-xl transition-colors tap-spring cursor-pointer"
            title="Delete Selected"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
