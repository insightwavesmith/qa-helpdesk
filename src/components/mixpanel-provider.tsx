"use client";

import { useEffect } from "react";
import { mp } from "@/lib/mixpanel";

export default function MixpanelProvider() {
  useEffect(() => {
    mp.init();
  }, []);

  return null;
}
