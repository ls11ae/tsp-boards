import { useMemo } from 'react';
import { useStore, type Language } from '../store';
import { de } from './de';
import { en, type Messages } from './en';

const MESSAGES: Record<Language, Messages> = { en, de };

export function useT(): Messages {
  const lang = useStore((s) => s.lang);
  return MESSAGES[lang];
}

export interface Formatters {
  readonly lang: Language;
  /** Number with a fixed number of decimals in the current language. */
  number(value: number, decimals?: number): string;
  integer(value: number): string;
}

export function useFormat(): Formatters {
  const lang = useStore((s) => s.lang);
  return useMemo(() => {
    const locale = lang === 'de' ? 'de-DE' : 'en-GB';
    const cache = new Map<number, Intl.NumberFormat>();
    const fmt = (decimals: number) => {
      let f = cache.get(decimals);
      if (!f) {
        f = new Intl.NumberFormat(locale, {
          minimumFractionDigits: decimals,
          maximumFractionDigits: decimals,
        });
        cache.set(decimals, f);
      }
      return f;
    };
    return {
      lang,
      number: (value, decimals = 1) => fmt(decimals).format(value),
      integer: (value) => fmt(0).format(Math.round(value)),
    };
  }, [lang]);
}
