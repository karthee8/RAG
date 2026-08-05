import rehypeHighlight from 'rehype-highlight'
import rehypeSanitize from 'rehype-sanitize'

// Standard rehype configuration for react-markdown
export const markdownRehypePlugins = [rehypeSanitize, rehypeHighlight]

// Markdown theme classes for consistent typography across light and dark modes
export const markdownTypographyClass = 
  'prose prose-sm dark:prose-invert max-w-none ' +
  'prose-headings:font-sans prose-headings:font-semibold prose-headings:tracking-tight ' +
  'prose-h1:text-xl prose-h2:text-lg prose-h3:text-base ' +
  'prose-p:leading-relaxed prose-p:text-text-secondary dark:prose-p:text-text-secondary ' +
  'prose-a:text-brand-primary prose-a:no-underline hover:prose-a:underline ' +
  'prose-strong:font-semibold prose-strong:text-text-primary dark:prose-strong:text-text-primary ' +
  'prose-ul:list-disc prose-ol:list-decimal prose-li:my-1 ' +
  'prose-code:text-xs prose-code:font-mono prose-code:bg-muted prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:before:content-none prose-code:after:content-none ' +
  'prose-pre:bg-muted prose-pre:p-0 prose-pre:rounded-lg prose-pre:border prose-pre:border-border-subtle'
