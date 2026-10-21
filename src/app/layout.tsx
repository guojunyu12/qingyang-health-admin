import './globals.css';
import type {Metadata} from 'next';
export const metadata:Metadata={title:'轻养 M05 · 运营后台',description:'轻养健康 M05 运营后台'};
export default function Layout({children}:{children:React.ReactNode}){return <html lang="zh-CN"><body>{children}</body></html>;}
