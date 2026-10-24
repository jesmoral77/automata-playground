import { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-blue-600 text-white hover:bg-blue-700 border-blue-600",
  secondary: "bg-white text-slate-800 hover:bg-slate-50 border-slate-300",
  ghost: "bg-transparent text-slate-700 hover:bg-slate-100 border-transparent",
  danger: "bg-white text-red-700 hover:bg-red-50 border-red-300",
};

export function Button({
  variant = "secondary",
  active = false,
  className = "",
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; active?: boolean }) {
  return (
    <button
      type="button"
      className={`inline-flex items-center justify-center gap-1 rounded-md border px-3 py-1.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
        active ? "bg-blue-50 text-blue-800 border-blue-400 ring-1 ring-blue-400" : VARIANTS[variant]
      } ${className}`}
      {...rest}
    />
  );
}

export function Badge({ tone, children }: { tone: "green" | "red" | "amber" | "slate" | "blue"; children: ReactNode }) {
  const tones = {
    green: "bg-green-100 text-green-800 border-green-300",
    red: "bg-red-100 text-red-800 border-red-300",
    amber: "bg-amber-100 text-amber-900 border-amber-300",
    slate: "bg-slate-100 text-slate-700 border-slate-300",
    blue: "bg-blue-100 text-blue-800 border-blue-300",
  };
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold ${tones[tone]}`}>
      {children}
    </span>
  );
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{children}</h3>;
}

export const inputClass =
  "w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500";
