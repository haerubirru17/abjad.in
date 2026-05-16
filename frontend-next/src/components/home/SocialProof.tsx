'use client';

import { motion } from 'framer-motion';
import { Card, CardContent } from '@/components/ui/card';

export default function SocialProof() {
  const testimonials = [
    {
      quote: "Sangat membantu! Saya hampir saja tertipu link undian palsu yang dikirim via WhatsApp. Abjad.in langsung mendeteksinya sebagai phishing.",
      author: "Budi Santoso",
      role: "Wiraswasta"
    },
    {
      quote: "Alat wajib untuk orang tua. Saya selalu mengecek link game yang dimainkan anak saya untuk memastikan tidak ada unsur judi online (judol).",
      author: "Siti Rahma",
      role: "Ibu Rumah Tangga"
    },
    {
      quote: "Sebagai admin IT, saya merekomendasikan Abjad.in ke seluruh karyawan perusahaan untuk memfilter email berbahaya. AI-nya sangat akurat.",
      author: "Hendra Wijaya",
      role: "IT Security"
    }
  ];

  return (
    <section className="py-24 bg-muted/30">
      <div className="container mx-auto px-4">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-bold font-heading text-foreground mb-4">Dipercaya oleh Ribuan Orang</h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">Kami berkomitmen menciptakan internet yang lebih aman untuk semua orang di Indonesia.</p>
        </div>
        
        <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto">
          {testimonials.map((t, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1, duration: 0.5 }}
            >
              <Card className="h-full bg-card hover:shadow-xl transition-all duration-300 border-border/50 hover:border-primary/20 hover:-translate-y-1">
                <CardContent className="p-8 flex flex-col justify-between h-full">
                  <p className="text-foreground/80 italic mb-8 leading-relaxed">"{t.quote}"</p>
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-xl">
                      {t.author.charAt(0)}
                    </div>
                    <div>
                      <p className="font-bold text-foreground font-heading">{t.author}</p>
                      <p className="text-sm font-medium text-primary">{t.role}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
