import "./globals.css";

export const metadata = {
  title: "Maze Race",
  description: "Multiplayer classroom maze racing game"
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
