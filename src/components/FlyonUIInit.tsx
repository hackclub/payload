"use client";
import { useEffect } from "react";

export function FlyonUIInit() {
  useEffect(() => {
    import("flyonui/flyonui");
  }, []);
  return null;
}
