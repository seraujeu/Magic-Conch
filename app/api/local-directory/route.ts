import {
  handleLocalDirectoryRequest,
  localDirectoryRequestAccessError,
  type LocalDirectoryRequest,
} from "../../../build/local-directory-vite-plugin";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const accessError = localDirectoryRequestAccessError(new URL(request.url), request.headers.get("origin"), request.headers.get("content-type"));
  if (accessError) {
    return Response.json({ error: accessError.error }, { status: accessError.status, headers: { "Cache-Control": "no-store" } });
  }
  try {
    const body = await request.json() as LocalDirectoryRequest;
    return Response.json(await handleLocalDirectoryRequest(process.cwd(), body), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return Response.json({
      error: error instanceof Error ? error.message : "The local directory request failed.",
    }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }
}
