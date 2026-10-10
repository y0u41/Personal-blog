import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { Category, PostStatus, Tag } from '@blog/shared';
import { listCategories } from '../api/categories';
import { getErrorMessage } from '../api/client';
import { createPost, getPost, updatePost } from '../api/posts';
import { listTags } from '../api/tags';
import { uploadImage, validateImageFile } from '../api/uploads';
import MarkdownView from '../components/MarkdownView';
import { buildCategoryTree, flattenCategoryTree } from '../lib/category-tree';
import { toast } from '../store/toast';
import { useAuthStore } from '../store/auth';

interface FormState {
  title: string;
  summary: string;
  content: string;
  coverImage: string;
  categoryId: string;
  tagIds: string[];
  status: PostStatus;
}

const EMPTY: FormState = {
  title: '',
  summary: '',
  content: '',
  coverImage: '',
  categoryId: '',
  tagIds: [],
  status: 'draft',
};

type UploadTarget = 'cover' | 'inline' | '';

export default function Write() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const token = useAuthStore((s) => s.token);

  const [form, setForm] = useState<FormState>(EMPTY);
  const [categories, setCategories] = useState<Category[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(isEdit);
  const [uploading, setUploading] = useState<UploadTarget>('');

  const contentRef = useRef<HTMLTextAreaElement>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);
  const inlineInputRef = useRef<HTMLInputElement>(null);

  const categoryOptions = useMemo(
    () => flattenCategoryTree(buildCategoryTree(categories)),
    [categories],
  );

  useEffect(() => {
    listCategories().then(setCategories).catch(() => undefined);
    listTags().then(setTags).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!isEdit || !id) {
      return;
    }
    setLoading(true);
    getPost(id)
      .then((p) => {
        setForm({
          title: p.title,
          summary: p.summary ?? '',
          content: p.content ?? '',
          coverImage: p.coverImage ?? '',
          categoryId: p.categoryId ?? '',
          tagIds: (p.postTags ?? []).map((pt) => pt.tag.id),
          status: p.status,
        });
      })
      .catch((err) => toast.error(getErrorMessage(err)))
      .finally(() => setLoading(false));
  }, [id, isEdit]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const toggleTag = (tagId: string) => {
    setForm((f) => ({
      ...f,
      tagIds: f.tagIds.includes(tagId)
        ? f.tagIds.filter((t) => t !== tagId)
        : [...f.tagIds, tagId],
    }));
  };

  // 在光标处插入文本（图片 Markdown）
  const insertAtCursor = (text: string) => {
    const el = contentRef.current;
    if (!el) {
      setForm((f) => ({ ...f, content: f.content + text }));
      return;
    }
    const value = el.value;
    const start = el.selectionStart ?? value.length;
    const end = el.selectionEnd ?? start;
    setForm((f) => ({ ...f, content: value.slice(0, start) + text + value.slice(end) }));
    requestAnimationFrame(() => {
      el.focus();
      const pos = start + text.length;
      el.setSelectionRange(pos, pos);
    });
  };

  const onPickFile = async (file: File | undefined, target: 'cover' | 'inline') => {
    if (!file) {
      return;
    }
    // 前端先校验类型与大小（后端仍会二次校验）
    const invalid = validateImageFile(file);
    if (invalid) {
      toast.error(invalid);
      return;
    }
    if (!token) {
      toast.error('请先登录');
      return;
    }
    setUploading(target);
    try {
      const res = await uploadImage(file);
      if (target === 'cover') {
        set('coverImage', res.url);
        toast.success('封面已上传');
      } else {
        insertAtCursor(`\n![图片](${res.url})\n`);
        toast.success('图片已插入正文');
      }
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setUploading('');
    }
  };

  const onSubmit = async (status: PostStatus) => {
    if (!form.title.trim() || !form.content.trim()) {
      toast.error('标题和正文不能为空');
      return;
    }
    if (!token) {
      toast.error('请先登录');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        title: form.title.trim(),
        summary: form.summary.trim() || undefined,
        content: form.content,
        coverImage: form.coverImage.trim() || undefined,
        // 编辑时显式传 null = 清空分类（后端按三态处理）；新建时不传即未分类
        categoryId: form.categoryId ? Number(form.categoryId) : isEdit ? null : undefined,
        tagIds: form.tagIds.map(Number),
        status,
      };
      const saved = isEdit && id ? await updatePost(id, payload) : await createPost(payload);
      toast.success(status === 'published' ? '已发布' : '已保存草稿');
      navigate(`/post/${encodeURIComponent(saved.slug)}`);
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="py-20 text-center text-slate-400">加载中…</div>;
  }

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="mb-5 text-2xl font-bold text-slate-800">
        {isEdit ? '编辑文章' : '写文章'}
      </h1>

      <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-6">
        <input
          value={form.title}
          onChange={(e) => set('title', e.target.value)}
          placeholder="文章标题"
          className="w-full border-b border-slate-200 pb-2 text-xl font-semibold outline-none focus:border-indigo-400"
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm text-slate-600">分类</label>
            <select
              value={form.categoryId}
              onChange={(e) => set('categoryId', e.target.value)}
              className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-400"
            >
              <option value="">未分类</option>
              {categoryOptions.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm text-slate-600">封面图（可上传或填 URL）</label>
            <div className="flex gap-2">
              <input
                value={form.coverImage}
                onChange={(e) => set('coverImage', e.target.value)}
                placeholder="https://… 或点击上传"
                className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-400"
              />
              <button
                type="button"
                disabled={uploading === 'cover'}
                onClick={() => coverInputRef.current?.click()}
                className="shrink-0 rounded-md border border-slate-200 px-3 py-2 text-sm hover:bg-slate-100 disabled:opacity-60"
              >
                {uploading === 'cover' ? '上传中…' : '上传'}
              </button>
            </div>
            {form.coverImage && (
              <img
                src={form.coverImage}
                alt="封面预览"
                className="mt-2 h-24 w-full rounded-md object-cover"
              />
            )}
            <input
              ref={coverInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              className="hidden"
              onChange={(e) => {
                void onPickFile(e.target.files?.[0], 'cover');
                e.target.value = '';
              }}
            />
          </div>
        </div>

        <div>
          <label className="mb-1 block text-sm text-slate-600">摘要（可选）</label>
          <input
            value={form.summary}
            onChange={(e) => set('summary', e.target.value)}
            className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-400"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm text-slate-600">标签（可多选）</label>
          <div className="flex flex-wrap gap-2">
            {tags.length === 0 && <span className="text-sm text-slate-400">暂无标签</span>}
            {tags.map((t) => {
              const active = form.tagIds.includes(t.id);
              return (
                <button
                  type="button"
                  key={t.id}
                  onClick={() => toggleTag(t.id)}
                  className={`rounded-full px-3 py-1 text-sm ${
                    active ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  #{t.name}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <div className="mb-1 flex items-center justify-between">
            <label className="block text-sm text-slate-600">
              正文（Markdown，右侧实时预览）
            </label>
            <button
              type="button"
              disabled={uploading === 'inline'}
              onClick={() => inlineInputRef.current?.click()}
              className="rounded-md border border-slate-200 px-3 py-1 text-xs hover:bg-slate-100 disabled:opacity-60"
            >
              {uploading === 'inline' ? '上传中…' : '＋ 插入图片'}
            </button>
            <input
              ref={inlineInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              className="hidden"
              onChange={(e) => {
                void onPickFile(e.target.files?.[0], 'inline');
                e.target.value = '';
              }}
            />
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <textarea
              ref={contentRef}
              value={form.content}
              onChange={(e) => set('content', e.target.value)}
              placeholder={'# 标题\n\n在这里用 Markdown 写作…'}
              className="h-80 resize-y rounded-md border border-slate-200 p-3 font-mono text-[13px] leading-6 outline-none focus:border-indigo-400"
            />
            <div className="h-80 overflow-y-auto rounded-md border border-slate-200 bg-slate-50 p-4">
              {form.content ? (
                <MarkdownView content={form.content} />
              ) : (
                <span className="text-sm text-slate-400">预览区</span>
              )}
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <button
            type="button"
            disabled={saving}
            onClick={() => onSubmit('draft')}
            className="rounded-md border border-slate-200 px-4 py-2 text-sm hover:bg-slate-100 disabled:opacity-60"
          >
            保存草稿
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => onSubmit('published')}
            className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
          >
            {saving ? '提交中…' : '发布'}
          </button>
        </div>
      </div>
    </div>
  );
}
