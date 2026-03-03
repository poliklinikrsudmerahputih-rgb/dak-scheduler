// src/app/(auth)/layout.js
export default function AuthLayout({ children }) {
  return (
    <section className="min-h-screen bg-slate-50">
      {children}
    </section>
  );
}