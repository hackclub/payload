import { auth, signOut } from "@/auth";

export default async function UserMenu() {
  const session = await auth();

  if (!session?.user) return null;

  return (
    <div className="dropdown dropdown-end">
      <div tabIndex={0} role="button" className="btn btn-ghost btn-circle avatar border border-base-300">
        <div className="w-10 rounded-full">
          <img alt="User Avatar" src={session.user.image || "https://github.com/ghost.png"} />
        </div>
      </div>
      <ul tabIndex={0} className="menu menu-sm dropdown-content mt-3 z-[1] p-2 shadow bg-base-100 rounded-box w-52 border border-base-300">
        <li className="px-4 py-2 font-bold bg-base-200 mb-2 rounded-t-lg">{session.user.name}</li>
        <li>
          <form action={async () => {
            "use server";
            await signOut();
          }}>
            <button type="submit" className="w-full text-left">Sign Out</button>
          </form>
        </li>
      </ul>
    </div>
  );
}

