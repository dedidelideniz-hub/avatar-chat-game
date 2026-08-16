// 👑 Sanalika Yönetici Paneli — /admin
// Demo giriş: kullanıcı adı "admin", şifre "admin".
// (Güvenlik notu: bu bilgiler istemcide ve Convex fonksiyonlarında sabittir;
// gerçek bir yayında env değişkeni + rol kontrolüne taşınmalıdır.)
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { CURRENCY_EMOJI, formatCoins } from "@/lib/shop";
import { useMutation, useQuery } from "convex/react";
import {
  ArrowLeft,
  Crown,
  Lock,
  LogOut,
  UserRound,
  Users,
  Wallet,
  X,
} from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";

const ADMIN_USER = "admin";
const ADMIN_PASS = "admin";

const ADMIN_CREDS = { adminUser: ADMIN_USER, adminPass: ADMIN_PASS };

function fmtDate(ms: number) {
  return new Date(ms).toLocaleDateString("tr-TR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export default function Admin() {
  const navigate = useNavigate();
  const [user, setUser] = useState(
    () => sessionStorage.getItem("admin-user") ?? "",
  );
  const [pass, setPass] = useState(
    () => sessionStorage.getItem("admin-pass") ?? "",
  );
  const [authed, setAuthed] = useState(
    () => sessionStorage.getItem("admin-authed") === "1",
  );
  const [tab, setTab] = useState<"players" | "guests">("players");
  const [loginError, setLoginError] = useState<string | null>(null);
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [banningId, setBanningId] = useState<string | null>(null);

  const players = useQuery(
    api.admin.listPlayers,
    authed ? ADMIN_CREDS : "skip",
  );
  const guests = useQuery(api.admin.listGuests, authed ? ADMIN_CREDS : "skip");
  const addCoins = useMutation(api.admin.addCoins);
  const setBanned = useMutation(api.admin.setBanned);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (user === ADMIN_USER && pass === ADMIN_PASS) {
      sessionStorage.setItem("admin-user", user);
      sessionStorage.setItem("admin-pass", pass);
      sessionStorage.setItem("admin-authed", "1");
      setAuthed(true);
      setLoginError(null);
      toast.success("Giriş başarılı — hoş geldin! 👑");
    } else {
      setLoginError("Kullanıcı adı veya şifre hatalı.");
    }
  };

  const handleLogout = () => {
    sessionStorage.removeItem("admin-user");
    sessionStorage.removeItem("admin-pass");
    sessionStorage.removeItem("admin-authed");
    setAuthed(false);
    setUser("");
    setPass("");
  };

  const handleAddCoins = async (profileId: Id<"profiles">, username: string) => {
    const raw = amounts[profileId]?.trim() ?? "";
    const amount = Number(raw);
    if (!Number.isInteger(amount) || amount <= 0) {
      toast.error("Geçerli bir SP miktarı gir (örn. 500).");
      return;
    }
    setLoadingId(profileId);
    try {
      const balance = await addCoins({
        ...ADMIN_CREDS,
        profileId,
        amount,
      });
      toast.success(
        `${username} hesabına ${formatCoins(amount)} SP yüklendi 🪙 (yeni bakiye: ${formatCoins(balance)})`,
      );
      setAmounts((prev) => ({ ...prev, [profileId]: "" }));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Yükleme başarısız.");
    } finally {
      setLoadingId(null);
    }
  };

  const handleSetBanned = async (
    profileId: Id<"profiles">,
    username: string,
    banned: boolean,
  ) => {
    setBanningId(profileId);
    try {
      await setBanned({ ...ADMIN_CREDS, profileId, banned });
      toast.success(
        banned
          ? `${username} oyundan yasaklandı 🚫`
          : `${username} yasağı kaldırıldı ✅`,
      );
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "İşlem başarısız.",
      );
    } finally {
      setBanningId(null);
    }
  };

  if (!authed) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-[#0d1220] p-4 text-slate-100">
        <div className="w-full max-w-sm">
          <button
            type="button"
            onClick={() => navigate("/")}
            className="mb-6 flex items-center gap-1.5 text-sm font-semibold text-slate-400 transition-colors hover:text-white"
          >
            <ArrowLeft className="size-4" /> Oyunun ana sayfasına dön
          </button>
          <div className="overflow-hidden rounded-3xl border border-white/10 bg-[#151b2e] shadow-2xl">
            <div className="border-b border-white/10 bg-gradient-to-r from-indigo-600/30 to-fuchsia-600/30 px-6 py-7 text-center">
              <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-fuchsia-500 shadow-lg">
                <Lock className="size-7 text-white" />
              </div>
              <h1 className="mt-4 text-2xl font-extrabold tracking-tight">
                Yönetici Paneli
              </h1>
              <p className="mt-1 text-sm font-medium text-slate-400">
                Sanalika oyun yönetimi
              </p>
            </div>
            <form onSubmit={handleLogin} className="space-y-4 p-6">
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Kullanıcı adı
                </label>
                <Input
                  value={user}
                  onChange={(e) => setUser(e.target.value)}
                  placeholder="admin"
                  autoComplete="username"
                  className="h-12 rounded-2xl border-white/10 bg-white/5 text-slate-100 placeholder:text-slate-500 focus:border-indigo-400"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Şifre
                </label>
                <Input
                  type="password"
                  value={pass}
                  onChange={(e) => setPass(e.target.value)}
                  placeholder="••••••"
                  autoComplete="current-password"
                  className="h-12 rounded-2xl border-white/10 bg-white/5 text-slate-100 placeholder:text-slate-500 focus:border-indigo-400"
                />
              </div>
              {loginError && (
                <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm font-semibold text-red-300">
                  {loginError}
                </p>
              )}
              <Button
                type="submit"
                className="h-12 w-full rounded-2xl bg-gradient-to-r from-indigo-500 to-fuchsia-500 text-base font-extrabold text-white shadow-lg hover:from-indigo-400 hover:to-fuchsia-400"
              >
                Giriş Yap
              </Button>
              <p className="text-center text-xs text-slate-500">
                Demo: admin / admin
              </p>
            </form>
          </div>
        </div>
      </div>
    );
  }

  const loading =
    (tab === "players" && players === undefined) ||
    (tab === "guests" && guests === undefined);

  return (
    <div className="min-h-dvh bg-[#0d1220] text-slate-100">
      {/* top bar */}
      <header className="sticky top-0 z-20 border-b border-white/10 bg-[#0d1220]/90 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-fuchsia-500 shadow-lg">
              <Crown className="size-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-extrabold leading-none tracking-tight">
                Yönetici Paneli
              </h1>
              <p className="mt-0.5 text-xs font-medium text-slate-400">
                Hoş geldin, {ADMIN_USER} 👑
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate("/")}
              className="text-slate-300 hover:bg-white/10 hover:text-white"
            >
              <X className="mr-1 size-4" /> Çık
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleLogout}
              className="text-slate-300 hover:bg-red-500/20 hover:text-red-300"
            >
              <LogOut className="mr-1 size-4" /> Oturumu kapat
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-6">
        {/* tabs */}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setTab("players")}
            className={`flex items-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-extrabold transition-all ${
              tab === "players"
                ? "bg-gradient-to-r from-indigo-500 to-fuchsia-500 text-white shadow-lg"
                : "bg-white/5 text-slate-400 hover:bg-white/10 hover:text-white"
            }`}
          >
            <Users className="size-4" />
            Kayıtlı Oyuncular
            {players !== undefined && (
              <span
                className={`rounded-full px-2 py-0.5 text-[11px] font-extrabold ${
                  tab === "players"
                    ? "bg-white/20 text-white"
                    : "bg-white/10 text-slate-400"
                }`}
              >
                {players.length}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => setTab("guests")}
            className={`flex items-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-extrabold transition-all ${
              tab === "guests"
                ? "bg-gradient-to-r from-indigo-500 to-fuchsia-500 text-white shadow-lg"
                : "bg-white/5 text-slate-400 hover:bg-white/10 hover:text-white"
            }`}
          >
            <UserRound className="size-4" />
            Misafir Oyuncular
            {guests !== undefined && (
              <span
                className={`rounded-full px-2 py-0.5 text-[11px] font-extrabold ${
                  tab === "guests"
                    ? "bg-white/20 text-white"
                    : "bg-white/10 text-slate-400"
                }`}
              >
                {guests.length}
              </span>
            )}
          </button>
        </div>

        {/* content */}
        <div className="mt-5 overflow-hidden rounded-3xl border border-white/10 bg-[#151b2e] shadow-2xl">
          {loading ? (
            <div className="flex items-center justify-center gap-3 py-16 text-slate-400">
              <div className="size-6 animate-spin rounded-full border-2 border-white/20 border-t-indigo-400" />
              Yükleniyor…
            </div>
          ) : tab === "players" ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead>
                  <tr className="border-b border-white/10 text-[11px] font-extrabold uppercase tracking-wider text-slate-500">
                    <th className="px-5 py-3">Oyuncu</th>
                    <th className="px-3 py-3">Kayıt</th>
                    <th className="px-3 py-3">Bakiye</th>
                    <th className="px-3 py-3">Çanta</th>
                    <th className="px-5 py-3 text-right">SP Yükle</th>
                    <th className="px-3 py-3 text-center">Yasak</th>
                  </tr>
                </thead>
                <tbody>
                  {players!.map((p) => (
                    <tr
                      key={p.profileId}
                      className={`border-b border-white/5 transition-colors last:border-0 hover:bg-white/[0.03] ${
                        p.banned ? "bg-red-500/[0.07]" : ""
                      }`}
                    >
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-3">
                          <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-sky-400 to-indigo-500 text-base shadow">
                            {p.username.slice(0, 1).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 font-extrabold">
                              <span className="truncate">{p.username}</span>
                              {p.vip && (
                                <span
                                  className="flex shrink-0 items-center gap-0.5 rounded-full bg-gradient-to-r from-amber-400 to-yellow-500 px-1.5 py-0.5 text-[10px] font-extrabold text-white"
                                  title="VIP üye"
                                >
                                  <Crown className="size-3" /> VIP
                                </span>
                              )}
                              {p.banned && (
                                <span
                                  className="flex shrink-0 items-center gap-0.5 rounded-full bg-red-500/20 px-1.5 py-0.5 text-[10px] font-extrabold text-red-300"
                                  title="Yasaklı oyuncu"
                                >
                                  🚫 Yasak
                                </span>
                              )}
                            </div>
                            <p className="truncate text-xs text-slate-500">
                              {p.email ?? (
                                <span className="italic">e-posta yok</span>
                              )}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3.5 text-xs font-semibold text-slate-400">
                        {fmtDate(p.createdAt)}
                      </td>
                      <td className="px-3 py-3.5">
                        <span className="flex w-fit items-center gap-1 rounded-full bg-emerald-500/15 px-2.5 py-1 text-xs font-extrabold text-emerald-300">
                          {CURRENCY_EMOJI} {formatCoins(p.coins)}
                        </span>
                      </td>
                      <td className="px-3 py-3.5 text-xs font-semibold text-slate-400">
                        🎒 {p.items} ürün
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="flex items-center justify-end gap-2">
                          <div className="relative">
                            <Wallet className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-500" />
                            <Input
                              type="number"
                              min={1}
                              value={amounts[p.profileId] ?? ""}
                              onChange={(e) =>
                                setAmounts((prev) => ({
                                  ...prev,
                                  [p.profileId]: e.target.value,
                                }))
                              }
                              placeholder="SP miktarı"
                              inputMode="numeric"
                              className="h-9 w-32 rounded-xl border-white/10 bg-white/5 pr-2 pl-9 text-sm font-semibold text-slate-100 placeholder:text-slate-500 focus:border-emerald-400"
                            />
                          </div>
                          <Button
                            size="sm"
                            disabled={loadingId === p.profileId}
                            onClick={() => handleAddCoins(p.profileId, p.username)}
                            className="h-9 rounded-xl bg-emerald-500 px-3 font-extrabold text-emerald-950 shadow hover:bg-emerald-400"
                          >
                            {loadingId === p.profileId
                              ? "…"
                              : "Yükle"}
                          </Button>
                        </div>
                      </td>
                      <td className="px-3 py-3.5 text-center">
                        <Button
                          size="sm"
                          disabled={banningId === p.profileId}
                          onClick={() =>
                            handleSetBanned(
                              p.profileId,
                              p.username,
                              !p.banned,
                            )
                          }
                          className={`h-9 rounded-xl px-3 font-extrabold shadow ${
                            p.banned
                              ? "bg-emerald-500 text-emerald-950 hover:bg-emerald-400"
                              : "bg-red-500/15 text-red-300 hover:bg-red-500/30"
                          }`}
                        >
                          {banningId === p.profileId
                            ? "…"
                            : p.banned
                              ? "Kaldır"
                              : "Yasakla"}
                        </Button>
                      </td>
                    </tr>
                  ))}
                  {players!.length === 0 && (
                    <tr>
                      <td
                        colSpan={6}
                        className="px-5 py-14 text-center text-sm font-semibold text-slate-500"
                      >
                        Henüz kayıtlı oyuncu yok.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-left text-sm">
                <thead>
                  <tr className="border-b border-white/10 text-[11px] font-extrabold uppercase tracking-wider text-slate-500">
                    <th className="px-5 py-3">Kullanıcı</th>
                    <th className="px-3 py-3">Tür</th>
                    <th className="px-3 py-3">İlk görülme</th>
                    <th className="px-5 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {guests!.map((g) => (
                    <tr
                      key={g.userId}
                      className="border-b border-white/5 transition-colors last:border-0 hover:bg-white/[0.03]"
                    >
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-3">
                          <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-white/10 text-base">
                            👤
                          </div>
                          <div className="min-w-0">
                            <div className="font-extrabold">Misafir</div>
                            <p className="truncate text-xs text-slate-500">
                              {g.email ?? "kimlik bilgisi yok"}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3.5">
                        <span className="w-fit rounded-full bg-sky-500/15 px-2.5 py-1 text-xs font-extrabold text-sky-300">
                          {g.isAnonymous ? "Anonim" : "Profil yok"}
                        </span>
                      </td>
                      <td className="px-3 py-3.5 text-xs font-semibold text-slate-400">
                        {fmtDate(g.createdAt)}
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        <span className="text-[11px] font-semibold text-slate-600">
                          avatar oluşturmadı
                        </span>
                      </td>
                    </tr>
                  ))}
                  {guests!.length === 0 && (
                    <tr>
                      <td
                        colSpan={4}
                        className="px-5 py-14 text-center text-sm font-semibold text-slate-500"
                      >
                        Şu an misafir oyuncu yok. 🎉
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
