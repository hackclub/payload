/**
 * Site footer. GIT_COMMIT_SHA is inlined at build time by next.config.ts
 * (git in dev, the GIT_SHA build arg in Docker — the build context has no
 * .git, see .dockerignore).
 */
export default function Footer({ className = "mt-16" }: { className?: string }) {
  return (
    <div className={`${className} text-center text-sm text-hc-muted/80 flex items-center justify-center gap-1.5`}>
      Payload &bull; Made with{" "}
      <svg className="w-4 h-4 text-hc-red inline-block" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>{" "}
      by Floppy
      <span className="text-hc-muted/60 font-mono text-xs">&bull; {process.env.GIT_COMMIT_SHA}</span>
    </div>
  );
}
