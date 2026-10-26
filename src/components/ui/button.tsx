import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/cn';

export const buttonVariants = cva(
  'relative inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full font-semibold tracking-wide transition-all duration-300 disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2 focus-visible:ring-offset-paper',
  {
    variants: {
      variant: {
        // Dourado com texto escuro (contraste AA) — CTA principal
        gold: 'bg-gold-button bg-[length:200%_auto] font-bold text-fg shadow-glow hover:bg-[position:100%_0] hover:shadow-[0_14px_36px_-12px_rgba(154,116,50,.6)] hover:-translate-y-0.5',
        dark: 'bg-fg text-paper shadow-soft hover:bg-fg/90 hover:-translate-y-0.5',
        outline: 'border border-fg/20 bg-paper text-fg hover:border-gold hover:text-gold-deep',
        ghost: 'text-fg/80 hover:bg-fg/5 hover:text-fg',
        subtle: 'bg-fg/5 text-fg ring-1 ring-fg/10 hover:bg-fg/10',
        danger: 'bg-rose-600/90 text-white hover:bg-rose-500',
        success: 'bg-emerald-600/90 text-white hover:bg-emerald-500',
      },
      size: {
        sm: 'h-9 px-4 text-xs',
        md: 'h-11 px-6 text-sm',
        lg: 'min-h-14 whitespace-normal px-6 py-3 text-center text-sm uppercase leading-snug tracking-[0.14em] sm:px-8 sm:tracking-[0.18em]',
        icon: 'h-10 w-10',
      },
    },
    defaultVariants: { variant: 'gold', size: 'md' },
  },
);

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, loading, disabled, children, type = 'button', ...props }, ref) => (
    <button
      ref={ref}
      type={type}
      className={cn(buttonVariants({ variant, size }), className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
      {children}
    </button>
  ),
);
Button.displayName = 'Button';
