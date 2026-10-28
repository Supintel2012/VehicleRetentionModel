"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * The selected tab, deep-linkable as ?tab=<id> or #<id>. Selecting a tab
 * rewrites the address with ?tab=<id> (replacing the history entry, so Back
 * leaves the page rather than stepping through tabs).
 */
export function useTabState<T extends string>(ids: readonly T[], fallback: T): [T, (id: T) => void] {
  const [tab, setTab] = useState<T>(fallback);

  useEffect(() => {
    const read = () => {
      const params = new URLSearchParams(window.location.search);
      const wanted = params.get("tab") ?? window.location.hash.replace(/^#/, "");
      if ((ids as readonly string[]).includes(wanted)) setTab(wanted as T);
    };
    read();
    window.addEventListener("hashchange", read);
    window.addEventListener("popstate", read);
    return () => {
      window.removeEventListener("hashchange", read);
      window.removeEventListener("popstate", read);
    };
  }, [ids]);

  const select = useCallback((id: T) => {
    setTab(id);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", id);
    url.hash = "";
    window.history.replaceState(null, "", url);
  }, []);

  return [tab, select];
}
