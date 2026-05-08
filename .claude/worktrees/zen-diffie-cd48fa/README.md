# ⛳ GolfUp — Golf Game Organizer

Viber групп дэх гольфчидын тоглолт зохион байгуулах вэб апп.

## Боломжууд

- 🏌️ Тоглолт үүсгэх (огноо, цаг, байршил, группын тоо)
- 👥 Нэгдэх / Гарах
- 📊 Автомат групп зохион байгуулалт (Waiting List → Group 2)
- 📱 Viber-ээр хуваалцах
- 🌐 Монгол / Англи хэл
- 🔥 Firebase Realtime Database (real-time sync)

## Хурдан эхлэх

```bash
# Clone хийх
git clone <your-repo-url>
cd golf-organizer

# Dependencies суулгах
npm install

# Dev server ажиллуулах
npm run dev
```

## Firebase тохируулах

`SETUP.md` файлд дэлгэрэнгүй заавар байна.

## Deploy хийх

```bash
npm run build
```

`dist/` фолдерыг Vercel, Netlify, эсвэл Firebase Hosting дээр deploy хийнэ.

## Технологи

- Vite + Vanilla JS
- Firebase Realtime Database
- CSS (Glassmorphism, Dark Theme)
- Google Fonts (Inter)
