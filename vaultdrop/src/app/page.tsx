'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { 
  Shield, 
  LogOut, 
  Search, 
  ArrowUpDown, 
  PackageOpen, 
  Clock, 
  Sparkles,
  CheckSquare,
  Square
} from 'lucide-react';
import { OpenSourceLink } from '@/components/OpenSourceLink';

import { getCurrentUser, logoutUser } from '@/lib/auth-helpers';
import { getUserFiles, uploadVaultFile, deleteVaultFile, downloadFilesAsZip } from '@/lib/file-helpers';
import { VaultFile, UserProfile } from '@/lib/types';
import { useSessionTimer } from '@/hooks/useSessionTimer';

import { StorageMeter } from '@/components/StorageMeter';
import { DropZone } from '@/components/DropZone';
import { FileRow } from '@/components/FileRow';
import { FilePreviewModal } from '@/components/FilePreviewModal';
import { BulkActionBar } from '@/components/BulkActionBar';
import { PanicButton } from '@/components/PanicButton';
import { IdleWarningBanner } from '@/components/IdleWarningBanner';
import { AppleColorText } from '@/components/AppleColorText';

export default function DashboardPage() {
  const router = useRouter();

  const [user, setUser] = useState<UserProfile | null>(null);
  const [files, setFiles] = useState<VaultFile[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  // Filters & Search
  const [activeFilter, setActiveFilter] = useState<VaultFile['category'] | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [sortBy, setSortBy] = useState<'soonest' | 'newest' | 'size'>('soonest');

  // Selection & Modal
  const [selectedFileIds, setSelectedFileIds] = useState<Set<string>>(new Set());
  const [previewFile, setPreviewFile] = useState<VaultFile | null>(null);
  const [isZipping, setIsZipping] = useState<boolean>(false);

  // Auth Guard
  useEffect(() => {
    const current = getCurrentUser();
    if (!current) {
      router.push('/login');
    } else {
      setUser(current);
      loadFiles(current.id);
    }
  }, [router]);

  const loadFiles = async (userId: string) => {
    try {
      const list = await getUserFiles(userId);
      setFiles(list);
    } catch (err) {
      console.error('Failed to load files', err);
    } finally {
      setLoading(false);
    }
  };

  // 30-Minute Expanded Session Timer
  const handleTimeout = useCallback(async () => {
    await logoutUser();
    router.push('/login?reason=timeout');
  }, [router]);

  const { secondsRemaining, isWarning, extendSession } = useSessionTimer({
    onTimeout: handleTimeout,
    enabled: Boolean(user),
  });

  // Panic Wipe: Instant 0ms screen wipe
  const handlePanicWipe = useCallback(async () => {
    await logoutUser();
    router.push('/login?reason=panic');
  }, [router]);

  const handleManualLogout = async () => {
    await logoutUser();
    router.push('/login');
  };

  // Upload Handler
  const handleUpload = async (file: File) => {
    if (!user) return;
    const res = await uploadVaultFile(user.id, file);
    if (res.success && res.file) {
      setFiles((prev) => [res.file!, ...prev]);
    } else if (res.error) {
      throw new Error(res.error);
    }
  };

  // Delete Handler
  const handleDelete = async (fileId: string) => {
    if (!user) return;
    const ok = await deleteVaultFile(user.id, fileId);
    if (ok) {
      setFiles((prev) => prev.filter((f) => f.id !== fileId));
      setSelectedFileIds((prev) => {
        const next = new Set(prev);
        next.delete(fileId);
        return next;
      });
    }
  };

  // Download Single File
  const handleDownload = (file: VaultFile) => {
    if (file.url) {
      const a = document.createElement('a');
      a.href = file.url;
      a.download = file.name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } else if (file.content) {
      const blob = new Blob([file.content], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = file.name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
  };

  // Bulk Multi-Select Handlers
  const handleToggleSelect = (fileId: string) => {
    setSelectedFileIds((prev) => {
      const next = new Set(prev);
      if (next.has(fileId)) {
        next.delete(fileId);
      } else {
        next.add(fileId);
      }
      return next;
    });
  };

  const handleSelectAll = () => {
    if (selectedFileIds.size === filteredFiles.length) {
      setSelectedFileIds(new Set());
    } else {
      setSelectedFileIds(new Set(filteredFiles.map((f) => f.id)));
    }
  };

  const handleBulkDownload = async () => {
    const selected = files.filter((f) => selectedFileIds.has(f.id));
    if (selected.length === 0) return;
    setIsZipping(true);
    try {
      await downloadFilesAsZip(selected, `vaultdrop_${user?.username || 'archive'}.zip`);
    } catch (err) {
      console.error('Failed to create zip bundle', err);
    } finally {
      setIsZipping(false);
    }
  };

  const handleBulkDelete = async () => {
    if (!user) return;
    for (const fileId of Array.from(selectedFileIds)) {
      await deleteVaultFile(user.id, fileId);
    }
    setFiles((prev) => prev.filter((f) => !selectedFileIds.has(f.id)));
    setSelectedFileIds(new Set());
  };

  // Total Storage Calculation
  const totalUsedBytes = useMemo(() => {
    return files.reduce((acc, f) => acc + f.size, 0);
  }, [files]);

  // Filtered & Sorted Files
  const filteredFiles = useMemo(() => {
    return files
      .filter((f) => {
        if (activeFilter !== 'all' && f.category !== activeFilter) return false;
        if (searchQuery.trim() && !f.name.toLowerCase().includes(searchQuery.toLowerCase())) {
          return false;
        }
        return true;
      })
      .sort((a, b) => {
        if (sortBy === 'soonest') {
          return new Date(a.expiresAt).getTime() - new Date(b.expiresAt).getTime();
        }
        if (sortBy === 'newest') {
          return new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime();
        }
        if (sortBy === 'size') {
          return b.size - a.size;
        }
        return 0;
      });
  }, [files, activeFilter, searchQuery, sortBy]);

  // Category counts for filter chips
  const counts = useMemo(() => {
    const map = { all: files.length, image: 0, pdf: 0, doc: 0, code: 0, archive: 0, other: 0 };
    files.forEach((f) => {
      map[f.category] = (map[f.category] || 0) + 1;
    });
    return map;
  }, [files]);

  if (loading || !user) {
    return (
      <div className="min-h-screen bg-[#F8F3F0] flex items-center justify-center">
        <p className="text-[13px] text-[#6B6B6B] font-mono animate-pulse">Initializing encrypted vault...</p>
      </div>
    );
  }

  // Format session time
  const timerMin = Math.floor(secondsRemaining / 60);
  const timerSec = secondsRemaining % 60;
  const sessionTimeString = `${timerMin.toString().padStart(2, '0')}:${timerSec.toString().padStart(2, '0')}`;

  return (
    <div className="min-h-screen bg-[#F8F3F0] flex flex-col justify-between selection:bg-[#014BAA] selection:text-white">
      {/* 1. Frosted Glass Top Navigation Bar */}
      <header className="sticky top-0 z-40 glass-surface border-b border-[#E5DCD4]/80 px-4 md:px-8 py-3.5 transition-all">
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-4">
          {/* Logo & Workstation Pill */}
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-2xl bg-[#014BAA] flex items-center justify-center text-white shadow-apple">
              <Shield className="w-5 h-5 fill-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[17px] font-bold text-[#014BAA] tracking-tight">
                  Vault<AppleColorText text="Drop" mode="chars" />
                </span>
                <span className="hidden sm:inline-block text-[12px] font-semibold bg-[#014BAA]/10 text-[#014BAA] px-2.5 py-0.5 rounded-full font-mono">
                  @{user.username}
                </span>
              </div>
              <span className="text-[11px] text-[#6B6B6B] block font-mono">
                Private Ephemeral Vault • <AppleColorText text="Air-Gap Shield" className="text-[11px]" mode="chars" />
              </span>
            </div>
          </div>

          {/* Center / Right: Telemetry & Controls */}
          <div className="flex items-center gap-3">
            {/* Storage Meter */}
            <StorageMeter usedBytes={totalUsedBytes} totalCapMb={user.storageCapMb} />

            {/* Session TTL Countdown (Expanded 30m) */}
            <div 
              title="30-minute session lifetime"
              className="hidden md:flex items-center gap-1.5 px-3.5 py-2 bg-white/90 rounded-xl border border-[#E5DCD4]/90 text-[12px] font-mono text-[#1A1A1A] shadow-sm"
            >
              <Clock className="w-4 h-4 text-[#014BAA]" />
              <span>TTL: {sessionTimeString}</span>
            </div>

            {/* Open Source Navbar Link */}
            <OpenSourceLink className="rounded-xl px-3 py-2 text-[12px]" showLabelOnMobile={false} />

            {/* Logout Button */}
            <button
              onClick={handleManualLogout}
              className="p-2 sm:px-3.5 sm:py-2 text-[#6B6B6B] hover:text-[#C8102E] hover:bg-red-50 rounded-xl border border-[#E5DCD4]/70 transition-colors tap-spring cursor-pointer flex items-center gap-1.5 text-[13px] font-semibold"
              title="End Session & Lock Vault"
            >
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:inline">Lock</span>
            </button>
          </div>
        </div>
      </header>

      {/* 2. Main Dashboard Content */}
      <main className="max-w-5xl w-full mx-auto px-4 md:px-8 py-6 space-y-6 flex-1">
        {/* Top Operational Pill Banner */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 p-3.5 bg-white rounded-2xl border border-[#E5DCD4] text-[13px] text-[#6B6B6B] shadow-apple">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
            <span>Zero credentials typed on workstation • <AppleColorText text="Zero Trace Active" className="text-[12px] font-semibold" mode="chars" /></span>
          </div>
          <div className="flex items-center gap-1.5 text-[12px] text-[#014BAA] font-medium font-mono">
            <Sparkles className="w-4 h-4" />
            <span>24h auto-destruction enabled</span>
          </div>
        </div>

        {/* Drag and Drop Zone */}
        <DropZone onFileUpload={handleUpload} />

        {/* Filter Chips & Search Bar */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pt-2">
          {/* Category Filter Chips */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 text-[13px]">
            {[
              { id: 'all', label: 'All', count: counts.all },
              { id: 'image', label: 'Images', count: counts.image },
              { id: 'pdf', label: 'PDF', count: counts.pdf },
              { id: 'doc', label: 'Docs', count: counts.doc },
              { id: 'code', label: 'Code', count: counts.code },
              { id: 'archive', label: 'Archive', count: counts.archive },
            ].map((chip) => (
              <button
                key={chip.id}
                onClick={() => setActiveFilter(chip.id as VaultFile['category'] | 'all')}
                className={`px-3.5 py-2 rounded-xl font-medium transition-all tap-spring flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
                  activeFilter === chip.id
                    ? 'bg-[#014BAA] text-white shadow-sm'
                    : 'bg-white text-[#6B6B6B] border border-[#E5DCD4] hover:text-[#1A1A1A] hover:bg-[#F8F3F0]'
                }`}
              >
                <span>{chip.label}</span>
                <span
                  className={`text-[11px] px-2 py-0.5 rounded-full font-mono ${
                    activeFilter === chip.id ? 'bg-white/20 text-white' : 'bg-black/5 text-[#6B6B6B]'
                  }`}
                >
                  {chip.count}
                </span>
              </button>
            ))}
          </div>

          {/* Search & Sort Controls */}
          <div className="flex items-center gap-2">
            <div className="relative flex-1 sm:w-52">
              <Search className="w-4 h-4 text-[#9B9B9B] absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Search files..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-[13px] bg-white border border-[#E5DCD4] rounded-xl focus:outline-none focus:border-[#014BAA]"
              />
            </div>

            <div className="relative">
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as 'soonest' | 'newest' | 'size')}
                className="appearance-none bg-white border border-[#E5DCD4] text-[13px] font-medium text-[#1A1A1A] pl-8 pr-8 py-2 rounded-xl focus:outline-none focus:border-[#014BAA] cursor-pointer"
              >
                <option value="soonest">Expiring Soonest</option>
                <option value="newest">Recently Uploaded</option>
                <option value="size">Largest Size</option>
              </select>
              <ArrowUpDown className="w-3.5 h-3.5 text-[#9B9B9B] absolute left-2.5 top-3 pointer-events-none" />
            </div>
          </div>
        </div>

        {/* File Inventory Container */}
        <div className="bg-white rounded-3xl border border-[#E5DCD4] shadow-apple overflow-hidden">
          {/* Header Row / Select All Toggle */}
          {filteredFiles.length > 0 && (
            <div className="px-5 py-3 bg-[#F8F3F0]/60 border-b border-[#E5DCD4] flex items-center justify-between text-[13px] text-[#6B6B6B]">
              <button
                onClick={handleSelectAll}
                className="flex items-center gap-2 font-medium hover:text-[#014BAA] transition-colors tap-spring cursor-pointer"
              >
                {selectedFileIds.size === filteredFiles.length ? (
                  <CheckSquare className="w-4.5 h-4.5 text-[#014BAA]" />
                ) : (
                  <Square className="w-4.5 h-4.5 text-[#9B9B9B]" />
                )}
                <span>Select All ({filteredFiles.length})</span>
              </button>

              <span className="font-mono text-[12px] text-[#9B9B9B]">
                24h Ephemeral Lifetime Active
              </span>
            </div>
          )}

          {/* File Rows List */}
          {filteredFiles.length > 0 ? (
            <div>
              {filteredFiles.map((file) => (
                <FileRow
                  key={file.id}
                  file={file}
                  isSelected={selectedFileIds.has(file.id)}
                  onToggleSelect={handleToggleSelect}
                  onPreview={setPreviewFile}
                  onDownload={handleDownload}
                  onDelete={handleDelete}
                />
              ))}
            </div>
          ) : (
            /* Empty State with Clear CTA */
            <div className="p-12 text-center space-y-3.5">
              <div className="w-18 h-18 bg-[#F8F3F0] rounded-2xl flex items-center justify-center mx-auto text-[#014BAA]">
                <PackageOpen className="w-9 h-9" />
              </div>
              <h3 className="text-[18px] font-bold text-[#1A1A1A]">Your vault is empty</h3>
              <p className="text-[13px] text-[#6B6B6B] max-w-sm mx-auto">
                Drag files anywhere onto this window, or scan the QR code with your phone to transfer documents to this workstation.
              </p>
            </div>
          )}
        </div>
      </main>

      {/* 3. Footer */}
      <footer className="max-w-5xl w-full mx-auto px-4 md:px-8 py-4.5 text-center text-[12px] text-[#9B9B9B] border-t border-[#E5DCD4]/50">
        VaultDrop Cryptographic Engine • In-Memory Cache • Auto-purges when session expires or browser closes
      </footer>

      {/* 4. Modals & Action Overlays */}
      <FilePreviewModal
        file={previewFile}
        onClose={() => setPreviewFile(null)}
        onDownload={handleDownload}
      />

      <BulkActionBar
        selectedFiles={files.filter((f) => selectedFileIds.has(f.id))}
        onDownloadAll={handleBulkDownload}
        onDeleteAll={handleBulkDelete}
        onClearSelection={() => setSelectedFileIds(new Set())}
        isDownloading={isZipping}
      />

      {/* 5. Inactivity Warning Banner (Final 2 minutes) */}
      {isWarning && (
        <IdleWarningBanner
          secondsRemaining={secondsRemaining}
          onExtend={extendSession}
          onLogout={handleManualLogout}
        />
      )}

      {/* 6. Floating Panic Wipe Button */}
      <PanicButton onPanic={handlePanicWipe} />
    </div>
  );
}
