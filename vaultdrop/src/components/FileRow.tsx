'use client';

import { useState, useEffect } from 'react';
import { 
  FileText, 
  Image as ImageIcon, 
  FileCode, 
  FileArchive, 
  File as GenericFileIcon,
  Download, 
  Trash2, 
  Eye, 
  Clock 
} from 'lucide-react';
import { VaultFile } from '@/lib/types';
import { formatBytes, getExpiryLabel } from '@/lib/file-helpers';

interface FileRowProps {
  file: VaultFile;
  isSelected: boolean;
  onToggleSelect: (fileId: string) => void;
  onPreview: (file: VaultFile) => void;
  onDownload: (file: VaultFile) => void;
  onDelete: (fileId: string) => void;
}

export function FileRow({
  file,
  isSelected,
  onToggleSelect,
  onPreview,
  onDownload,
  onDelete,
}: FileRowProps) {
  const [expiry, setExpiry] = useState<{ label: string; isUrgent: boolean }>({
    label: 'Calculating...',
    isUrgent: false,
  });

  useEffect(() => {
    setExpiry(getExpiryLabel(file.expiresAt));
    const timer = setInterval(() => {
      setExpiry(getExpiryLabel(file.expiresAt));
    }, 30000); // Ticker every 30s
    return () => clearInterval(timer);
  }, [file.expiresAt]);

  // Color-coded badge & icon matching spec
  const getBadgeStyle = () => {
    switch (file.category) {
      case 'pdf':
        return {
          bg: 'bg-red-50 text-red-600 border-red-200',
          icon: <FileText className="w-4 h-4 text-red-600" />,
        };
      case 'image':
        return {
          bg: 'bg-emerald-50 text-emerald-600 border-emerald-200',
          icon: <ImageIcon className="w-4 h-4 text-emerald-600" />,
        };
      case 'doc':
        return {
          bg: 'bg-blue-50 text-blue-600 border-blue-200',
          icon: <FileText className="w-4 h-4 text-blue-600" />,
        };
      case 'code':
        return {
          bg: 'bg-purple-50 text-purple-600 border-purple-200',
          icon: <FileCode className="w-4 h-4 text-purple-600" />,
        };
      case 'archive':
        return {
          bg: 'bg-amber-50 text-amber-600 border-amber-200',
          icon: <FileArchive className="w-4 h-4 text-amber-600" />,
        };
      default:
        return {
          bg: 'bg-slate-50 text-slate-600 border-slate-200',
          icon: <GenericFileIcon className="w-4 h-4 text-slate-600" />,
        };
    }
  };

  const badge = getBadgeStyle();

  return (
    <div
      className={`group flex items-center justify-between p-4 sm:p-5 transition-all duration-150 border-b border-[#E5DCD4]/70 ${
        isSelected ? 'bg-[#E6EEF7]/50' : 'hover:bg-[#F8F3F0]/60'
      }`}
    >
      {/* Left: Checkbox & File Info */}
      <div className="flex items-center gap-3.5 min-w-0 flex-1 pr-3">
        <input
          type="checkbox"
          checked={isSelected}
          onChange={() => onToggleSelect(file.id)}
          className="w-4 h-4 rounded text-[#014BAA] focus:ring-0 focus:ring-offset-0 border-[#E5DCD4] cursor-pointer"
        />

        {/* MIME Icon */}
        <div
          className={`w-10 h-10 rounded-xl border flex items-center justify-center flex-shrink-0 ${badge.bg}`}
        >
          {badge.icon}
        </div>

        {/* Filename & Monospace Telemetry */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span
              onClick={() => onPreview(file)}
              className="text-[14px] sm:text-[15px] font-semibold text-[#1A1A1A] truncate cursor-pointer hover:text-[#014BAA] transition-colors"
              title={file.name}
            >
              {file.name}
            </span>
          </div>

          <div className="flex items-center gap-2 text-[12px] text-[#6B6B6B] font-mono mt-0.5">
            <span>{formatBytes(file.size)}</span>
            <span>•</span>
            <span
              className={`flex items-center gap-1 ${
                expiry.isUrgent ? 'text-[#C8102E] font-semibold' : 'text-[#6B6B6B]'
              }`}
            >
              <Clock className="w-3.5 h-3.5" />
              {expiry.label}
            </span>
          </div>
        </div>
      </div>

      {/* Right: Actions */}
      <div className="flex items-center gap-1.5 sm:gap-2.5 flex-shrink-0">
        <button
          onClick={() => onPreview(file)}
          className="p-2 sm:p-2.5 text-[#6B6B6B] hover:text-[#014BAA] hover:bg-[#014BAA]/5 rounded-xl transition-colors tap-spring cursor-pointer"
          title="Quick Preview"
        >
          <Eye className="w-4 h-4" />
        </button>

        <button
          onClick={() => onDownload(file)}
          className="p-2 sm:p-2.5 text-[#6B6B6B] hover:text-[#014BAA] hover:bg-[#014BAA]/5 rounded-xl transition-colors tap-spring cursor-pointer"
          title="Download File"
        >
          <Download className="w-4 h-4" />
        </button>

        <button
          onClick={() => onDelete(file.id)}
          className="p-2 sm:p-2.5 text-[#6B6B6B] hover:text-[#C8102E] hover:bg-red-50 rounded-xl transition-colors tap-spring cursor-pointer"
          title="Delete Immediately"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
