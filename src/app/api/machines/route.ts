import { createMachine } from "@/lib/storage/machines";
import { errorResponse, readMachineBody } from "@/lib/storage/http";

/** Save a new machine. Returns its id and a secret edit token. */
export async function POST(request: Request) {
  try {
    const { name, machine } = await readMachineBody(request);
    const { saved, editToken } = await createMachine(name, machine);
    return Response.json({ ...saved, editToken }, { status: 201 });
  } catch (e) {
    return errorResponse(e);
  }
}
