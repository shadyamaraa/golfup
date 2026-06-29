# UB Golf — User Flow

> Дизайнерт зориулсан баримт бичиг. Mermaid диаграмыг [mermaid.live](https://mermaid.live) дээр paste хийж харах эсвэл Figma/FigJam → "Import from Mermaid" ашиглана уу.

---

## Хуудсуудын жагсаалт

| Route | Хуудас | Хандах эрх |
|-------|--------|------------|
| `#/` | Нүүр хуудас (Feed) | Нэвтэрсэн |
| `#/create` | Тоглолт үүсгэх | Нэвтэрсэн |
| `#/game/:id` | Тоглолтын дэлгэрэнгүй | Нэвтэрсэн + community эрх |
| `#/join/:id` | Холбоосоор нэгдэх | Бүгд (auth redirect) |
| `#/edit/:id` | Тоглолт засах | Үүсгэгч / Admin |
| `#/users` | Тоглогчдын жагсаалт | Нэвтэрсэн |
| `#/menu` | Хоолны цэс | Нэвтэрсэн |
| `#/order/:gameId` | Хоол захиалах (тоглолттой) | Нэвтэрсэн |
| `#/orders/:id` | Захиалгын дэлгэрэнгүй | Нэвтэрсэн |
| `#/admin` | Admin самбар (5 таб) | Admin |
| `#/kitchen` | Гал тогооны дэлгэц | Kitchen нууц үг |

---

## Journey 1 — Тоглолт үүсгэх ба хуваалцах

```mermaid
flowchart TD
    A([Эхлэх]) --> B{Нэвтэрсэн үү?}
    B -- Үгүй --> C[/Login — утас + нууц үг/]
    C --> D[Нүүр хуудас #/]
    B -- Тийм --> D

    D --> E[+ Тоглолт үүсгэх товч]
    E --> F[/Тоглолт үүсгэх хуудас #/create/]

    F --> G[Огноо, цаг, байршил]
    G --> H[Бүлгийн хэмжээ]
    H --> I{Tee time захиалах уу?}
    I -- Тийм --> J[/Tee time picker modal/]
    J --> K
    I -- Үгүй --> K[Нэмэлт тохиргоо]

    K --> L[Харагдах байдал\nPublic / Circles / Private]
    L --> M{Урилга илгээх үү?}
    M -- Тийм --> N[/Тоглогч урих modal/]
    N --> O
    M -- Үгүй --> O[Хадгалах]

    O --> P[/Тоглолтын дэлгэрэнгүй #/game/:id/]
    P --> Q{Хуваалцах}
    Q --> R[Viber холбоос]
    Q --> S[URL хуулах]

    style F fill:#dbeafe
    style P fill:#dbeafe
    style J fill:#fef9c3
    style N fill:#fef9c3
```

---

## Journey 2 — Тоглолтод нэгдэх

```mermaid
flowchart TD
    A([Эхлэх]) --> B{Хаанаас ирсэн?}
    B -- Нүүр хуудас --> C[Feed дэх тоглолтын карт]
    B -- Хуваалцсан холбоос --> D[#/join/:id]

    C --> E[/Тоглолтын дэлгэрэнгүй #/game/:id/]
    D --> F{Нэвтэрсэн үү?}
    F -- Үгүй --> G[/Login/]
    G --> E
    F -- Тийм --> E

    E --> H{Тоглолтод нэгдэх боломжтой юу?}
    H -- Цагийн давхцал бий --> I[Алдааны мэдэгдэл\n2 цагийн зай хэрэгтэй]
    H -- Боломжтой --> J{Description бий юу?}

    J -- Тийм --> K[/Зөвшөөрлийн modal/]
    K -- Зөвшөөрсөн --> L
    K -- Цуцалсан --> E
    J -- Үгүй --> L

    L{Slot бий юу?} -- Тийм --> M[Бүлэгт нэмэгдлээ ✓]
    L -- Дүүрсэн --> N[Waiting list-д нэмэгдлээ]

    M --> O[Мэдэгдэл — Үүсгэгч болон тоглогчид]
    N --> P[Waiting list байрлал харуулах]
    P --> Q{Хэн нэгэн гарвал?}
    Q -- Тийм --> R[Auto-дэвшилт + мэдэгдэл]

    style E fill:#dbeafe
    style K fill:#fef9c3
    style M fill:#dcfce7
    style N fill:#fef3c7
```

---

## Journey 3 — Хоол захиалах

```mermaid
flowchart TD
    A([Эхлэх]) --> B{Хаанаас ирсэн?}
    B -- Тоглолтын дэлгэрэнгүй --> C[🍽️ Хоол захиалах товч]
    B -- Нүүр хуудас --> D[Хоолны цэс товч]

    C --> E[/Хоолны цэс #/order/:gameId/]
    D --> F[/Хоолны цэс #/menu/]

    E --> G[Ангиллаар харах]
    F --> G
    G --> H[Хайлт хийх]
    G --> I[Хоол сонгох +/-]

    H --> I
    I --> J[🛒 Cart товч гарах\n N хоол · Нийт₮]
    J --> K[/Checkout modal/]

    K --> L[Хэрэглэгчийн нэр, утас\nАвто бөглөгдөх]
    L --> M{Хүргэлтийн байршил}
    M --> MA[🪑 Ширээ — floor plan]
    M --> MB[🌿 Гадаа]
    M --> MC[⛳ Талбай дээр]

    MA --> N
    MB --> N
    MC --> N

    N{Авах цаг}
    N --> NA[⚡ Яаралтай]
    N --> NB[🕐 Тодорхой цаг]

    NA --> O[Захиалга илгээх]
    NB --> O

    O --> P[/Захиалгын дэлгэрэнгүй #/orders/:id/]
    P --> Q[2-шатлалт tracker\nТөлсөн → Дууссан]
    Q --> R{Гал тогоо mark done хийвэл}
    R --> S[Захиалга дууслаа ✓]

    style E fill:#dbeafe
    style F fill:#dbeafe
    style K fill:#fef9c3
    style P fill:#dbeafe
    style S fill:#dcfce7
```

---

## Journey 4 — Гал тогооны ажилтан

```mermaid
flowchart TD
    A([Гал тогооны дэлгэц нээх]) --> B[#/kitchen]
    B --> C{Нэвтэрсэн үү?\nlocalStorage шалгана}
    C -- Үгүй --> D[/Нууц үгийн modal/]
    D -- Зөв нууц үг --> E
    D -- Буруу --> D
    C -- Тийм --> E

    E[/Гал тогооны дэлгэц/] --> F{Таб сонгох}

    F --> G[📋 Идэвхтэй захиалга]
    F --> H[🕐 Хуваарьт захиалга]
    F --> I[📜 Түүх]
    F --> J[📊 Тайлан]

    G --> K[Захиалга харах\nНэр, утас, хоолнууд, тэмдэглэл]
    K --> L{Хугацааны дохио}
    L --> LA[🟢 < 10 мин]
    L --> LB[🟡 10-20 мин]
    L --> LC[🔴 > 20 мин]

    K --> M[Дууссан ✓ товч]
    M --> N[status: completed]
    N --> O[Захиалга Түүх рүү шилжинэ]

    H --> P[Цагаар эрэмбэлсэн жагсаалт]
    J --> Q[Өдрийн орлого\nТоп 8 хоол]

    R[🔔 Шинэ захиалга ирвэл] --> S[Beep дуу + Banner мэдэгдэл]
    S --> G

    style E fill:#dcfce7
    style D fill:#fef9c3
```

---

## Journey 5 — Admin удирдлага

```mermaid
flowchart TD
    A([Admin нэвтрэх]) --> B[Нүүр хуудас]
    B --> C[🛡️ Admin товч header дээр]
    C --> D[/Admin самбар #/admin/]

    D --> E{Таб сонгох}

    E --> F[👤 Хэрэглэгчид]
    F --> FA[Хэрэглэгч үүсгэх]
    F --> FB[Хэрэглэгч засах ✏️]
    F --> FC[Хэрэглэгч устгах 🗑️]
    FB --> FBB[Нэр, дүр, статус\nBank мэдээлэл\nNийгэмлэгүүд]

    E --> G[⭕ Нийгэмлэгүүд]
    G --> GA[Гишүүд харах/нэмэх/хасах]

    E --> H[🔍 Хайлт]
    H --> HA[Тоглогч хайх]
    HA --> HB[Ирээдүйн тоглолтууд]
    HA --> HC[Өнгөрсөн тоглолтууд]
    HA --> HD[Устгасан тоглолтууд]
    HD --> HE[Тоглолт сэргээх ↩️]

    E --> I[🍽️ Цэс удирдлага]
    I --> IA[Хоол нэмэх/засах/устгах]
    I --> IB[Ширээ удирдах]

    style D fill:#fff7ed
    style FBB fill:#fef9c3
```

---

## Бүх хуудсуудын холбоос (Navigation Map)

```mermaid
flowchart LR
    LOGIN --> HOME

    HOME --> CREATE
    HOME --> GAME_DETAIL
    HOME --> USERS
    HOME --> FOOD_MENU
    HOME --> ADMIN

    CREATE --> GAME_DETAIL
    GAME_DETAIL --> EDIT
    GAME_DETAIL --> FOOD_ORDER
    FOOD_ORDER --> ORDER_DETAIL

    ADMIN --> HOME
    KITCHEN --> HOME

    subgraph Хэрэглэгч
        HOME[🏠 Нүүр хуудас]
        CREATE[➕ Тоглолт үүсгэх]
        GAME_DETAIL[🏌️ Тоглолтын дэлгэрэнгүй]
        EDIT[✏️ Тоглолт засах]
        USERS[👥 Тоглогчид]
        FOOD_MENU[🍽️ Хоолны цэс]
        FOOD_ORDER[🛒 Хоол захиалах]
        ORDER_DETAIL[📦 Захиалгын дэлгэрэнгүй]
    end

    subgraph Admin
        ADMIN[🛡️ Admin самбар]
    end

    subgraph Гал тогоо
        KITCHEN[👨‍🍳 Гал тогооны дэлгэц]
    end

    subgraph Нэвтрэх
        LOGIN[🔐 Login]
    end
```

---

## Modals / Overlays жагсаалт

| Modal | Гарах үед | Зорилго |
|-------|-----------|---------|
| Login form | Нэвтрээгүй үед | Утас + нууц үгээр нэвтрэх |
| Join confirmation | Тоглолтод нэгдэхэд (description байвал) | Нөхцөл зөвшөөрүүлэх |
| Invite players | Game detail — "Урих" товч | Тоглогч урих |
| Book tee time | Create game / Game detail | Tee time цаг захиалах |
| Checkout | Food menu — cart товч | Захиалга баталгаажуулах |
| Bank details | Тоглогчийн нэр дэргэд 💳 | Дансны мэдээлэл харах |
| Edit user | Admin → Users → ✏️ | Хэрэглэгч засах |
| Kitchen login | #/kitchen анхны нэвтрэлт | Нууц үгийн хаалга |
| Profile | Header — avatar товч | Профайл засах |
