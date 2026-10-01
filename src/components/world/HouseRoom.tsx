/**
 * 🏠 ODA — evin İÇİ. Kapıdaki "Evine gir" düğmesine basınca açılan ekran.
 *
 * Oda, sokaktaki karakteri taşıyan AYNI 3D modelle kurulur: duvar/zemin/eşya
 * katmanı DOM (Tailwind) ile çizilir, ortada duran karakter ise gerçek GLB
 * avatardır (`GlbProfileAvatar` — kendi şeffaf canvas'ı vardır). Böylece odaya
 * giren karakter, sokakta gördüğün karakterin TA KENDİSİDİR (renk/kuşam dahil).
 *
 * Oda her oyuncuya özeldir: sahibi adını değiştirebilir, giriş sayısını ve
 * ziyaretçi defterini görür. Komşular listesinden başka bir oyuncunun odasına
 * geçilebilir (o zaman yalnızca gezer/izler, adın onun defterine yazılır).
 *
 * NEDEN AYRI DOSYA: cadde sahnesi (GameEngine3D) WebGL ve kare döngüsüyle dolu;
 * oda ise sahnenin durduğu, sakin bir iç mekân. Ayrı bileşen, cadde koduna
 * dokunmadan açılıp kapanabilir (battle ekranlarıyla aynı desen).
 */
import { Button } from "@/components/ui/button";
import type { HouseView } from "@/engine/houseDoor";
import { motion } from "framer-motion";
import { DoorOpen, Home, Pencil, Users } from "lucide-react";
import { useState } from "react";
import { GlbProfileAvatar } from "@/engine/GlbAvatar3D";

/**
 * Oda örneği kimliğinin kısa gösterimi (`room_kd7…4a9`).
 *
 * Kimlik sunucunun ürettiği INSTANCE kimliğidir ve odada görünür: oda artık
 * adıyla değil KİMLİĞİYLE de çağrılabilir (aynı oda adını iki oyuncu seçse bile
 * karışmaz). Uzun uuid'yi ekranda şişirmemek için baş/son parçalar gösterilir.
 */
export function shortRoomId(roomId: string): string {
  const body = roomId.startsWith("room_") ? roomId.slice(5) : roomId;
  if (body.length <= 10) return body;
  return `${body.slice(0, 4)}…${body.slice(-4)}`;
}

/** Kapıdan girerken yükleme ekranında yanan adımlar. */
export const HOUSE_STEPS = [
  "Kapı açılıyor",
  "Odan hazırlanıyor",
  "Eşyalar yerleştiriliyor",
  "Işıklar yanıyor",
];

/** Yükleme ekranında dönen ipuçları. */
export const HOUSE_TIPS = [
  "Odanı istediğin gibi adlandırabilirsin.",
  "Komşular odaya girince defterde görünür.",
  "Kapıdan çıkınca caddeye dönersin.",
];

export interface HouseRoomProps {
  /** Açılan oda. */
  view: HouseView;
  /** Karakterin kuşandığı eşyalar (sokaktakiyle aynı görünüm). */
  equipped: string[];
  /** Caddede çevrimiçi diğer oyuncuların adları (komşu ziyareti). */
  neighbors: string[];
  /** Sahibi oda adını kaydeder. */
  onRename: (name: string) => void;
  /** Komşunun odasına geç. */
  onVisit: (ownerName: string) => void;
  /** Kapıdan çık (caddeye dön). */
  onExit: () => void;
}

