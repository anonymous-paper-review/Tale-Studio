import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'SVC Pipeline Experiment',
  description: 'S→V→C linear pipeline test harness',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
