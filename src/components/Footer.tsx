/**
 * Site footer. GIT_COMMIT_SHA is inlined at build time by next.config.ts
 * (git in dev, the GIT_SHA build arg in Docker — the build context has no
 * .git, see .dockerignore).
 */
export default function Footer({ className = "mt-16" }: { className?: string }) {
  const sha = process.env.GIT_COMMIT_SHA;
  const shaClass = "font-mono text-xs text-hc-smoke/40";

  return (
    <footer className={`${className} flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-sm text-hc-smoke/70`}>
      <p>
        Made with
        <svg className="inline-block w-3.5 h-3.5 mx-1 -mt-0.5 text-hc-red" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>
        by Floppy, Powered by Shipwrights
      </p>
      <span className="h-3 w-px bg-hc-smoke/20" />
      {sha && sha !== "unknown" ? (
        <a
          href={`https://github.com/hackclub/payload/commit/${sha}`}
          target="_blank"
          rel="noopener noreferrer"
          className={`${shaClass} hover:text-hc-smoke/70 transition-colors`}
        >
          {sha}
        </a>
      ) : (
        <span className={shaClass}>{sha ?? "unknown"}</span>
      )}
    </footer>
  );
}
