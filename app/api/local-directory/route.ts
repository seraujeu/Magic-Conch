import {
  handleLocalDirectoryRequest,
  isLoopbackHostname,
  type LocalDirectoryRequest,
} from "../../../build/local-directory-vite-plugin";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!isLoopbackHostname(new URL(request.url).hostname)) {
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
