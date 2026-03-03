// src/app/layout.js
import "./globals.css";

export const metadata = {
  title: "DAK-SCHEDULER PRO | Daniel Ari Kristianto",
  description: "Advanced Hospital Scheduling System",
};

export default function RootLayout({ children }) {
  return (
    // Tambahkan suppressHydrationWarning di sini
    <html lang="id" suppressHydrationWarning>
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}