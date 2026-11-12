import en from "./messages/en.json";

export type MessageKey = keyof typeof en;

const catalog: Record<MessageKey, string> = en;

export function t(key: MessageKey): string {
  return catalog[key];
}

export const messages = en;
