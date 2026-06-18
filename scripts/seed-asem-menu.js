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
  {
    name: 'Будаатай хуурга', nameEn: 'Mongolian Fried Rice', nameKr: '몽골 볶음밥',
    description: 'Хуурсан өндөг, ногоотой Монгол хуурсан будаа',
    descriptionEn: 'Mongolian-style fried rice with scrambled egg and fresh vegetables',
    descriptionKr: '스크램블 에그와 신선한 채소를 넣은 몽골식 볶음밥',
    category: "Golfer's Favorite", popular: true, price: p(22.9), imageUrl: ''
  },
  {
    name: 'Будаатай шөл', nameEn: 'Mongolian Rice Soup', nameKr: '몽골 쌀국물',
    description: 'Мах, ногоотой будаатай дулаан шөл',
    descriptionEn: 'Warm Mongolian rice soup with meat and vegetables',
    descriptionKr: '고기와 채소가 들어간 따뜻한 몽골식 쌀 수프',
    category: "Golfer's Favorite", popular: true, price: p(22.9), imageUrl: ''
  },
  {
    name: 'Гурилтай шөл', nameEn: 'Mongolian Noodle Soup', nameKr: '몽골 면 수프',
    description: 'Үхрийн мах, хонины хавиргатай гурилтай шөл',
    descriptionEn: 'Mongolian noodle soup with beef and lamb rib',
    descriptionKr: '쇠고기와 양갈비가 들어간 몽골식 면 수프',
    category: "Golfer's Favorite", popular: true, price: p(29.9), imageUrl: '/food/mongolian-noodle-soup.jpg'
  },
  {
    name: 'Цуйван', nameEn: 'Mongolian Fried Noodle', nameKr: '몽골 차이반',
    description: 'Өвчүүний махтай Монгол цуйван',
    descriptionEn: 'Mongolian-style stir-fried noodles with beef brisket',
    descriptionKr: '쇠고기 양지머리를 넣은 몽골식 볶음 면',
    category: "Golfer's Favorite", popular: true, price: p(37.9), imageUrl: '/food/mongolian-fried-noodle.jpg'
  },
  {
    name: 'Хуушуур', nameEn: 'Mongolian Khuushuur', nameKr: '몽골 호쇼르',
    description: 'Үхрийн махтай хуушуур — зөвхөн ажлын өдөр',
    descriptionEn: 'Crispy Mongolian fried dumplings with beef filling — weekdays only',
    descriptionKr: '쇠고기 속을 넣은 몽골식 튀긴 만두 — 평일만 제공',
    category: "Golfer's Favorite", popular: true, weekdayOnly: true, price: p(39.9), imageUrl: '/food/khuushuur.jpg'
  },
  {
    name: 'Chicken Fajita', nameEn: 'Chicken Fajita', nameKr: '치킨 파히타',
    description: 'Тахианы махтай Мексик маягийн фахита',
    descriptionEn: 'Mexican-style chicken fajita with peppers and spices',
    descriptionKr: '피망과 향신료를 넣은 멕시코식 치킨 파히타',
    category: "Golfer's Favorite", popular: true, price: p(45.9), imageUrl: '/food/mexican-chicken-fajita.jpg'
  },
  {
    name: 'Бантан', nameEn: 'Bantan Soup', nameKr: '반탄 수프',
    description: 'Үхрийн мах, хонины хавиргатай гурилтай Монгол бантан',
    descriptionEn: 'Traditional Mongolian bantan soup with beef, lamb rib and hand-pulled noodles',
    descriptionKr: '쇠고기, 양갈비와 수제 면이 들어간 전통 몽골 반탄 수프',
    category: "Golfer's Favorite", popular: true, price: p(25.9), imageUrl: ''
  },

  // ── STARTER ──────────────────────────────────────────────────────────────
  {
    name: 'Үхрийн өвчүүний махан зууш', nameEn: 'Beef Brisket Appetizer', nameKr: '쇠고기 양지 에피타이저',
    description: 'Халапеньо, үхрийн өвчүүний махан зууш (659 ккал)',
    descriptionEn: 'Tender beef brisket with jalapeño (659 kcal)',
    descriptionKr: '할라피뇨를 곁들인 부드러운 쇠고기 양지 전채 (659 kcal)',
    category: 'Starter', price: p(31.9), imageUrl: '/food/beef-brisket-appetizer.jpg'
  },
  {
    name: 'Бяслагны цуглуулга', nameEn: 'Mini Delicatessen', nameKr: '치즈 플래터',
    description: 'Бяслагны цуглуулга (559 ккал)',
    descriptionEn: 'Artisan cheese and delicatessen selection (559 kcal)',
    descriptionKr: '수제 치즈와 델리카트슨 모둠 (559 kcal)',
    category: 'Starter', price: p(46.9), imageUrl: '/food/mini-delicatessen.jpg'
  },
  {
    name: 'Бяслагтай халуун хясаа', nameEn: 'Baked Mussels with Cheese and Spicy Mayo', nameKr: '치즈 구운 홍합',
    description: 'Халуун ногоо, бяслагтай хясаа (367 ккал)',
    descriptionEn: 'Baked mussels topped with melted cheese and spicy mayonnaise (367 kcal)',
    descriptionKr: '녹인 치즈와 매운 마요네즈를 올린 구운 홍합 (367 kcal)',
    category: 'Starter', price: p(46.9), imageUrl: '/food/baked-mussels.jpg'
  },

  // ── SALADS ───────────────────────────────────────────────────────────────
  {
    name: 'Ази маягийн гурвалсан салат', nameEn: 'Asian Style Triple Salad', nameKr: '아시안 트리플 샐러드',
    description: 'Үхрийн гүзээ, газрын самар, буурцгийн сүмстэй салат (495 ккал)',
    descriptionEn: 'Beef tripe, peanuts and bean sprout dressing salad (495 kcal)',
    descriptionKr: '쇠고기 내장, 땅콩, 콩나물 드레싱 샐러드 (495 kcal)',
    category: 'Salads', price: p(25.9), imageUrl: '/food/asian-triple-salad.jpg'
  },
  {
    name: 'Хүрэн манжин, ногоон алимтай салат', nameEn: 'Red Beetroot & Green Apple Salad', nameKr: '비트 & 그린애플 샐러드',
    description: 'Хүрэн манжин, ногоон алимтай салат (219 ккал)',
    descriptionEn: 'Fresh red beetroot and crisp green apple salad (219 kcal)',
    descriptionKr: '신선한 빨간 비트와 아삭한 그린 애플 샐러드 (219 kcal)',
    category: 'Salads', price: p(27.9), imageUrl: '/food/red-beetroot-salad.jpg'
  },
  {
    name: 'Цезарь салат', nameEn: 'Caesar Salad', nameKr: '시저 샐러드',
    description: 'Шинэ ногоо, гриллдэж шарсан тахианы салат (600 ккал)',
    descriptionEn: 'Classic Caesar with romaine lettuce and grilled chicken breast (600 kcal)',
    descriptionKr: '로메인 상추와 구운 닭가슴살을 넣은 클래식 시저 샐러드 (600 kcal)',
    category: 'Salads', price: p(31.9), popular: true, imageUrl: '/food/caesar-salad.jpg'
  },
  {
    name: 'Айсберг ногоон салат', nameEn: 'Ice Garden Salad', nameKr: '아이스버그 가든 샐러드',
    description: 'Шинэхэн жимс, айсберг ногоон салат (161 ккал)',
    descriptionEn: 'Light salad with fresh fruit and crispy iceberg lettuce (161 kcal)',
    descriptionKr: '신선한 과일과 아삭한 아이스버그 상추 샐러드 (161 kcal)',
    category: 'Salads', price: p(31.9), imageUrl: '/food/ice-garden-salad.jpg'
  },
  {
    name: 'Лийр, Кешью, хөгцтэй бяслагтай салат', nameEn: 'Pear, Cashew & Blue Cheese Salad', nameKr: '배, 캐슈넛 & 블루치즈 샐러드',
    description: 'Лийр, Кешью самар хөгцтэй бяслагтай салат (400 ккал)',
    descriptionEn: 'Fresh pear, cashew nuts and creamy blue cheese salad (400 kcal)',
    descriptionKr: '신선한 배, 캐슈넛과 크리미 블루치즈 샐러드 (400 kcal)',
    category: 'Salads', price: p(31.9), imageUrl: '/food/pear-cashew-salad.jpg'
  },
  {
    name: 'Авокадо, ямааны бяслагтай салат', nameEn: 'Avocado Salad with Feta Cheese', nameKr: '아보카도 페타 샐러드',
    description: 'Ямааны бяслаг, улаан лооль, шарсан талхтай авокадо салат (400 ккал)',
    descriptionEn: 'Avocado with goat cheese, cherry tomato and toasted bread (400 kcal)',
    descriptionKr: '아보카도에 염소 치즈, 방울토마토, 구운 빵을 곁들인 샐러드 (400 kcal)',
    category: 'Salads', price: p(37.9), imageUrl: '/food/avocado-salad.jpg'
  },
  {
    name: 'Утсан нугас, Моцарелла бяслагтай салат', nameEn: 'Smoked Duck & Mozzarella Salad', nameKr: '훈제 오리 & 모차렐라 샐러드',
    description: 'Утсан нугасны мах, Итали цэвэр моцарелла бяслаг, жүржийн сүмстэй салат (583 ккал)',
    descriptionEn: 'Smoked duck breast, Italian mozzarella and citrus dressing (583 kcal)',
    descriptionKr: '훈제 오리 가슴살, 이탈리안 모차렐라와 시트러스 드레싱 (583 kcal)',
    category: 'Salads', price: p(39.9), imageUrl: '/food/smoked-duck-salad.jpg'
  },

  // ── SOUPS ────────────────────────────────────────────────────────────────
  {
    name: 'Цагаан байцааны зутан шөл', nameEn: 'Cauliflower Cream Soup', nameKr: '콜리플라워 크림 수프',
    description: 'Цагаан цэцэгт байцааны зутан шөл (426 ккал)',
    descriptionEn: 'Velvety cauliflower cream soup (426 kcal)',
    descriptionKr: '부드러운 콜리플라워 크림 수프 (426 kcal)',
    category: 'Soups', price: p(26.9), imageUrl: '/food/cauliflower-cream-soup.jpg'
  },
  {
    name: 'Мөөгний зутан шөл', nameEn: 'Mushroom Cream Soup', nameKr: '버섯 크림 수프',
    description: 'Мөөгний зутан шөл (400 ккал)',
    descriptionEn: 'Rich and creamy mushroom soup (400 kcal)',
    descriptionKr: '진하고 크리미한 버섯 수프 (400 kcal)',
    category: 'Soups', price: p(26.9), imageUrl: '/food/mushroom-cream-soup.jpg'
  },
  {
    name: 'Монгол гурилтай шөл', nameEn: 'Mongolian Noodle Soup', nameKr: '몽골 면 수프',
    description: 'Үхрийн мах, хонины хавиргатай гурилтай шөл (1200 ккал)',
    descriptionEn: 'Hearty Mongolian noodle soup with beef and lamb rib (1200 kcal)',
    descriptionKr: '쇠고기와 양갈비가 들어간 푸짐한 몽골식 면 수프 (1200 kcal)',
    category: 'Soups', price: p(29.9), popular: true, imageUrl: '/food/mongolian-noodle-soup.jpg'
  },
  {
    name: 'Халуун тахианы сүүн шөл', nameEn: 'Creamy Spicy Chicken Soup', nameKr: '매운 크림 치킨 수프',
    description: 'Халуун ногоотой, тахианы махтай сүүн шөл (600 ккал)',
    descriptionEn: 'Creamy chicken soup with a spicy kick (600 kcal)',
    descriptionKr: '매운맛이 살아있는 크리미 치킨 수프 (600 kcal)',
    category: 'Soups', price: p(33.9), imageUrl: '/food/spicy-chicken-soup.jpg'
  },
  {
    name: 'Тахианы Рамен', nameEn: 'Chicken Ramen', nameKr: '치킨 라멘',
    description: 'Бүрж шарсан тахианы махтай Рамен (1160 ккал)',
    descriptionEn: 'Rich ramen broth with crispy fried chicken (1160 kcal)',
    descriptionKr: '바삭하게 튀긴 치킨을 올린 진한 라멘 (1160 kcal)',
    category: 'Soups', price: p(33.9), imageUrl: '/food/chicken-ramen.jpg'
  },
  {
    name: 'Гахайн Рамен', nameEn: 'Pork Ramen', nameKr: '돼지 라멘',
    description: 'Амталж шарсан гахайн махтай Рамен (1229 ккал)',
    descriptionEn: 'Savory ramen with seasoned roasted pork (1229 kcal)',
    descriptionKr: '양념한 구운 돼지고기를 올린 라멘 (1229 kcal)',
    category: 'Soups', price: p(33.9), imageUrl: '/food/pork-ramen.jpg'
  },
  {
    name: 'Халуун үхрийн Рамен', nameEn: 'Spicy Beef Ramen', nameKr: '매운 쇠고기 라멘',
    description: 'Жигнэсэн үхрийн мах, цуутай чанасан өндөгтэй рамен (1230 ккал)',
    descriptionEn: 'Braised beef and soft-boiled egg ramen with spicy broth (1230 kcal)',
    descriptionKr: '매운 국물에 수육과 반숙 달걀을 올린 쇠고기 라멘 (1230 kcal)',
    category: 'Soups', price: p(33.9), imageUrl: '/food/spicy-beef-ramen.jpg'
  },
  {
    name: 'Мексик маягийн хар шошт шөл', nameEn: 'Mexican Beef & Black Bean Soup', nameKr: '멕시칸 쇠고기 블랙빈 수프',
    description: 'Мексик маягийн хар шош, үхрийн махтай шөл (1200 ккал)',
    descriptionEn: 'Mexican-style hearty beef and black bean soup (1200 kcal)',
    descriptionKr: '멕시코식 쇠고기와 블랙빈 수프 (1200 kcal)',
    category: 'Soups', price: p(34.9), imageUrl: ''
  },
  {
    name: 'Банштай цай', nameEn: 'Mongolian Milk Tea with Dumplings', nameKr: '몽골 만두 밀크티',
    description: 'Борцтой, хунчиртай банштай цай (1250 ккал)',
    descriptionEn: 'Traditional Mongolian salted milk tea with small dumplings and dried beef (1250 kcal)',
    descriptionKr: '작은 만두와 건조 쇠고기를 넣은 전통 몽골 짠 밀크티 (1250 kcal)',
    category: 'Soups', price: p(34.9), imageUrl: '/food/mongolian-milk-tea.jpg'
  },
  {
    name: 'Тойгны шөл', nameEn: 'Beef Hock Bone Soup', nameKr: '쇠족발 뼈 수프',
    description: 'Өвчүүний мах, монгол бяслагтай, тойгны шөл, жигнэсэн гурилны хачиртай (866 ккал)',
    descriptionEn: 'Beef brisket and Mongolian cheese bone soup with steamed dumplings (866 kcal)',
    descriptionKr: '쇠고기 양지와 몽골 치즈 뼈 수프와 찐 만두 곁들임 (866 kcal)',
    category: 'Soups', price: p(38.9), imageUrl: '/food/beef-hock-bone-soup.jpg'
  },
  {
    name: 'Халуун далайн сүүн шөл', nameEn: 'Creamy Spicy Seafood Soup', nameKr: '매운 해산물 크림 수프',
    description: 'Халуун ногоотой далайн сүүн шөл (600 ккал)',
    descriptionEn: 'Creamy seafood soup with a spicy chili kick (600 kcal)',
    descriptionKr: '매운 칠리로 맛을 낸 크리미 해산물 수프 (600 kcal)',
    category: 'Soups', price: p(39.9), imageUrl: ''
  },

  // ── BREAKFAST ─────────────────────────────────────────────────────────────
  {
    name: 'Бөөрөлзгөнө тарагтай овьёос', nameEn: 'Raspberry Yogurt Oatmeal', nameKr: '라즈베리 요거트 오트밀',
    description: 'Бөөрөлзгөнө тарагтай овьёос (600 ккал)',
    descriptionEn: 'Creamy oatmeal topped with raspberry yogurt (600 kcal)',
    descriptionKr: '라즈베리 요거트를 올린 크리미 오트밀 (600 kcal)',
    category: 'Breakfast', price: p(23.9), imageUrl: ''
  },
  {
    name: 'Авокадо Кросант сэндвич', nameEn: 'Avocado Croissant Sandwich', nameKr: '아보카도 크루아상 샌드위치',
    description: 'Гахайн утсан мах, Чеддар бяслаг, Авокадотай кросант сэндвич (900 ккал)',
    descriptionEn: 'Buttery croissant with smoked ham, cheddar cheese and avocado (900 kcal)',
    descriptionKr: '훈제 햄, 체다 치즈, 아보카도를 넣은 버터 크루아상 샌드위치 (900 kcal)',
    category: 'Breakfast', price: p(23.9), imageUrl: ''
  },
  {
    name: 'Тахианы, бяслагтай талх', nameEn: 'Chicken Filled Cheese Bun', nameKr: '치킨 치즈 번',
    description: 'Моцарелла бяслаг, тахианы махтай талх (350 ккал)',
    descriptionEn: 'Soft bun filled with chicken and melted mozzarella cheese (350 kcal)',
    descriptionKr: '닭고기와 녹은 모차렐라 치즈를 채운 부드러운 번 (350 kcal)',
    category: 'Breakfast', price: p(25.9), imageUrl: ''
  },
  {
    name: 'Бельги вафли', nameEn: 'Belgian Waffle', nameKr: '벨기에 와플',
    description: 'Гүзээлзгэнэ, ойн жимсний сүмстэй Бельги вафли (350 ккал)',
    descriptionEn: 'Crispy Belgian waffle with strawberry and forest berry compote (350 kcal)',
    descriptionKr: '딸기와 산딸기 컴포트를 곁들인 바삭한 벨기에 와플 (350 kcal)',
    category: 'Breakfast', price: p(29.9), imageUrl: '/food/belgian-waffle.jpg'
  },
  {
    name: 'Англи өглөөний хоол', nameEn: 'English Breakfast', nameKr: '잉글리시 브렉퍼스트',
    description: 'Бүрэн англи өглөөний хоол (900 ккал)',
    descriptionEn: 'Full English breakfast with eggs, bacon, sausage, beans and toast (900 kcal)',
    descriptionKr: '달걀, 베이컨, 소시지, 콩, 토스트를 포함한 풀 잉글리시 브렉퍼스트 (900 kcal)',
    category: 'Breakfast', price: p(29.9), imageUrl: '/food/english-breakfast.jpg'
  },
  {
    name: 'Утсан загас, өндөгтэй шарсан талх', nameEn: 'Sourdough with Smoked Salmon & Poached Egg', nameKr: '훈제 연어 수란 사워도우',
    description: 'Утсан яргай загас, өндөгтэй шарсан хөрөнгөний талх (900 ккал)',
    descriptionEn: 'Toasted sourdough topped with smoked salmon and poached egg (900 kcal)',
    descriptionKr: '훈제 연어와 수란을 올린 구운 사워도우 (900 kcal)',
    category: 'Breakfast', price: p(29.9), imageUrl: ''
  },

  // ── MAIN COURSE ───────────────────────────────────────────────────────────
  {
    name: 'Цуйван', nameEn: 'Mongolian Fried Noodle (Tsuivan)', nameKr: '몽골 차이반',
    description: 'Өвчүүний махтай цуйван (1050 ккал)',
    descriptionEn: 'Traditional Mongolian stir-fried noodles with beef brisket (1050 kcal)',
    descriptionKr: '쇠고기 양지머리를 넣은 전통 몽골식 볶음 면 (1050 kcal)',
    category: 'Main Course', price: p(37.9), popular: true, imageUrl: '/food/mongolian-fried-noodle.jpg'
  },
  {
    name: 'Хуушуур', nameEn: 'Mongolian Khuushuur', nameKr: '몽골 호쇼르',
    description: 'Шинэ ногооны салаттай, үхрийн махтай хуушуур (1200 ккал) — зөвхөн ажлын өдөр',
    descriptionEn: 'Crispy beef Mongolian fried dumplings with fresh salad (1200 kcal) — weekdays only',
    descriptionKr: '신선한 샐러드를 곁들인 쇠고기 몽골식 튀긴 만두 (1200 kcal) — 평일만 제공',
    category: 'Main Course', weekdayOnly: true, price: p(39.9), imageUrl: '/food/khuushuur.jpg'
  },
  {
    name: 'Дорно маягийн тахиа', nameEn: 'Oriental Style Chicken', nameKr: '동양식 치킨',
    description: 'Буурцагны сүмстэй бүрмэл тахиа (1262 ккал)',
    descriptionEn: 'Whole chicken marinated and glazed with bean sauce (1262 kcal)',
    descriptionKr: '콩 소스로 마리네이드하여 구운 통닭 (1262 kcal)',
    category: 'Main Course', price: p(43.9), imageUrl: '/food/oriental-chicken.jpg'
  },
  {
    name: 'Хятад маягийн бяслагтай тахиа', nameEn: 'Chinese Style Cheese Chicken', nameKr: '중국식 치즈 치킨',
    description: 'Хятад маягаар амталсан бяслагтай тахиа (1150 ккал)',
    descriptionEn: 'Chicken seasoned Chinese-style with melted cheese (1150 kcal)',
    descriptionKr: '중국식으로 양념한 치킨에 녹은 치즈를 올린 요리 (1150 kcal)',
    category: 'Main Course', price: p(45.9), imageUrl: '/food/chinese-cheese-chicken.jpg'
  },
  {
    name: 'Мексик Тахианы Фахита', nameEn: 'Mexican Chicken Fajita', nameKr: '멕시칸 치킨 파히타',
    description: 'Тахианы махтай Мексик Фахита (1300 ккал)',
    descriptionEn: 'Sizzling Mexican chicken fajita with peppers and tortilla (1300 kcal)',
    descriptionKr: '피망과 또르띠야를 곁들인 지글지글 멕시칸 치킨 파히타 (1300 kcal)',
    category: 'Main Course', price: p(45.9), imageUrl: '/food/mexican-chicken-fajita.jpg'
  },
  {
    name: 'Загас, шарсан төмс', nameEn: 'Fish and Chips', nameKr: '피시 앤 칩스',
    description: 'Шарсан төмс, тартар сүмстэй бүрж шарсан цагаан загас (2565 ккал)',
    descriptionEn: 'Beer-battered white fish with crispy chips and tartar sauce (2565 kcal)',
    descriptionKr: '맥주 반죽 흰살생선과 바삭한 감자튀김, 타르타르 소스 (2565 kcal)',
    category: 'Main Course', price: p(45.9), imageUrl: ''
  },
  {
    name: 'Гахайн, бяслагтай крокет', nameEn: 'Pork & Cheese Croquette', nameKr: '돼지고기 치즈 크로켓',
    description: 'Бяслагтай шарсан гахайн махан крокет (1300 ккал)',
    descriptionEn: 'Golden-fried pork and cheese croquette (1300 kcal)',
    descriptionKr: '황금빛으로 튀긴 돼지고기 치즈 크로켓 (1300 kcal)',
    category: 'Main Course', price: p(41.9), imageUrl: ''
  },
  {
    name: 'Гахайн хүзүүний стейк', nameEn: 'Grilled Pork Neck Steak', nameKr: '그릴 돼지목살 스테이크',
    description: 'Цөцгийтэй жүржийн сүмстэй, гриллдэж шарсан гахайн хүзүүний стейк (1100 ккал)',
    descriptionEn: 'Grilled pork neck steak with creamy orange sauce (1100 kcal)',
    descriptionKr: '크리미 오렌지 소스를 곁들인 그릴 돼지목살 스테이크 (1100 kcal)',
    category: 'Main Course', price: p(50.9), imageUrl: '/food/pork-neck-steak.jpg'
  },
  {
    name: 'Хонины хавирга', nameEn: 'Grilled Lamb Chops', nameKr: '그릴 양갈비',
    description: 'Гриллдэж шарсан хонины хавирга (1300 ккал)',
    descriptionEn: 'Juicy grilled lamb chops with herbs (1300 kcal)',
    descriptionKr: '허브로 마리네이드한 그릴 양갈비 (1300 kcal)',
    category: 'Main Course', price: p(54.9), imageUrl: '/food/grilled-lamb-chops.jpg'
  },
  {
    name: 'Сичуань маягийн үхрийн хавирга', nameEn: 'Szechuan Style Beef Short Ribs', nameKr: '쓰촨식 쇠갈비',
    description: 'Сичуань маягаар амталсан үхрийн хавирга (1520 ккал)',
    descriptionEn: 'Beef short ribs braised in bold Szechuan spices (1520 kcal)',
    descriptionKr: '쓰촨 향신료로 천천히 조린 쇠갈비 (1520 kcal)',
    category: 'Main Course', price: p(65.9), imageUrl: '/food/szechuan-beef-ribs.jpg'
  },
  {
    name: 'Франц маягийн нугасны гуя', nameEn: 'French Duck Confit with Mango Sauce', nameKr: '프렌치 덕 콩피 & 망고 소스',
    description: 'Франц маягаар болгосон мангоны сүмстэй нугасны гуя (810 ккал)',
    descriptionEn: 'Slow-cooked French duck confit with tropical mango sauce (810 kcal)',
    descriptionKr: '천천히 조리한 프렌치 덕 콩피와 열대 망고 소스 (810 kcal)',
    category: 'Main Course', price: p(64.9), imageUrl: '/food/french-duck-confit.jpg'
  },
  {
    name: 'Үхрийн нурууны стейк', nameEn: 'Grilled Beef Sirloin Steak', nameKr: '그릴 쇠등심 스테이크',
    description: 'Бяслаг, мөөгтэй үхрийн нурууны махан стейк (1520 ккал)',
    descriptionEn: 'Grilled beef sirloin with cheese and mushroom sauce (1520 kcal)',
    descriptionKr: '치즈와 버섯 소스를 곁들인 그릴 쇠등심 스테이크 (1520 kcal)',
    category: 'Main Course', price: p(71.9), imageUrl: '/food/beef-sirloin-steak.jpg'
  },
  {
    name: 'Үхрийн гол махан стейк (Primeat)', nameEn: 'Grilled Beef Tenderloin Steak (Primeat)', nameKr: '그릴 쇠안심 스테이크 (프라임)',
    description: 'Үхрийн чөмөг, итали банш, мөөгний сүмстэй ил гал дээр шарсан үхрийн гол махан стейк (2500 ккал)',
    descriptionEn: 'Open-fire grilled Primeat tenderloin with bone marrow, Italian dumpling and mushroom sauce (2500 kcal)',
    descriptionKr: '뼈 골수, 이탈리안 만두, 버섯 소스를 곁들인 오픈파이어 프라임 안심 스테이크 (2500 kcal)',
    category: 'Main Course', price: p(71.9), popular: true, imageUrl: '/food/beef-tenderloin-steak.jpg'
  },
  {
    name: 'Улаан дарсны Үхрийн богино хавирга', nameEn: 'Pastrami Beef Short Ribs with Red Wine Sauce', nameKr: '파스트라미 쇠갈비 레드와인 소스',
    description: 'Улаан дарсны сүмс, хуурсан мини лууван, нухсан төмстэй үхрийн богино хавирга (1316 ккал)',
    descriptionEn: 'Pastrami beef short ribs braised in red wine with glazed carrots and mashed potato (1316 kcal)',
    descriptionKr: '레드와인으로 조린 파스트라미 쇠갈비와 당근 글레이즈, 매시드 포테이토 (1316 kcal)',
    category: 'Main Course', price: p(73.9), imageUrl: ''
  },
  {
    name: 'Яргай загасны стейк', nameEn: 'Salmon Fillet Steak', nameKr: '연어 필레 스테이크',
    description: 'Аньс, чацаргана, цагаан вино, сүүн кремэн сүмстэй яргай загасны стейк (783 ккал)',
    descriptionEn: 'Pan-seared salmon fillet with dill, sea buckthorn, white wine cream sauce (783 kcal)',
    descriptionKr: '딜, 씨버컨, 화이트와인 크림 소스를 곁들인 팬시어 연어 필레 (783 kcal)',
    category: 'Main Course', price: p(79.9), imageUrl: '/food/salmon-fillet-steak.jpg'
  },
  {
    name: 'Мисо сүмстэй хар загас', nameEn: 'Roasted Miso Cod Fish', nameKr: '미소 구운 대구',
    description: 'Бууцай, дарсан ягаан гаа, мисо сүмстэй, хар сагамхай загас (826 ккал)',
    descriptionEn: 'Black cod glazed with miso, bok choy and pickled ginger (826 kcal)',
    descriptionKr: '미소 글레이즈 흑대구와 청경채, 절인 생강 (826 kcal)',
    category: 'Main Course', price: p(85.9), imageUrl: '/food/miso-cod-fish.jpg'
  },
  {
    name: 'Рибай стейк (Primeat)', nameEn: 'Grilled Ribeye Steak (Primeat)', nameKr: '그릴 립아이 스테이크 (프라임)',
    description: 'Хөгцтэй бяслагны сүмстэй, ил гал дээр шарсан үхрийн сээрний махан стейк (1658 ккал)',
    descriptionEn: 'Open-fire grilled Primeat ribeye with blue cheese sauce (1658 kcal)',
    descriptionKr: '블루치즈 소스를 곁들인 오픈파이어 프라임 립아이 스테이크 (1658 kcal)',
    category: 'Main Course', price: p(99.9), imageUrl: '/food/ribeye-steak.jpg'
  },
  {
    name: 'Гахайн тагалцаг', nameEn: 'Pork Knuckle (1-2 per)', nameKr: '돼지 족발 (1-2인)',
    description: 'Нухсан төмс, исгэлэн байцаатай гахайн тагалцаг (2531 ккал) — 1-2 хүн',
    descriptionEn: 'Slow-roasted pork knuckle with mashed potato and sauerkraut (2531 kcal) — serves 1-2',
    descriptionKr: '매시드 포테이토와 사워크라우트를 곁들인 천천히 구운 족발 (2531 kcal) — 1-2인분',
    category: 'Main Course', price: p(99.9), imageUrl: '/food/pork-knuckle.jpg'
  },
  {
    name: 'Т-ясан стейк (Primeat)', nameEn: 'Grilled T-bone Steak (Primeat)', nameKr: 'T본 스테이크 (프라임)',
    description: 'Хуурсан ногоо, аньсны сүмстэй, ил гал дээр шарсан үхрийн нурууны махан стейк (2500 ккал)',
    descriptionEn: 'Open-fire grilled Primeat T-bone with sautéed vegetables and dill sauce (2500 kcal)',
    descriptionKr: '볶은 채소와 딜 소스를 곁들인 오픈파이어 프라임 T본 스테이크 (2500 kcal)',
    category: 'Main Course', price: p(99.9), imageUrl: '/food/tbone-steak.jpg'
  },
  {
    name: 'Томахавк стейк (Primeat)', nameEn: 'Grilled Tomahawk Steak (Primeat)', nameKr: '토마호크 스테이크 (프라임)',
    description: 'Гэрийн аргаар бэлтгэсэн төмсний хачиртай, ил гал дээр шарсан үхрийн хавирганы махан стейк (2972 ккал)',
    descriptionEn: 'Impressive open-fire grilled Primeat tomahawk with house-made potato gratin (2972 kcal)',
    descriptionKr: '수제 포테이토 그라탱을 곁들인 오픈파이어 프라임 토마호크 스테이크 (2972 kcal)',
    category: 'Main Course', price: p(199.9), imageUrl: '/food/tomahawk-steak.jpg'
  },

  // ── VEGAN FOOD ────────────────────────────────────────────────────────────
  {
    name: 'Веган шөл', nameEn: 'Vegan Soup', nameKr: '비건 수프',
    description: 'Шар будаа, куана будаа, бууцай, шош, хулуу, яншуй, шинцайтай веган шөл (450 ккал)',
    descriptionEn: 'Vegan soup with millet, quinoa, bok choy, bean curd, zucchini and coriander (450 kcal)',
    descriptionKr: '기장, 퀴노아, 청경채, 두부, 주키니, 고수를 넣은 비건 수프 (450 kcal)',
    category: 'Vegan', price: p(30.9), imageUrl: '/food/vegan-soup.jpg'
  },
  {
    name: 'Хулуун зоог', nameEn: 'Zucchini Boats', nameKr: '주키니 보트',
    description: 'Цөцгийн сүмстэй, пармизан бяслагтай веган зоог (900 ккал)',
    descriptionEn: 'Baked zucchini boats stuffed with cream and parmesan cheese (900 kcal)',
    descriptionKr: '크림과 파마산 치즈를 채워 구운 주키니 보트 (900 kcal)',
    category: 'Vegan', price: p(36.9), imageUrl: '/food/zucchini-boats.jpg'
  },
  {
    name: 'Веган загас', nameEn: 'Vegan Fish Fillet', nameKr: '비건 생선 필레',
    description: 'Хулуу, үрлэн помидор, төмс, лууван, шар буурцагны сүүгээр амталсан веган загас (350 ккал)',
    descriptionEn: 'Plant-based fish fillet with zucchini, tomato, potato, carrot in soy milk sauce (350 kcal)',
    descriptionKr: '두유 소스로 맛낸 식물성 생선 필레와 주키니, 토마토, 감자, 당근 (350 kcal)',
    category: 'Vegan', price: p(45.0), imageUrl: '/food/vegan-fish-fillet.jpg'
  },

  // ── PASTA & RAVIOLI ───────────────────────────────────────────────────────
  {
    name: 'Карбонара', nameEn: 'Carbonara Pasta', nameKr: '카르보나라',
    description: 'Пармезан бяслаг, сүүн крем, гахайн утсан махтай гоймон (1250 ккал)',
    descriptionEn: 'Classic pasta with parmesan, cream and smoked pork belly (1250 kcal)',
    descriptionKr: '파마산, 크림, 훈제 삼겹살을 넣은 클래식 카르보나라 (1250 kcal)',
    category: 'Pasta & Ravioli', price: p(41.9), popular: true, imageUrl: '/food/carbonara.jpg'
  },
  {
    name: 'Халуун Аррабиата', nameEn: 'Spicy Arrabbiata Pasta', nameKr: '매운 아라비아타',
    description: 'Халапеньо, улаан лоолийн сүмс, пармезан бяслаг, тахианы махтай гоймон (1100 ккал)',
    descriptionEn: 'Spicy pasta with jalapeño, tomato sauce, parmesan and chicken (1100 kcal)',
    descriptionKr: '할라피뇨, 토마토 소스, 파마산, 치킨을 넣은 매운 파스타 (1100 kcal)',
    category: 'Pasta & Ravioli', price: p(41.9), imageUrl: '/food/arrabbiata.jpg'
  },
  {
    name: 'Далайн гоймонтой паста', nameEn: 'Seafood Strozzapreti Pasta', nameKr: '해산물 스트로차프레티 파스타',
    description: 'Далайн гаралтай итали гоймонтой паста (900 ккал)',
    descriptionEn: 'Italian strozzapreti pasta with fresh seafood (900 kcal)',
    descriptionKr: '신선한 해산물을 넣은 이탈리안 스트로차프레티 파스타 (900 kcal)',
    category: 'Pasta & Ravioli', price: p(43.9), imageUrl: '/food/seafood-pasta.jpg'
  },
  {
    name: 'Итали хар банш', nameEn: 'Creamy Black Ravioli', nameKr: '블랙 라비올리',
    description: 'Цөцгийн сүмстэй итали хар банш (1217 ккал)',
    descriptionEn: 'Squid ink black ravioli with creamy sauce (1217 kcal)',
    descriptionKr: '오징어 먹물 블랙 라비올리와 크림 소스 (1217 kcal)',
    category: 'Pasta & Ravioli', price: p(44.9), imageUrl: '/food/black-ravioli.jpg'
  },
  {
    name: 'Итали цагаан банш', nameEn: 'Tomato Parmesan White Ravioli', nameKr: '토마토 파마산 라비올리',
    description: 'Улаан лоольны сүмстэй итали цагаан банш (628 ккал)',
    descriptionEn: 'Italian white ravioli in rich tomato and parmesan sauce (628 kcal)',
    descriptionKr: '진한 토마토 파마산 소스를 곁들인 이탈리안 라비올리 (628 kcal)',
    category: 'Pasta & Ravioli', price: p(44.9), imageUrl: '/food/white-ravioli.jpg'
  },
  {
    name: 'Гахайн махан паста (1-2 хүн)', nameEn: 'Grilled Pork Clamarata Pasta (1-2 per)', nameKr: '그릴 돼지고기 파스타 (1-2인)',
    description: 'Ил гал дээр шарсан гахайн махан паста (900 ккал)',
    descriptionEn: 'Clamarata pasta with open-fire grilled pork (900 kcal) — serves 1-2',
    descriptionKr: '오픈파이어 그릴 돼지고기를 올린 클라마라타 파스타 (900 kcal) — 1-2인분',
    category: 'Pasta & Ravioli', price: p(65.9), imageUrl: ''
  },
  {
    name: 'Үхрийн махан стейктэй паста (1-2 хүн)', nameEn: 'Grilled Beef Conchiglie Pasta (1-2 per)', nameKr: '그릴 쇠고기 파스타 (1-2인)',
    description: 'Ил гал дээр шарсан үхрийн махан стейктэй паста (1571 ккал)',
    descriptionEn: 'Conchiglie pasta with open-fire grilled beef steak (1571 kcal) — serves 1-2',
    descriptionKr: '오픈파이어 그릴 쇠고기 스테이크를 올린 콘킬리에 파스타 (1571 kcal) — 1-2인분',
    category: 'Pasta & Ravioli', price: p(65.9), imageUrl: ''
  },
  {
    name: 'Рикотта бяслагтай Каннеллони (1-2 хүн)', nameEn: 'Baked Ricotta Cannelloni (1-2 per)', nameKr: '구운 리코타 카넬로니 (1-2인)',
    description: 'Улаан лоольны сүмс каннеллони гоймонтой бяслагны хучмал (1571 ккал)',
    descriptionEn: 'Oven-baked cannelloni stuffed with ricotta in tomato sauce (1571 kcal) — serves 1-2',
    descriptionKr: '토마토 소스를 곁들인 오븐 구운 리코타 카넬로니 (1571 kcal) — 1-2인분',
    category: 'Pasta & Ravioli', price: p(65.9), imageUrl: '/food/ricotta-cannelloni.jpg'
  },
  {
    name: 'Яргай загасны Тальятелле (1-2 хүн)', nameEn: 'Oven-baked Salmon Tagliatelle (1-2 per)', nameKr: '연어 탈리아텔레 (1-2인)',
    description: 'Яргай загасны хучмал таглитель паста (1925 ккал)',
    descriptionEn: 'Oven-baked salmon tagliatelle pasta gratin (1925 kcal) — serves 1-2',
    descriptionKr: '오븐 구운 연어 탈리아텔레 그라탱 (1925 kcal) — 1-2인분',
    category: 'Pasta & Ravioli', price: p(69.9), imageUrl: '/food/salmon-tagliatelle.jpg'
  },

  // ── PIZZA & BURGER ────────────────────────────────────────────────────────
  {
    name: 'Маргарита пицца', nameEn: 'Margherita Pizza', nameKr: '마르게리타 피자',
    description: 'Бяслагтай пицца (1316 ккал)',
    descriptionEn: 'Classic pizza with tomato sauce and melted mozzarella (1316 kcal)',
    descriptionKr: '토마토 소스와 녹인 모차렐라를 올린 클래식 마르게리타 피자 (1316 kcal)',
    category: 'Pizza & Burger', price: p(42.9), popular: true, imageUrl: '/food/margarita-pizza.jpg'
  },
  {
    name: 'Махан пицца', nameEn: 'Meat Lovers Pizza', nameKr: '미트 러버 피자',
    description: 'Маханд дурлагсад пицца (1744 ккал)',
    descriptionEn: 'Pizza loaded with a generous selection of meats (1744 kcal)',
    descriptionKr: '다양한 고기를 듬뿍 올린 미트 러버 피자 (1744 kcal)',
    category: 'Pizza & Burger', price: p(46.9), imageUrl: '/food/meat-pizza.jpg'
  },
  {
    name: 'Мексик халуун пицца', nameEn: 'Spicy Mexico Pizza', nameKr: '멕시칸 핫 피자',
    description: 'Тахианы мах, халопенотой пицца (1558 ккал)',
    descriptionEn: 'Spicy pizza with chicken and jalapeño (1558 kcal)',
    descriptionKr: '치킨과 할라피뇨를 올린 매운 멕시칸 피자 (1558 kcal)',
    category: 'Pizza & Burger', price: p(46.9), imageUrl: '/food/mexico-pizza.jpg'
  },
  {
    name: 'Тахианы бүргер', nameEn: 'Spicy BBQ Chicken Burger', nameKr: '스파이시 BBQ 치킨 버거',
    description: 'Тахианы махтай бүргер (1610 ккал)',
    descriptionEn: 'Juicy BBQ chicken burger with spicy sauce (1610 kcal)',
    descriptionKr: '스파이시 소스를 곁들인 바비큐 치킨 버거 (1610 kcal)',
    category: 'Pizza & Burger', price: p(40.9), imageUrl: '/food/chicken-burger.jpg'
  },
  {
    name: 'Үхрийн Primeat бүргер', nameEn: 'Fondue Cheese Prime Beef Burger', nameKr: '퐁듀 치즈 프라임 쇠고기 버거',
    description: 'Шингэн бяслаг, халопенотой үхрийн махтай бүргер (1610 ккал)',
    descriptionEn: 'Prime beef burger with melted fondue cheese and jalapeño (1610 kcal)',
    descriptionKr: '녹인 퐁듀 치즈와 할라피뇨를 곁들인 프라임 쇠고기 버거 (1610 kcal)',
    category: 'Pizza & Burger', price: p(49.9), imageUrl: '/food/beef-burger.jpg'
  },

  // ── SHARE FOOD ────────────────────────────────────────────────────────────
  {
    name: 'Тахианы махан салат (4-6 хүн)', nameEn: 'Home-made Chicken Salad (4-6 per)', nameKr: '수제 치킨 샐러드 (4-6인)',
    description: 'Шарсан талх, өндөг, бяслагтай тахианы цээж махан салат (3200 ккал)',
    descriptionEn: 'House-made chicken breast salad with croutons, egg and cheese (3200 kcal) — serves 4-6',
    descriptionKr: '크루통, 달걀, 치즈를 넣은 수제 닭가슴살 샐러드 (3200 kcal) — 4-6인분',
    category: 'Share Food', price: p(95.9), imageUrl: '/food/chicken-salad-share.jpg'
  },
  {
    name: 'Тайланд маягийн үхрийн салат (4-6 хүн)', nameEn: 'Thai Beef Tenderloin Salad (4-6 per)', nameKr: '태국식 쇠안심 샐러드 (4-6인)',
    description: 'Газрын самар, Тайланд маягийн сүмстэй үхрийн гол махан салат (1328 ккал)',
    descriptionEn: 'Thai-style beef tenderloin salad with peanuts and tangy dressing (1328 kcal) — serves 4-6',
    descriptionKr: '땅콩과 새콤한 드레싱을 곁들인 태국식 쇠안심 샐러드 (1328 kcal) — 4-6인분',
    category: 'Share Food', price: p(95.9), imageUrl: '/food/thai-beef-salad.jpg'
  },
  {
    name: 'Шинэхэн жимсний тавиур (4-6 хүн)', nameEn: 'Fresh Fruit Platter (4-6 per)', nameKr: '신선 과일 플래터 (4-6인)',
    description: 'Шинэхэн жимсний цуглуулга (1800 ккал)',
    descriptionEn: 'Seasonal fresh fruit platter (1800 kcal) — serves 4-6',
    descriptionKr: '제철 신선 과일 모둠 (1800 kcal) — 4-6인분',
    category: 'Share Food', price: p(99.9), imageUrl: ''
  },
  {
    name: 'Хатаасан мах, бяслагны тавиур (4-6 хүн)', nameEn: 'Cured Meat & Cheese Platter (4-6 per)', nameKr: '가공육 & 치즈 플래터 (4-6인)',
    description: 'Хатаасан мах, бяслагны цуглуулга (5210 ккал)',
    descriptionEn: 'Selection of cured meats and artisan cheeses (5210 kcal) — serves 4-6',
    descriptionKr: '가공육과 수제 치즈 모둠 (5210 kcal) — 4-6인분',
    category: 'Share Food', price: p(129.9), imageUrl: ''
  },
  {
    name: 'Тахианы махан цуглуулга (4-6 хүн)', nameEn: 'Chicken Meat Collection (4-6 per)', nameKr: '치킨 모둠 (4-6인)',
    description: 'Тахианы махан цуглуулга (5210 ккал)',
    descriptionEn: 'Generous chicken meat sharing platter (5210 kcal) — serves 4-6',
    descriptionKr: '푸짐한 치킨 모둠 플래터 (5210 kcal) — 4-6인분',
    category: 'Share Food', price: p(175.9), imageUrl: ''
  },
  {
    name: 'Үхэр, Хонь, Гахайн цуглуулга (4-6 хүн)', nameEn: 'Grilled Pork, Beef & Lamb Collection (4-6 per)', nameKr: '쇠고기·양고기·돼지고기 모둠 (4-6인)',
    description: 'Үхэр, хонь, гахайн махан цуглуулга (6140 ккал)',
    descriptionEn: 'Mixed grilled beef, lamb and pork sharing platter (6140 kcal) — serves 4-6',
    descriptionKr: '쇠고기, 양고기, 돼지고기 그릴 모둠 (6140 kcal) — 4-6인분',
    category: 'Share Food', price: p(299.9), imageUrl: '/food/pork-beef-lamb-collection.jpg'
  },

  // ── CHILDREN SET ──────────────────────────────────────────────────────────
  {
    name: "Хүүхдийн пицца сет", nameEn: "Children's Pizza Set", nameKr: '어린이 피자 세트',
    description: 'Пицца, сүүтэй будаа, жимсний салат, шарсан төмс',
    descriptionEn: 'Kids pizza with rice porridge, fruit salad and fries',
    descriptionKr: '아이용 피자, 죽, 과일 샐러드, 감자튀김 세트',
    category: "Children's Set", price: p(24.9), imageUrl: '/food/children-pizza-set.jpg'
  },
  {
    name: 'Хүүхдийн тахианы сет', nameEn: "Children's Chicken Set", nameKr: '어린이 치킨 세트',
    description: 'Шарсан тахиа, бантан, жимсний салат, шарсан төмс',
    descriptionEn: 'Kids fried chicken with bantan soup, fruit salad and fries',
    descriptionKr: '아이용 치킨, 반탄 수프, 과일 샐러드, 감자튀김 세트',
    category: "Children's Set", price: p(24.9), imageUrl: '/food/children-chicken-set.jpg'
  },
  {
    name: 'Хүүхдийн бөмбөлөгний сет', nameEn: "Children's Meat Ball Set", nameKr: '어린이 미트볼 세트',
    description: 'Шпагетти, хулууны зутан, жимсний салат, шарсан төмс',
    descriptionEn: 'Kids meatball spaghetti with zucchini cream, fruit salad and fries',
    descriptionKr: '아이용 미트볼 스파게티, 주키니 크림, 과일 샐러드, 감자튀김 세트',
    category: "Children's Set", price: p(24.9), imageUrl: '/food/children-meatball-set.jpg'
  },

  // ── DESSERT ───────────────────────────────────────────────────────────────
  {
    name: 'Орео чиз кейк', nameEn: 'Oreo Cheese Cake', nameKr: '오레오 치즈케이크',
    description: 'Орео жигнэмэгтэй хуруухайн бяслагны бялуу',
    descriptionEn: 'Creamy cheesecake with Oreo cookie crust',
    descriptionKr: '오레오 쿠키 크러스트를 얹은 크리미 치즈케이크',
    category: 'Dessert', price: p(18.9),
    imageUrl: '',
  },
  {
    name: 'Шоколад Опера кейк', nameEn: 'Classic Opera Cake', nameKr: '클래식 오페라 케이크',
    description: 'Шоколад болон кофены давхаргатай клаасик Опера бялуу',
    descriptionEn: 'Classic layered opera cake with chocolate and coffee',
    descriptionKr: '초콜릿과 커피 레이어가 있는 클래식 오페라 케이크',
    category: 'Dessert', price: p(18.9),
    imageUrl: '',
  },
  {
    name: 'Карамель чиз кейк', nameEn: 'Caramel Cheese Cake', nameKr: '카라멜 치즈케이크',
    description: 'Карамелийн сүмстэй хуруухайн бяслагны бялуу',
    descriptionEn: 'Rich cheesecake drizzled with salted caramel sauce',
    descriptionKr: '솔티드 카라멜 소스를 곁들인 진한 치즈케이크',
    category: 'Dessert', price: p(18.9),
    imageUrl: '',
  },
  {
    name: 'Мөсөн зайрмаг', nameEn: 'Ice Cream', nameKr: '아이스크림',
    description: 'Ваниль, шоколад эсвэл гүзээлзгэнэ',
    descriptionEn: 'Vanilla, chocolate or strawberry ice cream',
    descriptionKr: '바닐라, 초콜릿 또는 딸기 아이스크림',
    category: 'Dessert', price: p(18.9),
    imageUrl: '',
  },
  {
    name: 'Крем Брюле', nameEn: 'Crème Brûlée', nameKr: '크렘 브륄레',
    description: 'Карамелийн давхаргатай сүүн крем',
    descriptionEn: 'Classic French custard with caramelized sugar crust',
    descriptionKr: '카라멜화된 설탕 크러스트를 올린 클래식 프렌치 커스터드',
    category: 'Dessert', price: p(18.9),
    imageUrl: '',
  },
  {
    name: 'Нимбэгний тарт', nameEn: 'Lemon Tart', nameKr: '레몬 타르트',
    description: 'Нимбэгний кремтэй, мерингетэй тарт',
    descriptionEn: 'Zesty lemon tart with meringue',
    descriptionKr: '상큼한 레몬 커드와 머랭을 올린 레몬 타르트',
    category: 'Dessert', price: p(18.9),
    imageUrl: '',
  },
  {
    name: 'Шоколад Брауни, мөсөн зайрмаг', nameEn: 'Chocolate Brownie with Ice Cream', nameKr: '초콜릿 브라우니 & 아이스크림',
    description: 'Ваниль зайрмагтай дулаан шоколадны брауни',
    descriptionEn: 'Warm chocolate brownie served with vanilla ice cream',
    descriptionKr: '바닐라 아이스크림을 곁들인 따뜻한 초콜릿 브라우니',
    category: 'Dessert', price: p(18.9),
    imageUrl: '',
  },
  {
    name: 'Тирамису', nameEn: 'Tiramisu Cake', nameKr: '티라미수',
    description: 'Маскарпонэ, кофены давхаргатай италийн тирамису',
    descriptionEn: 'Classic Italian tiramisu with mascarpone and espresso',
    descriptionKr: '마스카르포네와 에스프레소로 만든 클래식 이탈리안 티라미수',
    category: 'Dessert', price: p(20.9), popular: true,
    imageUrl: '',
  },
  {
    name: 'Жимс, шоколадны сүмстэй', nameEn: 'Sliced Fruit with Chocolate Sauce', nameKr: '과일 & 초콜릿 소스',
    description: 'Шоколадны сүмстэй шинэхэн зүссэн жимс',
    descriptionEn: 'Fresh seasonal sliced fruit with warm chocolate dipping sauce',
    descriptionKr: '따뜻한 초콜릿 디핑 소스를 곁들인 신선한 계절 과일',
    category: 'Dessert', price: p(20.9),
    imageUrl: '',
  },

  // ── SIDES ─────────────────────────────────────────────────────────────────
  {
    name: 'Сармисан бяслагтай тариалан талх', nameEn: 'Garlic Cheese Pita Bread', nameKr: '마늘 치즈 피타 브레드',
    description: 'Сармис, бяслагтай шарсан питта талх',
    descriptionEn: 'Toasted pita bread with garlic butter and cheese',
    descriptionKr: '마늘 버터와 치즈를 바른 구운 피타 브레드',
    category: 'Sides', price: p(9.9),
    imageUrl: '',
  },
  {
    name: 'Давстай талх, чидун жимс', nameEn: 'Salted Cake and Olive Bread', nameKr: '소금 케이크 & 올리브 브레드',
    description: 'Давстай бялуу болон чидун жимсний талх',
    descriptionEn: 'Assorted salted bread and olive focaccia',
    descriptionKr: '다양한 소금 빵과 올리브 포카치아',
    category: 'Sides', price: p(14.9),
    imageUrl: '',
  },
  {
    name: 'Шарсан ногоо', nameEn: 'Roasted Vegetables', nameKr: '구운 채소',
    description: 'Улирлын шарсан ногоо',
    descriptionEn: 'Seasonal roasted vegetables with herbs',
    descriptionKr: '허브를 곁들인 계절 구운 채소',
    category: 'Sides', price: p(14.9),
    imageUrl: '',
  },
  {
    name: 'Халуун чинжүү', nameEn: 'Steamed Spicy Wildpeppers', nameKr: '매운 고추',
    description: 'Жигнэсэн, зарим нь хатаасан халуун чинжүү',
    descriptionEn: 'Steamed or dried spicy wild peppers',
    descriptionKr: '찐 또는 건조 매운 고추',
    category: 'Sides', price: p(15.9),
    imageUrl: '',
  },
  {
    name: 'Шарсан төмс', nameEn: 'French Fries', nameKr: '프렌치프라이',
    description: 'Алтан шарсан хагархай төмс',
    descriptionEn: 'Crispy golden French fries',
    descriptionKr: '바삭한 황금빛 프렌치프라이',
    category: 'Sides', price: p(18.9), popular: true,
    imageUrl: '',
  },
  {
    name: 'Сосис, чипс', nameEn: 'Sausage and Chips', nameKr: '소시지 & 칩스',
    description: 'Шарсан сосис, чипстэй',
    descriptionEn: 'Grilled sausage with crispy chips',
    descriptionKr: '구운 소시지와 바삭한 칩스',
    category: 'Sides', price: p(25.9),
    imageUrl: '',
  },

  // ── BEVERAGES — SOFT DRINKS ───────────────────────────────────────────────
  {
    name: 'Кока-кола 300мл', nameEn: 'Coca-Cola (300ml)', nameKr: '코카콜라 (300ml)',
    category: 'Beverages', price: p(6.5),
    imageUrl: '',
  },
  {
    name: 'Кока-кола лаазтай 330мл', nameEn: 'Coca-Cola Can (330ml)', nameKr: '코카콜라 캔 (330ml)',
    category: 'Beverages', price: p(7.5),
    imageUrl: '',
  },
  {
    name: 'Жүс (Жүрж/Алим/Манго)', nameEn: 'Juice (Orange/Apple/Mango)', nameKr: '주스 (오렌지/사과/망고)',
    description: 'Жүрж, алим, манго жүсний нэг төрөл',
    descriptionEn: 'Choice of orange, apple or mango juice',
    descriptionKr: '오렌지, 사과, 망고 주스 중 선택',
    category: 'Beverages', price: p(6.5),
    imageUrl: '',
  },
  {
    name: 'Шинэхэн жүс', nameEn: 'Fresh Squeezed Juice', nameKr: '생과일 주스',
    description: 'Жүрж эсвэл алим',
    descriptionEn: 'Freshly squeezed orange or apple juice',
    descriptionKr: '갓 짜낸 오렌지 또는 사과 주스',
    category: 'Beverages', price: p(19.0),
    imageUrl: '',
  },
  {
    name: 'Ред Булл', nameEn: 'Red Bull', nameKr: '레드불',
    category: 'Beverages', price: p(12.0),
    imageUrl: '',
  },
  {
    name: 'Ус (500мл)', nameEn: 'Still Water (500ml)', nameKr: '생수 (500ml)',
    category: 'Beverages', price: p(3.0),
    imageUrl: '',
  },
  {
    name: 'Шарын архи (дамжуулсан)', nameEn: 'Draft Beer', nameKr: '생맥주',
    description: 'Таг татсан шарын архи',
    descriptionEn: 'Freshly poured draft beer from the tap',
    descriptionKr: '탭에서 갓 뽑은 생맥주',
    category: 'Beverages', price: p(8.0),
    imageUrl: '',
  },
  {
    name: 'Шарын архи (лонхтой)', nameEn: 'Bottled Beer', nameKr: '병맥주',
    description: 'Лонхтой шарын архи',
    descriptionEn: 'Chilled bottled beer',
    descriptionKr: '차가운 병맥주',
    category: 'Beverages', price: p(7.0),
    imageUrl: '',
  },

  // ── BEVERAGES — HOT DRINKS ────────────────────────────────────────────────
  {
    name: 'Цай (Ногоон/Хар/Нектар)', nameEn: 'Tea Bag (Green/Black/Nectar)', nameKr: '티백 (녹차/홍차/넥타)',
    description: 'Mighty Leaf — нэг хүний',
    descriptionEn: 'Mighty Leaf premium tea — choice of green, black or nectar',
    descriptionKr: '마이티 리프 프리미엄 티 — 녹차, 홍차, 넥타 중 선택',
    category: 'Beverages', price: p(8.5),
    imageUrl: '',
  },
  {
    name: 'Халуун сүү (Зөгийн бал/Шоколад)', nameEn: 'Hot Milk (Honey/Chocolate)', nameKr: '따뜻한 우유 (꿀/초콜릿)',
    descriptionEn: 'Warm steamed milk with honey or chocolate',
    descriptionKr: '꿀 또는 초콜릿을 더한 따뜻한 스팀 우유',
    category: 'Beverages', price: p(9.9),
    imageUrl: '',
  },
  {
    name: 'Имбирь нимбэгний цай', nameEn: 'Ginger Lemon Tea', nameKr: '생강 레몬 차',
    descriptionEn: 'Warming fresh ginger tea with lemon',
    descriptionKr: '레몬을 넣은 따뜻한 생강차',
    category: 'Beverages', price: p(12.5),
    imageUrl: '',
  },
  {
    name: 'Халуун жимсний жүс', nameEn: 'Hot Fruit Juice (Lingonberry/Seabuckthorn)', nameKr: '따뜻한 과일 주스',
    description: 'Жимсгэнэ эсвэл чацаргана',
    descriptionEn: 'Hot lingonberry or sea buckthorn fruit drink',
    descriptionKr: '월귤 또는 씨버컨 따뜻한 과일 음료',
    category: 'Beverages', price: p(12.5),
    imageUrl: '',
  },
  {
    name: 'Чайдан цай (2-4 хүн)', nameEn: 'Pot Tea (2-4 per)', nameKr: '포트 티 (2-4인)',
    description: 'Mighty Leaf ногоон, хар, нектар — 2-4 хүний',
    descriptionEn: 'Mighty Leaf pot tea (green, black or nectar) — serves 2-4',
    descriptionKr: '마이티 리프 포트 티 (녹차, 홍차, 넥타) — 2-4인분',
    category: 'Beverages', price: p(15.5),
    imageUrl: '',
  },

  // ── BEVERAGES — COFFEE ────────────────────────────────────────────────────
  {
    name: 'Эспрессо', nameEn: 'Espresso', nameKr: '에스프레소',
    descriptionEn: 'Single shot of rich espresso',
    descriptionKr: '진한 에스프레소 싱글샷',
    category: 'Coffee', price: p(9.5),
    imageUrl: '',
  },
  {
    name: 'Американо', nameEn: 'Americano', nameKr: '아메리카노',
    descriptionEn: 'Espresso diluted with hot water',
    descriptionKr: '에스프레소에 뜨거운 물을 희석한 아메리카노',
    category: 'Coffee', price: p(9.5),
    imageUrl: '',
  },
  {
    name: 'Давхар Американо', nameEn: 'Double Americano', nameKr: '더블 아메리카노',
    description: 'Хоёр шот эспрессо, халуун ус',
    descriptionEn: 'Double espresso shot with hot water',
    descriptionKr: '더블 에스프레소샷에 뜨거운 물을 넣은 아메리카노',
    category: 'Coffee', price: p(12.5),
    imageUrl: '',
  },
  {
    name: 'Капучино', nameEn: 'Cappuccino', nameKr: '카푸치노',
    descriptionEn: 'Espresso with equal parts steamed and foamed milk',
    descriptionKr: '에스프레소와 스팀 우유, 풍부한 거품의 카푸치노',
    category: 'Coffee', price: p(11.5),
    imageUrl: '',
  },
  {
    name: 'Латте', nameEn: 'Café Latte', nameKr: '카페 라떼',
    descriptionEn: 'Smooth espresso with steamed milk',
    descriptionKr: '부드러운 에스프레소와 스팀 우유의 카페 라떼',
    category: 'Coffee', price: p(10.5), popular: true,
    imageUrl: '',
  },
  {
    name: 'Ванилин латте', nameEn: 'Vanilla Latte', nameKr: '바닐라 라떼',
    descriptionEn: 'Latte with a hint of sweet vanilla syrup',
    descriptionKr: '달콤한 바닐라 시럽을 더한 라떼',
    category: 'Coffee', price: p(13.5),
    imageUrl: '',
  },
  {
    name: 'Моха', nameEn: 'Mocha', nameKr: '모카',
    descriptionEn: 'Espresso with chocolate and steamed milk',
    descriptionKr: '에스프레소, 초콜릿, 스팀 우유로 만든 모카',
    category: 'Coffee', price: p(13.5),
    imageUrl: '',
  },
  {
    name: 'Карамель латте', nameEn: 'Caramel Latte', nameKr: '카라멜 라떼',
    descriptionEn: 'Latte with rich caramel syrup',
    descriptionKr: '진한 카라멜 시럽을 넣은 라떼',
    category: 'Coffee', price: p(13.5),
    imageUrl: '',
  },
  {
    name: 'Матча латте', nameEn: 'Matcha Latte', nameKr: '말차 라떼',
    descriptionEn: 'Japanese matcha green tea with steamed milk',
    descriptionKr: '스팀 우유를 넣은 일본식 말차 라떼',
    category: 'Coffee', price: p(14.0),
    imageUrl: '',
  },
  {
    name: 'Ирланд кофе', nameEn: 'Irish Coffee', nameKr: '아이리시 커피',
    descriptionEn: 'Hot coffee with Irish whiskey and whipped cream',
    descriptionKr: '아이리시 위스키와 휘핑크림을 넣은 아이리시 커피',
    category: 'Coffee', price: p(18.0),
    imageUrl: '',
  },

  // ── BEVERAGES — SMOOTHIE & SHAKE ─────────────────────────────────────────
  {
    name: 'Манго смузи', nameEn: 'Mango Smoothie', nameKr: '망고 스무디',
    descriptionEn: 'Tropical mango smoothie blended fresh',
    descriptionKr: '신선하게 갈아 만든 열대 망고 스무디',
    category: 'Smoothie & Shake', price: p(17.0),
    imageUrl: '',
  },
  {
    name: 'Гүзээлзгэнэ смузи', nameEn: 'Strawberry Smoothie', nameKr: '딸기 스무디',
    descriptionEn: 'Fresh strawberry smoothie blended with yogurt',
    descriptionKr: '요거트와 함께 갈아 만든 신선한 딸기 스무디',
    category: 'Smoothie & Shake', price: p(17.0),
    imageUrl: '',
  },
  {
    name: 'Жимсний смузи', nameEn: 'Fruit Smoothie', nameKr: '과일 스무디',
    descriptionEn: 'Mixed fresh seasonal fruit smoothie',
    descriptionKr: '신선한 계절 과일을 넣어 만든 믹스 스무디',
    category: 'Smoothie & Shake', price: p(19.0),
    imageUrl: '',
  },
  {
    name: 'Ванилин шейк', nameEn: 'Vanilla Shake', nameKr: '바닐라 쉐이크',
    descriptionEn: 'Creamy classic vanilla milkshake',
    descriptionKr: '크리미한 클래식 바닐라 밀크쉐이크',
    category: 'Smoothie & Shake', price: p(16.9),
    imageUrl: '',
  },
  {
    name: 'Гүзээлзгэнэний шейк', nameEn: 'Strawberry Shake', nameKr: '딸기 쉐이크',
    descriptionEn: 'Thick and creamy strawberry milkshake',
    descriptionKr: '진하고 크리미한 딸기 밀크쉐이크',
    category: 'Smoothie & Shake', price: p(16.9),
    imageUrl: '',
  },
  {
    name: 'Шоколад шейк', nameEn: 'Chocolate Shake', nameKr: '초콜릿 쉐이크',
    descriptionEn: 'Rich chocolate milkshake',
    descriptionKr: '진한 초콜릿 밀크쉐이크',
    category: 'Smoothie & Shake', price: p(16.9),
    imageUrl: '',
  },
  {
    name: 'Сникерс шейк', nameEn: 'Snickers Shake', nameKr: '스니커즈 쉐이크',
    descriptionEn: 'Indulgent Snickers bar milkshake with caramel and peanut',
    descriptionKr: '카라멜과 땅콩이 들어간 스니커즈 밀크쉐이크',
    category: 'Smoothie & Shake', price: p(19.9),
    imageUrl: '',
  },
  {
    name: 'Орео шейк', nameEn: 'Oreo Shake', nameKr: '오레오 쉐이크',
    descriptionEn: 'Creamy milkshake blended with Oreo cookies',
    descriptionKr: '오레오 쿠키를 갈아 넣은 크리미 밀크쉐이크',
    category: 'Smoothie & Shake', price: p(19.9),
    imageUrl: '',
  },
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
      nameKr: item.nameKr || '',
      description: item.description || '',
      descriptionEn: item.descriptionEn || '',
      descriptionKr: item.descriptionKr || '',
      price: item.price,
      category: item.category,
      available: true,
      popular: item.popular || false,
      weekdayOnly: item.weekdayOnly || false,
      imageUrl: item.imageUrl || '',
      sortOrder: sortOrder++,
    };
    await set(ref(db, 'menu/' + id), record);
    process.stdout.write('.');
  }

  console.log(`\n✅ ${ITEMS.length} зүйл амжилттай нэмэгдлээ.`);
  process.exit(0);
}

seed().catch(err => { console.error(err); process.exit(1); });
