import { Link } from 'react-router-dom';
import { buttonVariants } from '@/components/ui/button';

export default function NotFound() {
  return (
    <div className="container flex min-h-[70vh] flex-col items-center justify-center pt-28 text-center">
      <p className="font-display text-8xl text-gold-metal">404</p>
      <h1 className="mt-4 text-3xl">Página não encontrada</h1>
      <Link to="/" className={buttonVariants({ className: 'mt-8' })}>Voltar ao início</Link>
    </div>
  );
}
