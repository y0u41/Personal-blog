import { Link } from 'react-router-dom';

export default function NotFound() {
  return (
    <div className="py-24 text-center">
      <div className="text-5xl font-bold text-slate-300">404</div>
      <p className="mt-4 text-slate-500">页面不存在或已被移除</p>
      <Link
        to="/"
        className="mt-6 inline-block rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
      >
        返回首页
      </Link>
    </div>
  );
}
