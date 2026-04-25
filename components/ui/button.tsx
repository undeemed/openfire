"use client";

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default:
          "bg-orange-600 text-white hover:bg-orange-500 shadow-[0_0_24px_-6px_rgba(234,88,12,0.55)]",
        fire:
          "bg-gradient-to-b from-orange-500 to-red-600 text-white hover:from-orange-400 hover:to-red-500 shadow-[0_0_28px_-4px_rgba(239,68,68,0.65)]",
        secondary:
          "bg-zinc-800 text-zinc-100 hover:bg-zinc-700 border border-zinc-700",
        ghost: "hover:bg-zinc-800/60 text-zinc-200",
        outline:
          "border border-zinc-700 bg-transparent text-zinc-200 hover:bg-zinc-800/40",
        destructive:
          "bg-red-700 text-white hover:bg-red-600",
        success:
          "bg-emerald-700 text-white hover:bg-emerald-600",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-8 px-3 text-xs",
        lg: "h-12 px-6 text-base",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(buttonVariants({ variant, size, className }))}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
