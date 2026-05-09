"use client";
import { useEffect } from "react";

export function FlyonUIInit() {
  useEffect(() => {
    // @ts-ignore
    import("flyonui/flyonui");
  }, []);
  return null;
}
