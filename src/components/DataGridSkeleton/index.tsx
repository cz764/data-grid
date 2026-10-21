export interface DataGridSkeletonProps {
  label?: string;
  rows?: number;
  showHeading?: boolean;
}

export function DataGridSkeleton({
  label = "Loading bond inventory",
  rows = 8,
  showHeading = true,
}: DataGridSkeletonProps) {
  return (
    <section
      className={
        showHeading ? "overflow-hidden rounded-[18px] border border-border bg-surface" : "overflow-hidden bg-surface"
      }
      aria-label={label}
      aria-busy="true"
    >
      {showHeading ? (
        <div className="grid gap-2.5 px-6 py-5">
          <span className="skeleton-bar h-2.5 w-[110px] rounded-[5px]" />
          <span className="skeleton-bar h-6 w-[min(280px,70%)] rounded-[7px]" />
        </div>
      ) : null}
      <div className="skeleton-bar h-10 border-t border-border-subtle" />
      {Array.from({ length: rows }, (_, index) => (
        <div className="skeleton-bar h-11 border-t border-border-subtle" key={index} />
      ))}
      <span className="sr-only">{label}</span>
    </section>
  );
}
