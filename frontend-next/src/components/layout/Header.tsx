import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { ShieldCheck } from 'lucide-react';

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
          <Link href="#api" className="text-sm font-semibold text-foreground/80 hover:text-primary transition-colors">API & Integrasi</Link>
        </nav>
        <div className="flex items-center gap-4">
          <Button variant="ghost" className="text-primary hover:text-primary hover:bg-primary/10 font-semibold">Masuk</Button>
          <Button className="bg-primary text-primary-foreground hover:bg-primary/90 font-semibold shadow-md">Daftar</Button>
        </div>
      </div>
    </header>
  );
}
