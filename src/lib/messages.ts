import { browser } from 'wxt/browser';
import type {
  FieldKind,
  GeneratorOptions,
  Identity,
  ImportedLogin,
  LoginDraft,
  LoginEntry,
  LoginSuggestion,
  SavePrompt,
  StagedCredential,
  VaultSettings,
  VaultState,
} from './types';

type Empty = Record<string, never>;

/**
 * Every runtime message, keyed by type. `scope` decides who may send it:
 * the background refuses popup-scoped messages that come from a web page.
 */
export interface MessageMap {
  // ---- extension pages only -------------------------------------------------
  'vault:status': { req: Empty; res: { state: VaultState } };
  'vault:setup': { req: { password: string }; res: Empty };
  'vault:unlock': { req: { password: string }; res: Empty };
  'vault:lock': { req: Empty; res: Empty };
  'vault:list': { req: Empty; res: { entries: LoginEntry[] } };
  'vault:upsert': { req: { entry: LoginDraft }; res: { entry: LoginEntry } };
  'vault:delete': { req: { id: string }; res: Empty };
  'vault:import': {
    req: { entries: ImportedLogin[] };
    res: { added: number; updated: number; skipped: number };
  };
  'vault:export': { req: { password: string }; res: { entries: LoginEntry[] } };
  'vault:change-password': { req: { current: string; next: string }; res: Empty };
  'vault:wipe': { req: { password: string }; res: Empty };
  'identity:get': { req: Empty; res: { identity: Identity | null } };
  'identity:set': { req: { identity: Identity }; res: Empty };
  'settings:get': { req: Empty; res: { settings: VaultSettings } };
  'settings:set': { req: { settings: VaultSettings }; res: Empty };
  'staged:list': { req: Empty; res: { items: StagedCredential[] } };
  'staged:save': { req: { id: string }; res: { entry: LoginEntry } };
  'staged:discard': { req: { id: string }; res: Empty };
  'totp:code': { req: { id: string }; res: { code: string; remaining: number } };
  'generator:preview': { req: { options?: GeneratorOptions }; res: { password: string } };

  // ---- content scripts (origin is taken from the sender, never the payload) --
  'fill:query': {
    req: { kind: FieldKind };
    res: {
      state: VaultState;
      logins: LoginSuggestion[];
      staged: { id: string; source: string; createdAt: number; username: string }[];
      hasIdentity: boolean;
      crossSiteFrame: boolean;
      site: string | null;
    };
  };
  'fill:credentials': { req: { id: string }; res: { username: string; password: string } };
  'fill:totp': { req: { id: string }; res: { code: string } };
  'fill:identity': { req: Empty; res: { identity: Identity } };
  'fill:staged': { req: { id: string }; res: { password: string } };
  'generator:new': { req: { username: string }; res: { password: string } };
  'stage:typed': { req: { username: string; password: string }; res: Empty };
  'login:step': { req: { username: string }; res: Empty };
  'capture:submit': {
    req: { username: string; password: string; newPassword?: string };
    res: Empty;
  };
  'capture:claim-prompt': { req: { docId: string }; res: { prompt: SavePrompt | null } };
  'capture:respond': {
    req: { stagedId: string; action: 'save' | 'never' | 'dismiss' };
    res: { needsUnlock: boolean };
  };
  'ui:open-popup': { req: Empty; res: Empty };
}

export type MessageType = keyof MessageMap;
export type Req<T extends MessageType> = MessageMap[T]['req'];
export type Res<T extends MessageType> = MessageMap[T]['res'];
export type Envelope<T extends MessageType = MessageType> = { type: T } & Req<T>;
export type Reply<T extends MessageType> = { ok: true; data: Res<T> } | { ok: false; error: string };

export const CONTENT_MESSAGES = new Set<MessageType>([
  'fill:query',
  'fill:credentials',
  'fill:totp',
  'fill:identity',
  'fill:staged',
  'generator:new',
  'stage:typed',
  'login:step',
  'capture:submit',
  'capture:claim-prompt',
  'capture:respond',
  'ui:open-popup',
]);

export class MessageError extends Error {}

export async function send<T extends MessageType>(type: T, payload: Req<T>): Promise<Res<T>> {
  const reply = (await browser.runtime.sendMessage({ type, ...payload })) as Reply<T> | undefined;
  if (!reply) throw new MessageError('No response from VaultFill background');
  if (!reply.ok) throw new MessageError(reply.error);
  return reply.data;
}

/** Messages the background pushes into tabs. */
export type TabMessage = { type: 'cmd:cycle' };
