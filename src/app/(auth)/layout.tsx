import { ModeToggle } from "@/components/app/mode-toggle";

// Auth shell (UI_BUILD_PLAN §4.5): muted ambient background with a floating
// ModeToggle top-right. Individual auth pages own their centered card content.
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-screen bg-muted/30">
      <div className="absolute right-4 top-4 z-10">
        <ModeToggle />
      </div>
      {children}
    </div>
  );
}
