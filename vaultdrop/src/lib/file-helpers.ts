import JSZip from 'jszip';
import { VaultFile, FileCategory } from './types';
import { supabase, isSupabaseConfigured } from './supabase';

export const MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024; // 20 MB (20,971,520 bytes)
export const MAX_USER_STORAGE_BYTES = 50 * 1024 * 1024; // 50 MB
const MOCK_STORAGE_FILES_PREFIX = 'vaultdrop_files_';

/**
 * Categorize MIME types and file extensions into 6 UI filter buckets.
 */
export function getFileCategory(filename: string, mimeType: string): FileCategory {
  const ext = filename.split('.').pop()?.toLowerCase() || '';

  if (mimeType.startsWith('image/') || ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg'].includes(ext)) {
    return 'image';
  }
  if (mimeType === 'application/pdf' || ext === 'pdf') {
    return 'pdf';
  }
  if (
    ['doc', 'docx', 'txt', 'rtf', 'md', 'csv', 'xlsx', 'xls', 'pptx'].includes(ext) ||
    mimeType.includes('word') ||
    mimeType.includes('document') ||
    mimeType.includes('sheet')
  ) {
    return 'doc';
  }
  if (
    ['js', 'ts', 'jsx', 'tsx', 'py', 'c', 'cpp', 'java', 'html', 'css', 'json', 'sql', 'sh', 'rs', 'go'].includes(ext)
  ) {
    return 'code';
  }
  if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext) || mimeType.includes('zip') || mimeType.includes('compressed')) {
    return 'archive';
  }
  return 'other';
}

/**
 * Format bytes to human-readable string.
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

/**
 * Get human remaining time formatted like 'expires in 18h 42m' or 'expires in 04m 12s'.
 */
export function getExpiryLabel(expiresAt: string): { label: string; isUrgent: boolean } {
  const diff = new Date(expiresAt).getTime() - Date.now();
  if (diff <= 0) {
    return { label: 'Expired', isUrgent: true };
  }

  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((diff % (1000 * 60)) / 1000);

  const isUrgent = hours === 0; // Under 1 hour remaining

  if (hours > 0) {
    return {
      label: `expires in ${hours}h ${minutes}m`,
      isUrgent,
    };
  }

  return {
    label: `expires in ${minutes}m ${seconds}s`,
    isUrgent: true,
  };
}

