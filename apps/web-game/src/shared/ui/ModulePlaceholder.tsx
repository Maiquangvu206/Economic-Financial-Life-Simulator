import type { ReactNode } from 'react';
import { PageHeader } from '@efls/ui';

export interface ModulePlaceholderProps {
  title: string;
  description: string;
  capabilities: Array<{ title: string; body: string }>;
  status?: string;
  children?: ReactNode;
}

export function ModulePlaceholder({
  title,
  description,
  capabilities,
  status = 'Scaffold',
  children,
}: ModulePlaceholderProps) {
  return (
    <div className="space-y-5">
      <PageHeader
        title={title}
        description={description}
        actions={
          <span className="rounded-full border border-slate-700 px-2.5 py-1 text-[11px] text-slate-400">
            {status}
          </span>
        }
      />

      {children}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {capabilities.map((capability) => (
          <article key={capability.title} className="panel">
            <h2 className="panel-title">{capability.title}</h2>
            <p className="mt-1 text-xs leading-relaxed text-slate-500">{capability.body}</p>
          </article>
        ))}
      </div>
    </div>
  );
}
