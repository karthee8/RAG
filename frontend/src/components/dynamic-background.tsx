'use client';

import dynamic from 'next/dynamic';

const KnowledgeUniverseBackground = dynamic(
  () => import('./knowledge-universe-background'),
  { ssr: false }
);

export function DynamicBackground() {
  return <KnowledgeUniverseBackground />;
}
