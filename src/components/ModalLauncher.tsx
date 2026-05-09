export default async function ClientModalLauncher({
  children
}: {
  id: string,
  children: React.ReactNode
}) {
  return (
    <>
      <button 
        className="btn btn-sm btn-error text-error-content">
        {children}
      </button>
    </>
  );
}
