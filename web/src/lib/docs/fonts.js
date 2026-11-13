// Phông nhúng (Arimo ≈ Arial, Tinos ≈ Times New Roman) cho bản xem trước và trình sửa mẫu — cùng phông với tệp PDF nên chữ xuống dòng giống nhau.
// Kèm CSS chung của nội dung mẫu in (TPL_CSS). Chỉ chèn vào trang một lần.
import { useEffect } from 'react';
import ArimoR from '../../assets/fonts/Arimo-Regular.ttf?url';
import ArimoB from '../../assets/fonts/Arimo-Bold.ttf?url';
import ArimoI from '../../assets/fonts/Arimo-Italic.ttf?url';
import ArimoBI from '../../assets/fonts/Arimo-BoldItalic.ttf?url';
import TinosR from '../../assets/fonts/Tinos-Regular.ttf?url';
import TinosB from '../../assets/fonts/Tinos-Bold.ttf?url';
import TinosI from '../../assets/fonts/Tinos-Italic.ttf?url';
import TinosBI from '../../assets/fonts/Tinos-BoldItalic.ttf?url';
import { TPL_CSS } from './templates.js';

let injected = false;
export function injectDocFonts() {
  if (injected || typeof document === 'undefined') return; injected = true;
  const face = (fam, url, w, st) => `@font-face{font-family:"${fam}";src:url("${url}") format("truetype");font-weight:${w};font-style:${st};font-display:swap}`;
  const el = document.createElement('style');
  el.textContent = [face('Arimo', ArimoR, 400, 'normal'), face('Arimo', ArimoB, 700, 'normal'), face('Arimo', ArimoI, 400, 'italic'), face('Arimo', ArimoBI, 700, 'italic'),
    face('Tinos', TinosR, 400, 'normal'), face('Tinos', TinosB, 700, 'normal'), face('Tinos', TinosI, 400, 'italic'), face('Tinos', TinosBI, 700, 'italic')].join('\n') + TPL_CSS;
  document.head.appendChild(el);
}
export function useDocFonts() { useEffect(() => { injectDocFonts(); }, []); }
