import { useCallback, useEffect, useState } from 'react';
import type { Comment, CommentTreeNode } from '@blog/shared';
import { createComment, deleteComment, listComments } from '../api/comments';
import { getErrorMessage } from '../api/client';
import { formatDate } from '../lib/format';
import { useAuthStore } from '../store/auth';
import { toast } from '../store/toast';

interface Props {
  slug: string;
}

function displayAuthor(c: Comment): string {
  if (c.user) {
    return c.user.displayName || c.user.username;
  }
  return c.authorName || '匿名';
}

export default function CommentSection({ slug }: Props) {
  const currentUser = useAuthStore((s) => s.user);
  const [items, setItems] = useState<CommentTreeNode[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  const [content, setContent] = useState('');
  const [authorName, setAuthorName] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [replyContent, setReplyContent] = useState('');

  const reload = useCallback(() => {
    setLoading(true);
    listComments(slug)
      .then((res) => {
        setItems(res.items);
        setTotal(res.total);
      })
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, [slug]);

  useEffect(() => {
    reload();
  }, [reload]);

  const submit = async (text: string, parentId?: string) => {
    if (!text.trim()) {
      toast.error('评论内容不能为空');
      return;
    }
    if (!currentUser && authorName.trim().length < 2) {
      toast.error('请填写昵称（2-30 字）');
      return;
    }
    setSubmitting(true);
    try {
      const created = await createComment(slug, {
        content: text.trim(),
        parentId: parentId ? Number(parentId) : undefined,
        authorName: currentUser ? undefined : authorName.trim(),
      });
      toast.success(
        created.status === 'approved'
          ? '评论已发布'
          : '评论已提交，审核通过后展示',
      );
      setContent('');
      setReplyContent('');
      setReplyTo(null);
      reload();
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  const remove = async (c: CommentTreeNode) => {
    if (!window.confirm('确定删除这条评论吗？')) {
      return;
    }
    try {
      await deleteComment(c.id);
      toast.success('已删除');
      reload();
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  const canDelete = (c: CommentTreeNode) =>
    currentUser != null && (currentUser.role === 'admin' || c.userId === currentUser.id);

  const renderNode = (node: CommentTreeNode, depth: number) => (
    <li key={node.id} className={depth > 0 ? 'mt-3 border-l-2 border-slate-100 pl-4' : 'mt-5'}>
      <div className="text-sm">
        <span className="font-medium text-slate-700">{displayAuthor(node)}</span>
        <span className="ml-2 text-xs text-slate-400">{formatDate(node.createdAt)}</span>
      </div>
      <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-slate-600">
        {node.content}
      </p>
      <div className="mt-1 flex gap-3 text-xs text-slate-400">
        {depth === 0 && (
          <button
            type="button"
            className="hover:text-indigo-600"
            onClick={() => {
              setReplyTo(replyTo === node.id ? null : node.id);
              setReplyContent('');
            }}
          >
            回复
          </button>
        )}
        {canDelete(node) && (
          <button type="button" className="hover:text-red-500" onClick={() => remove(node)}>
            删除
          </button>
        )}
      </div>

      {replyTo === node.id && (
        <div className="mt-2">
          <textarea
            value={replyContent}
            onChange={(e) => setReplyContent(e.target.value)}
            rows={2}
            placeholder="回复…"
            className="w-full rounded-md border border-slate-200 p-2 text-sm outline-none focus:border-indigo-400"
          />
          <div className="mt-1 flex justify-end gap-2">
            <button
              type="button"
              className="text-xs text-slate-400 hover:text-slate-600"
              onClick={() => setReplyTo(null)}
            >
              取消
            </button>
            <button
              type="button"
              disabled={submitting}
              className="rounded-md bg-indigo-600 px-3 py-1 text-xs text-white hover:bg-indigo-700 disabled:opacity-60"
              onClick={() => submit(replyContent, node.id)}
            >
              回复
            </button>
          </div>
        </div>
      )}

      {node.children.length > 0 && <ul>{node.children.map((ch) => renderNode(ch, depth + 1))}</ul>}
    </li>
  );

  return (
    <section className="mt-10 border-t border-slate-200 pt-8">
      <h2 className="mb-4 text-lg font-semibold text-slate-800">
        评论 {total > 0 && <span className="text-sm text-slate-400">({total})</span>}
      </h2>

      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
        {currentUser ? (
          <div className="mb-2 text-sm text-slate-500">
            以 <span className="font-medium text-slate-700">
              {currentUser.displayName || currentUser.username}
            </span>{' '}
            的身份评论
          </div>
        ) : (
          <input
            value={authorName}
            onChange={(e) => setAuthorName(e.target.value)}
            placeholder="昵称（2-30 字，游客必填）"
            className="mb-2 w-full rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-400"
          />
        )}
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={3}
          placeholder="说点什么…（支持纯文本）"
          className="w-full rounded-md border border-slate-200 p-3 text-sm outline-none focus:border-indigo-400"
        />
        <div className="mt-2 flex items-center justify-between">
          <span className="text-xs text-slate-400">
            游客与读者评论需经管理员审核后显示
          </span>
          <button
            type="button"
            disabled={submitting}
            onClick={() => submit(content)}
            className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
          >
            {submitting ? '提交中…' : '发表评论'}
          </button>
        </div>
      </div>

      {loading ? (
        <div className="py-8 text-center text-sm text-slate-400">评论加载中…</div>
      ) : items.length === 0 ? (
        <div className="py-8 text-center text-sm text-slate-400">
          还没有评论，来抢沙发～
        </div>
      ) : (
        <ul>{items.map((node) => renderNode(node, 0))}</ul>
      )}
    </section>
  );
}
