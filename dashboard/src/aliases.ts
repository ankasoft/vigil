/**
 * Per-browser host display aliases.
 *
 * Stored only in localStorage (`vigil_host_aliases`). A change dispatches a
 * `vigil:aliases-changed` window event so all components re-render.
 */

import { useEffect, useState } from 'react';

const KEY = 'vigil_host_aliases';
const EVENT = 'vigil:aliases-changed';

export type AliasMap = Record<string, string>;

export function getAliases(): AliasMap {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '{}');
  } catch {
    return {};
  }
}

export function setAlias(host: string, alias: string) {
  const map = getAliases();
  const trimmed = alias.trim();
  if (trimmed && trimmed !== host) map[host] = trimmed;
  else delete map[host];
  localStorage.setItem(KEY, JSON.stringify(map));
  window.dispatchEvent(new Event(EVENT));
}

export function useAliases(): AliasMap {
  const [map, setMap] = useState<AliasMap>(getAliases);
  useEffect(() => {
    const fn = () => setMap(getAliases());
    window.addEventListener(EVENT, fn);
    return () => window.removeEventListener(EVENT, fn);
  }, []);
  return map;
}

export function displayName(host: string, aliases: AliasMap): string {
  return aliases[host] || host;
}
