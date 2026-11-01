# RUN AI Native — GitHub-taught AI บน Cloudflare Free

โมดูลนี้นำข้อมูลและตัวอย่างใน GitHub ไปประกอบการตอบด้วย RAG/Few-shot
โมเดลที่ประมวลผลจริงคือ Gemma 4 26B A4B บน Cloudflare Workers AI
ไม่ใช่การ fine-tune น้ำหนักโมเดล และไม่ต้องใช้เครื่องผู้ใช้รันโมเดล

## วิธีสอน AI

1. แก้ training/native-ai/knowledge.json เพื่อเพิ่มบทความสั้นที่ถูกต้อง
2. แก้ training/native-ai/examples.json เพื่อเพิ่มคู่คำถาม/คำตอบตัวอย่าง
3. แก้ training/native-ai/instructions.json เพื่อปรับบุคลิกและข้อกำหนด
4. GitHub Actions ตรวจสอบชุดข้อมูลและการเรียก Worker ก่อน Deploy
5. เมื่อ Deploy ผ่าน Worker ใหม่จะใช้ความรู้ที่อัปเดตทันที

ห้ามนำ API Key, รหัสผ่าน, ข้อมูลส่วนตัว หรือข้อมูลที่ไม่มีสิทธิ์เผยแพร่ใส่ลง GitHub

## ตั้งค่า Cloudflare หนึ่งครั้ง — ไม่ต้องใช้เครื่องคุณเป็นเซิร์ฟเวอร์

1. สมัคร Cloudflare Free: https://dash.cloudflare.com/
2. หา Account ID ใน Cloudflare Workers & Pages
3. สร้าง API Token สิทธิ์ Deploy Cloudflare Workers แบบจำกัดเฉพาะบัญชี
4. ใน GitHub RUN-AI → Settings → Secrets and variables → Actions เพิ่ม:
   CLOUDFLARE_ACCOUNT_ID และ CLOUDFLARE_API_TOKEN
5. GitHub → Actions → Native AI - Verify and Deploy → Run workflow
6. เปิดผล Deploy แล้วคัดลอก URL Worker จริงจากผลลัพธ์
7. AWS Amplify → Hosting → Environment variables เพิ่ม VITE_RUN_AI_NATIVE_URL
   โดยใช้ URL Worker ของคุณ เช่น https://run-ai-native.YOUR-SUBDOMAIN.workers.dev
8. Redeploy Frontend RUN-AI หลังแก้ตัวแปร
9. เปิด RUN-AI → AI Chat → RUN AI Native

ก่อนเพิ่ม domain staging ให้แก้ค่า ALLOWED_ORIGINS ใน native-ai/wrangler.toml
Origin checks ไม่ใช่ Authentication. Worker มี rate limiting 6 ครั้ง/นาทีต่อ IP แบบประมาณการ
และโควตา Free Cloudflare AI เป็นเพดานสุดท้ายตามบัญชี Cloudflare

## ขอบเขตและความปลอดภัย

- Cloudflare Workers AI Free มี 10,000 Neurons/วัน ต่อบัญชี ซึ่งไม่เท่ากับ 10,000 คำถาม
- Worker ถูกตั้งให้ทำงานบนแผน Free; หากอัปเกรด Paid อาจถูกเรียกเก็บเงินตามการใช้งาน
- ภายในรุ่นแรกเป็นข้อความอย่างเดียว ไม่รองรับรูป/วิดีโอ
- Browser ไม่เก็บ Cloudflare API Key; GitHub Secret ใช้สำหรับ Deploy เท่านั้น
- แอป Native แยกจาก AWS Bedrock / OpenRouter; AWS Amplify ยังมีค่าโฮสต์ได้
- ไม่มี API แสดง Neurons คงเหลือจริงต่อผู้ใช้ จึงไม่แสดงตัวเลขปลอม
- Worker ส่งข้อความผู้ใช้ไปให้ Cloudflare ประมวลผล ผู้ใช้ควรหลีกเลี่ยงข้อมูลลับ
- แก้ข้อมูลสอน AI ไม่ได้แปลว่า Fine-tuning โมเดลหลัก

แหล่งอ้างอิง: https://developers.cloudflare.com/workers-ai/platform/pricing/
และ https://developers.cloudflare.com/workers/ci-cd/external-cicd/github-actions/