export function HouseRoom({
  view,
  equipped,
  neighbors,
  onRename,
  onVisit,
  onExit,
}: HouseRoomProps) {
  const [name, setName] = useState(view.name);
  const [editing, setEditing] = useState(false);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className="fixed inset-0 z-[60] flex flex-col bg-[#2a1d17]"
    >
      {/* ── ÜST ŞERİT: oda adı + çıkış ─────────────────────────── */}
      <div className="flex shrink-0 items-center gap-2 px-3 py-2 text-white">
        <span className="flex size-9 items-center justify-center rounded-full bg-white/10">
          <Home className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-extrabold">
            {view.name}
            {!view.isMine && (
              <span className="ml-2 rounded-full bg-white/15 px-2 py-0.5 text-[10px] font-bold">
                {view.ownerName} odası
              </span>
            )}
          </p>
          <p className="truncate text-[11px] font-semibold text-white/60">
            🚪 {view.visits} giriş
            {view.isMine ? " · senin evin" : " · misafir olarak geziyorsun"}
            {" · "}
            <span
              className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-[10px] text-white/70"
              title={`Oda örneği kimliği: ${view.roomId}`}
            >
              #{shortRoomId(view.roomId)}
            </span>
          </p>
        </div>
        <Button
          size="sm"
          variant="ghost"
          className="rounded-full text-white hover:bg-white/15"
          onClick={onExit}
        >
          <DoorOpen className="size-4" /> Çık
        </Button>
      </div>

      {/* ── ODA SAHNESİ ───────────────────────────────────────────
          Duvar + zemin + eşyalar DOM ile çizilir; ortada gerçek 3D karakter
          durur. Katmanlar, tek ekranlık bir "diorama" gibi üst üste bindirilir. */}
      <div className="relative min-h-0 flex-1 overflow-hidden">
        {/* Duvar: sıcak badana + hafif dikey doku. */}
        <div className="absolute inset-0 bg-[#e9d6bb]" />
        <div className="absolute inset-0 bg-[repeating-linear-gradient(90deg,rgba(0,0,0,0.035)_0px,rgba(0,0,0,0.035)_1px,transparent_1px,transparent_34px)]" />
        {/* Zemin: ahşap tahta (perspektif hissi için üstte koyu şerit). */}
        <div className="absolute inset-x-0 bottom-0 h-[38%] bg-[#8a5a34]" />
        <div className="absolute inset-x-0 bottom-[37%] h-[3%] bg-[#6d4526]" />
        <div className="absolute inset-x-0 bottom-0 h-[38%] bg-[repeating-linear-gradient(90deg,rgba(0,0,0,0.12)_0px,rgba(0,0,0,0.12)_2px,transparent_2px,transparent_58px)]" />

        {/* Pencere: gündüz dışarısı (caddenin yeşili) + cam bölmeleri. */}
        <div className="absolute left-[8%] top-[10%] h-[34%] w-[30%] overflow-hidden rounded-t-[40%] border-4 border-[#b98a5c] bg-gradient-to-b from-[#89c7ee] via-[#bfe4f5] to-[#dff0c9] shadow-inner">
          <div className="absolute bottom-0 h-1/3 w-full bg-[#7cc04f]" />
          <div className="absolute left-[18%] bottom-[18%] h-[30%] w-[22%] rounded-full bg-[#5faa38]" />
          <div className="absolute right-[14%] bottom-[16%] h-[38%] w-[26%] rounded-full bg-[#69b640]" />
          <div className="absolute inset-y-0 left-1/2 w-1 -translate-x-1/2 bg-[#b98a5c]" />
          <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 bg-[#b98a5c]" />
        </div>

        {/* Duvar süsü: çerçeveli ev resmi. */}
        <div className="absolute right-[12%] top-[12%] flex size-16 items-center justify-center rounded-xl border-4 border-[#b98a5c] bg-[#fdf3e0] text-2xl shadow-md">
          🏡
        </div>

        {/* Komodin + saksı (sağ alt). */}
        <div className="absolute right-[6%] bottom-[30%] h-[16%] w-[22%] rounded-t-md bg-[#a9713f] shadow-lg">
          <div className="absolute -top-1 inset-x-0 h-2 rounded bg-[#c98d55]" />
        </div>
        <div className="absolute right-[10%] bottom-[44%] text-3xl drop-shadow">🪴</div>

        {/* Yatak (sol alt). */}
        <div className="absolute left-[-4%] bottom-[22%] h-[22%] w-[42%] rounded-r-2xl bg-[#d9c3a1] shadow-lg">
          <div className="absolute left-0 top-[14%] h-[72%] w-[26%] rounded-r-xl bg-[#f4efe4]" />
          <div className="absolute left-[30%] top-[8%] h-[26%] w-[40%] rounded-lg bg-[#c0533f]" />
        </div>

        {/* Kilim: karakterin üstünde durduğu halı. */}
        <div className="absolute left-1/2 bottom-[6%] h-[16%] w-[62%] -translate-x-1/2 rounded-[50%] border-4 border-[#a8433a] bg-[#c85a4a]/80 shadow-inner">
          <div className="absolute inset-[18%] rounded-[50%] border-2 border-[#f0d9a8]/70" />
        </div>

        {/* Karakter: sokaktakiyle AYNI model/kuşam. */}
        <div className="absolute left-1/2 bottom-[8%] -translate-x-1/2">
          <GlbProfileAvatar
            equipped={equipped}
            height={2}
            className="pointer-events-none h-56 w-40 sm:h-72 sm:w-52"
          />
        </div>

        {/* Tavan lambası + sıcak ışık halkası. */}
        <div className="absolute left-1/2 top-0 h-[18%] w-1 -translate-x-1/2 bg-[#4a3527]" />
        <div className="absolute left-1/2 top-[16%] size-10 -translate-x-1/2 rounded-full bg-[#ffe9a8] shadow-[0_0_60px_30px_rgba(255,226,150,0.35)]" />
      </div>

      {/* ── ALT PANEL: ad / defter / komşular ──────────────────── */}
      <div className="shrink-0 space-y-3 border-t-4 border-[#3d2f2a]/30 bg-[#f3e0bd] px-3 pb-[max(env(safe-area-inset-bottom),0.6rem)] pt-3">
        {view.isMine ? (
          editing ? (
            <div className="flex items-center gap-2">
              <input
                value={name}
                maxLength={24}
                autoFocus
                onChange={(e) => setName(e.target.value)}
                placeholder={`${view.ownerName} Odası`}
                className="min-w-0 flex-1 rounded-2xl border border-[#c8ab7d] bg-white px-3 py-2 text-sm font-semibold text-[#3d2f2a] outline-none focus:border-[#8a5a34]"
              />
              <Button
                size="sm"
                className="rounded-full"
                onClick={() => {
                  onRename(name);
                  setEditing(false);
                }}
              >
                Kaydet
              </Button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-[#b99a6a] px-3 py-2 text-xs font-bold text-[#7a5a37] transition-colors hover:bg-[#e9d5ae]"
            >
              <Pencil className="size-3.5" /> Oda adını değiştir
            </button>
          )
        ) : null}

        <div className="flex items-center gap-2 text-[11px] font-bold text-[#7a5a37]">
          <Users className="size-3.5" />
          {view.visitors.length > 0
            ? `Son ziyaretçiler: ${view.visitors.slice(0, 4).join(", ")}`
            : "Defter boş — komşularını davet et!"}
        </div>

        {neighbors.length > 0 && (
          <div className="flex gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {neighbors.slice(0, 8).map((who) => (
              <button
                key={who}
                type="button"
                onClick={() => onVisit(who)}
                className="shrink-0 rounded-full border border-[#c8ab7d] bg-white/70 px-3 py-1.5 text-[11px] font-extrabold text-[#5c4326] transition-colors hover:bg-white"
              >
                🚪 {who}
              </button>
            ))}
          </div>
        )}
      </div>
    </motion.div>
  );
}
