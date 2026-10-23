'use client';

import React from 'react';
import {
  FileText,
  Image as ImageIcon,
  FileCode,
  FileArchive,
  File as GenericFileIcon,
  Download,
  Trash2,
  Eye,
  Clock,
} from 'lucide-react';
import { VaultFile } from '@/lib/types';
import { formatBytes } from '@/lib/file-helpers';
import { useExpiryLabel } from '@/hooks/useExpiryLabel';

interface MobileFileCardProps {
  file: VaultFile;
  isSelected: boolean;
  onToggleSelect: (fileId: string) => void;
  onPreview: (file: VaultFile) => void;
  onDownload: (file: VaultFile) => void;
  onDelete: (fileId: string) => void;
}

export function MobileFileCard({
  file,
  isSelected,
  onToggleSelect,
  onPreview,
  onDownload,
  onDelete,
}: MobileFileCardProps) {
  const expiry = useExpiryLabel(file.expiresAt);

  const getIcon = () => {
    switch (file.category) {
      case 'image':
        return <ImageIcon className="w-5 h-5 text-indigo-600" />;
      case 'pdf':
        return <FileText className="w-5 h-5 text-[#C8102E]" />;
      case 'code':
        return <FileCode className="w-5 h-5 text-emerald-600" />;
      case 'archive':
        return <FileArchive className="w-5 h-5 text-amber-600" />;
      default:
        return <GenericFileIcon className="w-5 h-5 text-[#014BAA]" />;
    }
  };

  return (
    <div
      className={`p-4 bg-white rounded-2xl border transition-all ${
        isSelected
          ? 'border-[#014BAA] bg-[#014BAA]/5 shadow-sm'
          : 'border-[#E5DCD4] shadow-xs'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        {/* Left: Icon & File Info */}
        <div
          role="button"
          tabIndex={0}
          onClick={() => onPreview(file)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onPreview(file);
            }
          }}
          aria-label={`Preview ${file.name}`}
          className="flex items-start gap-3 flex-1 min-w-0 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0071E3] rounded-xl"
        >
          <div className="w-10 h-10 rounded-xl bg-[#F8F3F0] flex items-center justify-center flex-shrink-0 mt-0.5">
            {getIcon()}
          </div>
          <div className="min-w-0 flex-1">
            <h4 className="text-[14px] font-semibold text-[#1A1A1A] truncate tracking-tight">
              {file.name}
            </h4>
            <div className="flex items-center gap-2 mt-1 text-[11px] text-[#6B6B6B]">
              <span className="font-mono">{formatBytes(file.size)}</span>
              <span>•</span>
              <span
                className={`flex items-center gap-1 font-mono ${
                  expiry.isUrgent ? 'text-[#C8102E] font-bold' : ''
                }`}
              >
                <Clock className="w-3 h-3" />
                {expiry.label}
              </span>
            </div>
          </div>
        </div>

        {/* Right: Select Checkbox */}
        <input
          type="checkbox"
          checked={isSelected}
          onChange={() => onToggleSelect(file.id)}
          className="w-5 h-5 rounded-md border-[#E5DCD4] text-[#014BAA] focus:ring-[#014BAA] cursor-pointer mt-1"
          aria-label={`Select ${file.name}`}
        />
      </div>

      {/* Action Row */}
      <div className="flex items-center justify-end gap-2 mt-3 pt-3 border-t border-[#E5DCD4]/60">
        <button
          type="button"
          onClick={() => onPreview(file)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#F8F3F0] hover:bg-[#E5DCD4] text-[#1A1A1A] text-[12px] font-medium transition-all tap-spring cursor-pointer"
        >
          <Eye className="w-3.5 h-3.5 text-[#014BAA]" />
          <span>Preview</span>
        </button>

        <button
          type="button"
          onClick={() => onDownload(file)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#014BAA]/10 hover:bg-[#014BAA]/20 text-[#014BAA] text-[12px] font-medium transition-all tap-spring cursor-pointer"
        >
          <Download className="w-3.5 h-3.5" />
          <span>Download</span>
        </button>

        <button
          type="button"
          onClick={() => onDelete(file.id)}
          className="p-1.5 rounded-xl text-[#6B6B6B] hover:text-[#C8102E] hover:bg-red-50 transition-all tap-spring cursor-pointer"
          title="Delete file"
          aria-label={`Delete ${file.name}`}
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
