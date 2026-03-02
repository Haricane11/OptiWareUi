import "./globals.css";
import Providers from "./providers";

export const metadata = {
  title: "OptiWare - Smart Warehouse",
  description: "Next-generation warehouse management system",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="antialiased" suppressHydrationWarning>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
