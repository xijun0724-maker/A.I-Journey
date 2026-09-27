import { describe, it, expect, beforeEach, vi } from 'vitest';

const STORAGE_KEY = 'journeyai.secure.v2';

const sessionStorageMock = vi.hoisted(() => {
  let store = {};
  return {
    getItem: (k) => store[k] || null,
    setItem: (k, v) => { store[k] = v; },
    removeItem: (k) => { delete store[k]; },
    clear: () => { Object.keys(store).forEach(k => delete store[k]); },
    _store: () => store,
  };
});

vi.stubGlobal('sessionStorage', sessionStorageMock);

import { setApiKey, getApiKey, clearApiKey, hasApiKey, keyStatus, hydrateKey, stripKey } from '../../src/utils/secure.js';

describe('secure.js', () => {
  beforeEach(() => {
    sessionStorageMock.clear();
  });

  describe('setApiKey / getApiKey', () => {
    it('stores and retrieves the key', () => {
      setApiKey('sk-test-123');
      expect(getApiKey()).toBe('sk-test-123');
    });

    it('stores it under the single openrouter slot', () => {
      setApiKey('sk-key-12345');
      const raw = JSON.parse(sessionStorage.getItem(STORAGE_KEY));
      expect(raw.keys.openrouter.value).toBe('sk-key-12345');
    });

    it('deletes the key when called with empty string', () => {
      setApiKey('sk-abc-1234');
      expect(getApiKey()).toBe('sk-abc-1234');
      setApiKey('');
      expect(getApiKey()).toBe('');
    });

    it('deletes the key when called with null', () => {
      setApiKey('sk-abc-1234');
      setApiKey(null);
      expect(getApiKey()).toBe('');
    });

    it('never reads the Gemini slots: they are pruned on the first access', () => {
      sessionStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          version: 2,
          keys: {
            gemini: { value: 'g-key-12345', created: Date.now(), lastUsed: Date.now() },
            apiKey: { value: 'g-key-12345', created: Date.now(), lastUsed: Date.now() },
          },
          meta: { gemini: { expired: true } },
        }),
      );

      expect(getApiKey()).toBe('');
      expect(hasApiKey()).toBe(false);

      const raw = JSON.parse(sessionStorage.getItem(STORAGE_KEY));
      expect(raw.keys.gemini).toBeUndefined();
      expect(raw.keys.apiKey).toBeUndefined();
      expect(raw.meta.gemini).toBeUndefined();
    });
  });

  describe('clearApiKey', () => {
    it('removes the stored key', () => {
      setApiKey('sk-clear-me');
      expect(hasApiKey()).toBe(true);
      clearApiKey();
      expect(hasApiKey()).toBe(false);
      expect(getApiKey()).toBe('');
    });

    it('marks the key expired when the TTL clears it', () => {
      setApiKey('sk-ttl-123456');
      expect(keyStatus()).toEqual({ present: true, expired: false });
      clearApiKey(true);
      expect(hasApiKey()).toBe(false);
      expect(keyStatus()).toEqual({ present: false, expired: true });
    });
  });

  describe('hasApiKey', () => {
    it('returns false when no key is stored', () => {
      expect(hasApiKey()).toBe(false);
    });

    it('returns true after setApiKey', () => {
      setApiKey('sk-has-1234');
      expect(hasApiKey()).toBe(true);
    });
  });

  describe('hydrateKey', () => {
    it('sets settings.apiKey from sessionStorage when available', () => {
      setApiKey('sk-hydrate-123');
      const settings = { apiKey: '' };
      hydrateKey(settings);
      expect(settings.apiKey).toBe('sk-hydrate-123');
    });

    it('leaves settings.apiKey empty when nothing stored', () => {
      const settings = { apiKey: '' };
      hydrateKey(settings);
      expect(settings.apiKey).toBeUndefined();
    });

    it('handles null settings gracefully', () => {
      expect(() => hydrateKey(null)).not.toThrow();
    });
  });

  describe('stripKey', () => {
    it('returns a copy with settings.apiKey cleared', () => {
      const db = { settings: { apiKey: 'sk-secret' } };
      expect(stripKey(db).settings.apiKey).toBe('');
    });

    it('leaves the live object untouched', () => {
      const db = { settings: { apiKey: 'sk-secret' } };
      stripKey(db);
      expect(db.settings.apiKey).toBe('sk-secret');
    });

    it('keeps the rest of the database intact', () => {
      const db = {
        settings: { apiKey: 'sk-secret', termName: '1st Term' },
        courses: [{ id: 'c1' }],
        chat: [{ role: 'user', content: 'hi' }],
      };
      const out = stripKey(db);
      expect(out.settings.termName).toBe('1st Term');
      expect(out.courses).toBe(db.courses);
      expect(out.chat).toBe(db.chat);
      expect(out).not.toBe(db);
      expect(out.settings).not.toBe(db.settings);
    });

    it('does not throw on null db', () => {
      expect(() => stripKey(null)).not.toThrow();
    });

    it('does not throw on db without settings', () => {
      expect(() => stripKey({})).not.toThrow();
    });
  });

  describe('error resilience', () => {
    it('degrades gracefully when sessionStorage.setItem throws', () => {
      const originalSetItem = sessionStorage.setItem;
      sessionStorage.setItem = vi.fn(() => { throw new Error('quota'); });
      expect(() => setApiKey('sk-fail-123')).not.toThrow();
      sessionStorage.setItem = originalSetItem;
    });

    it('degrades gracefully when sessionStorage.getItem throws', () => {
      const originalGetItem = sessionStorage.getItem;
      sessionStorage.getItem = vi.fn(() => { throw new Error('blocked'); });
      expect(getApiKey()).toBe('');
      expect(hasApiKey()).toBe(false);
      sessionStorage.getItem = originalGetItem;
    });

    it('degrades gracefully when stored data is corrupted JSON', () => {
      sessionStorage.setItem(STORAGE_KEY, '{{bad json');
      expect(getApiKey()).toBe('');
      expect(hasApiKey()).toBe(false);
    });
  });

  describe('sliding TTL and keyStatus', () => {
    it('reports present: false, expired: false when no key set', () => {
      expect(keyStatus()).toEqual({ present: false, expired: false });
    });

    it('reports present: true, expired: false when valid key set', () => {
      setApiKey('sk-valid-key-1234');
      expect(keyStatus()).toEqual({ present: true, expired: false });
    });

    it('expires after 30 days idle and reports expired', () => {
      setApiKey('sk-valid-key-1234');
      const raw = JSON.parse(sessionStorage.getItem(STORAGE_KEY));
      const THIRTY_ONE_DAYS = 31 * 24 * 60 * 60 * 1000;
      raw.keys.openrouter.lastUsed = Date.now() - THIRTY_ONE_DAYS;
      raw.keys.openrouter.created = Date.now() - THIRTY_ONE_DAYS;
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(raw));

      expect(keyStatus()).toEqual({ present: false, expired: true });
      expect(getApiKey()).toBe('');
      expect(keyStatus()).toEqual({ present: false, expired: true });
    });

    it('slides window on active use before 30 days', () => {
      setApiKey('sk-valid-key-1234');
      const raw = JSON.parse(sessionStorage.getItem(STORAGE_KEY));
      const TWENTY_DAYS = 20 * 24 * 60 * 60 * 1000;
      raw.keys.openrouter.created = Date.now() - TWENTY_DAYS;
      raw.keys.openrouter.lastUsed = Date.now() - TWENTY_DAYS;
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(raw));

      // Accessing key should slide created timestamp
      expect(getApiKey()).toBe('sk-valid-key-1234');
      const updated = JSON.parse(sessionStorage.getItem(STORAGE_KEY));
      expect(Date.now() - updated.keys.openrouter.created).toBeLessThan(1000);
      expect(keyStatus()).toEqual({ present: true, expired: false });
    });

    it('expires after 90 days absolute even if recently used', () => {
      setApiKey('sk-valid-key-1234');
      const raw = JSON.parse(sessionStorage.getItem(STORAGE_KEY));
      const NINETY_ONE_DAYS = 91 * 24 * 60 * 60 * 1000;
      raw.keys.openrouter.created = Date.now() - NINETY_ONE_DAYS;
      raw.keys.openrouter.lastUsed = Date.now() - 1000; // active 1s ago
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(raw));

      expect(keyStatus()).toEqual({ present: false, expired: true });
      expect(getApiKey()).toBe('');
    });
  });
});