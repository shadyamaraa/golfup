# GolfUp — Firebase Тохируулах Заавар

## 1. Firebase Project үүсгэх

1. [Firebase Console](https://console.firebase.google.com/) руу орно
2. **"Add project"** дарна
3. Нэр оруулна (жишээ: `golfup-app`)
4. Google Analytics идэвхгүй болгож болно → **"Create project"**

## 2. Web App нэмэх

1. Firebase project нээгдсэний дараа ⚙️ Settings → **"Add app"** → Web `</>` сонгоно
2. App nickname: `GolfUp`
3. Firebase Hosting check хийж болно
4. **"Register app"** дарахад config гарна:

```javascript
const firebaseConfig = {
  apiKey: "AIzaSy...",
  authDomain: "golfup-app.firebaseapp.com",
  databaseURL: "https://golfup-app-default-rtdb.firebaseio.com",
  projectId: "golfup-app",
  storageBucket: "golfup-app.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abc123"
};
```

5. Энэ config-ийг `src/config.js` файлд оруулна

## 3. Realtime Database идэвхжүүлэх

1. Firebase Console → **Build** → **Realtime Database**
2. **"Create Database"** дарна
3. Location сонгоно (Asia хамгийн ойрхон)
4. **"Start in test mode"** сонгоод **"Enable"** дарна

### Security Rules (Production-д)

Test mode дуусахаас өмнө rules-ээ солино:

```json
{
  "rules": {
    "games": {
      ".read": true,
      "$gameId": {
        ".write": true,
        ".read": true
      }
    }
  }
}
```

## 4. Config оруулах

`src/config.js` файлыг нээгээд Firebase config-ээ оруулна:

```javascript
export const firebaseConfig = {
  apiKey: "ТАНЫ_API_KEY",
  authDomain: "ТАНЫ_PROJECT.firebaseapp.com",
  databaseURL: "https://ТАНЫ_PROJECT-default-rtdb.firebaseio.com",
  projectId: "ТАНЫ_PROJECT",
  storageBucket: "ТАНЫ_PROJECT.appspot.com",
  messagingSenderId: "ТАНЫ_ID",
  appId: "ТАНЫ_APP_ID"
};
```

## 5. Deploy хийх (Firebase Hosting)

```bash
# Firebase CLI суулгах
npm install -g firebase-tools

# Нэвтрэх
firebase login

# Инициализ
firebase init hosting

# Build хийх
npm run build

# Deploy
firebase deploy
```

Hosting тохиргоонд:
- Public directory: `dist`
- Single-page app: **Yes**
- GitHub deploys: No (эсвэл Yes)

## 6. Бусад Deploy сонголтууд

### Vercel (хамгийн хялбар)
1. GitHub руу push хийнэ
2. [vercel.com](https://vercel.com) дээр Sign up
3. Import Git Repository → Deploy

### Netlify
1. GitHub руу push хийнэ
2. [netlify.com](https://netlify.com) дээр Sign up
3. Add new site → Import existing project → Deploy

---

## Түгээмэл асуултууд

**Q: Firebase үнэгүй юу?**
A: Тийм! Spark plan (үнэгүй) дээр:
- 1 GB database storage
- 10 GB/сар download
- 100 simultaneous connections

**Q: SMS verification хэрхэн нэмэх вэ?**
A: Firebase Auth → Phone provider идэвхжүүлэх хэрэгтэй. Blaze plan (pay-as-you-go) шаардлагатай, гэхдээ үнэгүй quota бий.
