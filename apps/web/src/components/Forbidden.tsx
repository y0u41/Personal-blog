import { Link } from 'react-router-dom';

// 已登录但角色不满足要求时展示的页面（例如读者访问 /write 或 /admin）
export default function Forbidden() {
  return (
    <div className="mx-auto max-w-lg py-24 text-center">
      <div className="text-5xl">🔒</div>
      <h1 className="mt-4 text-xl font-bold text-slate-800">没有访问权限</h1>
      <p className="mt-2 text-sm text-slate-500">
        当前账号的角色无权访问该页面。如需发表文章，请联系管理员将你的角色提升为「作者」。
      </p>
      <Link
        to="/"
        className="mt-6 inline-block rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
      >
        返回首页
      </Link>
    </div>
  );
}
