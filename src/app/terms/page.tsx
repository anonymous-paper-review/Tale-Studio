import type { Metadata } from 'next'
import { LegalPage } from '@/components/legal/legal-page'
import { LEGAL_DOCUMENTS } from '@/lib/legal/documents'

export const metadata: Metadata = {
  title: 'Terms of service | Tale Studio',
  alternates: { canonical: 'https://talestudio.art/terms' },
}

export default function TermsPage() {
  return <LegalPage document={LEGAL_DOCUMENTS.terms} />
}
