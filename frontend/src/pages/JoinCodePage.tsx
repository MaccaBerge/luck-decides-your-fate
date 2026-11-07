import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ApiError, findGameByCode } from "../lib/api";
import { Loading } from "../components/game/Loading";
import { WheelMark } from "../components/game/WheelMark";
import { card, primaryBtn } from "../components/game/buttons";

/** /j/{code}: the invite link and QR code of a multiplayer game. Finds the game and opens it. */
export default function JoinCodePage() {
  const { code = "" } = useParams();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    findGameByCode(code)
      .then(({ game_id }) => alive && navigate(`/g/${game_id}`, { replace: true }))
      .catch((e) => {
        if (!alive) return;
        setError(
          e instanceof ApiError && e.code === "code_not_found"
            ? "That game doesn't exist. It may have ended, or the code is wrong."
            : e instanceof Error
              ? e.message
              : "Something went wrong",
        );
      });
    return () => {
      alive = false;
    };
  }, [code, navigate]);

  if (!error) return <Loading />;
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center gap-6 px-4 text-ink">
      <div className="flex items-center gap-2.5">
        <WheelMark />
        <span className="font-display text-[19px] font-semibold">Luck Decides Your Fate</span>
      </div>
      <section className={`${card} flex flex-col gap-3 p-7`}>
        <h1 className="font-display text-[26px] font-semibold">Couldn't find that game</h1>
        <p className="text-sm text-ink-muted">{error}</p>
        <Link to="/" className={`${primaryBtn} mt-2 self-start`}>
          Go to your wheel
        </Link>
      </section>
    </main>
  );
}
