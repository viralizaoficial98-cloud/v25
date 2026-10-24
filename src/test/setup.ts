import '@testing-library/jest-dom/vitest';

// jsdom não implementa estas APIs usadas pelo Framer Motion / componentes
class IO {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() { return []; }
}
globalThis.IntersectionObserver = globalThis.IntersectionObserver ?? (IO as unknown as typeof IntersectionObserver);
window.scrollTo = () => {};
window.matchMedia =
  window.matchMedia ??
  ((q: string) => ({ matches: false, media: q, onchange: null, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent: () => false }));
