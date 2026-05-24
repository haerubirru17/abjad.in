import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { ShieldCheck, ExternalLink } from 'lucide-react';

export default function Header() {
  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto px-4 h-16 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2 group">
          <ShieldCheck className="h-7 w-7 text-primary group-hover:scale-110 transition-transform" />
          <span className="font-heading font-bold text-2xl text-primary tracking-tight">Abjad.in</span>
        </Link>
        <nav className="hidden md:flex gap-8">
          <Link href="#fitur" className="text-sm font-semibold text-foreground/80 hover:text-primary transition-colors">Fitur</Link>
          <Link href="#tentang" className="text-sm font-semibold text-foreground/80 hover:text-primary transition-colors">Tentang</Link>
          <Link href="#teknologi" className="text-sm font-semibold text-foreground/80 hover:text-primary transition-colors">Teknologi</Link>
        </nav>
        <div className="flex items-center gap-4">
          <Link href="https://github.com/haerubirru17/abjad.in" target="_blank" rel="noopener noreferrer">
            <Button variant="ghost" className="gap-2 text-foreground/70 hover:text-primary hover:bg-primary/10 font-semibold">
              <ExternalLink className="w-4 h-4" />
              <span className="hidden sm:inline">Source Code</span>
            </Button>
          </Link>
        </div>
      </div>
    </header>
  );
}

