import type { Metadata } from "next";
import { Providers } from "@/components/Providers";
import { validateEnv } from "@/lib/env";
import "./globals.css";

validateEnv();

export const metadata: Metadata = {
  title: {
    default: "InterviewAI",
    template: "%s | InterviewAI",
  },
  description: "AI-powered voice & video interview platform with real-time proctoring",
  icons: {
    icon: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🎯</text></svg>",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet" />
      </head>
      <body className="min-h-screen antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
