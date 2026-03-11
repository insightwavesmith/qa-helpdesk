"use client";

import { useEffect } from "react";
import { mp } from "@/lib/mixpanel";

interface PageViewTrackerProps {
  event: string;
  props?: Record<string, unknown>;
}

export function PageViewTracker({ event, props }: PageViewTrackerProps) {
  useEffect(() => {
    mp.track(event, props);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event]);

  return null;
}
