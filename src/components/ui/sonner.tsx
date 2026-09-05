import { Toaster as Sonner } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      className="toaster group"
      position="top-center"
      duration={2200}
      closeButton
      offset={16}
      toastOptions={{
        classNames: {
          toast:
            "group toast pointer-events-auto relative overflow-hidden rounded-xl border border-primary/30 bg-background/90 text-foreground shadow-[0_10px_40px_-12px_color-mix(in_oklab,var(--primary)_45%,transparent)] backdrop-blur-md before:absolute before:inset-y-0 before:left-0 before:w-1 before:bg-primary pr-10",
          title: "font-semibold tracking-tight",
          description: "group-[.toast]:text-muted-foreground",
          icon: "group-[.toast]:text-primary",
          success: "group-[.toaster]:border-primary/40",
          error:
            "group-[.toaster]:border-destructive/50 group-[.toaster]:before:bg-destructive group-[.toaster]:[&_[data-icon]]:text-destructive",
          actionButton:
            "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground group-[.toast]:rounded-md",
          cancelButton: "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
          closeButton:
            "!left-auto !right-2 !top-2 !translate-x-0 !translate-y-0 h-7 w-7 min-h-[28px] min-w-[28px] rounded-lg border border-foreground/20 bg-background/80 text-foreground/80 opacity-100 shadow-sm backdrop-blur-sm transition-colors hover:bg-primary hover:text-primary-foreground hover:border-primary/50 hover:scale-105 active:scale-95 flex items-center justify-center [&>svg]:h-4 [&>svg]:w-4 [&>svg]:stroke-[2.5]",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
