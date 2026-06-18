// One-time script to seed ASEM Restaurant menu into Firebase RTDB.
// Run: node scripts/seed-asem-menu.js
// Prices from PDF × 1000 = MNT (e.g. 31.9 → 31900₮)

import { initializeApp } from 'firebase/app';
import { getDatabase, ref, set, remove } from 'firebase/database';

const firebaseConfig = {
  apiKey: 'AIzaSyAO8NzK55UF4U05e3dZoxkNomzNX3-Ybgc',
  databaseURL: 'https://golfup-app-default-rtdb.firebaseio.com',
  projectId: 'golfup-app',
};
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

const p = (n) => Math.round(n * 1000); // price helper

const ITEMS = [
  // ── GOLFER'S FAVORITE ────────────────────────────────────────────────────
  { nameEn: 'Mongolian Fried Rice', name: 'Будаатай хуурга', description: 'Хуурсан өндөг, ногоотой Монгол хуурсан будаа', category: "Golfer's Favorite", popular: true, price: p(22.9) },
  { nameEn: 'Mongolian Rice Soup', name: 'Будаатай шөл', description: 'Мах, ногоотой будаатай дулаан шөл', category: "Golfer's Favorite", popular: true, price: p(22.9) },
  { nameEn: 'Mongolian Noodle Soup', name: 'Гурилтай шөл', description: 'Үхрийн мах, хонины хавиргатай гурилтай шөл', category: "Golfer's Favorite", popular: true, price: p(29.9) },
  { nameEn: 'Mongolian Fried Noodle', name: 'Цуйван', description: 'Өвчүүний махтай Монгол цуйван', category: "Golfer's Favorite", popular: true, price: p(37.9) },
  { nameEn: 'Mongolian Khuushuur', name: 'Хуушуур', description: 'Үхрийн махтай хуушуур — зөвхөн ажлын өдөр', category: "Golfer's Favorite", popular: true, price: p(39.9) },
  { nameEn: 'Chicken Fajita', name: 'Chicken Fajita', description: 'Тахианы махтай Мексик маягийн фахита', category: "Golfer's Favorite", popular: true, price: p(45.9) },
  { nameEn: 'Bantan', name: 'Бантан', description: 'Үхрийн мах, хонины хавиргатай гурилтай Монгол бантан', category: "Golfer's Favorite", popular: true, price: p(25.9) },

  // ── STARTER ──────────────────────────────────────────────────────────────
  { nameEn: 'Beef Brisket Appetizer', name: 'Үхрийн өвчүүний махан зууш', description: 'Халапеньо, үхрийн өвчүүний махан зууш (659 ккал)', category: 'Starter', price: p(31.9) },
  { nameEn: 'Mini Delicatessen', name: 'Бяслагны цуглуулга', description: 'Бяслагны цуглуулга (559 ккал)', category: 'Starter', price: p(46.9) },
  { nameEn: 'Baked Mussels with Cheese and Spicy Mayo', name: 'Бяслагтай халуун хясаа', description: 'Халуун ногоо, бяслагтай хясаа (367 ккал)', category: 'Starter', price: p(46.9) },

  // ── SALADS ───────────────────────────────────────────────────────────────
  { nameEn: 'Asian Style Triple Salad', name: 'Ази маягийн гурвалсан салат', description: 'Үхрийн гүзээ, газрын самар, буурцгийн сүмстэй салат (495 ккал)', category: 'Salads', price: p(25.9) },
  { nameEn: 'Red Beetroot & Green Apple Salad', name: 'Хүрэн манжин, ногоон алимтай салат', description: 'Хүрэн манжин, ногоон алимтай салат (219 ккал)', category: 'Salads', price: p(27.9) },
  { nameEn: 'Caesar Salad', name: 'Цезарь салат', description: 'Шинэ ногоо, гриллдэж шарсан тахианы салат (600 ккал)', category: 'Salads', price: p(31.9), popular: true },
  { nameEn: 'Ice Garden Salad', name: 'Айсберг ногоон салат', description: 'Шинэхэн жимс, айсберг ногоон салат (161 ккал)', category: 'Salads', price: p(31.9) },
  { nameEn: 'Pear, Cashew & Blue Cheese Salad', name: 'Лийр, Кешью, хөгцтэй бяслагтай салат', description: 'Лийр, Кешью самар хөгцтэй бяслагтай салат (400 ккал)', category: 'Salads', price: p(31.9) },
  { nameEn: 'Avocado Salad with Feta Cheese', name: 'Авокадо, ямааны бяслагтай салат', description: 'Ямааны бяслаг, улаан лооль, шарсан талхтай авокадо салат (400 ккал)', category: 'Salads', price: p(37.9) },
  { nameEn: 'Smoked Duck & Mozzarella Salad', name: 'Утсан нугас, Моцарелла бяслагтай салат', description: 'Утсан нугасны мах, Итали цэвэр моцарелла бяслаг, жүржийн сүмстэй салат (583 ккал)', category: 'Salads', price: p(39.9) },

  // ── SOUPS ────────────────────────────────────────────────────────────────
  { nameEn: 'Cauliflower Cream Soup', name: 'Цагаан байцааны зутан шөл', description: 'Цагаан цэцэгт байцааны зутан шөл (426 ккал)', category: 'Soups', price: p(26.9) },
  { nameEn: 'Mushroom Cream Soup', name: 'Мөөгний зутан шөл', description: 'Мөөгний зутан шөл (400 ккал)', category: 'Soups', price: p(26.9) },
  { nameEn: 'Mongolian Noodle Soup', name: 'Монгол гурилтай шөл', description: 'Үхрийн мах, хонины хавиргатай гурилтай шөл (1200 ккал)', category: 'Soups', price: p(29.9), popular: true },
  { nameEn: 'Creamy Spicy Chicken Soup', name: 'Халуун тахианы сүүн шөл', description: 'Халуун ногоотой, тахианы махтай сүүн шөл (600 ккал)', category: 'Soups', price: p(33.9) },
  { nameEn: 'Chicken Ramen', name: 'Тахианы Рамен', description: 'Бүрж шарсан тахианы махтай Рамен (1160 ккал)', category: 'Soups', price: p(33.9) },
  { nameEn: 'Pork Ramen', name: 'Гахайн Рамен', description: 'Амталж шарсан гахайн махтай Рамен (1229 ккал)', category: 'Soups', price: p(33.9) },
  { nameEn: 'Spicy Beef Ramen', name: 'Халуун үхрийн Рамен', description: 'Жигнэсэн үхрийн мах, цуутай чанасан өндөгтэй рамен (1230 ккал)', category: 'Soups', price: p(33.9) },
  { nameEn: 'Mexican Beef & Black Bean Soup', name: 'Мексик маягийн хар шошт шөл', description: 'Мексик маягийн хар шош, үхрийн махтай шөл (1200 ккал)', category: 'Soups', price: p(34.9) },
  { nameEn: 'Mongolian Milk Tea with Dumplings', name: 'Банштай цай', description: 'Борцтой, хунчиртай банштай цай (1250 ккал)', category: 'Soups', price: p(34.9) },
  { nameEn: 'Beef Hock Bone Soup', name: 'Тойгны шөл', description: 'Өвчүүний мах, монгол бяслагтай, тойгны шөл, жигнэсэн гурилны хачиртай (866 ккал)', category: 'Soups', price: p(38.9) },
  { nameEn: 'Creamy Spicy Seafood Soup', name: 'Халуун далайн сүүн шөл', description: 'Халуун ногоотой далайн сүүн шөл (600 ккал)', category: 'Soups', price: p(39.9) },

  // ── BREAKFAST ─────────────────────────────────────────────────────────────
  { nameEn: 'Raspberry Yogurt Oatmeal', name: 'Бөөрөлзгөнө тарагтай овьёос', description: 'Бөөрөлзгөнө тарагтай овьёос (600 ккал)', category: 'Breakfast', price: p(23.9) },
  { nameEn: 'Avocado Croissant Sandwich', name: 'Авокадо Кросант сэндвич', description: 'Гахайн утсан мах, Чеддар бяслаг, Авокадотай кросант сэндвич (900 ккал)', category: 'Breakfast', price: p(23.9) },
  { nameEn: 'Chicken Filled Cheese Bun', name: 'Тахианы, бяслагтай талх', description: 'Моцарелла бяслаг, тахианы махтай талх (350 ккал)', category: 'Breakfast', price: p(25.9) },
  { nameEn: 'Belgian Waffle', name: 'Бельги вафли', description: 'Гүзээлзгэнэ, ойн жимсний сүмстэй Бельги вафли (350 ккал)', category: 'Breakfast', price: p(29.9) },
  { nameEn: 'English Breakfast', name: 'Англи өглөөний хоол', description: 'Бүрэн англи өглөөний хоол (900 ккал)', category: 'Breakfast', price: p(29.9) },
  { nameEn: 'Sourdough with Smoked Salmon & Poached Egg', name: 'Утсан загас, өндөгтэй шарсан талх', description: 'Утсан яргай загас, өндөгтэй шарсан хөрөнгөний талх (900 ккал)', category: 'Breakfast', price: p(29.9) },

  // ── MAIN COURSE ───────────────────────────────────────────────────────────
  { nameEn: 'Mongolian Fried Noodle (Tsuivan)', name: 'Цуйван', description: 'Өвчүүний махтай цуйван (1050 ккал)', category: 'Main Course', price: p(37.9), popular: true },
  { nameEn: 'Mongolian Khuushuur', name: 'Хуушуур', description: 'Шинэ ногооны салаттай, үхрийн махтай хуушуур (1200 ккал) — зөвхөн ажлын өдөр', category: 'Main Course', price: p(39.9) },
  { nameEn: 'Oriental Style Chicken', name: 'Дорно маягийн тахиа', description: 'Буурцагны сүмстэй бүрмэл тахиа (1262 ккал)', category: 'Main Course', price: p(43.9) },
  { nameEn: 'Chinese Style Cheese Chicken', name: 'Хятад маягийн бяслагтай тахиа', description: 'Хятад маягаар амталсан бяслагтай тахиа (1150 ккал)', category: 'Main Course', price: p(45.9) },
  { nameEn: 'Mexican Chicken Fajita', name: 'Мексик Тахианы Фахита', description: 'Тахианы махтай Мексик Фахита (1300 ккал)', category: 'Main Course', price: p(45.9) },
  { nameEn: 'Fish and Chips', name: 'Загас, шарсан төмс', description: 'Шарсан төмс, тартар сүмстэй бүрж шарсан цагаан загас (2565 ккал)', category: 'Main Course', price: p(45.9) },
  { nameEn: 'Pork & Cheese Croquette', name: 'Гахайн, бяслагтай крокет', description: 'Бяслагтай шарсан гахайн махан крокет (1300 ккал)', category: 'Main Course', price: p(41.9) },
  { nameEn: 'Grilled Pork Neck Steak', name: 'Гахайн хүзүүний стейк', description: 'Цөцгийтэй жүржийн сүмстэй, гриллдэж шарсан гахайн хүзүүний стейк (1100 ккал)', category: 'Main Course', price: p(50.9) },
  { nameEn: 'Grilled Lamb Chops', name: 'Хонины хавирга', description: 'Гриллдэж шарсан хонины хавирга (1300 ккал)', category: 'Main Course', price: p(54.9) },
  { nameEn: 'Szechuan Style Beef Short Ribs', name: 'Сичуань маягийн үхрийн хавирга', description: 'Сичуань маягаар амталсан үхрийн хавирга (1520 ккал)', category: 'Main Course', price: p(65.9) },
  { nameEn: 'French Duck Confit with Mango Sauce', name: 'Франц маягийн нугасны гуя', description: 'Франц маягаар болгосон мангоны сүмстэй нугасны гуя (810 ккал)', category: 'Main Course', price: p(64.9) },
  { nameEn: 'Grilled Beef Sirloin Steak', name: 'Үхрийн нурууны стейк', description: 'Бяслаг, мөөгтэй үхрийн нурууны махан стейк (1520 ккал)', category: 'Main Course', price: p(71.9) },
  { nameEn: 'Grilled Beef Tenderloin Steak (Primeat)', name: 'Үхрийн гол махан стейк (Primeat)', description: 'Үхрийн чөмөг, итали банш, мөөгний сүмстэй ил гал дээр шарсан үхрийн гол махан стейк (2500 ккал)', category: 'Main Course', price: p(71.9), popular: true },
  { nameEn: 'Pastrami Beef Short Ribs with Red Wine Sauce', name: 'Улаан дарсны Үхрийн богино хавирга', description: 'Улаан дарсны сүмс, хуурсан мини лууван, нухсан төмстэй үхрийн богино хавирга (1316 ккал)', category: 'Main Course', price: p(73.9) },
  { nameEn: 'Salmon Fillet Steak', name: 'Яргай загасны стейк', description: 'Аньс, чацаргана, цагаан вино, сүүн кремэн сүмстэй яргай загасны стейк (783 ккал)', category: 'Main Course', price: p(79.9) },
  { nameEn: 'Roasted Miso Cod Fish', name: 'Мисо сүмстэй хар загас', description: 'Бууцай, дарсан ягаан гаа, мисо сүмстэй, хар сагамхай загас (826 ккал)', category: 'Main Course', price: p(85.9) },
  { nameEn: 'Grilled Ribeye Steak (Primeat)', name: 'Рибай стейк (Primeat)', description: 'Хөгцтэй бяслагны сүмстэй, ил гал дээр шарсан үхрийн сээрний махан стейк (1658 ккал)', category: 'Main Course', price: p(99.9) },
  { nameEn: 'Pork Knuckle (1-2 per)', name: 'Гахайн тагалцаг', description: 'Нухсан төмс, исгэлэн байцаатай гахайн тагалцаг (2531 ккал) — 1-2 хүн', category: 'Main Course', price: p(99.9) },
  { nameEn: 'Grilled T-bone Steak (Primeat)', name: 'Т-ясан стейк (Primeat)', description: 'Хуурсан ногоо, аньсны сүмстэй, ил гал дээр шарсан үхрийн нурууны махан стейк (2500 ккал)', category: 'Main Course', price: p(99.9) },
  { nameEn: 'Grilled Tomahawk Steak (Primeat)', name: 'Томахавк стейк (Primeat)', description: 'Гэрийн аргаар бэлтгэсэн төмсний хачиртай, ил гал дээр шарсан үхрийн хавирганы махан стейк (2972 ккал)', category: 'Main Course', price: p(199.9) },

  // ── VEGAN FOOD ────────────────────────────────────────────────────────────
  { nameEn: 'Vegan Soup', name: 'Веган шөл', description: 'Шар будаа, куана будаа, бууцай, шош, хулуу, яншуй, шинцайтай веган шөл (450 ккал)', category: 'Vegan', price: p(30.9) },
  { nameEn: 'Zucchini Boats', name: 'Хулуун зоог', description: 'Цөцгийн сүмстэй, пармизан бяслагтай веган зоог (900 ккал)', category: 'Vegan', price: p(36.9) },
  { nameEn: 'Vegan Fish Fillet', name: 'Веган загас', description: 'Хулуу, үрлэн помидор, төмс, лууван, шар буурцагны сүүгээр амталсан веган загас (350 ккал)', category: 'Vegan', price: p(45.0) },

  // ── PASTA & RAVIOLI ───────────────────────────────────────────────────────
  { nameEn: 'Carbonara Pasta', name: 'Карбонара', description: 'Пармезан бяслаг, сүүн крем, гахайн утсан махтай гоймон (1250 ккал)', category: 'Pasta & Ravioli', price: p(41.9), popular: true },
  { nameEn: 'Spicy Arrabbiata Pasta', name: 'Халуун Аррабиата', description: 'Халапеньо, улаан лоолийн сүмс, пармезан бяслаг, тахианы махтай гоймон (1100 ккал)', category: 'Pasta & Ravioli', price: p(41.9) },
  { nameEn: 'Seafood Strozzapreti Pasta', name: 'Далайн гоймонтай паста', description: 'Далайн гаралтай итали гоймонтой паста (900 ккал)', category: 'Pasta & Ravioli', price: p(43.9) },
  { nameEn: 'Creamy Black Ravioli', name: 'Итали хар банш', description: 'Цөцгийн сүмстэй итали хар банш (1217 ккал)', category: 'Pasta & Ravioli', price: p(44.9) },
  { nameEn: 'Tomato Parmesan White Ravioli', name: 'Итали цагаан банш', description: 'Улаан лоольны сүмстэй итали цагаан банш (628 ккал)', category: 'Pasta & Ravioli', price: p(44.9) },
  { nameEn: 'Grilled Pork Clamarata Pasta (1-2 per)', name: 'Гахайн махан паста (1-2 хүн)', description: 'Ил гал дээр шарсан гахайн махан паста (900 ккал)', category: 'Pasta & Ravioli', price: p(65.9) },
  { nameEn: 'Grilled Beef Conchiglie Pasta (1-2 per)', name: 'Үхрийн махан стейктэй паста (1-2 хүн)', description: 'Ил гал дээр шарсан үхрийн махан стейктэй паста (1571 ккал)', category: 'Pasta & Ravioli', price: p(65.9) },
  { nameEn: 'Baked Ricotta Cannelloni (1-2 per)', name: 'Рикотта бяслагтай Каннеллони (1-2 хүн)', description: 'Улаан лоольны сүмс каннеллони гоймонтой бяслагны хучмал (1571 ккал)', category: 'Pasta & Ravioli', price: p(65.9) },
  { nameEn: 'Oven-baked Salmon Tagliatelle (1-2 per)', name: 'Яргай загасны Тальятелле (1-2 хүн)', description: 'Яргай загасны хучмал таглитель паста (1925 ккал)', category: 'Pasta & Ravioli', price: p(69.9) },

  // ── PIZZA & BURGER ────────────────────────────────────────────────────────
  { nameEn: 'Margherita Pizza', name: 'Маргарита пицца', description: 'Бяслагтай пицца (1316 ккал)', category: 'Pizza & Burger', price: p(42.9), popular: true },
  { nameEn: 'Meat Lovers Pizza', name: 'Махан пицца', description: 'Маханд дурлагсад пицца (1744 ккал)', category: 'Pizza & Burger', price: p(46.9) },
  { nameEn: 'Spicy Mexico Pizza', name: 'Мексик халуун пицца', description: 'Тахианы мах, халопенотой пицца (1558 ккал)', category: 'Pizza & Burger', price: p(46.9) },
  { nameEn: 'Spicy BBQ Chicken Burger', name: 'Тахианы бүргер', description: 'Тахианы махтай бүргер (1610 ккал)', category: 'Pizza & Burger', price: p(40.9) },
  { nameEn: 'Fondue Cheese Prime Beef Burger', name: 'Үхрийн Primeat бүргер', description: 'Шингэн бяслаг, халопенотой үхрийн махтай бүргер (1610 ккал)', category: 'Pizza & Burger', price: p(49.9) },

  // ── SHARE FOOD ────────────────────────────────────────────────────────────
  { nameEn: 'Home-made Chicken Salad (4-6 per)', name: 'Тахианы махан салат (4-6 хүн)', description: 'Шарсан талх, өндөг, бяслагтай тахианы цээж махан салат (3200 ккал)', category: 'Share Food', price: p(95.9) },
  { nameEn: 'Thai Beef Tenderloin Salad (4-6 per)', name: 'Тайланд маягийн үхрийн салат (4-6 хүн)', description: 'Газрын самар, Тайланд маягийн сүмстэй үхрийн гол махан салат (1328 ккал)', category: 'Share Food', price: p(95.9) },
  { nameEn: 'Fresh Fruit Platter (4-6 per)', name: 'Шинэхэн жимсний тавиур (4-6 хүн)', description: 'Шинэхэн жимсний цуглуулга (1800 ккал)', category: 'Share Food', price: p(99.9) },
  { nameEn: 'Cured Meat & Cheese Platter (4-6 per)', name: 'Хатаасан мах, бяслагны тавиур (4-6 хүн)', description: 'Хатаасан мах, бяслагны цуглуулга (5210 ккал)', category: 'Share Food', price: p(129.9) },
  { nameEn: 'Chicken Meat Collection (4-6 per)', name: 'Тахианы махан цуглуулга (4-6 хүн)', description: 'Тахианы махан цуглуулга (5210 ккал)', category: 'Share Food', price: p(175.9) },
  { nameEn: 'Grilled Pork, Beef & Lamb Collection (4-6 per)', name: 'Үхэр, Хонь, Гахайн цуглуулга (4-6 хүн)', description: 'Үхэр, хонь, гахайн махан цуглуулга (6140 ккал)', category: 'Share Food', price: p(299.9) },

  // ── CHILDREN SET ──────────────────────────────────────────────────────────
  { nameEn: "Children's Pizza Set", name: 'Хүүхдийн пицца сет', description: 'Пицца, сүүтэй будаа, жимсний салат, шарсан төмс', category: "Children's Set", price: p(24.9) },
  { nameEn: "Children's Chicken Set", name: 'Хүүхдийн тахианы сет', description: 'Шарсан тахиа, бантан, жимсний салат, шарсан төмс', category: "Children's Set", price: p(24.9) },
  { nameEn: "Children's Meat Ball Set", name: 'Хүүхдийн бөмбөлөгний сет', description: 'Шпагетти, хулууны зутан, жимсний салат, шарсан төмс', category: "Children's Set", price: p(24.9) },

  // ── DESSERT ───────────────────────────────────────────────────────────────
  { nameEn: 'Oreo Cheese Cake', name: 'Орео чиз кейк', category: 'Dessert', price: p(18.9) },
  { nameEn: 'Classic Opera Cake', name: 'Шоколад Опера кейк', category: 'Dessert', price: p(18.9) },
  { nameEn: 'Caramel Cheese Cake', name: 'Карамель чиз кейк', category: 'Dessert', price: p(18.9) },
  { nameEn: 'Ice Cream', name: 'Мөсөн зайрмаг', category: 'Dessert', price: p(18.9) },
  { nameEn: 'Crème Brûlée', name: 'Крем Брюле', category: 'Dessert', price: p(18.9) },
  { nameEn: 'Lemon Tart', name: 'Нимбэгний тарт', category: 'Dessert', price: p(18.9) },
  { nameEn: 'Chocolate Brownie with Ice Cream', name: 'Шоколад Брауни, мөсөн зайрмаг', category: 'Dessert', price: p(18.9) },
  { nameEn: 'Tiramisu Cake', name: 'Тирамису', category: 'Dessert', price: p(20.9), popular: true },
  { nameEn: 'Sliced Fruit with Chocolate Sauce', name: 'Жимс, шоколадны сүмстэй', category: 'Dessert', price: p(20.9) },

  // ── SIDES ─────────────────────────────────────────────────────────────────
  { nameEn: 'Garlic Cheese Pita Bread', name: 'Сармисан бяслагтай тариалан талх', category: 'Sides', price: p(9.9) },
  { nameEn: 'Salted Cake and Olive Bread', name: 'Давстай талх, чидун жимс', category: 'Sides', price: p(14.9) },
  { nameEn: 'Roasted Vegetables', name: 'Шарсан ногоо', category: 'Sides', price: p(14.9) },
  { nameEn: 'Steamed Spicy Wildpeppers', name: 'Халуун чинжүү', category: 'Sides', price: p(15.9) },
  { nameEn: 'French Fries', name: 'Шарсан төмс', category: 'Sides', price: p(18.9), popular: true },
  { nameEn: 'Sausage and Chips', name: 'Сосис, чипс', category: 'Sides', price: p(25.9) },

  // ── BEVERAGES — SOFT DRINKS ───────────────────────────────────────────────
  { nameEn: 'Coca-Cola (300ml)', name: 'Кока-кола 300мл', category: 'Beverages', price: p(6.5) },
  { nameEn: 'Coca-Cola Can (330ml)', name: 'Кока-кола лаазтай 330мл', category: 'Beverages', price: p(7.5) },
  { nameEn: 'Juice (Orange/Apple/Mango)', name: 'Жүс (Жүрж/Алим/Манго)', description: 'Жүрж, алим, манго жүсний нэг төрөл', category: 'Beverages', price: p(6.5) },
  { nameEn: 'Fresh Squeezed Juice', name: 'Шинэхэн жүс', description: 'Жүрж эсвэл алим', category: 'Beverages', price: p(19.0) },
  { nameEn: 'Red Bull', name: 'Ред Булл', category: 'Beverages', price: p(12.0) },
  { nameEn: 'Still Water (500ml)', name: 'Ус (500мл)', category: 'Beverages', price: p(3.0) },
  { nameEn: 'Draft Beer', name: 'Шарын архи (дамжуулсан)', description: 'Таг татсан шарын архи', category: 'Beverages', price: p(8.0) },
  { nameEn: 'Bottled Beer', name: 'Шарын архи (лонхтой)', description: 'Лонхтой шарын архи', category: 'Beverages', price: p(7.0) },

  // ── BEVERAGES — HOT DRINKS ────────────────────────────────────────────────
  { nameEn: 'Tea Bag (Green/Black/Nectar)', name: 'Цай (Ногоон/Хар/Нектар)', description: 'Mighty Leaf — нэг хүний', category: 'Beverages', price: p(8.5) },
  { nameEn: 'Hot Milk (Honey/Chocolate)', name: 'Халуун сүү (Зөгийн бал/Шоколад)', category: 'Beverages', price: p(9.9) },
  { nameEn: 'Ginger Lemon Tea', name: 'Имбирь нимбэгний цай', category: 'Beverages', price: p(12.5) },
  { nameEn: 'Hot Fruit Juice (Lingonberry/Seabuckthorn)', name: 'Халуун жимсний жүс', description: 'Жимсгэнэ эсвэл чацаргана', category: 'Beverages', price: p(12.5) },
  { nameEn: 'Pot Tea (2-4 per)', name: 'Чайдан цай (2-4 хүн)', description: 'Mighty Leaf ногоон, хар, нектар — 2-4 хүний', category: 'Beverages', price: p(15.5) },

  // ── BEVERAGES — COFFEE ────────────────────────────────────────────────────
  { nameEn: 'Espresso', name: 'Эспрессо', category: 'Coffee', price: p(9.5) },
  { nameEn: 'Americano', name: 'Американо', category: 'Coffee', price: p(9.5) },
  { nameEn: 'Double Americano', name: 'Давхар Американо', description: 'Хоёр шот эспрессо, халуун ус', category: 'Coffee', price: p(12.5) },
  { nameEn: 'Cappuccino', name: 'Капучино', category: 'Coffee', price: p(11.5) },
  { nameEn: 'Café Latte', name: 'Латте', category: 'Coffee', price: p(10.5), popular: true },
  { nameEn: 'Vanilla Latte', name: 'Ванилин латте', category: 'Coffee', price: p(13.5) },
  { nameEn: 'Mocha', name: 'Моха', category: 'Coffee', price: p(13.5) },
  { nameEn: 'Caramel Latte', name: 'Карамель латте', category: 'Coffee', price: p(13.5) },
  { nameEn: 'Matcha Latte', name: 'Матча латте', category: 'Coffee', price: p(14.0) },
  { nameEn: 'Irish Coffee', name: 'Ирланд кофе', category: 'Coffee', price: p(18.0) },

  // ── BEVERAGES — SMOOTHIE & SHAKE ─────────────────────────────────────────
  { nameEn: 'Mango Smoothie', name: 'Манго смузи', category: 'Smoothie & Shake', price: p(17.0) },
  { nameEn: 'Strawberry Smoothie', name: 'Гүзээлзгэнэ смузи', category: 'Smoothie & Shake', price: p(17.0) },
  { nameEn: 'Fruit Smoothie', name: 'Жимсний смузи', category: 'Smoothie & Shake', price: p(19.0) },
  { nameEn: 'Vanilla Shake', name: 'Ванилин шейк', category: 'Smoothie & Shake', price: p(16.9) },
  { nameEn: 'Strawberry Shake', name: 'Гүзээлзгэнэний шейк', category: 'Smoothie & Shake', price: p(16.9) },
  { nameEn: 'Chocolate Shake', name: 'Шоколад шейк', category: 'Smoothie & Shake', price: p(16.9) },
  { nameEn: 'Snickers Shake', name: 'Сникерс шейк', category: 'Smoothie & Shake', price: p(19.9) },
  { nameEn: 'Oreo Shake', name: 'Орео шейк', category: 'Smoothie & Shake', price: p(19.9) },
];

async function seed() {
  console.log('Одоогийн menu/ node-г цэвэрлэж байна…');
  await remove(ref(db, 'menu'));

  let sortOrder = 0;
  for (const item of ITEMS) {
    const id = 'm_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
    const record = {
      id,
      name: item.name,
      nameEn: item.nameEn || '',
      description: item.description || '',
      price: item.price,
      category: item.category,
      available: true,
      popular: item.popular || false,
      sortOrder: sortOrder++,
    };
    await set(ref(db, 'menu/' + id), record);
    process.stdout.write('.');
  }

  console.log(`\n✅ ${ITEMS.length} зүйл амжилттай нэмэгдлээ.`);
  process.exit(0);
}

seed().catch(err => { console.error(err); process.exit(1); });
