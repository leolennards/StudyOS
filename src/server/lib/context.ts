/**
 * The request context every service requires as its first argument
 * (Architecture §7). There is no way to call a service without one, and
 * every repository query is scoped by `workspaceId`.
 */
export type RequestContext = {
  userId: string;
  workspaceId: string;
  role: "owner" | "editor" | "viewer";
};
