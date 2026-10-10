interface Props {
  page: number;
  pageSize: number;
  total: number;
  onChange: (page: number) => void;
}

export default function Pagination({ page, pageSize, total, onChange }: Props) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (totalPages <= 1) {
    return null;
  }
  const pages = Array.from({ length: totalPages }, (_, i) => i + 1).filter(
    (p) => p === 1 || p === totalPages || Math.abs(p - page) <= 1,
  );

  return (
    <nav className="mt-6 flex items-center justify-center gap-1 text-sm">
      <button
        disabled={page <= 1}
        onClick={() => onChange(page - 1)}
        className="rounded-md border border-slate-200 bg-white px-3 py-1.5 disabled:opacity-40"
      >
        上一页
      </button>
      {pages.map((p, idx) => {
        const prev = pages[idx - 1];
        const gap = prev != null && p - prev > 1;
        return (
          <span key={p} className="flex items-center gap-1">
            {gap && <span className="px-1 text-slate-400">…</span>}
            <button
              onClick={() => onChange(p)}
              className={`min-w-9 rounded-md border px-2.5 py-1.5 ${
                p === page
                  ? 'border-indigo-600 bg-indigo-600 text-white'
                  : 'border-slate-200 bg-white hover:border-indigo-300'
              }`}
            >
              {p}
            </button>
          </span>
        );
      })}
      <button
        disabled={page >= totalPages}
        onClick={() => onChange(page + 1)}
        className="rounded-md border border-slate-200 bg-white px-3 py-1.5 disabled:opacity-40"
      >
        下一页
      </button>
    </nav>
  );
}
