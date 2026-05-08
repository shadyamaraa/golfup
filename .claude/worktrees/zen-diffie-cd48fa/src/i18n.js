const T = {
  mn: {
    appName: 'GolfUp', tagline: 'Хамтдаа тоглоё!',
    home: 'Нүүр', createGame: 'Тоглолт үүсгэх', activeGames: 'Идэвхтэй тоглолтууд',
    noGames: 'Одоогоор тоглолт алга. Шинэ тоглолт үүсгэнэ үү!',
    date: 'Огноо', time: 'Цаг', location: 'Байршил', groupSize: 'Группын хүний тоо',
    create: 'Үүсгэх', cancel: 'Цуцлах', join: 'Нэгдэх', leave: 'Гарах',
    group: 'Групп', waitingList: 'Хүлээлгийн жагсаалт', emptySlot: 'Хоосон',
    players: 'тоглогч', full: 'Дүүрсэн', open: 'Нээлттэй',
    shareViber: 'Viber-ээр хуваалцах', copyLink: 'Линк хуулах', copied: 'Хуулагдлаа!',
    enterName: 'Нэрээ оруулна уу', yourName: 'Таны нэр', start: 'Эхлэх',
    welcome: 'Тавтай морил!', createdBy: 'Үүсгэсэн', gameInfo: 'Тоглолтын мэдээлэл',
    autoGroup: 'Хүлээлгийн жагсаалт 3+ болоход шинэ групп автоматаар үүснэ',
    autoGroupNew: 'Групп дүүрмэгц шинэ групп автоматаар үүснэ',
    alreadyJoined: 'Та аль хэдийн нэгдсэн байна',
    confirmLeave: 'Та гарахдаа итгэлтэй байна уу?', yes: 'Тийм', no: 'Үгүй',
    organizedBy: 'Зохион байгуулсан', at: '-д', shareText: 'Гольф тоглолт! 🏌️',
    joinPrompt: 'Нэгдэх бол доорх линк дээр дарна уу:', back: 'Буцах',
    today: 'Өнөөдөр', tomorrow: 'Маргааш', spotLeft: 'зай үлдсэн',
    gameDeleted: 'Тоглолт устгагдсан', delete: 'Устгах', confirmDelete: 'Устгахдаа итгэлтэй байна уу?',
    settings: 'Тохиргоо', demoMode: 'Демо горим', firebaseMode: 'Firebase горим',
    setupFirebase: 'Firebase тохируулах', notConfigured: 'Firebase тохируулаагүй байна',
  },
  en: {
    appName: 'GolfUp', tagline: 'Play together!',
    home: 'Home', createGame: 'Create Game', activeGames: 'Active Games',
    noGames: 'No games yet. Create a new one!',
    date: 'Date', time: 'Time', location: 'Location', groupSize: 'Group Size',
    create: 'Create', cancel: 'Cancel', join: 'Join', leave: 'Leave',
    group: 'Group', waitingList: 'Waiting List', emptySlot: 'Empty',
    players: 'players', full: 'Full', open: 'Open',
    shareViber: 'Share on Viber', copyLink: 'Copy Link', copied: 'Copied!',
    enterName: 'Enter your name', yourName: 'Your name', start: 'Start',
    welcome: 'Welcome!', createdBy: 'Created by', gameInfo: 'Game Info',
    autoGroup: 'New group auto-creates when waiting list reaches 3+',
    autoGroupNew: 'New group auto-creates when current group is full',
    alreadyJoined: 'You have already joined',
    confirmLeave: 'Are you sure you want to leave?', yes: 'Yes', no: 'No',
    organizedBy: 'Organized by', at: 'at', shareText: 'Golf game! 🏌️',
    joinPrompt: 'Click the link below to join:', back: 'Back',
    today: 'Today', tomorrow: 'Tomorrow', spotLeft: 'spot(s) left',
    gameDeleted: 'Game deleted', delete: 'Delete', confirmDelete: 'Are you sure you want to delete?',
    settings: 'Settings', demoMode: 'Demo Mode', firebaseMode: 'Firebase Mode',
    setupFirebase: 'Setup Firebase', notConfigured: 'Firebase not configured',
  }
};

let lang = localStorage.getItem('golfup_lang') || 'mn';

export function t(key) { return T[lang]?.[key] || T.en[key] || key; }
export function getLang() { return lang; }
export function setLang(l) { lang = l; localStorage.setItem('golfup_lang', l); }
export function toggleLang() { setLang(lang === 'mn' ? 'en' : 'mn'); return lang; }
