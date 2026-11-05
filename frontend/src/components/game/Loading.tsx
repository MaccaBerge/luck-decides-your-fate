export function Loading() {
  return (
    <div className="flex min-h-screen items-center justify-center" aria-busy="true">
      <div className="size-14 animate-spin rounded-full border-4 border-violet-200 border-t-violet-600 dark:border-violet-900 dark:border-t-violet-400" />
      <span className="sr-only">Loading…</span>
    </div>
  );
}
