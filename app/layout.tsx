import type { Metadata } from 'next';
import './globals.css';
import { CartProvider } from '@/components/cart-context';
import { Header } from '@/components/header';
import { Footer } from '@/components/footer';
import { WhatsAppFloat } from '@/components/whatsapp-float';
import { CurrencyNotice, CurrencyProvider } from '@/components/currency-provider';
export const metadata: Metadata = { title:'AS Collection | Pakistani Fashion', description:'Premium Pakistani women’s fashion, thoughtfully made.' };
export default function RootLayout({children}:{children:React.ReactNode}) { return <html lang="en"><body><CartProvider><CurrencyProvider><Header/><CurrencyNotice/>{children}<Footer/><WhatsAppFloat/></CurrencyProvider></CartProvider></body></html>; }
