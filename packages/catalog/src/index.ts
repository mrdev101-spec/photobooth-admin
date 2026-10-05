/**
 * Built-in catalog: everything the kiosk draws in code today, identified by the same ids the
 * kiosk uses (photo-booth-v1: src/services/photoLayouts.js, badgeLayouts.js, templateData.js,
 * aiTemplateData.js). The Admin enables/disables these by id; uploaded templates come later.
 */

export const APP_MODES = [
  { id: 'classic', name: 'Classic Receipt', desc: 'ใบเสร็จวินเทจขาวดำ พิมพ์เครื่องพิมพ์ความร้อน' },
  { id: 'ai', name: 'AI Studio', desc: 'สร้างโปสเตอร์ด้วย AI จากภาพถ่ายลูกค้า' },
  { id: 'photo', name: 'Photo 4x6', desc: 'ภาพสี 4x6 นิ้ว และเข็มกลัด' },
  { id: 'pickup', name: 'จุดรับรูป', desc: 'เครื่องของเจ้าหน้าที่ สแกนใบรับรูปแล้วพิมพ์' }
] as const;
export type AppMode = (typeof APP_MODES)[number]['id'];

export interface PhotoLayout {
  id: string;
  name: string;
  desc: string;
  collection?: 'classic';
  shots?: number;
}

export const PHOTO_LAYOUTS: readonly PhotoLayout[] = [
  { id: 'full', name: 'เต็มแผ่น', desc: 'ภาพเต็มแผ่นแบบไร้ขอบ เรียบง่าย เน้นตัวคน' },
  { id: 'classic', name: 'ขอบขาว', desc: 'ขอบขาวสะอาดตา พร้อมชื่องานและวันที่ด้านล่าง' },
  { id: 'magazine', name: 'ปกนิตยสาร', desc: 'ขึ้นปกนิตยสาร พร้อมหัวหนังสือตัวใหญ่ COVER STAR' },
  { id: 'film', name: 'ฟิล์ม', desc: 'ฟิล์มเนกาทีฟสีดำ มีรูหนามเตยสองข้าง สไตล์วินเทจ' },
  { id: 'scrapbook', name: 'สมุดภาพ', desc: 'ภาพติดเทปบนกระดาษคราฟท์ ลายมือเขียน น่ารักอบอุ่น' },
  { id: 'neon', name: 'นีออน', desc: 'กรอบนีออนชมพูฟ้าเรืองแสง สำหรับปาร์ตี้กลางคืน' },
  { id: 'pastel', name: 'พาสเทล', desc: 'พื้นพาสเทลหวานๆ ประดับดาว หัวใจ และประกาย' },
  { id: 'luxe', name: 'หรูหราทอง', desc: 'ดำทองหรูหรา เหมาะกับงานแต่งและงานกาล่า' },
  { id: 'retro', name: 'เรโทร 70s', desc: 'กรอบทีวีโค้งมน รุ้งพระอาทิตย์ตก สไตล์ยุค 70' },
  { id: 'popart', name: 'ป๊อปอาร์ต', desc: 'การ์ตูนป๊อปอาร์ตสีสด พร้อมป้าย WOW!' },
  { id: 'y2k', name: 'Y2K', desc: 'ย้อนยุค 2000 พื้นโฮโลแกรม ตัวอักษรโครเมียม กรอบหน้าต่างคอมเก่า' },
  { id: 'kbooth', name: 'สไตล์เกาหลี', desc: 'กรอบสีพื้นมินิมอลแบบตู้ถ่ายรูปเกาหลี ตัวอักษรเล็กเรียบ' },
  { id: 'editorial', name: 'มินิมอล', desc: 'หน้านิตยสารมินิมอล ตัวอักษร serif เว้นที่ว่างเยอะ ดูแพง' },
  { id: 'ticket', name: 'ตั๋วเข้างาน', desc: 'ตั๋วเข้างาน/บอร์ดดิ้งพาส มีบาร์โค้ดและรอยปรุ' },
  { id: 'zine', name: 'สตรีทซีน', desc: 'สตรีทซีนสายแฟชั่น ภาพขอบกระดาษฉีก เทปดำ สติกเกอร์' },
  { id: 'dailynews', name: 'หนังสือพิมพ์', desc: 'หน้าหนึ่งหนังสือพิมพ์วินเทจ พาดหัวเป็นชื่องาน ภาพสี', collection: 'classic' },
  { id: 'receipt', name: 'ใบเสร็จ', desc: 'ใบเสร็จร้านกาแฟวินเทจ มีรายการความทรงจำและบาร์โค้ด', collection: 'classic' },
  { id: 'polaroid', name: 'โพลารอยด์', desc: 'การ์ดโพลารอยด์ติดเทป พร้อมข้อความลายมือ', collection: 'classic' },
  { id: 'filmduo', name: 'ฟิล์ม 3 ช็อต', desc: 'ถ่าย 3 ช็อต แถบฟิล์ม 35mm 2 แถบ ตัดแบ่งกับเพื่อนได้', collection: 'classic', shots: 3 }
];

