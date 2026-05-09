import { describe, it, expect, vi } from 'vitest';
import {
  isAuthExpiredError,
  notifySessionLost,
  onSessionLost,
  handleQueryError,
} from '@/lib/queryErrorHandler';

describe('isAuthExpiredError', () => {
  it('returns false for null, undefined, empty', () => {
    expect(isAuthExpiredError(null)).toBe(false);
    expect(isAuthExpiredError(undefined)).toBe(false);
    expect(isAuthExpiredError({})).toBe(false);
  });

  it('detects HTTP 401 by status', () => {
    expect(isAuthExpiredError({ status: 401 })).toBe(true);
    expect(isAuthExpiredError({ statusCode: 401 })).toBe(true);
  });

  it('detects PostgREST JWT codes', () => {
    expect(isAuthExpiredError({ code: 'PGRST301' })).toBe(true);
    expect(isAuthExpiredError({ code: 'PGRST302' })).toBe(true);
  });

  it('detects Supabase AuthSessionMissingError by name', () => {
    expect(isAuthExpiredError({ name: 'AuthSessionMissingError' })).toBe(true);
  });

  it('detects message-based JWT failures', () => {
    expect(isAuthExpiredError({ message: 'JWT expired' })).toBe(true);
    expect(isAuthExpiredError({ message: 'invalid jwt' })).toBe(true);
    expect(isAuthExpiredError({ message: 'JWT is missing' })).toBe(true);
    expect(isAuthExpiredError({ message: 'Auth session missing' })).toBe(true);
  });

  it('does NOT classify generic errors as auth-expired', () => {
    expect(isAuthExpiredError({ status: 500 })).toBe(false);
    expect(isAuthExpiredError({ message: 'network error' })).toBe(false);
    expect(isAuthExpiredError({ code: 'PGRST116' })).toBe(false); // no rows
    expect(isAuthExpiredError(new Error('something broke'))).toBe(false);
  });
});

describe('session-lost event bus', () => {
  it('handleQueryError fires session-lost on auth-expired error', () => {
    const handler = vi.fn();
    const off = onSessionLost(handler);

    const wasAuth = handleQueryError({ status: 401 });
    expect(wasAuth).toBe(true);
    expect(handler).toHaveBeenCalledWith({ reason: 'auth-expired' });

    off();
  });

  it('handleQueryError ignores non-auth errors', () => {
    const handler = vi.fn();
    const off = onSessionLost(handler);

    const wasAuth = handleQueryError({ message: 'network unreachable' });
    expect(wasAuth).toBe(false);
    expect(handler).not.toHaveBeenCalled();

    off();
  });

  it('off() unsubscribes the listener', () => {
    const handler = vi.fn();
    const off = onSessionLost(handler);
    off();

    notifySessionLost('auth-expired');
    expect(handler).not.toHaveBeenCalled();
  });
});
