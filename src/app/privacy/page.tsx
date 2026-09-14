import type { Metadata } from 'next'
import { LegalPage } from '@/components/legal/legal-page'
import { LEGAL_DOCUMENTS } from '@/lib/legal/documents'

export const metadata: Metadata = {
  title: 'Privacy policy | Tale Studio',
  alternates: { canonical: 'https://talestudio.art/privacy' },
}

export default function PrivacyPage() {
  return <LegalPage document={LEGAL_DOCUMENTS.privacy} />
}
