// 🧪 Savaş Alanı Testi — `/test`
//
// KANCA SEBEBİ: savaş alanını denemek için cadde → giriş → duel akışından
// geçmek gerekiyordu (auth, lig, maç kuyruğu, Convex). Bu ekran arenayı
// DOĞRUDAN çalıştırır: `<BattleScene>` burada da oyunun içindekiyle AYNI
// bileşendir — kopya kod yok, tek kaynak. Yani burada gördüğün her şey
// üretimdeki arenanın ta kendisidir; "orijinaline aktarma" adımı gerekmez.
//
// Ne ayarlanabilir:
//   · ANA KARAKTERİN rengi (girişteki paletin aynısı, VIP renkleri dahil).
//     Renk hakkı bağlı hesaplarda TEK SEFER kullanılır (VIP hariç) — üretimle
//     aynı kural (bkz. convex/profiles.saveProfile).
//   · karakter SKİNİ (zırh/GLB görünümleri),
//   · iki tarafın YETENEĞİ ve botun zorluk seviyesi (1–10),
//   · "Yeniden başlat" ile aynı ayarlarla temiz bir maç.
//
// Rota PÚBLİKTİR (admin panel gibi, kendi girişi yok) ve hiçbir menüde
// listelenmez: sadece adres çubuğuna `/test` yazarak girilir. Üretime
// çıkarken bu rotayı kaldırmak ya da `import.meta.env.DEV` ile sınırlamak
// istersen tek satır — bkz. `src/main.tsx`.
import BattleScene from "@/components/world/BattleScene";
import { Button } from "@/components/ui/button";
import {
  CHARACTER_COLORS,
  DEFAULT_AVATAR,
  opponentColorFor,
} from "@/lib/avatar";
import { api } from "@/convex/_generated/api";
import { ABILITIES, DEFAULT_ABILITY, type AbilityId } from "@/lib/shop";
import { useQuery } from "convex/react";
import { Swords } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useNavigate } from "react-router";

/** Testte giyilebilecek karakter skinleri (PRODUCTS içindeki `skin-*` kimlikleri). */
const SKINS: { id: string; label: string }[] = [
  { id: "", label: "Varsayılan" },
  { id: "skin-savasci-glb", label: "Kraliyet Savaşçısı" },
  { id: "skin-samuray", label: "Samuray" },
  { id: "skin-sevalye", label: "Şövalye" },
];

interface FightSetup {
  playerColor: string;
  playerSkin: string;
  playerAbility: AbilityId;
  botAbility: AbilityId;
  level: number;
  /** Aynı ayarlarla yeni maç: `key` değişir, arena sıfırdan kurulur. */
  seed: number;
}

const DEFAULT_SETUP: FightSetup = {
  playerColor: CHARACTER_COLORS[5].hex, // Mavi
  playerSkin: "",
  playerAbility: DEFAULT_ABILITY,
  botAbility: DEFAULT_ABILITY,
  level: 5,
  seed: 0,
};

