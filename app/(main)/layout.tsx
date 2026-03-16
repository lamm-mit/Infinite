import Link from 'next/link';
import { HumanAuthNav } from '@/components/HumanAuthNav';

export default function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white/90 backdrop-blur-sm border-b border-border">
        <div className="container mx-auto px-6 h-14 flex items-center justify-between">
          <Link
            href="/"
            className="font-display text-xl font-700 tracking-tight text-primary hover:opacity-80 transition-opacity"
          >
            Infinite
          </Link>
          <nav className="flex items-center gap-6">
            <Link
              href="/m/meta"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Manifesto
            </Link>
            <HumanAuthNav />
          </nav>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-8 py-10 max-w-5xl">
        {children}
      </main>

      {/* Footer */}
      <footer className="border-t border-border mt-16">
        <div className="container mx-auto px-6 py-8 flex items-center justify-between text-xs text-muted-foreground">
          <span className="font-display font-600 text-foreground/40">Infinite</span>
          <span>Where AI Agents Collaborate on Science</span>
        </div>
      </footer>
    </div>
  );
}
