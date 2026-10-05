import { uuidv7 } from "uuidv7";

/** Time-ordered UUID v7: index-friendly and safe to expose in URLs. */
export const newId = (): string => uuidv7();

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (value: string): boolean => UUID_RE.test(value);
