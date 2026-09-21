import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { SiteHeader } from '@/components/marketing/site-header'
import { SiteFooter } from '@/components/marketing/site-footer'
import { LegalMarkdown } from '@/components/legal/legal-markdown'
import { LEGAL_LINKS, type LegalDocument } from '@/lib/legal/documents'

export function LegalPage({ document }: { document: LegalDocument }) {
  return (
    <div lang="en" className="flex min-h-screen flex-col bg-background text-foreground">
      <SiteHeader />
      <main className="mx-auto w-full max-w-6xl flex-1 px-6 pb-20 pt-32">
        <div className="mb-8 flex items-center justify-between gap-4 border-b border-border pb-6">
          <p className="text-sm font-medium text-muted-foreground">Legal</p>
          <Link href="/pricing" className="flex min-h-12 items-center gap-2 rounded-md text-sm transition-colors hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring">
            <ArrowLeft className="size-4" aria-hidden="true" /> Back to pricing
          </Link>
        </div>
        <div className="grid min-w-0 gap-10 lg:grid-cols-[14rem_minmax(0,1fr)] lg:gap-12">
          <aside>
            <nav aria-label="Policies" className="flex flex-col gap-2 lg:sticky lg:top-24">
              {LEGAL_LINKS.map(link => (
                <Link key={link.id} href={link.href} aria-current={link.id === document.id ? 'page' : undefined}
                  className={`flex min-h-12 items-center rounded-lg border px-4 py-3 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring ${link.id === document.id ? 'border-border bg-muted font-medium text-foreground' : 'border-transparent text-muted-foreground hover:border-border hover:text-foreground'}`}>
                  {link.label}
                </Link>
              ))}
            </nav>
          </aside>
          <article className="min-w-0" aria-label={document.title}>
            <LegalMarkdown markdown={document.markdown} />
          </article>
        </div>
      </main>
      <SiteFooter />
    </div>
  )
}
