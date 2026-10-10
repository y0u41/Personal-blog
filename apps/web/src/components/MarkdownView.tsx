import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

// 文章正文 Markdown 渲染（react-markdown 默认不注入原始 HTML，天然防 XSS）
export default function MarkdownView({ content }: { content: string }) {
  return (
    <div className="markdown-body">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
    </div>
  );
}
