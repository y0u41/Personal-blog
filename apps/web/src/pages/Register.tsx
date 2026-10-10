import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { register } from '../api/auth';
import { getErrorMessage } from '../api/client';
import { useAuthStore } from '../store/auth';
import { toast } from '../store/toast';

export default function Register() {
  const navigate = useNavigate();
  const setAuth = useAuthStore((s) => s.setAuth);
  const [form, setForm] = useState({
    username: '',
    email: '',
    password: '',
    displayName: '',
  });
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { accessToken, user } = await register({
        username: form.username,
        email: form.email,
        password: form.password,
        displayName: form.displayName || undefined,
      });
      setAuth(accessToken, user);
      toast.success('注册成功，已自动登录');
      navigate('/');
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const field = (
    key: keyof typeof form,
    label: string,
    type = 'text',
    required = true,
  ) => (
    <div>
      <label className="mb-1 block text-sm text-slate-600">{label}</label>
      <input
        type={type}
        required={required}
        value={form[key]}
        onChange={(e) => setForm({ ...form, [key]: e.target.value })}
        className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-400"
      />
    </div>
  );

  return (
    <div className="mx-auto max-w-sm py-10">
      <h1 className="mb-6 text-2xl font-bold text-slate-800">注册</h1>
      <form onSubmit={onSubmit} className="space-y-4 rounded-xl border border-slate-200 bg-white p-6">
        {field('username', '用户名')}
        {field('email', '邮箱', 'email')}
        {field('password', '密码（至少 8 位）', 'password')}
        {field('displayName', '昵称（可选）', 'text', false)}
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-md bg-indigo-600 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
        >
          {loading ? '注册中…' : '注册'}
        </button>
        <p className="text-center text-xs text-slate-400">
          已有账号？{' '}
          <Link to="/login" className="text-indigo-600 hover:underline">
            去登录
          </Link>
        </p>
      </form>
    </div>
  );
}
