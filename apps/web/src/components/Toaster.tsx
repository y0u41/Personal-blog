import { useToastStore } from '../store/toast';

const STYLES: Record<string, string> = {
  success: 'bg-emerald-600',
  error: 'bg-red-600',
  info: 'bg-slate-700',
};

export default function Toaster() {
  const toasts = useToastStore((s) => s.toasts);
  const remove = useToastStore((s) => s.remove);
  return (
    <div className="fixed right-4 top-4 z-50 flex w-72 flex-col gap-2">
      {toasts.map((t) => (
        <button
          key={t.id}
          onClick={() => remove(t.id)}
          className={`${STYLES[t.type]} rounded-md px-4 py-2.5 text-left text-sm text-white shadow-lg transition`}
        >
          {t.message}
        </button>
      ))}
    </div>
  );
}
