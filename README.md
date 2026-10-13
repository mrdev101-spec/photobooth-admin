# Photobooth Admin

Web Admin แบบหลายลูกค้า (multi-tenant) สำหรับจัดการตู้ถ่ายรูป SCLUO-DIO — ลูกค้าแต่ละรายจัดการตู้ของตัวเอง ทีมแพลตฟอร์มดูแลลูกค้า โควตา AI และการรับเงินผ่าน Stripe ของบริษัท

- เอกสารออกแบบ: [docs/ADMIN_SYSTEM_DESIGN.md](docs/ADMIN_SYSTEM_DESIGN.md)
- โปรเจกต์ตู้: `C:\my-dev\photobooth-v1` (สัญญาฝั่งตู้: `docs/WEB_ADMIN_INTEGRATION.md`)

## สถานะ

| Phase | สถานะ |
|---|---|
| 0. Foundation | ✅ monorepo, Next.js 16, MariaDB schema + migration, ระบบแยกลูกค้า, login/session, RBAC 2 ระดับ, Platform console (ลูกค้า, โควตา, สิทธิ์รับเงินจริง, รหัสข้อผิดพลาด, audit), พื้นที่ลูกค้า (ภาพรวม, สาขา, สมาชิก, audit) |
| 1. Pairing + Heartbeat | ✅ เพิ่มตู้ (ตามโควตา), รหัสจับคู่ 15 นาที, `POST /kiosk/pair`, `POST /kiosk/heartbeat`, สถานะสด/ต้องดูแล, ตรวจเครื่องเปลี่ยน (fingerprint), ปิดปรับปรุง, ยกเลิกการเชื่อมต่อ, ตู้ทั้งหมดใน Platform console |
| 2. Config + Storage | ✅ หน้าแก้การตั้งค่าตู้ (ทุกโหมด, ธีมงาน, รหัสผู้ดูแลแบบ hash), revision + diff + ย้อนกลับ, กันบันทึกทับกัน, `GET /kiosk/config` (304), `POST /kiosk/config/ack`, R2 แยกต่อลูกค้า (ตั้ง/ทดสอบ/หมุน key ใน Platform console) และส่ง key ลงตู้แบบเข้ารหัสด้วย device token |
| ขอบเขตแพลตฟอร์ม/ลูกค้า (§17) | ✅ ลงทะเบียนตู้โดยแพลตฟอร์ม, เปิด/ปิดการใช้งานตู้, หน้าลูกค้าแบบแท็บ (ภาพรวม/ตู้/ผู้ใช้/ขีดจำกัดและสิทธิ์/พื้นที่เก็บภาพ), โควตาตู้และผู้ใช้ (ว่าง = ไม่จำกัด), สิทธิ์ตั้งค่าตู้รายหมวด บังคับที่ server |
| หน้างาน: ออเดอร์ จุดรับรูป ยอดขาย Template (§18) | ✅ `POST /orders` และ `/orders/{ref}/printed` จากตู้, จุดรับรูป (คิวอัปเดตทุก 4 วินาที, เสียงและการแจ้งเตือน, สแกน QR/พิมพ์รหัส, พิมพ์ 4x6 ผ่านเบราว์เซอร์, ส่งมอบ, อนุญาตพิมพ์ซ้ำ), รายการออเดอร์และรายละเอียด, ยอดขายรายวัน/รายตู้/รายสินค้า และ CSV, KPI วันนี้บนภาพรวม, Template ของลูกค้าแบบแสดง/ซ่อน (รายตู้หรือทุกตู้), คลัง Template ส่วนกลาง (เลิกใช้/เปิดใช้ ส่งไปทุกตู้), ติดธงออเดอร์เงินจริงจากบัญชีที่ยังไม่อนุญาต (migration 0005) |
| เพิ่ม/อัปเดต Template จากส่วนกลาง (§18.7) | ✅ สร้าง template (4x6, เข็มกลัด, Classic, ฉาก AI) อัปโหลด PNG กรอบ ลากวางช่องรูป/ข้อความ ดูตัวอย่างสด ร่าง/เผยแพร่/ย้อนเวอร์ชัน, `GET /kiosk/assets/manifest`, ตู้เก่าไม่ได้ id `tpl_` (migration 0006-0007) • ตู้ต้องรองรับตาม `docs/KIOSK_TEMPLATE_MANIFEST.md` |
| 3. Events & Logs | ถัดไป |

