# MTBogd QPay integration (tee-time)

Tee-time-ийн QPay төлбөрийг **MTBogd** бүрэн эзэмшинэ. UBGolf зөвхөн:
1. Booking confirm хийгээд (`/bookings`) → game хадгална.
2. MTBogd-аас QPay invoice/QR авч (`/bookings/:id/qpay-invoice`) хэрэглэгчид харуулна.
3. Статусыг poll хийнэ (`/bookings/:id/qpay-status`) + MTBogd-ийн webhook-ийг хүлээж авна.

> Хоолны захиалгын QPay нь тусдаа — UBGolf-ийн өөрийн QPay (`functions/qpay.js`, `/api/qpay/*`). Энэ нь хэвээр.

## Тохиргоо

### 1. MTBogd base + key (бүх MTBogd дуудлага шинэ base руу)
- `functions/index.js` → `MTBOGD_BASE = https://api-sci3zq7dca-df.a.run.app/external/v1`
- Secret шинэчлэх (шинэ `mbg_live_` key):
```bash
firebase functions:secrets:set MTBOGD_API_KEY --project golfup-app
firebase functions:secrets:set MTBOGD_WEBHOOK_SECRET --project golfup-app
```

### 2. Deploy
```bash
firebase deploy --only functions:mtbogdProxy,functions:mtbogdWebhook,functions:cancelGameBooking,functions:syncBookingPlayers --project golfup-app
firebase deploy --only database --project golfup-app   # bookingId index
firebase deploy --only hosting --project golfup-app     # frontend + rewrite
```

### 3. Webhook URL-ийг MTBogd-д бүртгүүлэх
MTBogd-ийн admin-д дараах URL-ийг өгч **webhook** болгож бүртгүүл:
```
https://ubgolf.club/api/mtbogd-webhook
```
- Header: `X-MTBogd-Signature` (HMAC-SHA256, `MTBOGD_WEBHOOK_SECRET`-ээр шалгана).
- Event: `paid` → game `bookingPaid:true` болгоно; `cancelled` → `bookingCancelled:true`.
- Dedup: `X-MTBogd-Delivery` (RTDB `mtbogdDeliveries`).

## Урсгал

```
Хэрэглэгч tee-time + QPay сонгоно
 → createHold → confirmBooking (booking: confirmed, paymentStatus: pending)
 → saveGame (bookingCode-той)
 → MTBogd /qpay-invoice → QR харуулна
 → poll /qpay-status (3 сек) ‖ MTBogd webhook (paid)
 → paid → game руу шилжинэ
```

Тоглолт нь төлбөрөөс үл хамаарч **үргэлж үүснэ** (booking эхлээд confirm хийгдсэн).

## Тоглогч бүр өөрийн суудлаа төлнө (2026-11-16)

Sky ONE-ийн шинэ журам: захиалагч зөвхөн өөрийн суудлаа, нэгдсэн хүн бүр өөрийнхөө
суудлыг төлнө. UBGolf тал:

- **Захиалга үүсгэх** — `players`-д зөвхөн бодит тоглогчид (үүсгэгч ганцаараа бол 1),
  тус бүр `{ name, phone }`. Нэрийг давтаж суудал дүүргэхгүй.
- **Нэгдэх / гарах** — `syncBookingPlayers` тоглолтын жагсаалтыг (нэр + утас) илгээнэ.
- **Нэхэмжлэх** — `POST /bookings/:id/qpay-invoice { playerPhone }` (утасгүй бол
  `playerName`). `404 PLAYER_NOT_FOUND` → sync хийгээд дахин; `409 SEAT_ALREADY_PAID`
  → төлөгдсөн гэж үзнэ.
- **Төлөв** — `qpay-status`-ийн `players[]`, `paidSeats`, `balanceDue`-г уншиж,
  тоглолт дээр `bookingQuote { amount, unit, memberUnit, seats, paidSeats, balanceDue,
  allPaid, paid: { userId: true }, due: { userId: amount } }` хадгална (утас хадгалахгүй).
  `bookingPaid` нь бүх суудал төлөгдсөн үед л `true`; хүн нэмэгдвэл буцаж `false` болно.
- **Webhook** — `paid` / `cancelled` хэвээр; `payment_updated` зэрэг бусад event-ийг
  `mtbogdWebhook` алгасаад `200` буцаана (хэсэгчилсэн төлбөрийг client `qpay-status`-аас уншина).

QPay товч одоогоор хаалттай: `src/app.js` → `TEE_QPAY_ENABLED = false`. Бодит төлбөрөөр
туршсаны дараа `true` болгоно (рестораны `QPAY_ENABLED`-ээс тусдаа).
