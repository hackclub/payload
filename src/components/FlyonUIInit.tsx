"use client";
import { useEffect } from "react";

export function FlyonUIInit() {
  useEffect(() => {
    if (typeof window !== "undefined") {
      window.$hsOverlayCollection = window.$hsOverlayCollection || [];
    }
    import("flyonui/flyonui");
  }, []);
  return null;
}