/** Tek bir renk kareleri satırı (girişteki paletin aynısı). */
function ColorRow({
  value,
  onChange,
  title,
  locked = false,
}: {
  value: string;
  onChange: (hex: string) => void;
  title: string;
  /** Renk hakkı kullanıldı (VIP hariç): palet seçilemez. */
  locked?: boolean;
}) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between text-[11px] font-bold tracking-wider text-muted-foreground uppercase">
        <span>{title}</span>
        <span className="font-mono text-[10px] normal-case">{value}</span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {CHARACTER_COLORS.map((c) => {
          const active = c.hex === value;
          return (
            <button
              key={c.id}
              type="button"
              title={
                locked
                  ? `${c.label} — renk hakkın kullanıldı`
                  : c.vip
                    ? `${c.label} (VIP premium)`
                    : c.label
              }
              onClick={() => {
                if (locked && c.hex !== value) return;
                onChange(c.hex);
              }}
              className={`relative size-8 rounded-lg border transition-transform active:scale-95 ${
                active
                  ? "border-white ring-2 ring-[#22d3ee]"
                  : "border-white/20 hover:border-white/50"
              } ${locked ? "cursor-not-allowed opacity-60" : ""}`}
              style={{ backgroundColor: c.hex }}
            >
              {c.vip && (
                <span className="absolute -top-1 -right-1 text-[9px] leading-none">
                  👑
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Yetenek seçimi — oyunun kendi ABILITIES tablosundan. */
function AbilityRow({
  value,
  onChange,
}: {
  value: AbilityId;
  onChange: (id: AbilityId) => void;
}) {
  return (
    <div>
      <div className="mb-2 text-[11px] font-bold tracking-wider text-muted-foreground uppercase">
        Yetenek
      </div>
      <div className="flex flex-wrap gap-1.5">
        {ABILITIES.map((a) => (
          <button
            key={a.id}
            type="button"
            title={a.description}
            onClick={() => onChange(a.id)}
            className={`rounded-lg border px-2.5 py-1.5 text-xs font-bold transition-colors ${
              a.id === value
                ? "border-[#ff8a3c] bg-[#ff6a1f]/20 text-[#ffd0a8]"
                : "border-white/15 bg-white/5 text-muted-foreground hover:text-foreground"
            }`}
          >
            <span className="mr-1">{a.emoji}</span>
            {a.name}
          </button>
        ))}
      </div>
    </div>
  );
}

function Panel({
  title,
  accent,
  children,
}: {
  title: string;
  accent: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-white/10 bg-black/40 p-4 backdrop-blur-sm">
      <h2
        className="mb-3 text-sm font-black tracking-wide"
        style={{ color: accent }}
      >
        {title}
      </h2>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

export default function ArenaTest() {
  const navigate = useNavigate();
  const [setup, setSetup] = useState<FightSetup>(DEFAULT_SETUP);
  const [fighting, setFighting] = useState(false);
  const patch = useCallback(
    (p: Partial<FightSetup>) => setSetup((s) => ({ ...s, ...p })),
    [],
  );

  // Üretimle AYNI kurallar burada da geçerli:
  //   · renk yalnızca ANA karakteri boyar — bot kendi rengini giyer,
  //   · bağlı hesapta renk hakkı TEK SEFERdir (VIP hariç).
  // Girişsiz (anonim) testte kilit yoktur: alan serbestçe denenir.
  const profile = useQuery(api.profiles.getMyProfile);
  const colorLocked =
    (profile?.colorChosen ?? false) && !(profile?.vip ?? false);
  // 👑 Hazır karakter görünümü seçildiyse renk seçimi kapalıdır: Kraliyet
  // Savaşçısı / Samuray / Şövalye modelleri ORİJİNAL renklerini kullanır.
  const skinWorn = setup.playerSkin !== "";
  /** Botun KENDİ rengi: oyuncunun renginden bağımsız, seviyeye göre sabit. */
  const botColor = opponentColorFor(
    `test-bot:${setup.level}`,
    setup.playerColor,
  );
  // Bağlı hesabın rengini bir kez yükle (oyuncunun seçimini ezmesin).
  const colorInit = useRef(false);
  useEffect(() => {
    if (colorInit.current || !profile) return;
    colorInit.current = true;
    if (CHARACTER_COLORS.some((c) => c.hex === profile.avatar.shirt)) {
      patch({ playerColor: profile.avatar.shirt });
    }
  }, [profile, patch]);

  // ── maç modu: arena tam ekran, üzerine HİÇBİR panel binmez ──
  // (Test kontrolleri kasıtlı olarak maç sırasında görünmez: HUD'un,
  //  joystick'in ve gölge/bloom katmanının gerçek görünümü bozulmasın.)
  if (fighting) {
    return (
      <BattleScene
        key={setup.seed}
        playerName="Test Oyuncu"
        playerConfig={{ ...DEFAULT_AVATAR, shirt: setup.playerColor }}
        playerEquipped={setup.playerSkin ? [setup.playerSkin] : []}
        playerAbility={setup.playerAbility}
        opponentName={`Bot · Sv. ${setup.level}`}
        opponentConfig={{ ...DEFAULT_AVATAR, shirt: botColor }}
        opponentEquipped={[]}
        opponentAbility={setup.botAbility}
        opponentLevel={setup.level}
        onExit={() => setFighting(false)}
      />
    );
  }

  // ── hazırlık modu ──
  return (
    <div className="relative min-h-screen overflow-y-auto bg-[#070a12] text-foreground">
      {/* magma atmosferi — arenanın paletiyle aynı dil */}
      <div className="pointer-events-none fixed -top-32 -left-32 size-96 rounded-full bg-[#ff6a1f]/15 blur-3xl" />
      <div className="pointer-events-none fixed -right-24 bottom-0 size-96 rounded-full bg-[#22d3ee]/10 blur-3xl" />

      <div className="relative mx-auto w-full max-w-5xl px-4 py-8 sm:px-6">
        <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[11px] font-bold tracking-[0.2em] text-[#ff8a3c] uppercase">
              Vaelos · Test Sahası
            </p>
            <h1 className="mt-1 text-2xl font-black sm:text-3xl">
              Savaş Alanı Testi
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              Arena burada <strong>doğrudan</strong> çalışır: bu ekran oyunun
              gerçek <code className="text-[#ffd0a8]">&lt;BattleScene&gt;</code>{" "}
              bileşenini kullanır. Yani burada gördüğün görüntü, hareket, efekt
              ve HUD üretimdekiyle birebir aynıdır — ayrıca kopyalanacak kod
              yoktur, değişiklik iki yerde birden geçerli olur.
            </p>
          </div>
          <Button
            variant="outline"
            onClick={() => navigate("/world")}
            className="rounded-xl"
          >
            Oyuna dön
          </Button>
        </header>

        <div className="grid gap-4 md:grid-cols-2">
          <Panel title="OYUNCU" accent="#7dd3fc">
            <ColorRow
              title="Karakter rengi"
              value={setup.playerColor}
              onChange={(hex) => patch({ playerColor: hex })}
              locked={colorLocked || skinWorn}
            />
            {skinWorn ? (
              <p className="rounded-xl border border-[#22d3ee]/30 bg-[#22d3ee]/10 px-2.5 py-1.5 text-[11px] font-bold leading-4 text-[#c8f4ff]">
                🎨 Hazır karakter görünümü orijinal renklerini kullanır — renk
                seçimi kapalı. Renk yalnızca "Varsayılan" görünümde geçerli.
              </p>
            ) : colorLocked ? (
              <p className="rounded-xl border border-amber-300/25 bg-amber-300/10 px-2.5 py-1.5 text-[11px] font-bold leading-4 text-amber-100">
                🔒 Renk hakkını kullandın — karakter rengi tek sefer seçilir.
                Değiştirmek için 👑 VIP üyelik gerekiyor.
              </p>
            ) : null}
            <div>
              <div className="mb-2 text-[11px] font-bold tracking-wider text-muted-foreground uppercase">
                Görünüm (skin)
              </div>
              <div className="flex flex-wrap gap-1.5">
                {SKINS.map((s) => (
                  <button
                    key={s.id || "default"}
                    type="button"
                    onClick={() => patch({ playerSkin: s.id })}
                    className={`rounded-lg border px-2.5 py-1.5 text-xs font-bold transition-colors ${
                      s.id === setup.playerSkin
                        ? "border-[#22d3ee] bg-[#22d3ee]/15 text-[#c8f4ff]"
                        : "border-white/15 bg-white/5 text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
            <AbilityRow
              value={setup.playerAbility}
              onChange={(id) => patch({ playerAbility: id })}
            />
          </Panel>

          <Panel title="BOT (DÜŞMAN)" accent="#fda4af">
            {/* Botun rengi SEÇİLEMEZ: renk yalnızca ana karaktere aittir.
                Bot kendi rengini giyer (seviyeye göre sabit) ve oyuncunun
                rengini asla almaz. */}
            <div className="flex items-center gap-2.5 rounded-xl border border-white/10 bg-white/5 px-3 py-2">
              <span
                className="size-5 shrink-0 rounded-md border border-white/25"
                style={{ backgroundColor: botColor }}
              />
              <span className="text-[11px] font-bold leading-4 text-muted-foreground">
                Bot kendi rengini giyer — oyuncunun seçtiği renk yalnızca ana
                karakteri boyar.
              </span>
            </div>
            <AbilityRow
              value={setup.botAbility}
              onChange={(id) => patch({ botAbility: id })}
            />
            <div>
              <div className="mb-2 flex items-center justify-between text-[11px] font-bold tracking-wider text-muted-foreground uppercase">
                <span>Zorluk seviyesi</span>
                <span className="text-sm text-[#ffd0a8]">{setup.level}</span>
              </div>
              <input
                type="range"
                min={1}
                max={10}
                step={1}
                value={setup.level}
                onChange={(e) => patch({ level: Number(e.target.value) })}
                className="w-full accent-[#ff6a1f]"
              />
              <p className="mt-1 text-[11px] text-muted-foreground">
                Seviye 1: yavaş ve ıskalar · Seviye 10: hızlı, isabetli, sık
                ateş eder.
              </p>
            </div>
          </Panel>
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <Button
            onClick={() => {
              setSetup((s) => ({ ...s, seed: s.seed + 1 }));
              setFighting(true);
            }}
            className="h-12 rounded-xl bg-gradient-to-r from-[#ff8a3c] to-[#ff5a1f] px-6 text-base font-black text-black hover:from-[#ffa45c] hover:to-[#ff6a2b]"
          >
            <Swords className="mr-2 size-5" /> SAVAŞA GİR
          </Button>
          <Button
            variant="outline"
            className="h-12 rounded-xl"
            onClick={() => {
              const modda = { ...DEFAULT_SETUP, seed: setup.seed + 1 };
              setSetup(modda);
            }}
          >
            Ayarları sıfırla
          </Button>
        </div>

        <div className="mt-8 grid gap-3 text-xs text-muted-foreground sm:grid-cols-3">
          <div className="rounded-xl border border-white/10 bg-black/30 p-3">
            <p className="mb-1 font-bold text-foreground">Maç içi teşhis</p>
            Savaş alanının sağ kenarındaki <strong>QA</strong> düğmesi burada da
            çalışır: haritayı tarar, FPS/çizim yükü ve bulguları raporlar.
          </div>
          <div className="rounded-xl border border-white/10 bg-black/30 p-3">
            <p className="mb-1 font-bold text-foreground">Çıkış</p>
            Maç bitince ya da ESC/çıkış düğmesiyle sonuç ekranından çıkınca bu
            hazırlık ekranına dönersin.
          </div>
          <div className="rounded-xl border border-white/10 bg-black/30 p-3">
            <p className="mb-1 font-bold text-foreground">Kaydetmez</p>
            Bu ekran hiçbir ilerleme, altın veya lig verisi yazmaz; Convex'e maç
            kaydı göndermez (tamamen izole test).
          </div>
        </div>
      </div>
    </div>
  );
}
