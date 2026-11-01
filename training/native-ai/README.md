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
