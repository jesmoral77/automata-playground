import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-slate-100 text-slate-800">
      <h1 className="text-2xl font-bold">Machine not found</h1>
      <p>The link may be mistyped, or the machine no longer exists.</p>
      <Link href="/" className="text-blue-700 underline">
        Open the playground
      </Link>
    </div>
  );
}
