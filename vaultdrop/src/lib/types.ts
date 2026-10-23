export type FileCategory = 'image' | 'pdf' | 'doc' | 'code' | 'archive' | 'other';

export interface VaultFile {
  id: string;
  name: string;
  size: number;
  type: string;
  category: FileCategory;
  uploadedAt: string;
  expiresAt: string;
  /** Server-authoritative storage path (`user_<uid>/<fileId>.<ext>`). Never rebuild this on the client. */
  storagePath?: string;
  /** Short-lived signed URL, regenerated on sync. Never persist. */
  url?: string;
  urlExpiresAt?: number;
  /** Local-dev mock mode only. */
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

export interface VaultUsage {
  usedBytes: number;
  capBytes: number;
}

/** Status payload returned by get_login_session_status() on the workstation. */
export interface LoginSessionStatus {
  status: 'pending' | 'approved' | 'expired' | 'unknown';
  expiresAt?: string;
}

/** Payload returned once by consume_login_session() on the workstation. */
export interface ConsumedLoginSession {
  userId: string;
  username: string;
  refreshToken: string;
}

/** Payload returned once by resolve_handoff_session() on the phone. */
export interface ResolvedHandoff {
  userId: string;
  username: string;
}
