import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { headers } from 'next/headers';
import { cookieToInitialState } from 'wagmi';
import { config } from "@/walletConnect/siwe";
import Web3ModalProvider from "@/walletConnect/WalletConnect";
import { EndpointsContext } from "@/app/agent";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
});
const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
  weight: "100 900",
});

export const metadata: Metadata = {
  title: "EscrowGuild",
  description: "Escrow Guild is a platform to leverage AI Agents for your web3 adventures",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const initialState = cookieToInitialState(config, headers().get('cookie'));
  return (
    <html lang="en">
          <Web3ModalProvider initialState={initialState}>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      ><EndpointsContext>
        {children}</EndpointsContext>
      </body></Web3ModalProvider>
    </html>
  );
}