export function generateUUID(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Upload a file to user's ephemeral vault.
 * Validates constraints (filename 1-255, MIME 1-100, size <= 20MB, quota <= 50MB).
 * Handled gracefully if PostgreSQL BEFORE INSERT trigger throws quota_exceeded.
 */
export async function uploadVaultFile(
  userId: string,
  file: File,
  onProgress?: (percent: number) => void
): Promise<{ success: boolean; file?: VaultFile; error?: string }> {
  // 1. Client-side sanity checks matching schema
  if (file.name.length < 1 || file.name.length > 255) {
    return { success: false, error: 'Filename length must be between 1 and 255 characters.' };
  }

  if (file.size <= 0) {
    return { success: false, error: 'Cannot upload empty file.' };
  }

  if (file.size > MAX_FILE_SIZE_BYTES) {
    return { success: false, error: 'File exceeds 20 MB size limit.' };
  }

  const mimeType = (file.type || 'application/octet-stream').substring(0, 100);

  // 2. Client-side storage cap check
  const existingFiles = await getUserFiles(userId);
  const currentTotal = existingFiles.reduce((acc, f) => acc + f.size, 0);
  if (currentTotal + file.size > MAX_USER_STORAGE_BYTES) {
    return { success: false, error: 'Storage cap exceeded. Total vault usage cannot exceed 50 MB.' };
  }

  onProgress?.(15);

  const fileId = generateUUID();
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(); // 24 hours
  const category = getFileCategory(file.name, mimeType);

  // Supabase Cloud Environment
  if (isSupabaseConfigured && supabase) {
    const storagePath = `user_${userId}/${fileId}_${file.name}`;
    onProgress?.(35);

    // Upload bytes to private bucket 'vault'
    const { error: storageError } = await supabase.storage
      .from('vault')
      .upload(storagePath, file, {
        cacheControl: '3600',
        upsert: false,
      });

    if (storageError) {
      return { success: false, error: storageError.message };
    }

    onProgress?.(70);

    // Insert metadata into database (enforce_storage_quota_trigger runs here)
    const { error: dbError } = await supabase.from('files').insert({
      id: fileId,
      owner_id: userId,
      filename: file.name,
      storage_path: storagePath,
      size_bytes: file.size,
      mime_type: mimeType,
      expires_at: expiresAt,
    });

    if (dbError) {
      // Rollback storage file if database rejected
      await supabase.storage.from('vault').remove([storagePath]);
      if (dbError.message.includes('Storage quota exceeded') || dbError.code === 'P0001') {
        return { success: false, error: 'Storage quota exceeded. Please delete old files to free up space.' };
      }
      return { success: false, error: dbError.message };
    }

    onProgress?.(90);

    // Generate short-lived signed URL (60s)
    const { data: signedUrlData } = await supabase.storage
      .from('vault')
      .createSignedUrl(storagePath, 60);

    onProgress?.(100);

    const uploadedFile: VaultFile = {
      id: fileId,
      name: file.name,
      size: file.size,
      type: mimeType,
      category,
      uploadedAt: new Date().toISOString(),
      expiresAt,
      storagePath,
      url: signedUrlData?.signedUrl,
      blob: file,
    };

    return { success: true, file: uploadedFile };
  }

  // Fallback (Local Development)
  onProgress?.(50);
  let content: string | undefined;
  if (file.type.startsWith('text/') || ['json', 'js', 'ts', 'py', 'c', 'cpp', 'html', 'css', 'md'].includes(file.name.split('.').pop() || '')) {
    try {
      content = await file.text();
    } catch {
      // ignore
    }
  }

  onProgress?.(80);
  const objectUrl = URL.createObjectURL(file);
  const newFile: VaultFile = {
    id: fileId,
    name: file.name,
    size: file.size,
    type: mimeType,
    category,
    uploadedAt: new Date().toISOString(),
    expiresAt,
    url: objectUrl,
    content,
    blob: file,
  };

  const updatedFiles = [newFile, ...existingFiles];
  if (typeof window !== 'undefined') {
    const metaList = updatedFiles.map(f => ({
      ...f,
      blob: undefined,
    }));
    localStorage.setItem(`${MOCK_STORAGE_FILES_PREFIX}${userId}`, JSON.stringify(metaList));
  }

  onProgress?.(100);
  return { success: true, file: newFile };
}

/**
 * Fetch all valid (unexpired) files for a user.
 * Generates signed URLs in batch so preview and download work immediately.
 */
export async function getUserFiles(userId: string): Promise<VaultFile[]> {
  if (isSupabaseConfigured && supabase) {
    const { data, error } = await supabase
      .from('files')
      .select('*')
      .eq('owner_id', userId)
      .order('expires_at', { ascending: false });

    if (error || !data) return [];

    const now = Date.now();
    const valid = data.filter(row => new Date(row.expires_at).getTime() > now);
    if (valid.length === 0) return [];

    // Batch generate signed URLs (valid 3600 seconds) so every file has an active download URL
    const paths = valid.map(row => row.storage_path);
    const urlMap = new Map<string, string>();
    try {
      const { data: signedUrls } = await supabase.storage
        .from('vault')
        .createSignedUrls(paths, 3600);

      if (signedUrls) {
        signedUrls.forEach(item => {
          if (item && item.signedUrl && item.path) {
            urlMap.set(item.path, item.signedUrl);
          }
        });
      }
    } catch (err) {
      console.warn('Batch createSignedUrls error:', err);
    }

    return valid.map(row => ({
      id: row.id,
      name: row.filename,
      size: Number(row.size_bytes),
      type: row.mime_type,
      category: getFileCategory(row.filename, row.mime_type),
      uploadedAt: row.created_at,
      expiresAt: row.expires_at,
      storagePath: row.storage_path,
      url: urlMap.get(row.storage_path),
    }));
  }

  if (typeof window !== 'undefined') {
    const raw = localStorage.getItem(`${MOCK_STORAGE_FILES_PREFIX}${userId}`);
    if (!raw) return [];
    try {
      const files: VaultFile[] = JSON.parse(raw);
      const now = Date.now();
      return files.filter(f => new Date(f.expiresAt).getTime() > now);
    } catch {
      return [];
    }
  }

  return [];
}

/**
 * Delete a specific file.
 * In Supabase, the AFTER DELETE trigger automatically removes the object from storage!
 */
export async function deleteVaultFile(userId: string, fileId: string): Promise<boolean> {
  if (isSupabaseConfigured && supabase) {
    // Delete database row -> triggers delete_storage_object() automatically
    const { error } = await supabase.from('files').delete().eq('id', fileId);
    return !error;
  }

  if (typeof window !== 'undefined') {
    const files = await getUserFiles(userId);
    const filtered = files.filter(f => f.id !== fileId);
    localStorage.setItem(`${MOCK_STORAGE_FILES_PREFIX}${userId}`, JSON.stringify(filtered));
    return true;
  }

  return false;
}

/**
 * Direct file download guaranteed to work reliably on both PC and mobile smartphones.
 * Obtains binary Blob and triggers same-origin download with exact filename.
 */
export async function downloadVaultFileDirectly(file: VaultFile, userId?: string): Promise<boolean> {
  try {
    let blob: Blob | null = file.blob || null;

    // 1. Direct binary download from Supabase Storage
    if (!blob && isSupabaseConfigured && supabase) {
      const storagePath = file.storagePath || (userId ? `user_${userId}/${file.id}_${file.name}` : undefined);
      if (storagePath) {
        try {
          const { data, error } = await supabase.storage.from('vault').download(storagePath);
          if (!error && data) {
            blob = data;
          }
        } catch {
          // fallback to URL
        }
      }
    }

    // 2. Fetch via signed or direct URL as binary Blob
    if (!blob && file.url) {
      try {
        const response = await fetch(file.url);
        if (response.ok) {
          blob = await response.blob();
        }
      } catch (err) {
        console.warn('Fetch from signed URL failed:', err);
      }
    }

    // 3. Fallback for text content in local/mock mode
    if (!blob && file.content) {
      blob = new Blob([file.content], { type: file.type || 'text/plain' });
    }

    // 4. Trigger download with same-origin blob: URL (guaranteed not blocked by browser download policy)
    if (blob) {
      const blobUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.style.display = 'none';
      link.href = blobUrl;
      link.download = file.name;
      document.body.appendChild(link);
      link.click();
      setTimeout(() => {
        if (document.body.contains(link)) {
          document.body.removeChild(link);
        }
        window.URL.revokeObjectURL(blobUrl);
      }, 2000);
      return true;
    }

    // 5. Direct window/link navigation fallback
    if (file.url) {
      const link = document.createElement('a');
      link.style.display = 'none';
      link.href = file.url;
      link.download = file.name;
      link.target = '_blank';
      document.body.appendChild(link);
      link.click();
      setTimeout(() => {
        if (document.body.contains(link)) {
          document.body.removeChild(link);
        }
      }, 1000);
      return true;
    }

    return false;
  } catch (err) {
    console.error('downloadVaultFileDirectly failed:', err);
    return false;
  }
}

/**
 * Bulk zip download of selected files using JSZip.
 */
export async function downloadFilesAsZip(
  files: VaultFile[],
  zipName = 'vaultdrop_bundle.zip',
  userId?: string
): Promise<void> {
  const zip = new JSZip();

  for (const file of files) {
    let blob: Blob | null = file.blob || null;

    if (!blob && isSupabaseConfigured && supabase) {
      const storagePath = file.storagePath || (userId ? `user_${userId}/${file.id}_${file.name}` : undefined);
      if (storagePath) {
        try {
          const { data } = await supabase.storage.from('vault').download(storagePath);
          if (data) blob = data;
        } catch {
          // ignore
        }
      }
    }

    if (!blob && file.url) {
      try {
        const response = await fetch(file.url);
        if (response.ok) {
          blob = await response.blob();
        }
      } catch (e) {
        console.error('Failed to download file for zip:', file.name, e);
      }
    }

    if (blob) {
      zip.file(file.name, blob);
    } else if (file.content) {
      zip.file(file.name, file.content);
    }
  }

  const content = await zip.generateAsync({ type: 'blob' });
  const downloadUrl = window.URL.createObjectURL(content);
  const a = document.createElement('a');
  a.style.display = 'none';
  a.href = downloadUrl;
  a.download = zipName;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    if (document.body.contains(a)) {
      document.body.removeChild(a);
    }
    window.URL.revokeObjectURL(downloadUrl);
  }, 2000);
}
