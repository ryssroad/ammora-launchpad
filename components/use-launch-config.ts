"use client";

import { useCallback, useEffect, useState } from "react";
import { LOCAL_CONFIG_EVENT, localConfigId } from "@/lib/local-config";
import type { ConfigInfo } from "@/lib/types";

export function useLaunchConfig() {
  const [config, setConfig] = useState<ConfigInfo | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(() => {
    const id = localConfigId();
    const query = id ? `?id=${id}` : "";
    void fetch(`/api/config${query}`)
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || "Config could not be read.");
        setConfig(body as ConfigInfo);
        setError(null);
      })
      .catch((reason: unknown) => {
        setError(reason instanceof Error ? reason.message : "Config could not be read.");
      });
  }, []);

  useEffect(() => {
    reload();
    window.addEventListener(LOCAL_CONFIG_EVENT, reload);
    return () => window.removeEventListener(LOCAL_CONFIG_EVENT, reload);
  }, [reload]);

  return { config, error, reload };
}
