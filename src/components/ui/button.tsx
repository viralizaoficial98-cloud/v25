import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/cn';

export const buttonVariants = cva(
  'relative inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full font-semibold tracking-wide transition-all duration-300 disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-light focus-visible:ring-offset-2 focus-visible:ring-offset-ink',
  {
    variants: {
      variant: {
        gold: 'bg-gold-metal bg-[length:200%_auto] text-ink shadow-glow hover:bg-[position:100%_0] hover:shadow-[0_0_0_1px_rgba(232,207,142,.5),0_24px_60px_-18px_rgba(201,164,92,.6)]',
        outline: 'border border-gold/50 text-gold-light hover:border-gold-light hover:bg-gold/10',
        ghost: 'text-cream/80 hover:bg-white/5 hover:text-cream',
        subtle: 'bg-white/5 text-cream ring-1 ring-white/10 hover:bg-white/10',
        danger: 'bg-rose-600/90 text-white hover:bg-rose-500',
        success: 'bg-emerald-600/90 text-white hover:bg-emerald-500',
      },
      size: {
        sm: 'h-9 px-4 text-xs',
        md: 'h-11 px-6 text-sm',
        lg: 'h-14 px-8 text-sm uppercase tracking-[0.18em]',
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
