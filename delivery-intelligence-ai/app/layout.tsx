import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = { title: 'Delivery Intelligence AI', description: 'Copiloto de operações de delivery. Projeto independente com dados sintéticos.' };
export default function Layout({ children }: { children: React.ReactNode }) { return <html lang="pt-BR"><body>{children}</body></html>; }
