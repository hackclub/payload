export default function AdminLoading() {
  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="mb-8">
        <div className="h-10 w-48 bg-hc-dark rounded-hc animate-pulse" />
        <div className="h-5 w-72 bg-hc-dark rounded-hc animate-pulse mt-3" />
      </div>

      <div className="flex flex-wrap gap-2 border-b border-hc-darkless pb-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-9 w-24 bg-hc-dark rounded-hc animate-pulse" />
        ))}
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex-1 h-10 bg-hc-dark rounded-hc animate-pulse" />
        <div className="h-10 w-28 bg-hc-dark rounded-hc animate-pulse" />
      </div>

      <div className="bg-hc-dark rounded-hc border border-hc-darkless overflow-hidden">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 px-4 py-3 border-b border-hc-darkless/50">
            <div className="w-8 h-8 rounded-full bg-hc-darker animate-pulse" />
            <div className="flex-1 h-4 bg-hc-darker rounded animate-pulse" />
            <div className="w-20 h-4 bg-hc-darker rounded animate-pulse" />
          </div>
        ))}
      </div>
    </div>
  );
}