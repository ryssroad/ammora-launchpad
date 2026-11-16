export const LOCAL_CONFIG_KEY = "giwamoon.configId";
export const LOCAL_CONFIG_EVENT = "giwamoon-config";

export function localConfigId() {
  if (typeof window === "undefined") return null;
  try {
    const value = window.localStorage.getItem(LOCAL_CONFIG_KEY)?.trim() ?? "";
    return /^[1-9]\d*$/.test(value) ? value : null;
  } catch {
    return null;
  }
}

export function saveLocalConfigId(id: string) {
  window.localStorage.setItem(LOCAL_CONFIG_KEY, id);
  window.dispatchEvent(new Event(LOCAL_CONFIG_EVENT));
}
