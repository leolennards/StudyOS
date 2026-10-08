/**
 * Object key layout (Architecture §8). Keys are built only from ids, never
 * from user-supplied filenames, and every key starts with its workspace.
 *
 *   ws/<workspaceId>/docs/<documentId>/original
 *   ws/<workspaceId>/docs/<documentId>/derived/<name>
 *   ws/<workspaceId>/card-images/<imageId>/original
 *   ws/<workspaceId>/card-images/<imageId>/image.webp
 */
const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const KEY_RE = new RegExp(
  `^ws/${UUID}/(docs/${UUID}/(original|derived/[a-z0-9-]+\\.[a-z0-9]+)|card-images/${UUID}/(original|image\\.webp))$`,
);
const DOC_KEY_RE = new RegExp(`^ws/(${UUID})/docs/(${UUID})/`);
const CARD_IMAGE_KEY_RE = new RegExp(`^ws/(${UUID})/card-images/(${UUID})/`);

export const workspacePrefix = (workspaceId: string) => `ws/${workspaceId}/`;
export const documentPrefix = (workspaceId: string, documentId: string) => `ws/${workspaceId}/docs/${documentId}/`;
export const originalKey = (workspaceId: string, documentId: string) =>
  `${documentPrefix(workspaceId, documentId)}original`;
export const derivedKey = (workspaceId: string, documentId: string, name: string) =>
  `${documentPrefix(workspaceId, documentId)}derived/${name}`;

export const cardImagePrefix = (workspaceId: string, imageId: string) => `ws/${workspaceId}/card-images/${imageId}/`;
export const cardImageUploadKey = (workspaceId: string, imageId: string) =>
  `${cardImagePrefix(workspaceId, imageId)}original`;
export const cardImageKey = (workspaceId: string, imageId: string) =>
  `${cardImagePrefix(workspaceId, imageId)}image.webp`;

export const isValidKey = (key: string) => KEY_RE.test(key);

/** The workspace and document a key belongs to, or null for a key outside the layout. */
export function parseDocumentKey(key: string): { workspaceId: string; documentId: string } | null {
  const m = DOC_KEY_RE.exec(key);
  return m ? { workspaceId: m[1]!, documentId: m[2]! } : null;
}

/** The workspace and card picture a key belongs to, or null for any other key. */
export function parseCardImageKey(key: string): { workspaceId: string; imageId: string } | null {
  const m = CARD_IMAGE_KEY_RE.exec(key);
  return m ? { workspaceId: m[1]!, imageId: m[2]! } : null;
}
