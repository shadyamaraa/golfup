# UB Golf — Design System

> Энэ апп нь vanilla JS + Vite дээр ажилладаг. Design system нь **тусдаа framework биш** —
> `src/style.css` дахь token + компонент классуудын цэгцэлсэн, баримтжуулсан хувилбар.
> Амьд каталогийг **`#/styleguide`** хаягаар нээж хараарай (нэвтрэлтгүй ажиллана).

---

## 1. Бүтэц — 3 давхрага

```
Primitive tokens  →  Semantic tokens  →  Component classes
(--gold, --red)      (--color-accent)     (.btn-primary, .game-card)
```

1. **Primitive** — brand палитрын түүхий утга (`--gold: #c8a951`). Цөөн өөрчилнө.
2. **Semantic** — UI-ийн зорилготой нэр (`--color-accent`, `--color-danger`). **Шинэ UI үүнийг ашиглана.**
3. **Component** — давтагдах хэв маягийн класс (`.btn`, `.glass-card`, `.order-chip`).

> **Дүрэм:** Шинэ кодод **semantic token** (`var(--color-*)`, `var(--space-*)`) ашигла.
> Primitive (`var(--gold)`) -г шууд бичихээс зайлсхий — redesign-д төвөгтэй болно.

---

## 2. Tokens (`src/style.css` → `:root`)

### Өнгө — Semantic
| Token | Зориулалт |
|-------|-----------|
| `--color-bg` | Дэвсгэр |
| `--color-surface` / `--color-surface-hover` | Карт, самбар |
| `--color-border` | Хүрээ |
| `--color-accent` / `--color-accent-strong` | Алтан өнгөт онцлох (CTA, идэвхтэй) |
| `--color-brand` | Ногоон брэнд өнгө |
| `--color-success` / `--color-danger` / `--color-warning` | Төлвийн өнгө |
| `--color-text` / `--color-text-muted` / `--color-text-faint` | Текст |

### Зай — Spacing (4px суурьтай)
`--space-xs(4)` · `--space-sm(8)` · `--space-md(12)` · `--space-lg(16)` · `--space-xl(24)` · `--space-2xl(32)`

### Үсгийн хэмжээ — Type
`--text-xs` · `--text-sm` · `--text-base` · `--text-lg` · `--text-xl` · `--text-2xl`
Жин: `--font-weight-normal/medium/bold`

### Радиус
`--radius-sm(8)` · `--radius-md(14)` · `--radius-lg(20)` · `--radius-xl(28)`

---

## 3. Компонент классууд (түгээмэл)

| Класс | Тайлбар |
|-------|---------|
| `.btn` + `.btn-primary/outline/ghost/danger/outline-danger` | Товч (+ `.btn-sm/lg`) |
| `.glass-card` | Шилэн эффекттэй карт |
| `.game-card` | Тоглолтын карт (+ `.slot-progress`) |
| `.order-chip` (`.pending/.paid/.done`) | Захиалгын төлвийн chip |
| `.game-status` (`.status-open/.status-full`) | Тоглолтын төлөв |
| `.order-status-track` (+ `.reached/.current`) | 4-алхамт tracker |
| `.waitlist-banner` | Хүлээлгийн жагсаалтын байр |
| `.empty-state` | Хоосон төлөв |
| `.bottom-nav` / `.bn-item` | Доод навигаци |
| `.skeleton-card` / `.skeleton-line` | Ачааллын placeholder |
| `.food-search`, `.input-group input` | Form input |

Бүрэн жагсаалт + амьд жишээ → **`#/styleguide`**.

---

## 4. UI бүрэн шинэчлэлийн playbook

Redesign хийхдээ доорх дарааллаар явбал бүх апп нэг дор шинэчлэгдэнэ:

1. **Token-оос эхэл.** `:root` дахь `--color-*`, `--space-*`, `--radius-*`, type-г шинэ дизайнаар тохируул. Энэ нь хамгийн их нөлөөтэй, хамгийн бага эрсдэлтэй алхам.
2. **`#/styleguide` дээр шалга.** Token өөрчлөхөд бүх компонент шууд шинэчлэгдэхийг нэг хуудсанд хараарай.
3. **Inline style → класс руу нүүлгэ.** App нь `style="..."` ихтэй. Redesign-ийн явцад давтагдах хэв маягийг нэрлэсэн класс болгож (`.stat-card`, `.banner`) `style.css`-д төвлөрүүл. Ингэснээр дараагийн өөрчлөлт нэг газраас хийгдэнэ.
4. **Шинэ компонент → эхлээд styleguide-д.** Шинэ UI хэсэг нэмэхдээ эхлээд `#/styleguide`-д жишээ оруулж, дараа нь апп-д ашигла.
5. **Дизайнертай хуваалцах (заавал биш).** Token-уудыг `tokens.json` болгож export хийвэл дизайнер Figma "Variables"-д импортолж, ижил өнгө/зайгаар ажиллана. (Хүсвэл нэмж болно.)

### Анхаарах
- Vanilla JS pattern хадгал — React/Storybook руу **шилжихгүй** (CLAUDE.md).
- Token-ийн semantic нэрийг өөрчлөхгүй, зөвхөн **утгыг** нь өөрчил — кодыг эвдэхгүй.
- Бүх өөрчлөлтийн дараа `npm run build`.

---

## 5. Файлууд

| Файл | Агуулга |
|------|---------|
| `src/style.css` (`:root`) | Бүх token (primitive + semantic) |
| `src/style.css` (доод хэсэг) | Компонент классууд |
| `src/app.js` → `renderStyleGuide()` | Амьд каталог хуудас (`#/styleguide`) |
| `docs/design-system.md` | Энэ баримт |