export const PHOTO_FILTERS = [
  { id: 'natural', name: 'ธรรมชาติ' },
  { id: 'bright', name: 'สดใส' },
  { id: 'warm', name: 'อบอุ่น' },
  { id: 'cool', name: 'โทนเย็น' },
  { id: 'vintage', name: 'วินเทจ' },
  { id: 'mono', name: 'ขาวดำ' }
] as const;

export const BADGE_SIZES = [
  { id: '32', name: '32 มม. (1¼")', face: 32, cut: 44, safe: 27 },
  { id: '38', name: '38 มม. (1½")', face: 38, cut: 48, safe: 33 },
  { id: '44', name: '44 มม. (1¾")', face: 44, cut: 54, safe: 38 },
  { id: '58', name: '58 มม. (2¼")', face: 58, cut: 70, safe: 50 },
  { id: '75', name: '75 มม. (3")', face: 75, cut: 85, safe: 68 }
] as const;
export type BadgeSizeId = (typeof BADGE_SIZES)[number]['id'];

export const BADGE_FRAMES = [
  { id: 'ring', name: 'วงแหวนชื่องาน', desc: 'วงแหวนสีธีม ชื่องานโค้งด้านบน วันที่ด้านล่าง' },
  { id: 'clean', name: 'ภาพเต็มวง', desc: 'ภาพเต็มหน้าเข็ม ขอบบางเรียบง่าย' },
  { id: 'minimal', name: 'มินิมอล', desc: 'พื้นขาว เส้นบาง ตัวอักษรเล็กเรียบหรู' },
  { id: 'pastel', name: 'พาสเทล', desc: 'ขอบลูกไม้พาสเทล ประดับหัวใจและประกาย' },
  { id: 'gold', name: 'ทองหรู', desc: 'ดำทอง เหมาะกับงานแต่งและงานกาล่า' },
  { id: 'neon', name: 'นีออน', desc: 'วงแหวนนีออนเรืองแสง สำหรับปาร์ตี้' },
  { id: 'pop', name: 'ป๊อปอาร์ต', desc: 'จุดฮาล์ฟโทน ป้าย WOW! สีสด' },
  { id: 'y2k', name: 'Y2K', desc: 'พื้นโฮโลแกรม ประกายวิ้งๆ' }
] as const;

/** Classic Receipt mode (thermal printer); `price` is the kiosk's built-in default in THB. */
export const CLASSIC_TEMPLATES = [
  { id: 'newspaper', name: 'The Daily News', shots: 1, price: 40 },
  { id: 'receipt', name: 'Classic Receipt', shots: 1, price: 30 },
  { id: 'filmstrip', name: '35mm Film Strip', shots: 3, price: 50 },
  { id: 'polaroid', name: 'Polaroid Retro', shots: 1, price: 35 }
] as const;
export type ClassicTemplateId = (typeof CLASSIC_TEMPLATES)[number]['id'];

/** AI scenes are platform-managed only (customers can switch them on/off, not edit them). */
export const AI_SCENE_CATEGORIES = [
  { id: 'movie', name: 'ภาพยนตร์' },
  { id: 'festival', name: 'เทศกาล' },
  { id: 'thailand', name: 'ท่องเที่ยวไทย' }
] as const;

