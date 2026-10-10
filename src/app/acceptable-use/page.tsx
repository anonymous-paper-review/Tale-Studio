import type { Metadata } from 'next'
import { LegalPage } from '@/components/legal/legal-page'
import { LEGAL_DOCUMENTS } from '@/lib/legal/documents'

export const metadata: Metadata = {
  title: 'Acceptable use policy | Tale Studio',
  alternates: { canonical: 'https://talestudio.art/acceptable-use' },
}

export default function AcceptableUsePage() {
  return <LegalPage document={LEGAL_DOCUMENTS['acceptable-use']} />
}
