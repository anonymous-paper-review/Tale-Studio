import type { Metadata } from 'next'
import { LegalPage } from '@/components/legal/legal-page'
import { LEGAL_DOCUMENTS } from '@/lib/legal/documents'

export const metadata: Metadata = {
  title: 'Refunds & cancellation | Tale Studio',
  alternates: { canonical: 'https://talestudio.art/refund' },
}

export default function RefundPage() {
  return <LegalPage document={LEGAL_DOCUMENTS.refund} />
}
