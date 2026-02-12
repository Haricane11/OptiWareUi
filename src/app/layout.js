import "./globals.css";
import Providers from "./providers";

export const metadata = {
  title: "OptiWare - Smart Warehouse",
  description: "Next-generation warehouse management system",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
