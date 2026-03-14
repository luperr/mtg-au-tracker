"use client";

export default function Error() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
      <h1 className="text-4xl font-bold text-cream mb-2">500</h1>
      <p className="text-cream-dim mb-6">Something went wrong.</p>
      <a href="/" className="text-accent hover:underline">
        Back to search
      </a>
    </div>
  );
}
