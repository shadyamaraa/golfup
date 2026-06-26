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

## 6. Холбогдсон урсгалууд

QPay 2 газар холбогдсон (хоёулаа preview-channel дээр л идэвхтэй):

| Урсгал | RTDB collection | Тэмдэглэл |
|--------|-----------------|-----------|
| Хоолны захиалга (checkout) | `orders` | Гал тогооны дэлгэц эдгээрийг уншина |
| Tee-time захиалга | `bookingPayments` | Гал тогоонд **орохгүй** — тусдаа бичлэг |

Backend функцууд `collection` параметр авдаг (allowlist: `orders`, `bookingPayments`),
тэгэхээр нэг QPay client хоёр урсгалд хоёуланд нь үйлчилнэ.

### Tee-time: төлбөр-эхэлсэн (payment-first) урсгал

MTBogd booking-ийг **төлбөрийн ӨМНӨ баталгаажуулдаггүй** — өнчин захиалга үүсэхгүй:

```
1. Slot HOLD (mtbogd.createHold) — confirm хийхгүй
2. bookingPayments бичлэгт hold + бүтэн game-ийг хадгална (pendingBooking)
3. QPay QR → хэрэглэгч төлнө
4. QPay callback (СЕРВЕР) → payment/check → амжилттай бол:
   - MTBogd booking CONFIRM (server-side, x-api-key)
   - games/{id} үүснэ (bookingCode/bookingId-тай)
   - bookingPayments.status = 'paid'
5. Frontend listener → game руу шилжинэ
```

- Callback + check функцууд `MTBOGD_API_KEY` secret-ийг ашигладаг (аль хэдийн тохируулсан).
- Hold дуусах/confirm амжилтгүй бол `bookingError` тэмдэглэгдэж, хэрэглэгчид анхааруулна.
- Callback/check хоёулаа транзакцаар нэг л удаа confirm хийнэ (давхар захиалгаас сэргийлнэ).

## 7. Хамаарах файлууд

| Файл | Зорилго |
|------|---------|
| `functions/qpay.js` | QPay API client (token cache, invoice, check) |
| `functions/index.js` | `qpayCreateInvoice`, `qpayCallback`, `qpayCheckPayment` (collection-aware) |
| `firebase.json` | `/api/qpay/*` rewrites |
| `database.rules.json` | `bookingPayments` зам |
| `src/app.js` | `QPAY_ENABLED` flag, food + tee-time checkout, QR modal |
| `src/store.js` | `createQpayInvoice`, `checkQpayPayment`, `createBookingPayment` |
