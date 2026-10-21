import type { Metadata } from "next";
import type { ReactNode } from "react";

import "./globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "Bond Data Grid",
  description: "A reusable, high-throughput data grid demonstration.",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <main className="mx-auto flex h-dvh w-full max-w-[1600px] flex-col p-3 sm:p-6">
          <Providers>{children}</Providers>
        </main>
      </body>
    </html>
  );
}
