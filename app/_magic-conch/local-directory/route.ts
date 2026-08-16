import {
  handleLocalDirectoryRequest,
  type LocalDirectoryRequest,
} from "../../../build/local-directory-vite-plugin";

export const dynamic = "force-dynamic";

function isLoopbackRequest(request: Request) {
  const hostname = new URL(request.url).hostname.toLowerCase();
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]" || hostname === "::1";
}

export async function POST(request: Request) {
  if (!isLoopbackRequest(request)) {
    return Response.json({ error: "Local directory access is available only from this device." }, { status: 404 });
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
