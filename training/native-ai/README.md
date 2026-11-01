# RUN AI Native — ใช้ AWS Bedrock โดยไม่ต้องสมัคร Cloudflare

**ค่าเริ่มต้น:** GitHub เป็นแหล่ง Persona/ความรู้/ตัวอย่าง (RAG/Few-shot), Amazon Nova Micro เป็นโมเดลประมวลผลผ่าน AWS Lambda ของ RUN-AI ไม่ใช่การฝึกน้ำหนักโมเดล และไม่ใช้โทรศัพท์/คอมของคุณรัน AI

## เริ่มใช้งานบน AWS เดิม

1. รวมโค้ดเข้า main แล้วรอ AWS Amplify Gen 2 Deploy Backend และ Frontend สำเร็จ
2. ตรวจ AWS Bedrock ใน region us-east-1 ว่าสิทธิ์เรียก amazon.nova-micro-v1:0 พร้อมใช้งาน
3. เปิด RUN-AI → AI Chat → RUN AI Native; ไม่ต้องใช้ Cloudflare API Key หรือเพิ่ม Environment Variable ใหม่
4. AWS Native จำกัด **6 ครั้ง/วัน และ 24 ครั้ง/เดือนต่อเว็บไซต์** และยังหักโควตาแชตรวมเดิม 12 ครั้ง/วัน 60 ครั้ง/เดือน; ระบบ DynamoDB กันงบความเสี่ยงและป้องกันคำขอซ้ำ
5. หาก Deploy ผ่านแต่ยังแชตไม่ได้ ให้ตรวจ RUN_AI_ENABLE_BEDROCK, Emergency Kill Switch และสิทธิ์ Bedrock พร้อมตรวจ CloudWatch Logs

**ข้อควรทราบเรื่องราคา:** Amazon Bedrock เป็น Pay-as-you-go ตาม Input/Output Tokens หากบัญชีมีเครดิต AWS Free Tier อาจใช้เครดิตชำระได้ตามสิทธิ์และเงื่อนไข ไม่ใช่ AI ฟรีตลอดหรือจำกัดยอดบิลจริงโดยอัตโนมัติ. งาน Hosting, Lambda, AppSync และ DynamoDB อาจมีค่าใช้จ่ายอื่นเพิ่ม. ดู https://aws.amazon.com/bedrock/pricing/

## สอนความรู้ผ่าน GitHub

แก้ `training/native-ai/knowledge.json` เพิ่มข้อมูลจริง และ `training/native-ai/examples.json` เพิ่มคำถาม/คำตอบตัวอย่าง; กฎหลักอยู่ `training/native-ai/instructions.json`. GitHub CI ตรวจชุดข้อมูลก่อนรวม. หลังแก้ไขให้ Deploy Backend ผ่าน Amplify เพื่อบรรจุความรู้ใหม่ลง Lambda (การแก้ GitHub เพียงอย่างเดียวโดยยังไม่ Deploy ไม่เปลี่ยนคำตอบบนเว็บไซต์).

อย่านำ API Key, รหัสผ่าน หรือข้อมูลส่วนตัวไปใส่ไฟล์ GitHub. Native ส่งข้อความของผู้ใช้ไปยัง AWS Bedrock. นี่คือ RAG/Few-shot ไม่ใช่ Fine-tuning หรือสร้างโมเดลใหม่เอง.

## Cloudflare (ทางเลือก ไม่จำเป็นต้องทำ)

หากต้องการให้โหมด Native ใช้ Cloudflare Free ให้ Deploy `native-ai/worker.mjs` ด้วย `.github/workflows/native-ai-deploy.yml` โดยตั้ง GitHub Secrets `CLOUDFLARE_API_TOKEN` และ `CLOUDFLARE_ACCOUNT_ID`; จากนั้นเพิ่ม Amplify `VITE_RUN_AI_NATIVE_URL` ให้ชี้ Worker จริงและ Redeploy เว็บไซต์. หาก Worker ตอบ Health ว่าพร้อม ระบบจะเลือก Cloudflare ก่อน AWS; หากไม่ได้เชื่อม ระบบใช้ AWS เป็นค่าเริ่มต้น. การใช้ Cloudflare อยู่ภายใต้ 10,000 Neurons/วันบนบัญชี Free ตามเงื่อนไขผู้ให้บริการ โดยไม่รับประกันจำนวนแชต และต้องตรวจค่าใช้จ่ายส่วนอื่นแยกกัน.


## รุ่นบทสนทนา v2 — สอนให้ตอบหลากหลายและเป็นธรรมชาติ

ข้อมูลสอนแบ่งหน้าที่ให้ชัด:
- `instructions.json` กำหนดบุคลิก ความกระชับ ความต่อเนื่อง และความถูกต้อง
- `examples.json` มีตัวอย่างบทสนทนา 48 ชุด ครอบคลุมการทักทาย ความรู้ โค้ด นิยาย การวางแผน และการวิเคราะห์
- `knowledge.json` มีข้อเท็จจริงเฉพาะเว็บไซต์ ไม่ใช่คู่มือที่ต้องแทรกทุกคำถาม

ระบบดึงข้อมูลเว็บไซต์เฉพาะคำถามที่เกี่ยวกับ RUN-AI หรือเป็นคำถามต่อเนื่องจากเรื่องนั้น
คำถามทั่วไปเช่น 'ทำไมท้องฟ้าสีฟ้า' จะใช้ความรู้ทั่วไปของโมเดล ไม่แทรกคู่มือ AWS
ระบบเลือกตัวอย่างคำตอบตามประเภทคำถามเพื่อแสดงสไตล์ ไม่ใช่ให้ท่องจำหรือคัดลอกตามตัวอย่าง

### เช็กลิสต์ทดสอบหลัง AWS Amplify Deploy

1. สวัสดี วันนี้เป็นยังไงบ้าง — คุยเป็นธรรมชาติ ไม่อธิบาย AWS
2. ทำไมท้องฟ้าสีฟ้า — ตอบวิทยาศาสตร์สั้นและเข้าใจง่าย
3. แต่งเรื่องลึกลับ — คิดเรื่องใหม่ ไม่คัดลอกตัวอย่างเดิม
4. ช่วยแก้บั๊ก JavaScript — เสนอวิธีแก้พร้อมวิธีทดสอบ
5. เหนื่อยกับการเรียนมาก — ตอบอย่างใส่ใจ ไม่ตอบเป็นสคริปต์
6. RUN AI Native ใช้ AWS ไหม / แล้วเสียเงินไหม — เข้าใจบริบทคำถามต่อเนื่อง
7. เปลี่ยนหัวข้อเป็นแรงโน้มถ่วง — ไม่แทรกคู่มือเว็บไซต์
8. ถามข้อมูลเปลี่ยนแปลงเร็ว — ไม่เดาข้อมูลล่าสุดหรือจำนวนเงิน

รันทดสอบโค้ดด้วย `npm test`, `npm run check`, `npm run build` แล้วตรวจ GitHub Actions
ต้องให้ AWS Amplify Deploy Backend ที่อัปเดตจึงใช้ข้อมูลสอนใหม่ได้
CI PASS ไม่ใช่การยืนยันว่าคำตอบจริงจาก AWS Bedrock ดีขึ้นทุกคำถาม
การปรับนี้เป็น RAG/Few-shot ไม่ใช่ Fine-tuning น้ำหนัก Nova Micro
