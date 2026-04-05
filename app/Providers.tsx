"use client";

import { LanguageProvider } from "@/lib/i18n/LanguageContext";
import ErrorBoundary from "@/components/ErrorBoundary";

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ErrorBoundary>
      <LanguageProvider>{children}</LanguageProvider>
    </ErrorBoundary>
  );
}
