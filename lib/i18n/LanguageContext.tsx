"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { type Locale, LOCALES, translations } from "./translations";

type LanguageContextType = {
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: typeof translations.fr;
};

const LanguageContext = createContext<LanguageContextType>({
  locale: "fr",
  setLocale: () => {},
  t: translations.fr,
});

function detectBrowserLocale(): Locale {
  if (typeof window === "undefined") return "fr";
  const lang = navigator.language?.slice(0, 2).toLowerCase();
  if (LOCALES.includes(lang as Locale)) return lang as Locale;
  return "fr";
}

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>("fr");

  useEffect(() => {
    const stored = localStorage.getItem("rankpill_locale") as Locale | null;
    if (stored && LOCALES.includes(stored)) {
      setLocaleState(stored);
    } else {
      setLocaleState(detectBrowserLocale());
    }
  }, []);

  function setLocale(l: Locale) {
    setLocaleState(l);
    localStorage.setItem("rankpill_locale", l);
  }

  return (
    <LanguageContext.Provider value={{ locale, setLocale, t: translations[locale] }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  return useContext(LanguageContext);
}
