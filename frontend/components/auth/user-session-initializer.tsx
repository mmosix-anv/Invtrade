"use client";

import { useEffect, useRef } from "react";
import { useUserStore } from "@/store/user";
import { $fetch } from "@/lib/api";

/**
 * Initializes user session by fetching profile if cookies exist
 * Should be placed in root layout to run on every page load
 */
export function UserSessionInitializer() {
  const { user, setUser } = useUserStore();
  const hasInitialized = useRef(false);

  useEffect(() => {
    // Only initialize once and only if user is not already loaded
    if (hasInitialized.current || user) {
      return;
    }

    hasInitialized.current = true;

    // Try to fetch user profile (will work if auth cookies exist)
    const initializeSession = async () => {
      try {
        const { data, error } = await $fetch({
          url: "/api/user/profile",
          method: "GET",
          silent: true,
          silentSuccess: true,
        });

        if (!error && data) {
          // Validate that we got a proper user object
          if (data && typeof data === 'object' && data.id) {
            setUser(data);
          }
        }
      } catch (err) {
        // Silently fail - user is just not logged in or there's a backend issue
        console.debug("Session initialization failed:", err);
      }
    };

    initializeSession();
  }, [user, setUser]);

  return null;
}