/** AI scenes are platform-managed only (customers can switch them on/off, not edit them). Same ids as the kiosk (aiTemplateData.js). */
export const AI_SCENES = [
  { id: 'neon-city', name: 'Neon Dreams', desc: 'เมืองนีออนยามค่ำคืนกลางสายฝน แจ็กเก็ตเทคแวร์เรืองแสง', category: 'movie' },
  { id: 'astronaut', name: 'Beyond the Stars', desc: 'ชุดนักบินอวกาศ โลกและแสงอาทิตย์จากวงโคจร', category: 'movie' },
  { id: 'hollywood', name: 'Born to Shine', desc: 'ม่านกำมะหยี่แดง สปอตไลต์สีทอง ชุดราตรีและทักซิโด้', category: 'movie' },
  { id: 'rockstar', name: 'Louder Than Life', desc: 'เวทีคอนเสิร์ตยักษ์ ไฟสปอตไลต์ กีตาร์ไฟฟ้า', category: 'movie' },
  { id: 'superhero', name: 'Rise of a Hero', desc: 'ชุดฮีโร่เกราะน้ำเงิน-ทองพร้อมผ้าคลุม เหนือเมืองยามเย็น', category: 'movie' },
  { id: 'seoul-romance', name: 'Spring in Seoul', desc: 'ถนนซากุระบานสะพรั่ง แสงพาสเทลนุ่มละมุน', category: 'movie' },
  { id: 'noir', name: 'Midnight Case', desc: 'ขาวดำคอนทราสต์จัด โค้ทยาวกับหมวกเฟดอร่า ตัวอักษรสีแดง', category: 'movie' },
  { id: 'fantasy', name: 'The Last Kingdom', desc: 'ชุดเกราะราชวงศ์ ผ้าคลุมแดง ปราสาทและมังกรยามอาทิตย์ตก', category: 'movie' },
  { id: 'racing', name: 'Full Throttle', desc: 'ชุดนักแข่งขาว-แดง สนามแข่งกลางคืนและแสงไฟพุ่ง', category: 'movie' },
  { id: 'lost-temple', name: 'Lost Temple', desc: 'ซากวิหารโบราณกลางป่าดิบ แสงลอดม่านหมอก', category: 'movie' },
  { id: 'songkran', name: 'Songkran Festival', desc: 'ถนนสงกรานต์ สาดน้ำ ละอองน้ำระยิบระยับ เสื้อลายดอกและพวงมาลัย', category: 'festival' },
  { id: 'loy-krathong', name: 'Loy Krathong', desc: 'คืนเพ็ญริมแม่น้ำ กระทงใบตองแสงเทียน ชุดไทย', category: 'festival' },
  { id: 'yi-peng', name: 'Yi Peng · Chiang Mai', desc: 'โคมลอยนับร้อยบนฟ้ายามค่ำ เชียงใหม่ ชุดล้านนา', category: 'festival' },
  { id: 'chinese-new-year', name: 'Chinese New Year', desc: 'โคมแดงเรียงราย ถนนเยาวราช ชุดกี่เพ้าและชุดจีนสีแดงทอง', category: 'festival' },
  { id: 'wat-arun', name: 'Wat Arun · Bangkok', desc: 'ริมแม่น้ำเจ้าพระยา ยอดพระปรางค์วัดอรุณยามพระอาทิตย์ตก', category: 'thailand' },
  { id: 'phi-phi', name: 'Phi Phi Islands', desc: 'หาดทรายขาว น้ำทะเลสีเทอร์ควอยซ์ หน้าผาหินปูน เรือหางยาว', category: 'thailand' },
  { id: 'doi-inthanon', name: 'Doi Inthanon', desc: 'ทะเลหมอกสีทองยามรุ่ง พระมหาธาตุเจดีย์คู่ ดอกนางพญาเสือโคร่ง', category: 'thailand' },
  { id: 'red-lotus-sea', name: 'Red Lotus Sea', desc: 'ล่องเรือกลางทะเลบัวแดงสุดลูกหูลูกตา หมอกบาง ๆ ยามเช้า', category: 'thailand' },
  { id: 'ayutthaya', name: 'Ayutthaya', desc: 'วัดไชยวัฒนาราม เจดีย์อิฐโบราณ แสงบ่ายสีทอง ชุดไทยโบราณ', category: 'thailand' },
  { id: 'yaowarat', name: 'Yaowarat', desc: 'ถนนเยาวราชยามค่ำ ไฟนีออนแดงทอง ท่าโพสเท่ ๆ แบบนิตยสารแฟชั่น', category: 'thailand' },
  { id: 'yaowarat-candid', name: 'Yaowarat Candid', desc: 'เดินชิล ๆ ริมถนนเยาวราช มุมเผลอแบบช่างภาพสตรีท เลนส์เทเล แฟลช ไฟนีออนละลาย', category: 'thailand' },
  { id: 'yaowarat-tuktuk', name: 'Yaowarat Tuk-Tuk', desc: 'ยืนพิงรถตุ๊กตุ๊กกลางเยาวราชยามค่ำ โพสท่าเท่ ๆ ไฟแฟลชแบบช่างภาพ', category: 'thailand' }
] as const;

