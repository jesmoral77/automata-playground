import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import Playground from "@/components/Playground";
import { getMachine, StorageNotConfiguredError } from "@/lib/storage/machines";

export default function SharedMachinePage({ params }: PageProps<"/m/[id]">) {
  return (
    <Suspense fallback={<p className="p-8 text-slate-500">Loading machine…</p>}>
      <SharedMachine params={params} />
    </Suspense>
  );
}

async function SharedMachine({ params }: { params: PageProps<"/m/[id]">["params"] }) {
  const { id } = await params;
  let saved;
  try {
    saved = await getMachine(id);
  } catch (e) {
    const message =
      e instanceof StorageNotConfiguredError ? e.message : "The machine could not be loaded. Please try again.";
    return (
      <div className="p-8">
        <p className="text-red-700">{message}</p>
        <Link href="/" className="text-blue-700 underline">
          Back to the playground
        </Link>
      </div>
    );
  }
  if (!saved) notFound();
  return <Playground key={saved.id} initial={{ id: saved.id, name: saved.name, machine: saved.machine }} />;
}
