export type VaultState = 'uninitialized' | 'locked' | 'unlocked';

export interface PasswordHistoryItem {
  password: string;
  changedAt: number;
}

export interface LoginEntry {
  id: string;
  title: string;
  url: string;
  username: string;
  password: string;
  /** Base32 secret or full otpauth:// URI. */
  totp?: string;
  notes?: string;
  createdAt: number;
  updatedAt: number;
  lastUsedAt?: number;
  passwordHistory?: PasswordHistoryItem[];
}

export type LoginDraft = Pick<LoginEntry, 'title' | 'url' | 'username' | 'password'> &
  Partial<Pick<LoginEntry, 'id' | 'totp' | 'notes'>>;

export interface Identity {
  fullName: string;
  givenName: string;
  familyName: string;
  email: string;
  phone: string;
  organization: string;
  street: string;
  city: string;
  region: string;
  postalCode: string;
  country: string;
}

export type IdentityKey = keyof Identity;

export const EMPTY_IDENTITY: Identity = {
  fullName: '',
  givenName: '',
  familyName: '',
  email: '',
  phone: '',
  organization: '',
  street: '',
  city: '',
  region: '',
  postalCode: '',
  country: '',
};

export interface VaultSettings {
  autoLockMinutes: number;
  lockOnSystemLock: boolean;
  neverSaveSites: string[];
}

export const DEFAULT_SETTINGS: VaultSettings = {
  autoLockMinutes: 15,
  lockOnSystemLock: true,
  neverSaveSites: [],
};

export type StagedSource = 'generated' | 'typed' | 'submitted';

/** A credential held in RAM-only session storage until the user saves or it expires. */
export interface StagedCredential {
  id: string;
  site: string;
  url: string;
  username: string;
  password: string;
  source: StagedSource;
  createdAt: number;
  expiresAt: number;
  tabId?: number;
  prompt?: {
    action: 'save' | 'update';
    existingId?: string;
    state: 'pending' | 'shown' | 'done';
    shownToDoc?: string;
  };
}

/** Links a username entered on step 1 of a split login to the password step. */
export interface PendingLogin {
  site: string;
  username: string;
  entryId?: string;
  expiresAt: number;
}

/** What a content script is allowed to know about a login: never the password. */
export interface LoginSuggestion {
  id: string;
  title: string;
  username: string;
  hasTotp: boolean;
  preferred: boolean;
}

export interface SavePrompt {
  stagedId: string;
  action: 'save' | 'update';
  site: string;
  username: string;
  locked: boolean;
}

export type FieldKind =
  | 'USERNAME'
  | 'PASSWORD_CURRENT'
  | 'PASSWORD_NEW'
  | 'TOTP_CODE'
  | 'NAME'
  | 'ADDRESS'
  | 'EMAIL'
  | 'PHONE'
  | 'UNKNOWN';

export interface ImportedLogin {
  title: string;
  url: string;
  username: string;
  password: string;
  totp?: string;
  notes?: string;
}

export interface GeneratorOptions {
  length: number;
  lower: boolean;
  upper: boolean;
  digits: boolean;
  symbols: boolean;
  avoidAmbiguous: boolean;
}

export const DEFAULT_GENERATOR: GeneratorOptions = {
  length: 20,
  lower: true,
  upper: true,
  digits: true,
  symbols: true,
  avoidAmbiguous: true,
};
