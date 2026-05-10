import { auth, signOut } from "@/auth";

export default async function UserMenu() {
  const session = await auth();

  if (!session?.user) return null;

  return (
    <div className="flex items-center gap-4 text-hc-smoke bg-hc-darkless px-4 py-2 rounded-full border border-hc-slate/50">
      <div className="flex items-center gap-2">
        {session.user.image && (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={session.user.image} alt={session.user.name || "Profile"} className="w-6 h-6 rounded-full" />
        )}
        <span className="font-bold text-sm">{session.user.name}</span>
      </div>
      <div className="w-px h-4 bg-hc-slate"></div>
      <form action={async () => {
        "use server";
        await signOut();
      }}>
        <button type="submit" className="text-hc-muted hover:text-hc-red font-bold text-sm transition-colors">Sign Out</button>
      </form>
    </div>
  );
}

