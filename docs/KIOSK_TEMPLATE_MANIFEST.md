# Template ที่ส่วนกลางอัปโหลด: สิ่งที่ตู้ต้องรองรับ

เอกสารสำหรับทีมตู้ (photobooth-v1) ฝั่ง Admin พร้อมแล้ว ตามรูปแบบใน `WEB_ADMIN_INTEGRATION.md` หัวข้อ "รูปแบบ Template"

Schema อยู่ใน `packages/contracts/src/templates.ts` (Zod) ใช้ชื่อฟิลด์ตามนี้ทุกตัว

## 1. ภาพรวม

- template ในตัว (วาดด้วยโค้ดตู้) ใช้เหมือนเดิม Admin เปิด/ปิดด้วย id
- template ที่อัปโหลดมีรหัสขึ้นต้นด้วย `tpl_` เสมอ (`^tpl_[a-z0-9][a-z0-9_-]{1,58}$`) จึงไม่ชนกับ id ในตัว
- ใช้ได้ 4 หมวด: `photo-4x6`, `badge`, `classic`, `ai-scene`
- ไฟล์ตั้งชื่อตาม sha256 (`catalog/<sha256>.png|jpg`) ไฟล์เดิมไม่เปลี่ยนเนื้อหาเลย cache ได้ตลอด
- การแก้ template สร้าง `version` ใหม่ที่ชี้ไปยังไฟล์ใหม่

## 2. API

### `GET /kiosk/assets/manifest?since={rev}`

Header เหมือน API อื่น: `Authorization: Bearer <deviceToken>` และ `X-Kiosk-Id`

- ตอบ `304` ถ้า `since` ≥ revision ปัจจุบัน
- ตอบ `200` พร้อม `AssetManifestResponse`:

```jsonc
{
  "revision": 7,
  "generatedAt": "2026-10-01T03:12:00.000Z",
  "templates": [
    {
      "id": "tpl_summerfest",
      "version": 3,
      "kind": "photo-4x6",
      "name": "Summer Fest 2026",
      "desc": "กรอบโทนส้มพีช ภาพใหญ่ พร้อมชื่องานด้านล่าง",
      "tags": ["festival", "summer"],
      "files": {
        "overlay": { "url": "https://…/catalog/355172…e1.png", "sha256": "355172…e1", "width": 1200, "height": 1800, "bytes": 25370 },
        "preview": { "url": "https://…/catalog/e79347…07.jpg", "sha256": "e79347…07", "width": 480, "height": 720 }
      },
      "spec": {
        "background": "#FFFFFF",
        "photoSlots": [{ "x": 90, "y": 90, "w": 1020, "h": 1300, "radius": 40, "rotate": 0, "focus": "face" }],
        "textSlots": [
          { "field": "event.title", "x": 600, "y": 1488, "maxWidth": 980, "font": "Fredoka", "weight": 700, "size": 88, "minSize": 48, "color": "#FFFFFF", "align": "center", "letterSpacing": 0, "path": "straight" }
        ],
        "defaultFilter": "natural"
      }
    }
  ]
}
```

- `templates` มีเฉพาะ template ที่เผยแพร่อยู่ ตัวที่หายไปจากรายการคือถูกเลิกใช้ ให้ตู้ลบออก
- เมื่อเรียก endpoint นี้ครั้งแรก Admin จะถือว่าตู้รองรับ template อัปโหลดแล้ว จากนั้น `/kiosk/config` ของตู้นั้นจะมี id `tpl_…` ได้
  - ตู้ที่ยังไม่เคยเรียกจะไม่ได้รับ id `tpl_…` เลย ตู้เวอร์ชันเก่าจึงไม่พัง
- `heartbeat.manifestRevision` และ `config.assets.manifestRevision` บอก revision ล่าสุด ถ้าไม่ตรงกับที่ตู้มีให้ดึง manifest ใหม่

## 3. ขั้นตอนฝั่งตู้

1. heartbeat ได้ `manifestRevision` ไม่ตรงกับที่เก็บไว้ ให้เรียก `GET /kiosk/assets/manifest?since=<ของเดิม>`
2. ดาวน์โหลดเฉพาะไฟล์ที่ sha256 ยังไม่มีในเครื่อง ตรวจ sha256 (และ width/height ถ้ามี) ไฟล์ไหนไม่ตรงให้ทิ้งทั้งชุดแล้วลองใหม่ภายหลัง
3. ไฟล์ครบแล้วค่อยสลับใช้ชุดใหม่พร้อมกันทั้งชุด ตอนอยู่หน้าแรก (เหมือนการตั้งค่า)
4. ไฟล์ที่ไม่มี template ไหนอ้างถึงแล้ว ลบได้

