export type FileCategory = 'image' | 'pdf' | 'doc' | 'code' | 'archive' | 'other';

export interface VaultFile {
  id: string;
  name: string;
  size: number;
  type: string;
  category: FileCategory;
  uploadedAt: string;
  expiresAt: string;
  url?: string;
  content?: string;
  blob?: Blob;
}

export interface UserProfile {
  id: string;
  username: string;
  storageCapMb: number;
  usedBytes: number;
  createdAt: string;
  lastActiveAt: string;
  accountExpiresAt: string;
}

export interface PairingSession {
  id: string;
  qrToken: string;
  status: 'pending' | 'approved' | 'expired' | 'denied' | 'consumed';
  createdAt: string;
  expiresAt: string;
  consumedAt?: string;
  userId?: string;
  username?: string;
  deviceInfo?: string;
}
