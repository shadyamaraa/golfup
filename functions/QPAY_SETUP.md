# QPay v2 — Тохируулах заавар

Production-д **deploy хийхгүй** — preview channel дээр л тест хийнэ.

## 1. Firebase Secret Manager-д credential тохируулах

```bash
firebase functions:secrets:set QPAY_USERNAME
firebase functions:secrets:set QPAY_PASSWORD
firebase functions:secrets:set QPAY_INVOICE_CODE
```

Тус бүрийг дарахад terminal дээр утга оруулахыг хүснэ.

## 2. Functions deploy (preview project дээр)

```bash
firebase deploy --only functions --project <preview-project-id>
```

## 3. Callback URL

Callback URL нь автоматаар `req.headers.host`-аас тодорхойлогдоно:

```
https://<your-preview-host>/api/qpay/callback?order_id=<orderId>
```

## 4. Frontend flag

`src/app.js` дахь `QPAY_ENABLED` нь hostname-based:
- Preview channel (`--` агуулсан subdomain): **ON**
- Production (ubgolf.club, golfup-app.web.app): **автоматаар OFF**

## 5. Тест урсгал

1. Preview дээр нэвтрэх → хоол захиалах → checkout → QPay сонгох
2. QR modal гарах → банкны аппаар уншуулах
3. RTDB `orders/<id>` дээр `status: 'paid'`, `paymentMethod: 'qpay'` болохыг шалгах

## 6. Хамрах хүрээ — ЗӨВХӨН хоолны захиалга

Энэ UBGolf-ийн өөрийн QPay (`CDY_SKYRES` merchant) нь **зөвхөн хоолны захиалгад** үйлчилнэ:

| Урсгал | RTDB collection | Тэмдэглэл |
|--------|-----------------|-----------|
| Хоолны захиалга (checkout) | `orders` | Гал тогооны дэлгэц эдгээрийг уншина |

> **Tee-time QPay нь энд БИШ** — MTBogd эзэмшинэ. `functions/MTBOGD_QPAY.md` харна уу.

## 7. Хамаарах файлууд

| Файл | Зорилго |
|------|---------|
| `functions/qpay.js` | QPay API client (token cache, invoice, check) |
| `functions/index.js` | `qpayCreateInvoice`, `qpayCallback`, `qpayCheckPayment` (orders) |
| `firebase.json` | `/api/qpay/*` rewrites |
| `src/app.js` | `showQpayModal` (food checkout QR modal) |
| `src/store.js` | `createQpayInvoice`, `checkQpayPayment`, `cancelPendingPayment` |
