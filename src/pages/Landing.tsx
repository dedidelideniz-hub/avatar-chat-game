import { Button } from "@/components/ui/button";
import { AvatarPreview } from "@/components/avatar/AvatarPreview";
import {
  ArrowRight,
  Gamepad2,
  Map,
  MessageCircle,
  Palette,
  Sparkles,
  Users2,
} from "lucide-react";
import { motion } from "framer-motion";
import { Link } from "react-router";

const fadeUp = {
  initial: { opacity: 0, y: 24 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: "-80px" },
  transition: { duration: 0.55, ease: "easeOut" as const },
};

function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 44 44" className={className} aria-hidden="true">
      <rect x="1" y="1" width="42" height="42" rx="12" fill="#ff6b4a" />
      <circle cx="22" cy="20" r="12" fill="#ffd1a3" />
      <path d="M10 20 C10 7 34 7 34 20 C28 12 16 12 10 20 Z" fill="#6b4423" />
      <circle cx="18.5" cy="21" r="1.7" fill="#2b2320" />
      <circle cx="25.5" cy="21" r="1.7" fill="#2b2320" />
      <path
        d="M18.5 25 Q22 28.5 25.5 25"
        stroke="#2b2320"
        strokeWidth="1.6"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}

function GameLogo({ className }: { className?: string }) {
  return (
    <div className={`flex items-center gap-2.5 ${className ?? ""}`}>
      <LogoMark className="size-9" />
      <div className="flex flex-col leading-none">
        <span className="text-xl font-extrabold tracking-tight">Sanalika</span>
        <span className="mt-1 text-[9px] font-extrabold uppercase tracking-[0.22em] text-primary">
          Avatar Chat
        </span>
      </div>
    </div>
  );
}

/** Decorative stylized plaza scene with three avatars. */
function WorldScene({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 420 380"
      className={className}
      role="img"
      aria-label="Sanalikaaa dünyasından bir sahne"
    >
      <defs>
        <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffe4c2" />
          <stop offset="100%" stopColor="#fff6ea" />
        </linearGradient>
      </defs>

      {/* sky */}
      <rect width="420" height="380" fill="url(#sky)" />

      {/* sun */}
      <circle cx="356" cy="64" r="30" fill="#ffc53d" />
      <circle cx="356" cy="64" r="20" fill="#ffd96b" />

      {/* clouds */}
      <g fill="#ffffff" opacity="0.85">
        <ellipse cx="80" cy="58" rx="30" ry="12" />
        <ellipse cx="104" cy="52" rx="22" ry="10" />
        <ellipse cx="230" cy="92" rx="34" ry="12" />
        <ellipse cx="262" cy="84" rx="24" ry="10" />
      </g>

      {/* grass */}
      <rect x="0" y="248" width="420" height="132" fill="#aee571" />
      <rect x="0" y="300" width="420" height="80" fill="#9bd95c" opacity="0.55" />
      <ellipse cx="210" cy="372" rx="180" ry="24" fill="#ecd3a2" />

      {/* trees */}
      <g>
        <rect x="54" y="212" width="14" height="42" rx="5" fill="#8a5a33" />
        <circle cx="61" cy="194" r="26" fill="#5cb85c" />
        <circle cx="46" cy="206" r="16" fill="#6cc96c" />
        <circle cx="76" cy="206" r="16" fill="#4fae4f" />
      </g>
      <g>
        <rect x="352" y="220" width="12" height="34" rx="4" fill="#8a5a33" />
        <circle cx="358" cy="204" r="22" fill="#5cb85c" />
        <circle cx="345" cy="214" r="14" fill="#6cc96c" />
        <circle cx="371" cy="214" r="14" fill="#4fae4f" />
      </g>

      {/* bushes + flowers */}
      <g fill="#7cc74f">
        <circle cx="150" cy="262" r="15" />
        <circle cx="170" cy="269" r="12" />
        <circle cx="290" cy="266" r="14" />
        <circle cx="312" cy="273" r="11" />
      </g>
      <g>
        <circle cx="112" cy="272" r="4" fill="#ff8fb3" />
        <circle cx="238" cy="302" r="4" fill="#ffd166" />
        <circle cx="196" cy="330" r="4" fill="#ff8fb3" />
        <circle cx="330" cy="310" r="4" fill="#9b5de5" />
        <circle cx="74" cy="316" r="4" fill="#ffd166" />
      </g>

      {/* avatars */}
      <g transform="translate(202,118) scale(0.7)">
        <AvatarPreview width={140} height={180} config={{ skin: "#ffd1a3", hair: "short", hairColor: "#6b4423", shirt: "#3b82f6", pants: "#1e293b", shoes: "#111827" }} />
      </g>
      <g transform="translate(118,140) scale(0.58)">
        <AvatarPreview width={140} height={180} config={{ skin: "#8d5a2b", hair: "curly", hairColor: "#1c1917", shirt: "#ec4899", pants: "#334155", shoes: "#ef4444" }} />
      </g>
      <g transform="translate(296,132) scale(0.64)">
        <AvatarPreview width={140} height={180} config={{ skin: "#f5c19a", hair: "long", hairColor: "#eab308", shirt: "#14b8a6", pants: "#1e3a8a", shoes: "#f59e0b" }} />
      </g>

      {/* speech bubble */}
      <g transform="translate(150,60)">
        <rect x="4" y="0" width="118" height="34" rx="17" fill="#ffffff" stroke="#ead9bd" strokeWidth="2" />
        <path d="M34 34 L42 48 L56 34 Z" fill="#ffffff" stroke="#ead9bd" strokeWidth="2" />
        <text x="63" y="23" textAnchor="middle" fontSize="14" fontWeight="700" fill="#2b2320">
          Merhaba! 👋
        </text>
      </g>
    </svg>
  );
}