export interface EventPreset {
  id: string;
  name: string;
  title: string;
  subtitle: string;
  accent: string;
  layouts: string[];
}

export const EVENT_PRESETS: readonly EventPreset[] = [
  { id: 'general', name: 'ทั่วไป', title: 'SCLUO-DIO PHOTO BOOTH', subtitle: '', accent: '', layouts: [] },
  { id: 'wedding', name: 'งานแต่งงาน', title: 'Somchai & Somying', subtitle: 'Happily Ever After', accent: '#C9A45C', layouts: ['classic', 'luxe', 'editorial', 'kbooth', 'scrapbook', 'full'] },
  { id: 'birthday', name: 'วันเกิด', title: 'HAPPY BIRTHDAY', subtitle: 'Make a wish!', accent: '#F48FC2', layouts: ['pastel', 'polaroid', 'filmduo', 'popart', 'y2k', 'scrapbook', 'kbooth', 'classic'] },
  { id: 'party', name: 'ปาร์ตี้ / คอนเสิร์ต', title: 'PARTY NIGHT', subtitle: 'Live • Love • Dance', accent: '#FF3CAC', layouts: ['neon', 'filmduo', 'y2k', 'zine', 'magazine', 'ticket', 'popart', 'receipt'] },
  { id: 'corporate', name: 'องค์กร / สัมมนา', title: 'ANNUAL MEETING 2026', subtitle: 'Together we grow', accent: '#2563EB', layouts: ['classic', 'editorial', 'ticket', 'magazine', 'full', 'kbooth'] },
  { id: 'graduation', name: 'รับปริญญา', title: 'CONGRATULATIONS', subtitle: 'Class of 2026', accent: '#1E3A8A', layouts: ['classic', 'luxe', 'magazine', 'editorial', 'kbooth', 'film'] },
  { id: 'festival', name: 'เทศกาล / แฟร์', title: 'SUMMER FEST', subtitle: 'Good vibes only', accent: '#F59E0B', layouts: ['retro', 'filmduo', 'receipt', 'dailynews', 'popart', 'zine', 'ticket', 'y2k', 'film'] },
  { id: 'christmas', name: 'คริสต์มาส / ปีใหม่', title: 'MERRY CHRISTMAS', subtitle: 'Happy New Year 2027', accent: '#C0392B', layouts: ['classic', 'luxe', 'pastel', 'kbooth', 'scrapbook', 'magazine'] }
];

/** Fonts the kiosk ships; uploaded templates may only use these (Thai text always uses Sarabun). */
export const TEMPLATE_FONTS = ['Sarabun', 'Fredoka', 'Playfair Display', 'Caveat', 'Space Grotesk', 'Pacifico', 'Bangers'] as const;

export const PHOTO_LAYOUT_IDS = PHOTO_LAYOUTS.map((l) => l.id);
export const BADGE_FRAME_IDS = BADGE_FRAMES.map((f) => f.id);
export const AI_SCENE_IDS = AI_SCENES.map((s) => s.id);
export const CLASSIC_TEMPLATE_IDS = CLASSIC_TEMPLATES.map((t) => t.id);
