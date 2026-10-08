import { isAppError } from "@/server/lib/errors";
import { cardImageIdSchema } from "@/server/modules/flashcards/schemas";
import { flashcardsService } from "@/server/modules/flashcards/service";
import { getSession } from "@/server/platform/auth/session";

export const dynamic = "force-dynamic";

/**
 * A picture on a flashcard, for `<img src>`: checks the student can see it,
 * then redirects to a short-lived signed URL. The redirect is cached by the
 * browser for less time than the URL lasts, so a long review session keeps
 * working without asking for every picture again.
 */
export async function GET(_request: Request, { params }: RouteContext<"/api/card-images/[imageId]">) {
  const session = await getSession();
  if (!session) return new Response("Sign in to see this picture.", { status: 401 });
  const parsed = cardImageIdSchema.safeParse({ id: (await params).imageId });
  if (!parsed.success) return new Response("Not found", { status: 404 });
  try {
    const url = await flashcardsService.getImageUrl(session.ctx, parsed.data.id);
    return new Response(null, {
      status: 302,
      headers: { Location: url, "Cache-Control": "private, max-age=300" },
    });
  } catch (error) {
    if (isAppError(error) && error.code === "NOT_FOUND") return new Response("Not found", { status: 404 });
    throw error;
  }
}