const MARQUEE_ITEMS = [
  "Sohbet et",
  "Avatarını özelleştir",
  "Dünyayı keşfet",
  "Arkadaş edin",
  "Eğlen",
  "Kendin ol",
];

function MarqueeStrip() {
  const row = [...MARQUEE_ITEMS, ...MARQUEE_ITEMS];
  return (
    <div className="relative overflow-hidden border-y border-border/60 bg-secondary py-3.5">
      <div className="flex w-max animate-marquee items-center gap-8 pr-8">
        {row.map((item, i) => (
          <span
            key={i}
            className="flex items-center gap-8 whitespace-nowrap text-sm font-bold uppercase tracking-[0.18em] text-secondary-foreground/90"
          >
            {item}
            <span className="text-lg leading-none text-primary">✦</span>
          </span>
        ))}
      </div>
    </div>
  );
}

const FEATURES = [
  {
    icon: Palette,
    color: "bg-primary/10 text-primary",
    title: "Avatar Stüdyosu",
    desc: "Ten rengi, saç stili, kıyafet... karakterini saniyeler içinde yarat ve istediğin zaman değiştir.",
    badge: "Canlı",
  },
  {
    icon: MessageCircle,
    color: "bg-secondary/20 text-secondary-foreground",
    title: "Gerçek Zamanlı aşk",
    desc: "Dünyadaki herkesle sohbet et. Konuşma balonları avatarının hemen üstünde belirsin.",
    badge: "Yakında",
  },
  {
    icon: Map,
    color: "bg-accent text-accent-foreground",
    title: "Sanal Cadde",
    desc: "Cadde boyunca yürü, tezgâhların önünde dur, satıcılardan alışveriş yap. Çantan ve Sanalika Paran cebinde.",
    badge: "Canlı",
  },
  {
    icon: Users2,
    color: "bg-secondary/20 text-secondary-foreground",
    title: "Arkadaşlar",
    desc: "Karşılaştığın oyunculara arkadaşlık isteği gönder, çevrimiçi durumlarını takip et.",
    badge: "Yakında",
  },
];