ยังไม่ได้ทำใน Phase 0: TOTP 2FA (คอลัมน์พร้อมแล้ว), cron ล้าง session ที่หมดอายุ

## โครงสร้าง

```
apps/admin           Next.js (UI + Kiosk API) — deploy บน Vercel
packages/contracts   Zod schema ที่ใช้ร่วมกับตู้ (การตั้งค่าตู้, Kiosk API, รูปแบบ error) + `@photobooth/contracts/node`: เปิด secrets และตรวจรหัสผู้ดูแล (ตู้ใช้โค้ดเดียวกันได้)
packages/catalog     template / กรอบ / ฉาก AI / ธีมงานในตัว (id เดียวกับโค้ดตู้)
packages/error-codes รหัสข้อผิดพลาดของตู้ (สำเนา aiErrorCodes.json) + กลุ่ม AD ของ Admin
```

ภายใน `apps/admin`:

- `server/` โค้ดฝั่ง server — `db/` (schema, migrations), `auth/` (session, RBAC, context), `tenancy/` (บังคับ `org_id`), `services/` (logic ทางธุรกิจ)
- `app/platform/…` Platform console (ทีมเรา) • `app/o/[orgSlug]/…` พื้นที่ลูกค้า • `app/(auth)/…` login / เปลี่ยนรหัสผ่าน

**กฎการแยกลูกค้า:** ทุก query บนตารางของลูกค้าต้องผ่าน `orgWhere(ctx, table.orgId, …)` และ service ต้องรับ `OrgContext` — `org_id` มาจาก session เสมอ ไม่รับจากฟอร์ม

## เริ่มพัฒนา

ต้องมี Node.js 22+ และ MariaDB 10.11+ (หรือ 11.4 LTS)

1. สร้างฐานข้อมูล

   ```sql
   CREATE DATABASE photobooth_admin CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
   CREATE USER 'photobooth'@'%' IDENTIFIED BY '<password>';
   GRANT ALL PRIVILEGES ON photobooth_admin.* TO 'photobooth'@'%';
   ```

2. ติดตั้งและตั้งค่า

   ```bash
   npm install
   ```

   คัดลอก `apps/admin/.env.example` เป็น `apps/admin/.env.local` แล้วกรอก `DATABASE_URL`, `MASTER_KEY` และ `SEED_ADMIN_*`

3. สร้างตารางและผู้ดูแลแพลตฟอร์มคนแรก

   ```bash
   npm run db:migrate
   ```

   ```bash
   npm run db:seed
   ```

4. รัน

   ```bash
   npm run dev
   ```

   เปิด http://localhost:3100 แล้วเข้าสู่ระบบด้วยบัญชีจาก `SEED_ADMIN_*`

## ฐานข้อมูลในเครื่อง (Windows)

เครื่องพัฒนานี้ใช้ MariaDB ที่ติดตั้งด้วย `winget install MariaDB.Server` แต่ไม่ได้รันเป็น Windows service ข้อมูลอยู่ที่ `.local/mariadb` (อยู่ใน `.gitignore`) รหัสผ่าน root อยู่ใน `.local/db.env` และค่าของแอปอยู่ใน `apps/admin/.env.local` (สร้างอัตโนมัติ ไม่อยู่ใน git)

เปิดฐานข้อมูลก่อนรัน `npm run dev`:

```bash
powershell -ExecutionPolicy Bypass -File scripts/local-db.ps1
```

