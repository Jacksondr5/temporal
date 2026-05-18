"use client";

import { Button as ButtonPrimitive } from "@base-ui/react/button";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "../../lib/utils";

const buttonVariants = cva(
  "group/button font-chrome inline-flex shrink-0 items-center justify-center border border-transparent bg-clip-padding text-[11px] font-bold uppercase tracking-[0.18em] whitespace-nowrap transition-colors duration-[180ms] outline-none select-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:outline-destructive [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default:
          "border-primary bg-primary text-primary-foreground [a]:hover:border-[oklch(0.88_0.16_75)] [a]:hover:bg-[oklch(0.88_0.16_75)] hover:border-[oklch(0.88_0.16_75)] hover:bg-[oklch(0.88_0.16_75)]",
        outline:
          "border-border-strong bg-transparent text-foreground hover:border-primary hover:text-primary aria-expanded:border-primary aria-expanded:text-primary",
        secondary:
          "border-border bg-secondary text-secondary-foreground hover:border-border-strong hover:bg-surface-panel-hover aria-expanded:bg-surface-panel-hover aria-expanded:text-secondary-foreground",
        ghost:
          "bg-transparent text-cream-dim hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground",
        destructive:
          "border-destructive bg-destructive/10 text-destructive hover:bg-destructive/20 focus-visible:outline-destructive",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default:
          "h-9 gap-1.5 px-5 has-data-[icon=inline-end]:pr-4 has-data-[icon=inline-start]:pl-4",
        xs: "h-6 gap-1 px-2 text-[10px] has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-7 gap-1 px-3 text-[10px] has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2 [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-9 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
        icon: "size-8",
        "icon-xs": "size-6 [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-7",
        "icon-lg": "size-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