export default function Landing() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Nav */}
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-3 sm:px-6">            <Link to="/" aria-label="Sanalika ana sayfa">
            <GameLogo />
          </Link>
          <nav className="hidden items-center gap-8 text-sm font-semibold text-muted-foreground md:flex">
            <a href="#features" className="transition-colors hover:text-foreground">
              Özellikler
            </a>
            <a href="#studio" className="transition-colors hover:text-foreground">
              Avatar Stüdyosu
            </a>
            <a href="#cta" className="transition-colors hover:text-foreground">
              Katıl
            </a>
          </nav>
          <div className="flex items-center gap-2">
            <Button asChild variant="outline" className="rounded-full">
              <Link to="/auth">Giriş yap</Link>
            </Button>
            <Button asChild className="rounded-full">
              <Link to="/auth">
                Katıl
                <ArrowRight className="size-4" />
              </Link>
            </Button>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute -top-24 left-1/2 h-72 w-[42rem] -translate-x-1/2 rounded-full bg-primary/15 blur-3xl" />
        <div className="mx-auto grid w-full max-w-6xl items-center gap-12 px-4 py-16 sm:px-6 lg:grid-cols-2 lg:py-24">
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: "easeOut" }}
          >
            <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3.5 py-1.5 text-xs font-bold uppercase tracking-wider text-primary shadow-xs">
              <Sparkles className="size-3.5" />
              2D Avatar Chat Dünyası
            </span>
            <h1 className="mt-5 text-4xl font-extrabold leading-[1.08] tracking-tight sm:text-5xl lg:text-6xl">
              Kendi avatarını yarat,{" "}
              <span className="text-primary">dünyaya</span> adım at
            </h1>
            <p className="mt-5 max-w-xl text-base leading-7 text-muted-foreground sm:text-lg">
              Sanalika Avatar Chat — tarayıcında oynanan 2D avatar chat oyunu.
              Karakterini özelleştir, sanal dünyada gez, yeni insanlarla tanış
              ve sohbet et. Hepsi tamamen ücretsiz.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Button asChild size="lg" className="rounded-full px-7 text-base">
                <Link to="/auth">
                  <Gamepad2 className="size-5" />
                  Hemen Katıl
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="rounded-full px-7 text-base">
                <Link to="/world">
                  <Map className="size-5" />
                  Dünyayı keşfet
                </Link>
              </Button>
            </div>
            <div className="mt-8 flex flex-wrap gap-2">
              {["Ücretsiz", "Mobil uyumlu", "Joystick ile oyna"].map((chip) => (
                <span
                  key={chip}
                  className="rounded-full bg-accent px-3.5 py-1.5 text-xs font-bold text-accent-foreground"
                >
                  {chip}
                </span>
              ))}
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 28 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.15, ease: "easeOut" }}
            className="relative"
          >
            <div className="absolute -inset-4 -z-10 rounded-[2.5rem] bg-secondary/40 blur-2xl" />
            <div className="overflow-hidden rounded-[2rem] border-4 border-white/70 shadow-2xl shadow-primary/10">
              <div className="flex items-center gap-1.5 bg-foreground px-4 py-2.5">
                <span className="size-2.5 rounded-full bg-[#ff5f57]" />
                <span className="size-2.5 rounded-full bg-[#febc2e]" />
                <span className="size-2.5 rounded-full bg-[#28c840]" />
                <span className="ml-3 text-xs font-bold text-background/80">
                  sanalika.world — Ana Kafe
                </span>
              </div>
              <div className="animate-float-slow">
                <WorldScene className="block h-auto w-full" />
              </div>
            </div>
            <div className="absolute -left-6 -top-6 hidden animate-float rounded-2xl border border-border bg-card px-4 py-3 shadow-lg sm:block">
              <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                Çevrimiçi
              </p>
              <p className="text-sm font-extrabold">
                <span className="text-primary">✦</span> 12 avatar çevrimiçi
              </p>
            </div>
          </motion.div>
        </div>
      </section>

      <MarqueeStrip />

      {/* Features */}
      <section id="features" className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-6">
        <motion.div {...fadeUp} className="mx-auto max-w-2xl text-center">
          <span className="text-xs font-bold uppercase tracking-[0.2em] text-primary">
            Neler var?
          </span>
          <h2 className="mt-3 text-3xl font-extrabold tracking-tight sm:text-4xl">
            TEST 123 - Gemini çalışıyor
          </h2>
          <p className="mt-4 text-base leading-7 text-muted-foreground">
            Sohbetten keşfe, arkadaşlıktan kişiselleştirmeye — sanal bir dünyada
            olması gereken her şey.
          </p>
        </motion.div>

        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((feature, i) => (
            <motion.div
              key={feature.title}
              {...fadeUp}
              transition={{ duration: 0.5, delay: i * 0.08, ease: "easeOut" }}
              className="group relative flex flex-col rounded-3xl border border-border/70 bg-card p-6 shadow-sm transition-all hover:-translate-y-1 hover:shadow-lg hover:shadow-primary/5"
            >
              <div className="flex items-start justify-between">
                <span
                  className={`flex size-11 items-center justify-center rounded-2xl ${feature.color}`}
                >
                  <feature.icon className="size-5" />
                </span>
                <span
                  className={`rounded-full px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wider ${
                    feature.badge === "Canlı"
                      ? "bg-secondary/25 text-secondary-foreground"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  {feature.badge}
                </span>
              </div>
              <h3 className="mt-4 text-lg font-extrabold tracking-tight">
                {feature.title}
              </h3>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                {feature.desc}
              </p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Studio showcase */}
      <section id="studio" className="border-y border-border/60 bg-card/60 py-20">
        <div className="mx-auto grid w-full max-w-6xl items-center gap-12 px-4 sm:px-6 lg:grid-cols-2">
          <motion.div {...fadeUp}>
            <span className="text-xs font-bold uppercase tracking-[0.2em] text-primary">
              Avatar Stüdyosu
            </span>
            <h2 className="mt-3 text-3xl font-extrabold tracking-tight sm:text-4xl">
              Saniyeler içinde kendini yarat
            </h2>
            <p className="mt-4 max-w-lg text-base leading-7 text-muted-foreground">
              Ten renginden saç stiline, kıyafetinden ayakkabısına kadar her
              detayı seç. Beğenmediğin zaman tek tıkla rastgele dene ya da
              sonradan düzenle — avatarın hep senin.
            </p>
            <ul className="mt-6 space-y-3">
              {[
                "5 farklı saç stili ve 15 saç rengi",
                "9 ten rengi, 16 kıyafet ve 10 pantolon rengi",
                "Canlı SVG önizleme — seçtikçe avatarın anında güncellenir",
                "Rastgele butonu ile sonsuz kombinasyon dene",
              ].map((item) => (
                <li key={item} className="flex items-start gap-3 text-sm font-semibold">
                  <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[11px] text-primary">
                    ✓
                  </span>
                  {item}
                </li>
              ))}
            </ul>
            <Button asChild size="lg" className="mt-8 rounded-full px-7 text-base">
              <Link to="/auth">
                Avatarını oluştur
                <ArrowRight className="size-5" />
              </Link>
            </Button>
          </motion.div>

          <motion.div {...fadeUp} className="relative">
            <div className="absolute -inset-4 -z-10 rounded-[2.5rem] bg-primary/10 blur-2xl" />
            <div className="overflow-hidden rounded-[2rem] border border-border bg-card shadow-xl">
              <div className="border-b border-border/70 px-5 py-3.5 text-sm font-extrabold">
                🎨 Yeni avatar oluştur
              </div>
              <div className="flex flex-col gap-5 p-5 sm:flex-row sm:items-start">
                <div className="mx-auto w-full max-w-[220px] shrink-0 rounded-2xl bg-gradient-to-b from-[#ffe4c2] to-[#eaf9d8] p-4">
                  <AvatarPreview
                    config={{ skin: "#f5c19a", hair: "bob", hairColor: "#7c3aed", shirt: "#14b8a6", pants: "#334155", shoes: "#f59e0b" }}
                    className="mx-auto block h-auto w-full"
                  />
                </div>
                <div className="w-full space-y-4">
                  {[
                    { label: "Ten Rengi", colors: ["#ffd1a3", "#f5c19a", "#8d5a2b", "#3b2314"] },
                    { label: "Saç Rengi", colors: ["#1c1917", "#6b4423", "#eab308", "#db2777"] },
                    { label: "Üst", colors: ["#3b82f6", "#ec4899", "#22c55e", "#f59e0b"] },
                    { label: "Alt", colors: ["#1e293b", "#334155", "#1e3a8a", "#27272a"] },
                  ].map((row) => (
                    <div key={row.label}>
                      <p className="text-[11px] font-extrabold uppercase tracking-wider text-muted-foreground">
                        {row.label}
                      </p>
                      <div className="mt-1.5 flex gap-2">
                        {row.colors.map((color) => (
                          <span
                            key={color}
                            className="size-6 rounded-full border border-black/10 shadow-sm"
                            style={{ backgroundColor: color }}
                          />
                        ))}
                      </div>
                    </div>
                  ))}
                  <Button size="sm" className="w-full rounded-full">
                    <Sparkles className="size-4" />
                    Kaydet
                  </Button>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* CTA */}
      <section id="cta" className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-6">
        <motion.div
          {...fadeUp}
          className="relative overflow-hidden rounded-[2.5rem] bg-foreground px-6 py-14 text-center text-background sm:px-12"
        >
          <div className="pointer-events-none absolute -left-10 -top-10 size-40 rounded-full bg-primary/30 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-12 -right-8 size-44 rounded-full bg-secondary/30 blur-3xl" />
          <h2 className="relative mx-auto max-w-2xl text-3xl font-extrabold tracking-tight sm:text-4xl">
            Avatarını oluşturmaya hazır mısın?
          </h2>
          <p className="relative mx-auto mt-4 max-w-xl text-base leading-7 text-background/70">
            Bir dakika bile sürmüyor. E-postanı gir veya misafir olarak devam et —
            Sanalika seni bekliyor.
          </p>
          <div className="relative mt-8 flex flex-wrap items-center justify-center gap-3">
            <Button
              asChild
              size="lg"
              className="rounded-full bg-primary px-8 text-base text-primary-foreground hover:bg-primary/90"
            >
              <Link to="/auth">
                Hemen Başla
                <ArrowRight className="size-5" />
              </Link>
            </Button>
          </div>
        </motion.div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border/60 py-10">
        <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-6 px-4 sm:flex-row sm:px-6">
          <GameLogo />
          <nav className="flex flex-wrap items-center justify-center gap-6 text-sm font-semibold text-muted-foreground">
            <a href="#features" className="transition-colors hover:text-foreground">
              Özellikler
            </a>
            <a href="#studio" className="transition-colors hover:text-foreground">
              Stüdyo
            </a>
            <Link to="/auth" className="transition-colors hover:text-foreground">
              Giriş
            </Link>
          </nav>
          <p className="text-sm text-muted-foreground">
            © 2026 Sanalika Avatar Chat
          </p>
        </div>
      </footer>
    </div>
  );
}
