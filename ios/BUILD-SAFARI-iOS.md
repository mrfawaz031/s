# تشغيل wer9store على iPhone / iPad (Safari Web Extension)

> **الحقيقة أولًا (اقرأها كاملة):**
> - على iOS لا يمكن "تحميل إضافة غير مضغوطة" مثل كروم على الحاسب. الطريقة
>   **الرسمية والوحيدة** لتشغيل إضافة ويب على iPhone هي تحويلها إلى تطبيق
>   عبر **Xcode على جهاز Mac**، ثم تفعيلها من *Settings → Safari → Extensions*.
> - هذه الإضافة تغيّر الموقع **داخل متصفح Safari فقط** (طبقة الويب). لا تغيّر
>   موقع الجهاز كله ولا موقع التطبيقات الأصلية (خرائط Apple، إنستغرام…).
> - **لا يوجد "بدون كشف 100%".** تطبيقات كثيرة تقارن IP + WiFi + المستشعرات مع
>   موقع GPS؛ لتقليل التعارض استخدم **VPN** في نفس منطقة الموقع المختار.
> - تغيير موقع **الجهاز كله** على iOS يتطلب Xcode *Simulate Location* (مؤقت،
>   مع كيبل ويتوقف عند الفصل) أو جلبريك — وكلاهما قابل للكشف. لا أدّعي غير ذلك.

## المتطلبات
- جهاز **Mac** فيه **Xcode** (مجاني من App Store).
- كابل لتوصيل الـ iPhone بالـ Mac.
- حساب Apple عادي يكفي للتثبيت التجريبي (توقيع مجاني يدوم 7 أيام؛ حساب مطوّر
  مدفوع يجعله أطول).

## الخطوات

### 1) حوّل الإضافة إلى مشروع Safari
على الـ Mac، افتح Terminal داخل مجلد المشروع ونفّذ:

```bash
xcrun safari-web-extension-converter ./extension \
  --project-location ./ios/build \
  --app-name "wer9store" \
  --bundle-identifier com.wer9store.locator \
  --no-open
```

هذا يولّد مشروع Xcode كامل (نسختي iOS + macOS) من نفس ملفات `extension/`.

> سكربت مساعد جاهز: `bash scripts/build-safari.sh` (يشغّل الأمر أعلاه).

### 2) افتح المشروع في Xcode
```bash
open ./ios/build/wer9store/wer9store.xcodeproj
```
- اختر هدف (target) الـ **iOS**.
- من *Signing & Capabilities* اختر فريقك (Apple ID) وفعّل *Automatically
  manage signing*.

### 3) ثبّت على الـ iPhone
- وصّل الـ iPhone، اختره كـ *Run destination* في الأعلى، ثم اضغط ▶ (Run).
- أول مرة: على الـ iPhone اذهب *Settings → General → VPN & Device Management*
  → اعتمد شهادة المطوّر (Trust).

### 4) فعّل الإضافة داخل Safari
- *Settings → Apps → Safari → Extensions* → فعّل **wer9store** واسمح لها
  بالوصول للمواقع (Allow on Every Website).
- افتح Safari، اضغط أيقونة الإضافات في شريط العنوان (حرف "puzzle" أو "aA")،
  اختر wer9store، اختر الموقع، فعّل المفتاح، ثم أعد تحميل الصفحة.

### 5) تأكّد
افتح صفحة اختبار موقع (أو ملف `extension/test.html` عبر خادم محلي) وتحقق أن
الإحداثيات صارت هي المختارة.

## ملاحظات iOS
- بعض ميزات `world:"MAIN"` تحتاج Safari حديثًا (iOS 16.4+). إن لم يعمل حقن
  MAIN، فالإضافة تبقى تعمل لكن قد تحتاج ضبطًا إضافيًا في السكربتات.
- الإعدادات (الموقع المثبّت، المواقع المحفوظة) تُحفظ داخل الإضافة وتبقى حتى
  تطفئ المفتاح — نفس سلوك النسخة على الحاسب.

## بديل سريع بدون Xcode (لتغيير موقع الجهاز مؤقتًا)
- على الحاسب: **Chrome DevTools → Sensors → Location** (للاختبار داخل المتصفح).
- لموقع الجهاز كامل على iOS للمطوّرين فقط: Xcode → *Debug → Simulate Location*
  أو ملف `.gpx` داخل مشروع تطوير — مؤقّت ويتوقف عند فصل الجهاز.
