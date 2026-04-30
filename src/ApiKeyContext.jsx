/**
 * ApiKeyContext
 *
 * Provides a single, shared Claude API key across all tabs.
 * The key is:
 *   1. Cached in localStorage for instant availability on reload.
 *   2. Encrypted (AES-GCM, key derived from HOUSEHOLD_ID via PBKDF2) and
 *      stored in Supabase so both household users share it without either
 *      ever having to re-enter it on a new device.
 *
 * The HOUSEHOLD_ID acts as the "password" — both users share it via .env,
 * so no extra PIN is needed while the key still stays encrypted at rest.
 */

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { supabase, HOUSEHOLD_ID } from './supabase';

// ── Constants ─────────────────────────────────────────────────────────────────
const LS_KEY   = 'fridgetrack_claude_key';
const APP_SALT = 'fridgetrack-api-key-v1'; // fixed salt, never changes

// ── Web Crypto helpers ────────────────────────────────────────────────────────
async function deriveKey(householdId) {
  const enc = new TextEncoder();
  const base = await crypto.subtle.importKey(
    'raw',
    enc.encode(householdId),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: enc.encode(APP_SALT), iterations: 100_000, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

function toB64(buf) {
  return btoa(String.fromCharCode(...new Uint8Array(buf)));
}
function fromB64(b64) {
  return Uint8Array.from(atob(b64), c => c.charCodeAt(0));
}

async function encryptKey(raw, householdId) {
  const key = await deriveKey(householdId);
  const iv  = crypto.getRandomValues(new Uint8Array(12));
  const enc = new TextEncoder();
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(raw));
  return { encrypted: toB64(ciphertext), iv: toB64(iv) };
}

async function decryptKey(encryptedB64, ivB64, householdId) {
  const key  = await deriveKey(householdId);
  const iv   = fromB64(ivB64);
  const data = fromB64(encryptedB64);
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data);
  return new TextDecoder().decode(plain);
}

// ── Context ───────────────────────────────────────────────────────────────────
const ApiKeyContext = createContext({
  apiKey:     '',
  keyLoading: true,
  saveApiKey: async () => {},
  clearApiKey: () => {},
});

export function useApiKey() {
  return useContext(ApiKeyContext);
}

// ── Provider ──────────────────────────────────────────────────────────────────
export function ApiKeyProvider({ children }) {
  // Initialise from localStorage so the UI is never blocked on a network call
  const [apiKey,     setApiKey]     = useState(() => localStorage.getItem(LS_KEY) ?? '');
  const [keyLoading, setKeyLoading] = useState(!localStorage.getItem(LS_KEY));

  // On first mount (or when localStorage is empty): try Supabase
  useEffect(() => {
    if (apiKey) { setKeyLoading(false); return; }

    supabase
      .from('household_settings')
      .select('encrypted_api_key, iv')
      .eq('household_id', HOUSEHOLD_ID)
      .maybeSingle()
      .then(async ({ data }) => {
        if (data?.encrypted_api_key && data?.iv) {
          try {
            const plain = await decryptKey(data.encrypted_api_key, data.iv, HOUSEHOLD_ID);
            localStorage.setItem(LS_KEY, plain);
            setApiKey(plain);
          } catch {
            // Decryption failed (e.g. HOUSEHOLD_ID mismatch) — just stay empty
          }
        }
        setKeyLoading(false);
      })
      .catch(() => setKeyLoading(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const saveApiKey = useCallback(async (raw) => {
    const trimmed = raw.trim();
    // Update local state + cache immediately
    localStorage.setItem(LS_KEY, trimmed);
    setApiKey(trimmed);

    // Encrypt + persist to Supabase in the background
    try {
      const { encrypted, iv } = await encryptKey(trimmed, HOUSEHOLD_ID);
      await supabase.from('household_settings').upsert({
        household_id:      HOUSEHOLD_ID,
        encrypted_api_key: encrypted,
        iv,
        updated_at:        new Date().toISOString(),
      });
    } catch (err) {
      console.error('[ApiKey] Supabase save failed:', err.message);
      // Non-fatal: key still works from localStorage
    }
  }, []);

  const clearApiKey = useCallback(() => {
    localStorage.removeItem(LS_KEY);
    setApiKey('');
    supabase
      .from('household_settings')
      .update({ encrypted_api_key: null, iv: null })
      .eq('household_id', HOUSEHOLD_ID)
      .then(() => {})
      .catch(() => {});
  }, []);

  return (
    <ApiKeyContext.Provider value={{ apiKey, keyLoading, saveApiKey, clearApiKey }}>
      {children}
    </ApiKeyContext.Provider>
  );
}
