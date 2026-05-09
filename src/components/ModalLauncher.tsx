import { auth } from "@/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

export default async function ClientModalLauncher({
  id,
  children
}: {
  id: string,
  children: React.ReactNode
}) {
  return (
    <>
      <button 
        className="btn btn-sm btn-error text-error-content"
        onClick={() => {
           // We are in server component, cannot do onClick. Need to make it a client component.
        }}>
        {children}
      </button>
    </>
  );
}
