# เริ่มต้นพัฒนา: ระบบแอดมิน (photobooth-admin)

คู่มือติดตั้งและรันระบบแอดมินแบบละเอียด ตั้งแต่เครื่องเปล่าจนจับคู่ตู้ทดสอบได้ ถ้าย้ายมาจากเครื่องที่พัฒนาอยู่แล้ว (มีฐานข้อมูลและ `MASTER_KEY` เดิม) ให้ใช้คู่มือ `docs/NEW_MACHINE_SETUP.md` ใน repo ตู้ ([photobooth-v1](https://github.com/mrdev101-spec/photobooth-v1)) แทนข้อ 4–6

## 1. ภาพรวม

| ส่วน | อยู่ที่ |
|---|---|
| เว็บแอดมิน (Next.js 16 App Router, React 19, Tailwind 4, shadcn/ui) | `apps/admin` |
| ชนิดข้อมูลที่ใช้ร่วมกับตู้ (API ของตู้, ค่าตั้งตู้) | `packages/contracts` |
| แคตตาล็อกเทมเพลต, รหัสข้อผิดพลาด | `packages/catalog`, `packages/error-codes` |
| ฐานข้อมูล | MariaDB ผ่าน Drizzle (`apps/admin/server/db/schema.ts`, migration ใน `apps/admin/server/db/migrations`) |
| ตัวอย่างค่าตั้ง | `apps/admin/.env.example` |
| ออกแบบระบบ / ขึ้นระบบจริง | [ADMIN_SYSTEM_DESIGN.md](ADMIN_SYSTEM_DESIGN.md), [DEPLOY.md](DEPLOY.md) |

พอร์ต dev: **3100** ตู้ในเครื่อง (repo photobooth-v1) รันที่ 3002

## 2. โปรแกรมที่ต้องติดตั้ง

| โปรแกรม | ติดตั้ง |
|---|---|
| Git | `winget install Git.Git` |
| Node.js 22 ขึ้นไป (เครื่องพัฒนาใช้ 24) | `winget install OpenJS.NodeJS --version 24.19.0` |
| MariaDB 10.11 ขึ้นไป (เครื่องพัฒนาใช้ 13) | `winget install MariaDB.Server` |
| Stripe CLI (ถ้าทดสอบ webhook การจ่ายเงิน) | `winget install Stripe.StripeCli` |

MariaDB ติดตั้งแล้ว **ไม่ต้อง** ใช้ service ของ Windows โปรเจกต์นี้ใช้ฐานข้อมูลแยกในโฟลเดอร์ `.local/mariadb` ของ repo (อยู่ใน `.gitignore`)

## 3. ดึงโค้ดและติดตั้ง

```powershell
git clone https://github.com/mrdev101-spec/photobooth-admin.git C:\my-dev\photobooth-admin
```

```powershell
cd C:\my-dev\photobooth-admin
```

```powershell
git switch dev
```

```powershell
npm install
```

## 4. สร้างฐานข้อมูลในเครื่อง (ครั้งแรก)

1. ตั้งรหัส root ของฐานข้อมูลในเครื่อง แล้วเก็บไว้ในไฟล์ `.local/db.env` บรรทัดเดียว:

   ```text
   MARIADB_ROOT_PASSWORD=<รหัสที่ตั้งเอง>
   ```

2. สร้างโฟลเดอร์ข้อมูล (แก้ `MariaDB 13.0` ให้ตรงกับเวอร์ชันที่ติดตั้ง):

   ```powershell
   & "C:\Program Files\MariaDB 13.0\bin\mariadb-install-db.exe" --datadir=C:\my-dev\photobooth-admin\.local\mariadb --password=<รหัส root>
   ```

3. เปิดฐานข้อมูล (หน้าต่างนี้ต้องเปิดค้างไว้ตลอดที่พัฒนา):

   ```powershell
   powershell -ExecutionPolicy Bypass -File scripts/local-db.ps1
   ```

4. อีกหน้าต่าง เข้า MariaDB ด้วย root แล้วสร้างฐานข้อมูลและผู้ใช้ของแอป:

   ```powershell
   & "C:\Program Files\MariaDB 13.0\bin\mariadb.exe" -h 127.0.0.1 -u root -p
   ```

   ```sql
   CREATE DATABASE photobooth_admin CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
   CREATE USER 'photobooth'@'%' IDENTIFIED BY '<รหัสของแอป>';
   GRANT ALL PRIVILEGES ON photobooth_admin.* TO 'photobooth'@'%';
   ```

## 5. ตั้งค่า `apps/admin/.env.local`

คัดลอก `apps/admin/.env.example` เป็น `apps/admin/.env.local` แล้วกรอก:

| ตัวแปร | ค่าในเครื่อง dev |
|---|---|
| `DATABASE_URL` | `mysql://photobooth:<รหัสของแอป>@127.0.0.1:3306/photobooth_admin` |
| `DATABASE_SSL` | เว้นว่าง (ใช้ `true` เฉพาะฐานข้อมูลบนอินเทอร์เน็ต) |
| `MASTER_KEY` | สุ่มใหม่ด้วยคำสั่งด้านล่าง ใช้เข้ารหัส key ของ Stripe / R2 / AI ที่เก็บในฐานข้อมูล |
| `SEED_ADMIN_EMAIL`, `SEED_ADMIN_NAME`, `SEED_ADMIN_PASSWORD` | บัญชีผู้ดูแลแพลตฟอร์มคนแรก |
| `ADMIN_PUBLIC_URL` | เว้นว่างได้ใน dev (production ต้องเป็น https) |
| `RESEND_API_KEY`, `EMAIL_FROM` | เว้นว่างได้ใน dev: รหัสยืนยันการเข้าสู่ระบบจะพิมพ์ใน log ของ dev server แทนการส่งอีเมล |
| `PLATFORM_R2_*` | เว้นว่างได้ใน dev: ไฟล์เทมเพลตกลางเก็บที่ `.local/catalog-assets` |
| `CRON_SECRET` | เว้นว่างได้ใน dev |

สุ่ม `MASTER_KEY`:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

`MASTER_KEY` ต้องคู่กับฐานข้อมูลเสมอ ถ้าเปลี่ยนหรือหาย key ที่เคยบันทึกไว้จะอ่านไม่ได้และต้องกรอกใหม่ทั้งหมด

## 6. สร้างตารางและผู้ดูแลคนแรก

```powershell
npm run db:migrate
```

```powershell
npm run db:seed
```

หลัง seed แล้ว ลบ `SEED_ADMIN_PASSWORD` ออกจาก `.env.local` ได้

## 7. รัน

```powershell
npm run dev
```

เปิด http://localhost:3100 แล้วเข้าสู่ระบบด้วยบัญชี `SEED_ADMIN_*` ทีมแพลตฟอร์มและเจ้าของร้านต้องใส่รหัส 6 หลักที่ส่งทางอีเมล ใน dev ให้ดูรหัสจากบรรทัด `[email:dev]` ใน log ของ dev server

## 8. ตั้งค่าในแอดมินสำหรับการทดสอบ

1. **การชำระเงิน:** Platform › การรับเงิน ใส่ Stripe key โหมดทดสอบ (`sk_test_…`) และ restricted key สำหรับตู้ตอนแอดมินล่ม (`rk_test_…`, สิทธิ์ PaymentIntents: Write)
2. **AI:** Platform › ตั้งค่า AI ใส่ key ของผู้ให้บริการ (เช่น Google AI Studio)
3. **ร้านทดสอบ:** Platform › บัญชีลูกค้า สร้างร้าน แล้วตั้งค่า R2 ของร้าน (bucket รูปลูกค้า) และสาขา
4. **ตู้:** Platform › ตู้ ดูตู้ทั้งหมดทั้งในคลังตู้และที่ร้าน และออก Key ให้ตู้ที่ติดตั้งจากตัวติดตั้ง หรือจับคู่ตู้ในเครื่องจากหน้าร้าน (ข้อ 9)
5. **ฉาก AI ในตัว (ถ้าต้องการ):** นำเข้าภาพฉากจากโฟลเดอร์ `data/ai-scenes` ของตู้:

   ```powershell
   npx tsx --import ./scripts/allow-server-only.mjs --env-file-if-exists=.env.local scripts/import-ai-scenes.ts C:\my-dev\photobooth-v1\data\ai-scenes
   ```

   (รันใน `apps/admin`)

## 9. จับคู่กับตู้ในเครื่อง

1. รันตู้ใน repo photobooth-v1 (`npm run dev` ที่ http://localhost:3002)
2. แอดมิน: เข้าหน้าร้าน (`/o/<slug ร้าน>`) › ตู้ › เลือกตู้ › "จับคู่ตู้" ได้รหัส 8 ตัว
3. ตู้: Config › การตั้งค่า › "เชื่อมต่อ Admin Portal" ใส่ `http://localhost:3100` และรหัส
4. ตู้จะขึ้นสถานะออนไลน์ในแอดมินภายใน 1 นาที

## 10. ทดสอบ webhook ของ Stripe

ส่งต่อ webhook โหมดทดสอบเข้าแอดมินในเครื่อง (ล็อกอิน Stripe CLI ด้วย `stripe login` ครั้งแรก):

```powershell
stripe listen --forward-to localhost:3100/webhooks/stripe
```

นำ `whsec_…` ที่ได้ไปใส่ช่อง Webhook signing secret ใน Platform › การรับเงิน (ร้านที่ใช้บัญชี Stripe ของตัวเองใช้ `/webhooks/stripe/<orgId>`)

## 11. คำสั่งที่ใช้บ่อย

| คำสั่ง | ใช้ทำอะไร |
|---|---|
| `npm run dev` | dev server พอร์ต 3100 |
| `npm run typecheck` | ตรวจ TypeScript ทุก workspace |
| `npm test` | unit test (ไม่แตะฐานข้อมูล) |
| `npm run test:integration -w @photobooth/admin` | integration test ที่เขียนลงฐานข้อมูลใน `.env.local` (ใช้กับฐานข้อมูลทดสอบเท่านั้น) |
| `npm run db:generate` | สร้าง migration SQL หลังแก้ `server/db/schema.ts` |
| `npm run db:migrate` | รัน migration กับ `DATABASE_URL` |
| `npm run build` | build production |

สคริปต์ช่วยใน `apps/admin/scripts` (รันใน `apps/admin`, ไม่พิมพ์รหัสออกหน้าจอ):

| สคริปต์ | ใช้ทำอะไร |
|---|---|
| `set-password.ts` | ตั้งรหัสผ่านผู้ใช้ใหม่โดยไม่ผ่านหน้าเว็บ: `NEW_PASSWORD=… npx tsx --env-file-if-exists=.env.local scripts/set-password.ts <อีเมล>` |
| `dev-kiosk-token.ts` | ออก token ของตู้ไว้ทดสอบ API ด้วย curl: `OUT_FILE=… npx tsx --env-file-if-exists=.env.local scripts/dev-kiosk-token.ts <slug ร้าน>` |
| `import-ai-scenes.ts` | นำเข้าฉาก AI ในตัว (ข้อ 8) |

## 12. ขั้นตอนทำงานประจำ

1. เปิดฐานข้อมูล (`scripts/local-db.ps1`) แล้ว `npm run dev`
2. แตก branch จาก `dev`: `git switch -c feature/<ชื่องาน> dev`
3. แก้ schema แล้วให้รัน `npm run db:generate` และ `npm run db:migrate` และ commit ไฟล์ migration ด้วย
4. ก่อน merge: `npm run typecheck` และ `npm test` ต้องผ่าน
5. merge กลับ `dev` แบบ `--no-ff` แล้ว push
6. ขึ้นระบบจริง: merge `dev` เข้า `main` รัน migration กับฐานข้อมูล production ก่อน deploy (ดู [DEPLOY.md](DEPLOY.md))

## 13. ปัญหาที่พบบ่อย

| อาการ | สาเหตุและวิธีแก้ |
|---|---|
| `ECONNREFUSED 127.0.0.1:3306` | ยังไม่ได้เปิด `scripts/local-db.ps1` |
| `No local database at …my.ini` | ยังไม่ได้สร้างโฟลเดอร์ข้อมูล (ข้อ 4.2) |
| เข้าสู่ระบบแล้วไม่ได้รหัสทางอีเมล | ใน dev รหัสอยู่ใน log ของ dev server (`[email:dev]`) |
| หน้าตั้งค่าแจ้งว่าอ่าน key ไม่ได้ | `MASTER_KEY` ไม่ตรงกับตอนที่บันทึก key ใช้ตัวเดิม หรือกรอก key ใหม่ |
| คำสั่ง `npx shadcn` ล้มเหลว | ชื่อผู้ใช้ Windows มีอักขระพิเศษ (เช่น `&`) ให้ตั้ง `npm_config_cache` ไปที่โฟลเดอร์ใน repo เช่น `.local/npm-cache` แล้วรันใหม่ |
| ตู้จับคู่ไม่ได้ | ตรวจว่าใส่ `http://localhost:3100` (ไม่มี `/` ท้าย) และรหัสยังไม่หมดอายุ |
