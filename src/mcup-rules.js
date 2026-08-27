// src/mcup-rules.js
// The format rulebooks shown to viewers — the Ryder Cup document as the club
// wrote it, and a short plain match play primer. Content, not UI strings, so
// it ships in Mongolian (the club's language) rather than through i18n; only
// the surrounding headings are translated by the callers.
//
// Everything here is static HTML with no user input interpolated.

const S = {
  wrap: 'font-size:0.84rem;line-height:1.6;',
  d: 'margin-top:8px;border:1px solid var(--border-color);border-radius:9px;padding:10px 12px;background:var(--bg-card-hover);',
  sum: 'font-weight:800;font-size:0.82rem;cursor:pointer;',
  p: 'margin:8px 0 0;',
  li: 'margin:4px 0 0 18px;',
  ex: 'margin:8px 0 0;padding:8px 10px;border-left:3px solid var(--gold,#DD8910);background:var(--bg-color);border-radius:0 7px 7px 0;font-size:0.8rem;',
  key: 'margin:10px 0 0;font-weight:700;'
};

// The M Cup / Ryder Cup rulebook, as provided by the organisers.
export function ryderRulesHTML() {
  return `
  <div style="${S.wrap}">
    <p style="${S.p}">M Cup нь Ryder Cup-ийн match play зарчмаар явагдана.
    Тоглогчид нийт цохилтын тоогоор бус, <b>нүх бүрээр</b> өрсөлдөнө. Нүхийг
    цөөн цохилтоор дуусгасан тал тухайн нүхийг хожно.</p>
    <ul style="margin:6px 0 0;padding:0;list-style:none;">
      <li style="${S.li}">Нүх хожвол → <b>1 UP</b></li>
      <li style="${S.li}">Нүх тэнцвэл → <b>HALVED</b> — онооны зөрүү өөрчлөгдөхгүй</li>
      <li style="${S.li}">18 нүх дуусахад илүү олон нүх хожсон тал → матчийн ялагч</li>
      <li style="${S.li}">Матч хожвол → багтаа <b>1 оноо</b>; тэнцвэл → тал бүр <b>½ оноо</b></li>
    </ul>

    <details style="${S.d}">
      <summary style="${S.sum}">1. FOURBALL — 2 vs 2, хүн бүр өөрийн бөмбөгөөр</summary>
      <p style="${S.p}">Баг бүрээс 2 тоглогч гарна. Нийт 4 тоглогч тус бүр
      өөрийн бөмбөгөөр бүх нүхийг тоглоно. Тухайн нүхэнд багийн хоёр
      тоглогчийн <b>хамгийн сайн оноо</b> нь багийн оноо болно.</p>
      <div style="${S.ex}">
        Алтайн Бүргэдүүд: A — 4, B — 5 → багийн оноо <b>4</b><br/>
        Wellcom Diesels: C — 5, D — 4 → багийн оноо <b>4</b><br/>
        ➡️ Нүх тэнцэнэ. Хэрэв Алтайн нэг тоглогч 3 хийсэн бол Алтай нүхийг хожно.
      </div>
      <p style="${S.key}">«Хоёулаа өөрийн бөмбөгөө тоглоно. Хоёроос хамгийн сайн score-ийг авна.»</p>
      <p style="${S.p}">Хамтрагч нь найдвартай score хийж байгаа үед нөгөө
      тоглогч илүү эрсдэлтэй, довтолсон цохилт хийж birdie хайх боломжтой.</p>
    </details>

    <details style="${S.d}">
      <summary style="${S.sum}">2. FOURSOMES — 2 vs 2, нэг бөмбөгийг ээлжилж</summary>
      <p style="${S.p}">Баг бүрээс 2 тоглогч гарна. Fourball-аас ялгаатай нь
      хоёр тоглогч <b>нэг л бөмбөгөөр ээлжилж</b> цохино: A → tee shot,
      B → 2 дахь, A → 3 дахь, B → putt… бөмбөг нүхэнд ортол.</p>
      <p style="${S.p}"><b>Tee shot:</b> хосууд аль тоглогч нь сондгой, аль нь
      тэгш нүхнүүдэд tee shot хийхээ урьдчилан шийднэ (A: 1,3,5,7… / B:
      2,4,6,8…). Tee shot хаана очсоноос үл хамааран дараагийн цохилтыг
      хамтрагч нь заавал хийнэ.</p>
      <p style="${S.key}">«Хоёр тоглогч — нэг бөмбөг — ээлжилж цохино.»</p>
      <p style="${S.p}">Багийн ажиллагаа хамгийн их шаарддаг формат. Хос
      сонгохдоо driver/iron-ий зохицол, давуу/сул тал, odd/even хуваарилалт,
      богино тоглолт, putting, ойлголцол чухал.</p>
    </details>

    <details style="${S.d}">
      <summary style="${S.sum}">3. SINGLES — 1 vs 1 шууд match play</summary>
      <p style="${S.p}">Баг бүрийн нэг тоглогч эсрэг багийн нэг тоглогчтой
      ганцаарчилсан match play тоглоно. Нүх бүрийг шууд харьцуулна.</p>
      <div style="${S.ex}">
        A = 4, B = 5 → A нүхийг хожно → <b>1 UP</b><br/>
        Дараагийн нүх хоёулаа 4 → A хэвээр 1 UP<br/>
        Дараагийн нүх A = 5, B = 4 → <b>All Square</b>
      </div>
      <p style="${S.key}">«Нэг хүн — нэг өрсөлдөгч — шууд халз тоглолт.»</p>
    </details>

    <details style="${S.d}">
      <summary style="${S.sum}">Match play-ийн чухал ойлголтууд</summary>
      <p style="${S.p}"><b>ALL SQUARE</b> — матч тэнцүү явж байна.</p>
      <p style="${S.p}"><b>1 UP / 2 UP / 3 UP</b> — нэг тал хэдэн нүхээр илүү
      явж байгааг илэрхийлнэ. «2 UP after 10» = 10 нүх тоглосны дараа 2
      нүхээр илүү.</p>
      <p style="${S.p}"><b>DORMIE / матч хаагдах</b> — давуу нь үлдсэн нүхний
      тооноос илүү болмогц матч дуусна. «4 UP, 3 holes remaining» → үлдсэн
      3 нүхийг бүгдийг алдсан ч 1-ээр илүү үлдэх тул матч шууд дуусна.
      Үр дүн: <b>4&3</b> — 3 нүх үлдсэн байхад 4 нүхээр илүү болж дууссан.</p>
      <p style="${S.p}"><b>CONCEDED PUTT — «GIMME»</b> — өрсөлдөгч богино
      putt-ийг өгч болно: «Good» гэвэл бөмбөг орсонд тооцно. Тоглогч өөрөө
      gimme авах эрхгүй — зөвхөн өрсөлдөгч өгнө.</p>
    </details>

    <details style="${S.d}">
      <summary style="${S.sum}">Гол зарчим</summary>
      <p style="${S.p}">M Cup-д өөрийн нийт score-ийг бага гаргах нь гол
      зорилго биш. Өөрийн матчаа хожиж, багтаа оноо авах нь гол зорилго.
      Тиймээс stroke play-аас стратеги өөр:</p>
      <p style="${S.key}" align="center">Score биш → Hole · Hole биш → Match · Match биш → TEAM</p>
      <p style="${S.p}">Эцсийн зорилго: <b>БАГТАА ОНОО АВАХ.</b></p>
    </details>
  </div>`;
}

