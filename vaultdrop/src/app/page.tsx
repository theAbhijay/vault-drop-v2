'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
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
  Square,
  Smartphone,
  RefreshCw,
  Camera,
} from 'lucide-react';
import { OpenSourceLink } from '@/components/OpenSourceLink';
import { Footer } from '@/components/Footer';
import { MobileHandoffModal } from '@/components/MobileHandoffModal';
import { CameraQRScannerModal } from '@/components/CameraQRScannerModal';

import { getCurrentUser, logoutUser } from '@/lib/auth-helpers';
import {
  getUserFiles,
  uploadVaultFile,
  deleteVaultFile,
  downloadFilesAsZip,
  downloadVaultFileDirectly,
  getVaultUsage,
} from '@/lib/file-helpers';
import { isValidPairToken } from '@/lib/pair-helpers';
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
import { MobileFileCard } from '@/components/MobileFileCard';
import { PeacockLoader } from '@/components/PeacockLoader';

// The back-navigation sentinel must be pushed exactly ONCE per page load —
// a module-level guard survives React Strict Mode's double effect invocation.
let vaultSentinelPushed = false;

export default function DashboardPage() {
  const router = useRouter();

  // SSR-safe auth gate: starts null/false identically on server and client,
  // then flips after the server-validated check completes (no hydration gap).
  const [user, setUser] = useState<UserProfile | null>(null);
  const [authChecking, setAuthChecking] = useState<boolean>(true);
  const [files, setFiles] = useState<VaultFile[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [usedBytes, setUsedBytes] = useState<number>(0);
  const [notice, setNotice] = useState<{ text: string; kind: 'info' | 'error' } | null>(null);

  // Scene 1: PC Modal showing QR for phone
  const [isHandoffOpen, setIsHandoffOpen] = useState<boolean>(false);

  // Scene 2: Smartphone status
  const [isMobileDevice, setIsMobileDevice] = useState<boolean>(false);
  const [isScannerOpen, setIsScannerOpen] = useState<boolean>(false);

  // Filters & Search
  const [activeFilter, setActiveFilter] = useState<VaultFile['category'] | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [sortBy, setSortBy] = useState<'soonest' | 'newest' | 'size'>('soonest');

  // Selection & Modal
  const [selectedFileIds, setSelectedFileIds] = useState<Set<string>>(new Set());
  const [previewFile, setPreviewFile] = useState<VaultFile | null>(null);
  const [isZipping, setIsZipping] = useState<boolean>(false);

  const showNotice = useCallback((text: string, kind: 'info' | 'error' = 'info') => {
    setNotice({ text, kind });
    setTimeout(() => setNotice(null), 5000);
  }, []);

  const filesRef = useRef<VaultFile[]>([]);
  useEffect(() => {
    filesRef.current = files;
  }, [files]);

  const loadFiles = useCallback(
    async (userId: string, silent = false) => {
      if (!silent) setIsRefreshing(true);
      try {
        // Errors now THROW — a transient network failure keeps the previous
        // list instead of rendering an empty vault.
        const list = await getUserFiles(userId, filesRef.current);
        setFiles(list);

        const usage = await getVaultUsage().catch(() => null);
        if (usage) {
          setUsedBytes(usage.usedBytes);
        } else {
          setUsedBytes(list.reduce((acc, f) => acc + f.size, 0));
        }
      } catch (err) {
        console.error('Failed to load files', err);
        if (!silent) showNotice('Could not reach the vault. Check your connection and retry.', 'error');
      } finally {
        setLoading(false);
        if (!silent) setIsRefreshing(false);
      }
    },
    [showNotice]
  );

  // Robust Device Detection
  useEffect(() => {
    const checkMobile = () => {
      const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : '';
      const isMobileUA = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(userAgent);
      setIsMobileDevice(isMobileUA || (typeof window !== 'undefined' && window.innerWidth < 768));
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Strict Auth Guard — SERVER-VALIDATED (supabase.auth.getUser round-trip).
  useEffect(() => {
    let mounted = true;

    (async () => {
      const current = await getCurrentUser();
      if (!mounted) return;
      setAuthChecking(false);

      if (!current) {
        window.location.replace('/login');
        return;
      }

      setUser(current);

      // Zero-Trust Back/Forward Navigation Guard (single sentinel, once):
      // any Back press from the vault wipes the session immediately.
      if (typeof window !== 'undefined' && !vaultSentinelPushed) {
        vaultSentinelPushed = true;
        window.history.pushState({ inVault: true }, '', window.location.href);

        const handlePopState = async () => {
          setUser(null);
          setFiles([]);
          await logoutUser();
          window.location.replace('/login?reason=back_navigation');
        };

        const handlePageShow = (e: PageTransitionEvent) => {
          if (e.persisted) {
            // BFCache revival: re-validate instead of trusting cached DOM.
            void getCurrentUser().then((recheck) => {
              if (!recheck) window.location.replace('/login');
            });
          }
        };

        window.addEventListener('popstate', handlePopState);
        window.addEventListener('pageshow', handlePageShow);
      }

      loadFiles(current.id);
    })();

    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // In-app manual sync that does NOT reload the browser tab
  const handleManualRefresh = useCallback(async () => {
    if (!user || isRefreshing) return;
    await loadFiles(user.id, false);
  }, [user, isRefreshing, loadFiles]);

  // Real-Time Cross-Device Sync Heartbeat — runs only while visible; every
  // call reuses still-fresh signed URLs, so a poll is usually ONE cheap query.
  useEffect(() => {
    if (!user) return;

    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') {
        loadFiles(user.id, true);
      }
    }, 8000);

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        loadFiles(user.id, true);
      }
    };
    const handleFocus = () => loadFiles(user.id, true);

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleFocus);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
    };
  }, [user, loadFiles]);

  // 30-Minute Expanded Session Timer
  const handleTimeout = useCallback(async () => {
    setUser(null);
    setFiles([]);
    await logoutUser();
    window.location.replace('/login?reason=timeout');
  }, []);

  const { secondsRemaining, isWarning, extendSession } = useSessionTimer({
    onTimeout: handleTimeout,
    enabled: Boolean(user),
  });

  // Panic Wipe: Instant 0ms screen wipe
  const handlePanicWipe = useCallback(async () => {
    setUser(null);
    setFiles([]);
    await logoutUser();
    window.location.replace('/login?reason=panic');
  }, []);

  // Manual Vault Lock
  const handleManualLogout = useCallback(async () => {
    setUser(null);
    setFiles([]);
    await logoutUser();
    window.location.replace('/login?reason=lock');
  }, []);

  // QR Scan Handler for Scene 2 (Phone inside vault authorizes a PC).
  // Accepts ONLY a valid 64-hex server token — anything else is rejected.
  const handleScannedQR = useCallback(
    (scannedText: string) => {
      const clean = scannedText.trim();

      let token: string | null = null;
      let handoff: string | null = null;
      try {
        const url = new URL(clean, typeof window !== 'undefined' ? window.location.origin : undefined);
        token = url.searchParams.get('token');
        handoff = url.searchParams.get('handoff');
      } catch {
        const tokenMatch = clean.match(/[?&]token=([a-zA-Z0-9]+)/);
        if (tokenMatch) token = tokenMatch[1];
        const handoffMatch = clean.match(/[?&]handoff=([a-zA-Z0-9]+)/);
        if (handoffMatch) handoff = handoffMatch[1];
      }

      if (token && isValidPairToken(token)) {
        router.push(`/pair?token=${token}`);
        return;
      }
      if (handoff && isValidPairToken(handoff)) {
        router.push(`/pair?handoff=${handoff}`);
        return;
      }
      if (isValidPairToken(clean)) {
        router.push(`/pair?token=${clean}`);
        return;
      }

      showNotice('This QR code is not a valid VaultDrop pairing code.', 'error');
    },
    [router, showNotice]
  );

  // Upload Handler with Live Progress Bar
  const handleUpload = useCallback(
    async (file: File, onProgress?: (percent: number) => void) => {
      if (!user) return;
      const res = await uploadVaultFile(user.id, file, onProgress);
      if (res.success && res.file) {
        setFiles((prev) => [res.file!, ...prev]);
        setUsedBytes((prev) => prev + res.file!.size);
      } else if (res.error) {
        throw new Error(res.error);
      }
    },
    [user]
  );

  // Delete Handler
  const handleDelete = useCallback(
    async (fileId: string) => {
      if (!user) return;
      const ok = await deleteVaultFile(user.id, fileId);
      if (ok) {
        setFiles((prev) => prev.filter((f) => f.id !== fileId));
        setSelectedFileIds((prev) => {
          const next = new Set(prev);
          next.delete(fileId);
          return next;
        });
      } else {
        showNotice('Could not delete the file — it may have already expired. Syncing…', 'error');
        loadFiles(user.id, true);
      }
    },
    [user, showNotice, loadFiles]
  );

  // Download Single File (Reliable on PC & Mobile)
  const handleDownload = useCallback(
    async (file: VaultFile) => {
      const ok = await downloadVaultFileDirectly(file);
      if (!ok) {
        showNotice(`Could not download "${file.name}". It may have expired — try syncing.`, 'error');
      }
    },
    [showNotice]
  );

  // Bulk Multi-Select Handlers
  const handleToggleSelect = useCallback((fileId: string) => {
    setSelectedFileIds((prev) => {
      const next = new Set(prev);
      if (next.has(fileId)) {
        next.delete(fileId);
      } else {
        next.add(fileId);
      }
      return next;
    });
  }, []);

  const handleBulkDownload = useCallback(async () => {
    const selected = files.filter((f) => selectedFileIds.has(f.id));
    if (selected.length === 0) return;
    setIsZipping(true);
    try {
      const { failed } = await downloadFilesAsZip(selected, `vaultdrop_${user?.username || 'archive'}.zip`);
      if (failed.length > 0) {
        showNotice(`Zip created, but ${failed.length} file(s) could not be fetched (likely expired).`, 'error');
      }
    } catch (err) {
      console.error('Failed to create zip bundle', err);
      showNotice('Could not create the zip bundle. Please try again.', 'error');
    } finally {
      setIsZipping(false);
    }
  }, [files, selectedFileIds, user, showNotice]);

  // Parallel delete with per-file verification — files are removed from the
  // UI ONLY when their deletion actually succeeded.
  const handleBulkDelete = useCallback(async () => {
    if (!user) return;
    const ids = Array.from(selectedFileIds);

    const results = await Promise.allSettled(ids.map((id) => deleteVaultFile(user.id, id)));
    const succeeded = new Set<string>();
    const failedCount = results.filter((r) => r.status !== 'fulfilled' || r.value !== true).length;

    results.forEach((r, i) => {
      if (r.status === 'fulfilled' && r.value === true) succeeded.add(ids[i]);
    });

    if (succeeded.size > 0) {
      setFiles((prev) => prev.filter((f) => !succeeded.has(f.id)));
      setSelectedFileIds((prev) => {
        const next = new Set(prev);
        succeeded.forEach((id) => next.delete(id));
        return next;
      });
    }
    if (failedCount > 0) {
      showNotice(`${failedCount} file(s) could not be deleted — they may have already expired.`, 'error');
    }
  }, [user, selectedFileIds, showNotice]);

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

  const handleSelectAll = useCallback(() => {
    if (selectedFileIds.size === filteredFiles.length) {
      setSelectedFileIds(new Set());
    } else {
      setSelectedFileIds(new Set(filteredFiles.map((f) => f.id)));
    }
  }, [selectedFileIds, filteredFiles]);

  // While the server-validated auth check is running, render the Peacock
  // loader (identical on server and client — zero hydration mismatch).
  if (authChecking || !user) {
    return (
      <div className="min-h-screen bg-[#F8F3F0]">
        <PeacockLoader
          message="Verifying Vault Session..."
          submessage="Validating zero-trust credentials"
        />
      </div>
    );
  }

  // Format session time
  const timerMin = Math.floor(secondsRemaining / 60);
  const timerSec = secondsRemaining % 60;
  const sessionTimeString = `${timerMin.toString().padStart(2, '0')}:${timerSec.toString().padStart(2, '0')}`;

  return (
    <div className="min-h-screen bg-[#F8F3F0] flex flex-col justify-between selection:bg-[#014BAA] selection:text-white overflow-x-hidden">
      {/* 1. Frosted Glass Top Navigation Bar (Decluttered & Responsive) */}
      <header className="sticky top-0 z-40 glass-surface border-b border-[#E5DCD4]/80 px-3 sm:px-6 md:px-8 py-2.5 sm:py-3 transition-all">
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-2">
          {/* Logo & User Badge */}
          <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
            <div className="w-8 h-8 rounded-xl sm:rounded-2xl vd-flow flex items-center justify-center text-white shadow-apple">
              <Shield className="w-4 h-4 sm:w-5 sm:h-5 fill-white" />
            </div>
            <div className="flex items-center gap-1.5 sm:gap-2">
              <span className="text-[16px] sm:text-[17px] font-bold text-[#014BAA] tracking-tight">
                Vault<AppleColorText text="Drop" mode="chars" />
              </span>
              <span className="hidden sm:inline-block text-[11px] sm:text-[12px] font-semibold bg-[#014BAA]/10 text-[#014BAA] px-2 py-0.5 rounded-full font-mono">
                @{user.username}
              </span>
            </div>
          </div>

          {/* Right Controls: Scene-Aware Button, Storage, Lock */}
          <div className="flex items-center gap-1.5 sm:gap-2.5 flex-shrink-0">
            {/* Scene-Aware Action Button */}
            {isMobileDevice ? (
              /* Scene 2: Smartphone user inside vault -> "Log in on PC via QR" (In-Browser Camera Scanner) */
              <button
                type="button"
                onClick={() => setIsScannerOpen(true)}
                className="flex items-center gap-1.5 px-2.5 py-1.5 sm:px-3 sm:py-2 bg-gradient-to-tr from-[#0071E3]/10 to-[#AF52DE]/10 hover:from-[#0071E3]/20 hover:to-[#AF52DE]/20 text-[#014BAA] border border-[#0071E3]/30 rounded-xl text-[11px] sm:text-[12px] font-semibold transition-all tap-spring cursor-pointer shadow-xs whitespace-nowrap"
                title="Scan PC monitor QR to authorize session"
              >
                <Camera className="w-3.5 h-3.5 text-[#014BAA] flex-shrink-0" />
                <span>Log in on PC via QR</span>
              </button>
            ) : (
              /* Scene 1: PC user inside vault -> "Open on Phone via QR" */
              <button
                onClick={() => setIsHandoffOpen(true)}
                className="flex items-center gap-1.5 px-2.5 py-1.5 sm:px-3 sm:py-2 bg-gradient-to-tr from-[#0071E3]/10 to-[#AF52DE]/10 hover:from-[#0071E3]/20 hover:to-[#AF52DE]/20 text-[#014BAA] border border-[#0071E3]/30 rounded-xl text-[11px] sm:text-[12px] font-semibold transition-all tap-spring cursor-pointer shadow-xs whitespace-nowrap"
                title="Show QR code on this screen for your smartphone to scan"
              >
                <Smartphone className="w-3.5 h-3.5 text-[#014BAA] flex-shrink-0" />
                <span className="hidden sm:inline">Open on Phone via QR</span>
                <span className="sm:hidden">Phone</span>
              </button>
            )}

            {/* Storage Meter - Visible in header on desktop (moved to body on mobile) */}
            <div className="hidden sm:block">
              <StorageMeter usedBytes={usedBytes} totalCapMb={user.storageCapMb} />
            </div>

            {/* Session TTL Countdown (Desktop only) */}
            <div
              title="30-minute session lifetime"
              className="hidden lg:flex items-center gap-1.5 px-3 py-2 bg-white/90 rounded-xl border border-[#E5DCD4]/90 text-[12px] font-mono text-[#1A1A1A] shadow-xs"
            >
              <Clock className="w-3.5 h-3.5 text-[#014BAA]" />
              <span>TTL: {sessionTimeString}</span>
            </div>

            {/* Open Source Navbar Link (Desktop) */}
            <div className="hidden md:block">
              <OpenSourceLink className="rounded-xl px-2.5 sm:px-3 py-1.5 sm:py-2 text-[12px]" showLabelOnMobile={false} />
            </div>

            {/* Lock / Logout Button */}
            <button
              onClick={handleManualLogout}
              className="p-1.5 sm:px-3 sm:py-2 text-[#6B6B6B] hover:text-[#C8102E] hover:bg-red-50 rounded-xl border border-[#E5DCD4]/70 transition-colors tap-spring cursor-pointer flex items-center gap-1 text-[12px] font-semibold"
              title="End Session & Lock Vault"
            >
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:inline">Lock</span>
            </button>
          </div>
        </div>
      </header>

      {/* 2. Main Dashboard Content */}
      <main className="max-w-5xl w-full mx-auto px-3 sm:px-6 md:px-8 py-4 sm:py-6 space-y-4 sm:space-y-6 flex-1">
        {/* Non-blocking operation notices (replaces alert()) */}
        {notice && (
          <div
            role="status"
            aria-live="polite"
            className={`p-3 rounded-2xl border text-[13px] animate-in fade-in ${
              notice.kind === 'error'
                ? 'bg-red-50 border-red-200 text-[#C8102E]'
                : 'bg-[#E6EEF7] border-[#0071E3]/20 text-[#014BAA]'
            }`}
          >
            {notice.text}
          </div>
        )}

        {/* Mobile-Only Status Card (Declutters header so no text cuts off on small phones) */}
        <div className="sm:hidden p-3 bg-white rounded-2xl border border-[#E5DCD4] shadow-xs space-y-2.5">
          <div className="flex items-center justify-between text-[12px]">
            <span className="font-semibold text-[#014BAA] font-mono bg-[#014BAA]/10 px-2 py-0.5 rounded-full">
              @{user.username}
            </span>
            <div className="flex items-center gap-1 font-mono text-[11px] text-[#6B6B6B]">
              <Clock className="w-3 h-3 text-[#014BAA]" />
              <span>TTL: {sessionTimeString}</span>
            </div>
          </div>
          <StorageMeter usedBytes={usedBytes} totalCapMb={user.storageCapMb} />
        </div>

        {/* Status Banner */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 sm:gap-2 p-3 sm:p-3.5 bg-white rounded-2xl border border-[#E5DCD4] text-[12px] sm:text-[13px] text-[#6B6B6B] shadow-apple">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse flex-shrink-0" />
            <span>
              Zero credentials typed on shared hardware •{' '}
              <AppleColorText text="Zero Trace Active" className="font-semibold" mode="chars" />
            </span>
          </div>
          <div className="flex items-center gap-1.5 text-[11px] sm:text-[12px] text-[#014BAA] font-medium font-mono">
            <Sparkles className="w-3.5 h-3.5 flex-shrink-0" />
            <span>24h file auto-destruction</span>
          </div>
        </div>

        {/* Drag and Drop Zone */}
        <DropZone onFileUpload={handleUpload} />

        {/* Filter Chips & Search Bar */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pt-1">
          {/* Category Filter Chips & In-App Sync */}
          <div className="flex items-center gap-1.5 sm:gap-2 overflow-x-auto pb-1 text-[13px] no-scrollbar">
            <button
              type="button"
              onClick={handleManualRefresh}
              disabled={isRefreshing}
              title="Sync latest files across devices without refreshing the browser tab"
              className="px-3 py-1.5 sm:px-3.5 sm:py-2 rounded-xl text-[12px] sm:text-[13px] font-semibold transition-all tap-spring flex items-center gap-1.5 whitespace-nowrap cursor-pointer bg-white text-[#014BAA] border border-[#014BAA]/30 hover:bg-[#014BAA]/5 shadow-2xs"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-[#014BAA]' : 'text-[#014BAA]'}`} />
              <span>{isRefreshing ? 'Syncing...' : 'Sync Vault'}</span>
            </button>

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
                aria-pressed={activeFilter === chip.id}
                className={`px-3 py-1.5 sm:px-3.5 sm:py-2 rounded-xl text-[12px] sm:text-[13px] font-medium transition-all tap-spring flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
                  activeFilter === chip.id
                    ? 'bg-[#014BAA] text-white shadow-sm'
                    : 'bg-white text-[#6B6B6B] border border-[#E5DCD4] hover:text-[#1A1A1A] hover:bg-[#F8F3F0]'
                }`}
              >
                <span>{chip.label}</span>
                <span
                  className={`text-[10px] sm:text-[11px] px-1.5 py-0.5 rounded-full font-mono ${
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
                aria-label="Search files"
                className="w-full pl-9 pr-3 py-2 text-[12px] sm:text-[13px] bg-white border border-[#E5DCD4] rounded-xl focus:outline-none focus:border-[#014BAA]"
              />
            </div>

            <div className="relative">
              <select
                value={sortBy}
                aria-label="Sort files"
                onChange={(e) => setSortBy(e.target.value as 'soonest' | 'newest' | 'size')}
                className="appearance-none bg-white border border-[#E5DCD4] text-[12px] sm:text-[13px] font-medium text-[#1A1A1A] pl-8 pr-8 py-2 rounded-xl focus:outline-none focus:border-[#014BAA] cursor-pointer"
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
            <div className="px-4 sm:px-5 py-3 bg-[#F8F3F0]/60 border-b border-[#E5DCD4] flex items-center justify-between text-[12px] sm:text-[13px] text-[#6B6B6B]">
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

              <span className="font-mono text-[11px] sm:text-[12px] text-[#9B9B9B]">24h Auto-Destruction Active</span>
            </div>
          )}

          {/* File Inventory List: Adaptive Desktop Table vs Clean Mobile Cards */}
          {loading && files.length === 0 ? (
            /* Smooth inline initial loader (keeps full dashboard visible!) */
            <div className="p-12 sm:p-16 text-center space-y-3">
              <div className="w-8 h-8 rounded-full border-2 border-[#014BAA] border-t-transparent animate-spin mx-auto" />
              <p className="text-[12px] font-mono text-[#6B6B6B]">Connecting to vault storage...</p>
            </div>
          ) : filteredFiles.length > 0 ? (
            <>
              {/* Mobile View (< 640px): Clean uncluttered cards */}
              <div className="sm:hidden p-3 space-y-3">
                {filteredFiles.map((file) => (
                  <MobileFileCard
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

              {/* Desktop View (>= 640px): Standard sleek table rows */}
              <div className="hidden sm:block">
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
            </>
          ) : (
            /* Empty State */
            <div className="p-10 sm:p-14 text-center space-y-3.5">
              <div className="w-16 h-16 bg-[#F8F3F0] rounded-2xl flex items-center justify-center mx-auto text-[#014BAA]">
                <PackageOpen className="w-8 h-8" />
              </div>
              <h3 className="text-[17px] sm:text-[18px] font-bold text-[#1A1A1A]">
                Your vault <AppleColorText text="is empty" mode="chars" />
              </h3>
              <p className="text-[13px] text-[#6B6B6B] max-w-sm mx-auto">
                Drag files onto the drop zone above or click to browse. Files live in a private,
                encrypted-at-rest vault and are automatically destroyed after 24 hours.
              </p>
            </div>
          )}
        </div>
      </main>

      {/* 3. Production Footer */}
      <Footer />

      {/* 4. Modals & Action Overlays */}
      <FilePreviewModal file={previewFile} onClose={() => setPreviewFile(null)} onDownload={handleDownload} />

      <BulkActionBar
        selectedFiles={files.filter((f) => selectedFileIds.has(f.id))}
        onDownloadAll={handleBulkDownload}
        onDeleteAll={handleBulkDelete}
        onClearSelection={() => setSelectedFileIds(new Set())}
        isDownloading={isZipping}
      />

      {/* 5. Inactivity Warning Banner (Final 2 minutes) */}
      {isWarning && (
        <IdleWarningBanner secondsRemaining={secondsRemaining} onExtend={extendSession} onLogout={handleManualLogout} />
      )}

      {/* 6. Floating Panic Wipe Button: Desktop ONLY (Hidden on mobile per user request) */}
      {!isMobileDevice && <PanicButton onPanic={handlePanicWipe} />}

      {/* 7. Scene 1 Modal: PC shows dynamic QR for smartphone to scan */}
      <MobileHandoffModal isOpen={isHandoffOpen} onClose={() => setIsHandoffOpen(false)} />

      {/* 8. Scene 2 Modal: Smartphone in-browser camera scanner */}
      <CameraQRScannerModal
        isOpen={isScannerOpen}
        onClose={() => setIsScannerOpen(false)}
        onScan={handleScannedQR}
        title="Pair PC Workstation"
        subtitle="Align the PC screen QR code within the frame"
      />
    </div>
  );
}
