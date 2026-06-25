"use client";

import { useEffect, useState } from "react";
import { useAppStore } from "../stores/app.store";

export function useAppStoreHydrated(): boolean {
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setHydrated(useAppStore.persist.hasHydrated());
    return useAppStore.persist.onFinishHydration(() => setHydrated(true));
  }, []);

  return hydrated;
}
