import "./globals.css";
import { LanguageProvider } from "../lib/i18n";

export const metadata = {
  title: "Salon System | Management System",
  description: "Multi-branch spa management system for Dar es Salaam, Dodoma, and Arusha.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <LanguageProvider>{children}</LanguageProvider>
      </body>
    </html>
  );
}
