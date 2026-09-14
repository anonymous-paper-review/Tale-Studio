import { footerMarkdown } from '@/content/legal/footer'
import { LegalMarkdown } from '@/components/legal/legal-markdown'

export function LegalFooter() {
  return (
    <nav aria-label="Legal and business information" lang="en" className="text-muted-foreground">
      <LegalMarkdown markdown={footerMarkdown} compact />
    </nav>
  )
}