หมายเหตุ: เครื่องนี้เป็น MariaDB 13 ส่วน production ควรทดสอบกับเวอร์ชันเดียวกับที่ทีมใช้จริงก่อนขึ้นระบบ

## คำสั่ง

| คำสั่ง | ใช้ทำอะไร |
|---|---|
| `npm run dev` | dev server (พอร์ต 3100) |
| `npm run build` | production build |
| `npm test` | unit tests ทุก workspace (ไม่แตะฐานข้อมูล) |
| `npm run test:integration -w @photobooth/admin` | integration test ที่เขียนลง DB ใน `apps/admin/.env.local` (ใช้กับ DB ทดสอบเท่านั้น) |
| `npm run typecheck` | ตรวจ TypeScript ทุก workspace |
| `npm run db:generate` | สร้าง migration SQL จาก `server/db/schema.ts` (ไม่ต้องต่อ DB) |
| `npm run db:migrate` | รัน migration กับ DB ใน `DATABASE_URL` |
| `npm run db:seed` | สร้าง/เลื่อนขั้นผู้ดูแลแพลตฟอร์มจาก `SEED_ADMIN_*` |

## Branches และขั้นตอนขึ้นระบบ

| Branch | ใช้ทำอะไร |
|---|---|
| `main` | **Production**: deploy ขึ้นระบบจริงจาก `main` เท่านั้น |
| `dev` | รวมงานที่พัฒนาเสร็จแล้ว (deploy ขึ้น staging / Vercel Preview เพื่อทดสอบ) |
| `feature/…`, `fix/…` | งานแต่ละชิ้น แตกจาก `dev` แล้ว merge กลับเข้า `dev` |

1. แตก branch งานจาก `dev` → พัฒนา (`npm run typecheck`, `npm test`) → merge เข้า `dev`
2. ทดสอบ `dev` บน staging ร่วมกับตู้ทดสอบ
3. ผ่านแล้ว merge `dev` → `main` และติด tag เวอร์ชัน ก่อน deploy production (รัน migration ก่อน deploy)
4. แก้ด่วน: `hotfix/…` จาก `main` → merge เข้า `main` และ `dev`

## Deploy

ดูขั้นตอนเต็มใน [docs/DEPLOY.md](docs/DEPLOY.md): environment variables ทั้งหมด, ลำดับ migrate และ seed, Stripe webhook, R2, cron เก็บกวาด, `/healthz`, backup และ checklist ก่อนเปิดรับเงินจริง

- Vercel: Root Directory `apps/admin`, Region `sin1` (ตั้งใน `vercel.json` พร้อม cron), ต้องใช้แพ็กเกจ Pro
- รัน `npm run db:migrate` กับ DB production ก่อน deploy เวอร์ชันที่มี migration ใหม่

## หมายเหตุ MariaDB

- ใช้ Drizzle แบบ `mysql` dialect: MariaDB คืน JSON เป็นข้อความ จึงใช้ `jsonText()` (`server/db/json-text.ts`) แทน `json()` ของ Drizzle
- เวลาเก็บเป็น UTC ทั้งหมด (`timezone: 'Z'` และ `SET time_zone = '+00:00'`) แสดงผลเป็นเวลาไทย
- MariaDB ไม่มี `UPDATE … RETURNING` — งานที่ต้อง atomic ใช้ `UPDATE … WHERE` แล้วตรวจ `affectedRows`

### ทดสอบ API ของตู้ในเครื่อง

```bash
OUT_FILE=/path/to/kiosk.json npx tsx --env-file-if-exists=.env.local scripts/dev-kiosk-token.ts party-booth
```

ออก device token ให้ตู้ที่จับคู่แล้ว (เขียนลงไฟล์ ไม่พิมพ์ออกหน้าจอ) แล้วใช้เป็น `Authorization: Bearer` เพื่อยิง `/orders` หรือ `/kiosk/config` (รันใน `apps/admin` ใช้กับเครื่อง dev เท่านั้น)
