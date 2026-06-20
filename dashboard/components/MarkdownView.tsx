import { marked } from 'marked';
import clsx from 'clsx';

export interface MarkdownViewProps {
  source: string;
  className?: string;
}

marked.setOptions({
  gfm: true,
  breaks: true,
});

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function stripDangerous(html: string): string {
  // Strip <script>, <style>, <iframe>, on* attributes, javascript: URLs.
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, '')
    .replace(/\son\w+\s*=\s*"[^"]*"/gi, '')
    .replace(/\son\w+\s*=\s*'[^']*'/gi, '')
    .replace(/javascript:/gi, '');
}

export function MarkdownView({ source, className }: MarkdownViewProps) {
  let html: string;
  try {
    html = marked.parse(source ?? '', { async: false }) as string;
    html = stripDangerous(html);
  } catch {
    html = `<pre>${escapeHtml(source ?? '')}</pre>`;
  }

  return (
    <div
      className={clsx(
        'prose prose-invert max-w-none text-sm text-text-base/90 leading-relaxed',
        'prose-headings:text-text-base prose-headings:font-semibold prose-headings:tracking-tight',
        'prose-p:text-text-base/90 prose-li:text-text-base/90',
        'prose-a:text-accent prose-a:no-underline hover:prose-a:underline',
        'prose-strong:text-text-base',
        'prose-code:text-accent-2 prose-code:bg-code-bg prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-[13px] prose-code:before:hidden prose-code:after:hidden',
        'prose-pre:bg-code-bg prose-pre:border prose-pre:border-border prose-pre:rounded-lg',
        'prose-blockquote:border-l-accent prose-blockquote:text-text-dim prose-blockquote:font-normal',
        'prose-hr:border-border',
        'prose-th:text-text-base prose-td:text-text-base/90',
        className
      )}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

export default MarkdownView;
