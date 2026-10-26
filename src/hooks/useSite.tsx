import { createContext, useContext, useEffect, useMemo, type ReactNode } from 'react';
import { fetchSite } from '@/lib/api';
import { DEFAULT_ORDER, DEFAULT_SITE, type SectionKey, type SiteContent } from '@/lib/siteDefaults';
import { useAsync } from './useAsync';

interface Ctx {
  content: SiteContent;
  /** Secções visíveis, pela ordem definida no painel */
  order: SectionKey[];
  enabled: (key: SectionKey) => boolean;
  preview: boolean;
  previewError: boolean;
  loading: boolean;
}

const SiteContext = createContext<Ctx>({
  content: DEFAULT_SITE,
  order: DEFAULT_ORDER,
  enabled: () => true,
  preview: false,
  previewError: false,
  loading: false,
});

/** Pré-visualização de rascunhos: /?preview=1 com sessão de quem gere o site. */
export function isPreviewRequested() {
  try {
    return new URLSearchParams(window.location.search).get('preview') === '1';
  } catch {
    return false;
  }
}

function setMeta(selector: string, attr: 'name' | 'property', key: string, value: string) {
  if (!value) return;
  let el = document.head.querySelector<HTMLMetaElement>(selector);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute('content', value);
}

export function SiteProvider({ children }: { children: ReactNode }) {
  const wantPreview = isPreviewRequested();
  const { data, loading, error } = useAsync(async () => {
    if (wantPreview) {
      try {
        return { ...(await fetchSite(true)), previewError: false };
      } catch {
        return { ...(await fetchSite(false)), previewError: true };
      }
    }
    return { ...(await fetchSite(false)), previewError: false };
  }, []);

  const value = useMemo<Ctx>(() => {
    const content: SiteContent = structuredClone(DEFAULT_SITE);
    const visible = new Map<SectionKey, boolean>();
    let order: SectionKey[] = DEFAULT_ORDER;
    if (data && !error) {
      order = data.sections.map((s) => s.key as SectionKey).filter((k) => k in DEFAULT_SITE);
      for (const s of data.sections) {
        const key = s.key as SectionKey;
        if (!(key in content)) continue;
        // Os campos em falta mantêm o valor oficial por omissão
        (content as unknown as Record<string, unknown>)[key] = { ...(DEFAULT_SITE[key] as object), ...(s.data as object) };
        visible.set(key, s.enabled);
      }
    }
    return {
      content,
      order,
      enabled: (k) => visible.get(k) ?? true,
      preview: Boolean(data?.preview),
      previewError: Boolean(data?.previewError),
      loading,
    };
  }, [data, error, loading]);

  // SEO gerível no painel (título, descrição e imagem de partilha)
  useEffect(() => {
    const seo = value.content.seo;
    if (seo.meta_title) document.title = seo.meta_title;
    setMeta('meta[name="description"]', 'name', 'description', seo.meta_description);
    setMeta('meta[property="og:title"]', 'property', 'og:title', seo.meta_title);
    setMeta('meta[property="og:description"]', 'property', 'og:description', seo.meta_description);
  }, [value.content.seo]);

  return <SiteContext.Provider value={value}>{children}</SiteContext.Provider>;
}

export const useSite = () => useContext(SiteContext);
