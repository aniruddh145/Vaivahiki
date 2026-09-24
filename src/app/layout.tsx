import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Samaj Vivah",
  description: "Samaj Vivah",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