// Plain match play (Rules of Golf, Rule 3) — the short primer for the
// standalone 1v1 format.
export function matchRulesHTML() {
  return `
  <div style="${S.wrap}">
    <p style="${S.p}">Match play-д <b>нүх нүхээр</b> тулалдана. Тухайн нүхийг
    цөөн цохилтоор дуусгасан нь нүхийг авна, тэнцвэл halved. Нийт цохилт огт
    хамаагүй — нэг нүхэнд 10 цохисон ч ганцхан нүх л алдана.</p>
    <ul style="margin:6px 0 0;padding:0;list-style:none;">
      <li style="${S.li}">Оноо: <b>2 UP</b>, <b>All Square</b>, <b>4&3</b> гэх мэтээр тэмдэглэнэ</li>
      <li style="${S.li}"><b>Concession:</b> putt, нүх, бүр матчийг бүхэлд нь өршөөж болно («gimme» эндээс гаралтай)</li>
      <li style="${S.li}"><b>Penalty</b> ихэвчлэн 2 цохилт биш — <b>нүхээ алдана</b> (loss of hole)</li>
      <li style="${S.li}">Ээлж алгасаж цохивол өрсөлдөгч цохилтыг cancel хийлгэх эрхтэй</li>
      <li style="${S.li}"><b>Dormie:</b> түрүүлсэн нүхний тоо үлдсэн нүхнээс их болмогц матч дуусна</li>
      <li style="${S.li}">Матч хожвол <b>1 оноо</b>, тэнцвэл тал бүр <b>½</b></li>
    </ul>
  </div>`;
}
