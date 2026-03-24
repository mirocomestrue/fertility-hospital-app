"use client";

import { useEffect, useState, useCallback } from "react";

interface GeolocationState {
  latitude: number | null;
  longitude: number | null;
  error: string | null;
  loading: boolean;
}

export function useGeolocation() {
  const [state, setState] = useState<GeolocationState>({
    latitude: null,
    longitude: null,
    error: null,
    loading: true,
  });

  const locate = useCallback((highAccuracy = false) => {
    if (!navigator.geolocation) {
      setState((s) => ({ ...s, error: "Geolocation not supported", loading: false }));
      return;
    }

    setState((s) => ({ ...s, loading: true, error: null }));

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setState({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          error: null,
          loading: false,
        });
      },
      (err) => {
        // If high accuracy failed, retry with low accuracy
        if (highAccuracy) {
          navigator.geolocation.getCurrentPosition(
            (pos) => {
              setState({
                latitude: pos.coords.latitude,
                longitude: pos.coords.longitude,
                error: null,
                loading: false,
              });
            },
            (err2) => {
              setState((s) => ({ ...s, error: err2.message, loading: false }));
            },
            { enableHighAccuracy: false, timeout: 30000, maximumAge: 60000 }
          );
        } else {
          setState((s) => ({ ...s, error: err.message, loading: false }));
        }
      },
      {
        enableHighAccuracy: highAccuracy,
        timeout: 15000,
        maximumAge: highAccuracy ? 0 : 60000,
      }
    );
  }, []);

  useEffect(() => {
    locate(false);
  }, [locate]);

  const refresh = useCallback(() => {
    locate(true);
  }, [locate]);

  return { ...state, refresh };
}
