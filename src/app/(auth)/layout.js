// src/app/(auth)/layout.js
export default function AuthLayout({ children }) {
  return (
    <div className="min-h-screen w-full bg-slate-50 flex items-center justify-center">
      {children}
    </div>
  );
}