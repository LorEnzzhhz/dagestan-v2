// ---------------------------------------------------------------------------
// use-auth.ts — localStorage-backed auth (no accounts, no cloud).
// ---------------------------------------------------------------------------

import { useCallback, useMemo, useState } from "react";
import {
  getUser,
  setUser,
  signOutUser,
  type UserProfile,
} from "@/lib/store";

export function useAuth() {
  const [user, setUserState] = useState<UserProfile>(() => getUser());
  const isLoading = false;
  const isAuthenticated = true; // always "logged in" as guest

  const signIn = useCallback(
    async () => {
      // No-op — always a guest user
      setUserState(getUser());
    },
    [],
  );

  const signOut = useCallback(async () => {
    signOutUser();
    setUserState(getUser()); // creates a new guest
  }, []);

  const updateProfile = useCallback((patch: Partial<UserProfile>) => {
    setUserState((prev) => {
      const next = { ...prev, ...patch };
      setUser(next);
      return next;
    });
  }, []);

  return useMemo(
    () => ({
      isLoading,
      isAuthenticated,
      user,
      signIn,
      signOut,
      updateProfile,
    }),
    [isLoading, isAuthenticated, user, signIn, signOut, updateProfile],
  );
}
