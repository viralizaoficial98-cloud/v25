import { lazy, Suspense, useEffect } from 'react';
import { BrowserRouter, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { MotionConfig } from 'framer-motion';
import { Navbar } from '@/components/site/Navbar';
import { Footer } from '@/components/site/Footer';
import { Spinner } from '@/components/ui/misc';
import { SettingsProvider } from '@/hooks/useSettings';
import Landing from '@/pages/Landing';

const Checkout = lazy(() => import('@/pages/Checkout'));
const OrderPage = lazy(() => import('@/pages/OrderPage'));
const Lookup = lazy(() => import('@/pages/Lookup'));
const Legal = lazy(() => import('@/pages/Legal'));
const NotFound = lazy(() => import('@/pages/NotFound'));
const AdminApp = lazy(() => import('@/admin/AdminApp'));

function ScrollManager() {
  const { pathname, hash } = useLocation();
  useEffect(() => {
    if (hash && !hash.startsWith('#t=')) {
      const id = decodeURIComponent(hash.slice(1));
      // Espera pela renderização da secção (páginas carregadas de forma diferida)
      const t = setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' }), 80);
      return () => clearTimeout(t);
    }
    window.scrollTo({ top: 0 });
  }, [pathname, hash]);
  return null;
}

function PublicLayout() {
  return (
    <>
      <Navbar />
      <main id="conteudo">
        <Suspense fallback={<div className="flex min-h-[60vh] items-center justify-center pt-24"><Spinner /></div>}>
          <Outlet />
        </Suspense>
      </main>
      <Footer />
    </>
  );
}

export default function App() {
  return (
    <MotionConfig reducedMotion="user">
      <SettingsProvider>
        <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, '') || '/'}>
          <ScrollManager />
          <Routes>
            <Route element={<PublicLayout />}>
              <Route index element={<Landing />} />
              <Route path="checkout" element={<Checkout />} />
              <Route path="pedido/:code" element={<OrderPage />} />
              <Route path="consultar" element={<Lookup />} />
              <Route path="privacidade" element={<Legal kind="privacidade" />} />
              <Route path="termos" element={<Legal kind="termos" />} />
              <Route path="*" element={<NotFound />} />
            </Route>
            <Route
              path="admin/*"
              element={
                <Suspense fallback={<div className="flex min-h-screen items-center justify-center"><Spinner /></div>}>
                  <AdminApp />
                </Suspense>
              }
            />
          </Routes>
        </BrowserRouter>
      </SettingsProvider>
    </MotionConfig>
  );
}
