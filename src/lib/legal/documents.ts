import { termsMarkdown } from '@/content/legal/terms'
import { refundMarkdown } from '@/content/legal/refund'
import { privacyMarkdown } from '@/content/legal/privacy'

export const LEGAL_LINKS = [
  { id: 'terms', href: '/terms', label: 'Terms of service' },
  { id: 'refund', href: '/refund', label: 'Refunds & cancellation' },
  { id: 'privacy', href: '/privacy', label: 'Privacy policy' },
] as const

export type LegalDocumentId = (typeof LEGAL_LINKS)[number]['id']
export type LegalDocument = {
  id: LegalDocumentId
  title: string
  sourceFile: string
  markdown: string
}

export const LEGAL_DOCUMENTS: Record<LegalDocumentId, LegalDocument> = {
  terms: { id: 'terms', title: 'Terms of Service', sourceFile: 'terms-of-service.md', markdown: termsMarkdown },
  refund: { id: 'refund', title: 'Refund & Cancellation Policy', sourceFile: 'refund-policy.md', markdown: refundMarkdown },
  privacy: { id: 'privacy', title: 'Privacy Policy', sourceFile: 'privacy-policy.md', markdown: privacyMarkdown },
}
