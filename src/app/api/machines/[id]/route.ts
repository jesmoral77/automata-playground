import { getMachine, updateMachine } from "@/lib/storage/machines";
import { errorResponse, readMachineBody } from "@/lib/storage/http";

export async function GET(_request: Request, ctx: RouteContext<"/api/machines/[id]">) {
  try {
    const { id } = await ctx.params;
    const saved = await getMachine(id);
    if (!saved) return Response.json({ error: "Machine not found." }, { status: 404 });
    return Response.json(saved);
  } catch (e) {
    return errorResponse(e);
  }
}

/** Update a machine. Requires the edit token returned when it was created. */
export async function PUT(request: Request, ctx: RouteContext<"/api/machines/[id]">) {
  try {
    const { id } = await ctx.params;
    const token = request.headers.get("x-edit-token") ?? "";
    const { name, machine } = await readMachineBody(request);
    const result = await updateMachine(id, token, name, machine);
    if (result === "not-found") return Response.json({ error: "Machine not found." }, { status: 404 });
    if (result === "forbidden") {
      return Response.json({ error: "You don't have the edit token for this machine." }, { status: 403 });
    }
    return Response.json(result);
  } catch (e) {
    return errorResponse(e);
  }
}