## 4. การแสดงและการพิมพ์ (ช่องและไฟล์)

**กรอบ (photo-4x6 / badge / classic):**
1. เติมพื้นด้วย `spec.background`
2. วางภาพลูกค้าในแต่ละช่องของ `photoSlots` แบบ cover (ครอปให้หัวไม่ขาด) ใส่ `defaultFilter` และหมุนรอบจุดกลางตาม `rotate` (องศา)
   - ช่องสี่เหลี่ยม `{x,y,w,h,radius,rotate,focus}` มุมโค้งตาม `radius`
   - ช่องวงกลม (เข็มกลัด) `{shape:"circle",cx,cy,r,focus}`
   - `focus:"face"` = จัดหน้าให้อยู่กลางช่อง
   - ลูกค้าถ่ายน้อยกว่าจำนวนช่อง ให้วนใช้ภาพเดิม
3. วาด `files.overlay` ทับเต็มแผ่น ช่องรูปใน PNG โปร่งใส
4. วาดข้อความแต่ละช่องของ `textSlots`:
   - `field` คือข้อมูลที่ตู้เติมเอง: `event.title`, `event.subtitle`, `event.date`, `brand.brandName` หรือใช้ `text` ที่เป็นข้อความคงที่ (มีอย่างใดอย่างหนึ่งเท่านั้น)
   - `x,y` คือจุด baseline ของข้อความ ตามค่า `align`
   - ข้อความยาวเกิน `maxWidth` ให้ย่อทีละ 1px ลงได้ถึง `minSize`
   - `path: "arc-top" | "arc-bottom"` (เข็มกลัด) วาดตามวงกลมรอบจุดกลางภาพ รัศมีเท่ากับระยะจากจุดกลางถึง `(x,y)`
5. Classic: ทั้งใบเป็นขาวดำ ตู้แปลงเป็นเม็ดสกรีนเองตามเดิม

ฟอนต์ที่ใช้ได้: Sarabun, Fredoka, Playfair Display, Caveat, Space Grotesk, Pacifico, Bangers ข้อความภาษาไทยใช้ Sarabun แทนเสมอ

ขนาดไฟล์ (Admin ตรวจตั้งแต่อัปโหลด):
- photo-4x6: 1200 × 1800
- badge: 1000 × 1000
- classic: กว้าง 576 หรือ 384 สูง 300–4000
- PNG ต้องมีพื้นที่โปร่งใส

**ฉาก AI (`ai-scene`):**
- ใช้ `files.plate` เป็นภาพฉากอ้างอิง และ `files.female` / `files.male` เป็นภาพตัวอย่างให้ลูกค้าเลือก
- `spec.prompt` คือคำอธิบายฉากที่ Admin ใช้ตอนเรียก AI แทนตู้
- `spec.baseGender` คือเพศของภาพฉาก และ `spec.accent` คือสีประจำฉาก

## 5. การตั้งค่าตู้ (`/kiosk/config`)

- `templates.photoLayouts`, `badgeFrames`, `classic`, `aiScenes` มี id `tpl_…` ได้ (เฉพาะตู้ที่เคยดึง manifest)
- รายการว่าง `[]` = ทุกแบบที่เผยแพร่อยู่ **รวม template อัปโหลด** สำหรับตู้ที่รองรับ manifest
- `photoDefaultLayout` / `badgeDefaultFrame` เป็น id `tpl_…` ได้
- id ที่ไม่มีใน manifest (เช่นเพิ่งถูกเลิกใช้) ให้ข้ามไป ถ้าแบบเริ่มต้นหายไปให้ใช้แบบแรกที่เหลือ

## 6. สิ่งที่ฝั่ง Admin ยังรอ

- ตัวแสดงผลกลางจากทีมตู้ (ไฟล์ JS ไฟล์เดียว) ตอนนี้ Admin ใช้ตัวแสดงผลที่เขียนตามสเปกนี้ (`apps/admin/lib/frame-render.ts`) ถ้าได้ไฟล์จากทีมตู้จะเปลี่ยนไปใช้ เพื่อให้ภาพตัวอย่างตรงกับที่ตู้พิมพ์ 100%
- Bucket R2 ของบริษัท (`PLATFORM_R2_*`) ระหว่างรอ ไฟล์เก็บในเครื่องที่รัน Admin และเสิร์ฟที่ `/catalog-assets/<file>`
- บน Vercel ขนาดคำขอจำกัดที่ 4.5 MB ถ้าไฟล์กรอบใหญ่กว่านี้ต้องเพิ่มการอัปโหลดตรงไป R2 (presigned URL)
