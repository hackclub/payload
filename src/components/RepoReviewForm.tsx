"use client";

import { useState } from "react";
import { launchRepoReview } from "@/app/page-actions";
import { Sparkles } from "lucide-react";

/**
 * "Review a Repo" entry point: paste a git repo URL and Payload's AI prepares
 * a setup script + reviewer guide, then boots a Linux VM that runs it.
 */
export default function RepoReviewForm({ disabledReason = null }: { disabledReason?: string | null }) {
  const [repoUrl, setRepoUrl] = useState("");
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const disabled = disabledReason !== null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!repoUrl.trim() || isPending || disabled) return;
    setIsPending(true);
    setError(null);
    try {
      const result = await launchRepoReview(repoUrl);
      if (result?.error) {
        setError(result.error);
      } else {
        setRepoUrl("");
      }
    } catch (err) {
      console.error("Failed to start repo review:", err);
      setError("Something went wrong. Please try again.");
    } finally {
      setIsPending(false);
    }
  };

  return (
    <div className="bg-hc-dark rounded-hc border border-hc-darkless p-6 shadow-lg">
      <div className="flex items-center gap-2 mb-1">
        <Sparkles className="w-5 h-5 text-hc-purple" />
        <h2 className="text-xl font-bold text-hc-snow">Review a project</h2>
      </div>
      <p className="text-hc-muted text-sm mb-4">
        Paste a repository URL and AI will prepare a Linux VM for you — dependencies installed,
        project built, and a reviewer guide opened on the desktop.
      </p>

      <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-3">
        <input
          type="url"
          value={repoUrl}
          onChange={(e) => setRepoUrl(e.target.value)}
          placeholder="https://github.com/user/project"
          disabled={isPending || disabled}
          className="flex-1 bg-hc-darker border border-hc-darkless focus:border-hc-purple/60 rounded-hc px-4 py-2.5 text-hc-snow placeholder:text-hc-muted outline-none transition-colors disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={isPending || disabled || !repoUrl.trim()}
          className="bg-hc-purple hover:bg-hc-purple/80 text-white font-bold py-2.5 px-6 rounded-hc transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
        >
          {isPending ? "Starting…" : "Set up & review"}
        </button>
      </form>

      {disabledReason && (
        <p className="text-hc-orange text-sm mt-3">{disabledReason}</p>
      )}
      {error && (
        <p className="text-hc-red text-sm mt-3">{error}</p>
      )}
    </div>
  );
}
