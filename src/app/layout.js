import "./globals.css";

export const metadata = {
  title: "DAK-SCHEDULER PRO | Daniel Ari Kristianto",
  description: "Advanced Hospital Scheduling System",
};

export default function RootLayout({ children }) {
  return (
    <html lang="id">
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}