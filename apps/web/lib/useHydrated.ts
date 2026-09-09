"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => undefined;

/**
 * False for SSR and the first hydration render, then true in the browser.
 * This keeps browser-persisted wallet state from changing server-rendered
 * controls before React has attached to them.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}
