import Link from "next/link";

export function EmptyState({
  title,
  description,
  href,
  action
}: {
  title: string;
  description: string;
  href?: string;
  action?: string;
}) {
  return (
    <div className="rounded-md border border-dashed border-slate-300 bg-white p-6 text-center">
      <h2 className="text-lg font-bold text-ink">{title}</h2>
      <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-muted">{description}</p>
      {href && action ? (
        <Link className="mt-4 inline-flex min-h-10 items-center rounded-md bg-ink px-4 py-2 text-sm font-semibold text-white" href={href}>
          {action}
        </Link>
      ) : null}
    </div>
  );
}
