import { useEffect, useState } from "react";
import { api } from "./api";
import type { User } from "./types";
import AuthPage from "./pages/AuthPage";
import ChartPage from "./pages/ChartPage";

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    api
      .me()
      .then((r) => setUser(r.user))
      .catch(() => setUser(null))
      .finally(() => setReady(true));
  }, []);

  if (!ready) {
    return (
      <div className="auth-page">
        <div className="lead">正在加载…</div>
      </div>
    );
  }

  if (!user) return <AuthPage onAuthed={setUser} />;
  return <ChartPage user={user} onLogout={() => setUser(null)} />;
}
