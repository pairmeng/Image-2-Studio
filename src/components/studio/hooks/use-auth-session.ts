import { FormEvent, useEffect, useState } from "react";
import type { PublicUser } from "@/lib/types";
import { fetchJson } from "@/components/studio/utils/api-client";

type UseAuthSessionOptions = {
  onAuthenticated?: () => void;
  onLoggedOut?: () => void;
};

export function useAuthSession({ onAuthenticated, onLoggedOut }: UseAuthSessionOptions = {}) {
  const [authLoading, setAuthLoading] = useState(true);
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [currentUser, setCurrentUser] = useState<PublicUser | null>(null);
  const [registrationOpen, setRegistrationOpen] = useState(false);
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);

  async function loadSession() {
    setAuthLoading(true);
    try {
      const body = await fetchJson<{ user: PublicUser | null; registrationOpen: boolean }>("/api/auth/me", { cache: "no-store" });
      setCurrentUser(body.user);
      setRegistrationOpen(body.registrationOpen);
    } finally {
      setAuthLoading(false);
    }
  }

  async function submitAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAuthError("");

    const endpoint = authMode === "login" ? "/api/auth/login" : "/api/auth/register";
    try {
      const body = await fetchJson<{ user?: PublicUser }>(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: authEmail, password: authPassword }),
        fallbackMessage: "Authentication failed."
      });

      if (!body.user) {
        setAuthError("Authentication failed.");
        return;
      }

      setCurrentUser(body.user);
      setAuthPassword("");
      onAuthenticated?.();
    } catch (caught) {
      setAuthError(caught instanceof Error ? caught.message : "Authentication failed.");
    }
  }

  async function logout() {
    await fetchJson("/api/auth/logout", {
      method: "POST",
      fallbackMessage: "Logout failed."
    });
    onLoggedOut?.();
  }

  async function changePassword(input: { currentPassword: string; newPassword: string }) {
    setChangingPassword(true);
    try {
      const body = await fetchJson<{ user?: PublicUser }>("/api/auth/password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input),
        fallbackMessage: "Password could not be changed."
      });

      if (!body.user) {
        return {
          ok: false,
          error: "Password could not be changed."
        };
      }

      setCurrentUser(body.user);
      return { ok: true };
    } catch (caught) {
      return {
        ok: false,
        error: caught instanceof Error ? caught.message : "Password could not be changed."
      };
    } finally {
      setChangingPassword(false);
    }
  }

  function resetAuthSession(message?: string) {
    setCurrentUser(null);
    if (message) {
      setAuthError(message);
    }
  }

  useEffect(() => {
    void loadSession().catch(() => {
      setAuthLoading(false);
      setAuthError("Session could not be loaded.");
    });
  }, []);

  return {
    authLoading,
    authMode,
    currentUser,
    registrationOpen,
    authEmail,
    authPassword,
    authError,
    changingPassword,
    setAuthMode,
    setAuthEmail,
    setAuthPassword,
    setAuthError,
    setCurrentUser,
    loadSession,
    submitAuth,
    logout,
    changePassword,
    resetAuthSession
  };
}
