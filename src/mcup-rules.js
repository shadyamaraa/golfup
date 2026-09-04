// src/mcup-rules.js
// The format rulebooks shown to viewers — the Ryder Cup document as the club
// wrote it, a short plain match play primer, and the casual 2 v 2 blurbs.
// Content, not UI strings, so it ships in Mongolian (the club's language)
// rather than through i18n; only the surrounding headings are translated by
// the callers.
//
// Each format's block is exported on its own so a casual scramble, fourball or
// foursome game can show just its own rules. ryderRulesHTML() composes the very
// same blocks in the same order, numbered the way the club's document numbers
// them, so the M Cup rulebook still renders character for character as it did.
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

// FOURBALL — block 1 of the club's M Cup document, unchanged.
export function fourballRulesHTML(n) {
  return `    <details style="${S.d}">
      <summary style="${S.sum}">${n ? n + '. ' : ''}FOURBALL — 2 vs 2, хүн бүр өөрийн бөмбөгөөр</summary>
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
    </details>`;
}

// FOURSOMES — block 2, unchanged.
export function foursomesRulesHTML(n) {
  return `    <details style="${S.d}">
      <summary style="${S.sum}">${n ? n + '. ' : ''}FOURSOMES — 2 vs 2, нэг бөмбөгийг ээлжилж</summary>
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
    </details>`;
}

// SINGLES — block 3, unchanged.
export function singlesRulesHTML(n) {
  return `    <details style="${S.d}">
      <summary style="${S.sum}">${n ? n + '. ' : ''}SINGLES — 1 vs 1 шууд match play</summary>
      <p style="${S.p}">Баг бүрийн нэг тоглогч эсрэг багийн нэг тоглогчтой
      ганцаарчилсан match play тоглоно. Нүх бүрийг шууд харьцуулна.</p>
      <div style="${S.ex}">
        A = 4, B = 5 → A нүхийг хожно → <b>1 UP</b><br/>
        Дараагийн нүх хоёулаа 4 → A хэвээр 1 UP<br/>
        Дараагийн нүх A = 5, B = 4 → <b>All Square</b>
      </div>
      <p style="${S.key}">«Нэг хүн — нэг өрсөлдөгч — шууд халз тоглолт.»</p>
    </details>`;
}

// The match play vocabulary all three formats lean on.
export function matchConceptsHTML() {
  return `    <details style="${S.d}">
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
    </details>`;
}

// SCRAMBLE — new for the casual 2 v 2 formats; the M Cup document has no
// scramble block because the tournament never plays one. Written in the same
// voice as the blocks above: what happens, a worked hole, the key line.
export function scrambleRulesHTML(n) {
  return `    <details style="${S.d}">
      <summary style="${S.sum}">${n ? n + '. ' : ''}SCRAMBLE — 2 vs 2, хоёулаа цохиод сайныг нь сонгоно</summary>
      <p style="${S.p}">Хосын хоёр тоглогч <b>нүх бүрт хоёулаа</b> tee shot хийнэ.
      Дараа нь хоёр бөмбөгнөөс аль нь <b>илүү сайн байрлалтай</b> байгааг сонгож,
      нөгөөг нь авна. Хоёулаа сонгосон цэгээс (нэг клубын урт дотор, нүх рүү
      ойртуулахгүйгээр) дахин цохино. Бөмбөг нүхэнд ортол ингэж үргэлжилнэ.</p>
      <p style="${S.p}"><b>Багийн оноо:</b> нүхийг дуусгах хүртэл хийсэн цохилтын
      тоо — хос дээр ганцхан оноо бичигдэнэ.</p>
      <div style="${S.ex}">
        3-р нүх (Пар 4): хоёулаа tee shot → Батынх фэйрвэйд, Доржийнх банкерт.
        <b>Батын бөмбөгийг сонгоно.</b><br/>
        Хоёулаа тэндээс цохив → Доржийнх гринд ойр. <b>Доржийнхыг сонгоно.</b><br/>
        Хоёулаа putt → Бат оруулав. ➡️ Багийн оноо <b>3</b> (birdie).
      </div>
      <p style="${S.key}">«Хоёулаа цохино — сайн бөмбөгийг сонгоно — нэг оноо.»</p>
      <p style="${S.p}"><b>Хэндикеп:</b> хосын хэндикеп нь хоёр тоглогчийн
      <b>дундаж</b>. Хоёр хосын дунджийн <b>зөрүүг</b> өндөр хэндикептэй хос нь
      stroke index-ээр, хамгийн хэцүү нүхнээс эхлэн авна. Дөрвүүлээ хэндикептэй
      бол нет, эс бөгөөс гросс тоглоно.</p>
      <p style="${S.p}">Хамгийн хурдан, хамгийн уучлангуй формат: нэг муу цохилт
      багт үнэ төлүүлэхгүй тул шинэ тоглогчтой хосороход тохиромжтой. Стратеги —
      сул тоглогч нь эхэлж цохиж дарамтаа тайлаад, дараа нь тогтвортой нь цохино.
      Putt дээр эхний тоглогч <b>шугам харуулж</b> өгдөг нь том давуу тал.</p>
      <p style="${S.p}"><b>WHS:</b> нэг бөмбөгөөр тоглосон тул тоглогч бүрийн бие
      даасан онооны хуудас үүсэхгүй — энэ раунд handicap-д бүртгэгдэхгүй.</p>
    </details>`;
}

// The blurb a casual game page shows for its own 2 v 2 format: the format's own
// rulebook block, under a line framing it for one tee group rather than for two
// M Cup teams.
export function casualTeamRulesHTML(format) {
  const note = {
    scramble: 'Группын дотор 2 v 2. Хос бүр нэг бөмбөгөөр тоглож, нүх тутамд нэг оноо бичнэ.',
    fourball: 'Группын дотор 2 v 2. Хүн бүр өөрийн бөмбөгөө тоглоно; нүх бүрт хосынхоо хамгийн сайн (нет) оноог авна. Хэндикеп: 4 тоглогчийн хамгийн багаас нь зөрүүгээр.',
    foursome: 'Группын дотор 2 v 2. Хос нэг бөмбөгийг ээлжилж цохино. Хэндикеп: хосын дундаж; хоёр хосын дунджийн зөрүүг өндөр нь авна.'
  }[format];
  if (!note) return '';
  const body = format === 'scramble' ? scrambleRulesHTML()
    : format === 'fourball' ? fourballRulesHTML() : foursomesRulesHTML();
  return `
  <div style="${S.wrap}">
    <p style="${S.p}">${note}</p>
${body}
  </div>`;
}

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

${fourballRulesHTML(1)}

${foursomesRulesHTML(2)}

${singlesRulesHTML(3)}

${matchConceptsHTML()}

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
