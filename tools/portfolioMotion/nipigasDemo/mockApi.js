// Isolated, fictional presentation data. This module never contacts a backend.
const cities = ['Москва', 'Краснодар', 'Ростов-на-Дону', 'Тюмень', 'Свободный'].map((title, i) => ({id: i + 1, title}));
const attachment = (url, id = 1) => ({id, url, meta: {originalname: url.split('/').pop(), mimetype: url.endsWith('.mp4') ? 'video/mp4' : 'image/png'}});
const names = [['Алексей', 'Морозов'], ['Анна', 'Соколова'], ['Михаил', 'Орлов'], ['Мария', 'Ветрова'], ['Даниил', 'Снежин']];
const people = names.map(([firstname, lastname], i) => ({id: i + 1, firstname, lastname, email: `demo${i + 1}@example.test`, city: cities[i], score: 125 - i * 9, avatar: attachment(`/images/avatar${i + 1}.png`)}));
let user = {...people[0], score: 24, received_bonuses: {quiz_score: 0, xylophone_score: 0, stories: {}, city_video: {}}, roles: [], permissions: {actions: {}}};
let regions = cities.map((city, i) => ({...city, score: [1468, 1352, 235, 1410, 1530][i]}));
const greetings = ['Пусть новый год принесёт вдохновение и радостные встречи!', 'Тёплых праздников, смелых идей и новых открытий!', 'Пусть рядом всегда будут близкие и верные друзья!', 'Здоровья, счастья и исполнения желаний!', 'Вместе навстречу новому году!', 'Пусть каждый день начинается с улыбки!', 'Уютных вечеров и ярких путешествий!', 'Новых достижений и отличной команды рядом!', 'Мира, добра и маленьких чудес каждый день!', 'Счастья вашим семьям и исполнения мечты!', 'Спасибо за этот год! Впереди столько интересного!', 'Пусть в каждом городе будет тепло от наших поздравлений!'];
const treeFirstnames = ['Алексей', 'Анна', 'Михаил', 'Мария', 'Даниил', 'Елена', 'Артём', 'Ольга', 'Андрей', 'Ирина', 'Иван', 'Наталья', 'Сергей'];
const treeLastnames = ['Морозов', 'Соколова', 'Орлов', 'Ветрова', 'Снежин', 'Белова', 'Лебедев', 'Зайцева', 'Волков', 'Лесная', 'Романов', 'Зимина', 'Светлов'];
const treeLastname = i => {
  const female = ['Анна', 'Мария', 'Елена', 'Ольга', 'Ирина', 'Наталья'].includes(treeFirstnames[i % 13]);
  const surname = treeLastnames[(i + Math.floor(i / 13) * 2) % 13];
  if (surname === 'Лесная') return female ? surname : 'Лесной';
  return female ? (surname.endsWith('а') ? surname : surname + 'а') : surname.replace(/а$/, '');
};
// The original design provides 52 ornament positions, from the crown to the lowest branches.
const wishes = Array.from({length: 52}, (_, i) => ({id: i + 1, text: greetings[i % greetings.length], created_at: '2023-12-25T12:00:00Z', user: {id: i + 101, firstname: treeFirstnames[i % 13], lastname: treeLastname(i), city: cities[i % 5], avatar: attachment(`/images/avatar${i % 6 + 1}.png`)}}));
const messages = ['Москва на связи! С наступающим!', 'Краснодар передаёт тёплый привет!', 'Готовы отправляться в новогоднее путешествие?', 'Пусть сбываются самые смелые мечты!', 'Свободный присоединяется к поздравлениям!'].map((text, i) => ({id: i + 1, text, created_at: '2023-12-25T12:00:00Z', user: people[i]}));
const files = ['moscow', 'krasnodar', 'rostov', 'tumen', 'svb'];
const videos = people.slice(0, 3).map((person, i) => ({id: i + 1, user: person, video: attachment(`/videos/${files[i]}.mp4`), created_at: '2023-12-25T12:00:00Z', likes: Array.from({length: 8 + i * 3}, (_, n) => ({user_id: n + 20, video_id: i + 1}))}));
const stories = ['Традиции, которые нас объединяют', 'Новогоднее путешествие', 'Время загадывать желания'].map((title, i) => ({id: i + 1, content: {type: ['Главная история', 'Большая картинка справа', 'Маленькие картинки'][i], title, shortQuote: 'Самые тёплые воспоминания начинаются с простых вещей.', mainQuote: 'Новый год — время быть вместе', texts: ['Демонстрационная история: наряжаем ёлку, собираем друзей и делимся добрыми пожеланиями.', 'В каждом городе есть свои праздничные традиции. Вместе они складываются в большое новогоднее путешествие.'], author: `${people[i].firstname} ${people[i].lastname}`, authorPositions: ['Участник демоверсии'], region: cities[i].title}, photos: [attachment(`/images/storiesImages/0${i + 4}.png`)]}));
const copy = value => structuredClone(value);
function reward(cause, amount = 3) {
  user.score += amount; regions[0].score += amount;
  api.on.scoreChange?.({userId: user.id, score: user.score, cause});
  api.on.globalScoreChange?.(copy(regions));
  return {userId: user.id, score: user.score, cause};
}
export const setAuthTokens = () => {};
export const api = {
  on: {}, refreshAuth: async () => true,
  auth: {getProfile: async () => copy(user), loginViaPassword: async () => ({}), registerUser: async () => true, logoutUser: async () => true},
  scoring: {getCitiesScore: async () => copy(regions)},
  wishtree: {getLastWishes: async () => copy(wishes)},
  chat: {getLastMessages: async () => copy(messages)},
  text: {getText: async () => []}, config: {getConfigs: async () => []},
  cityvideo: {getVideos: async () => [...cities.map((city, i) => ({key: city.title, video: attachment(`/videos/${files[i]}.mp4`)})), {key: 'Главная', video: attachment('/videos/moscow.mp4')}]},
  story: {getStories: async () => copy(stories)},
  user: {
    getLeaders: async ({city_id} = {}) => copy(people.filter(p => !city_id || p.city.id === city_id)),
    setData: async data => {user = {...user, ...data, city: cities.find(c => c.id === data.city_id)}; return copy(user)},
    setAvatar: async ({avatar}) => {user.avatar = attachment(URL.createObjectURL(avatar)); return copy(user)},
  },
  activity: {
    finishQuiz: async ({score}) => {user.received_bonuses.quiz_score = score; return reward('quiz', score)},
    finishXylophone: async ({score}) => {user.received_bonuses.xylophone_score = score; return reward('xylophone', score)},
    checkStory: async ({story_id}) => {user.received_bonuses.stories[story_id] = true; return reward('story')},
    checkCityVideo: async ({city_id}) => {user.received_bonuses.city_video[city_id] = true; return reward('city_video')},
    spinFortuneWheel: async () => {user.santa_gift_to = people[3]; reward('wheel'); return copy(people[3])},
  },
  socket: {
    addMessage: async text => {const message = {id: messages.length + 1, text, created_at: new Date().toISOString(), user: copy(user)}; messages.push(message); api.on.messageCreated?.(copy(message)); reward('chat'); return true},
    addWish: async text => {const message = {id: Math.max(...wishes.map(w => w.id)) + 1, text, created_at: new Date().toISOString(), user: copy(user)}; const oldest = wishes.shift(); if (oldest) api.on.wishDeleted?.(oldest.id); wishes.push(message); api.on.wishCreated?.(copy(message)); reward('wish'); return true},
    likeWishvideo: async id => {const v = videos.find(v => v.id === id); v.likes.push({user_id: user.id, video_id: id}); api.on.videoLikeChange?.(copy(v)); return copy(v)},
    unlikeWishvideo: async id => {const v = videos.find(v => v.id === id); v.likes = v.likes.filter(l => l.user_id !== user.id); api.on.videoLikeChange?.(copy(v)); return copy(v)},
  },
  wishvideo: {
    getLastWishes: async () => copy(videos),
    createWishVideo: async ({video}) => {const v = {id: videos.length + 1, user: copy(user), video: attachment(URL.createObjectURL(video)), created_at: new Date().toISOString(), likes: []}; videos.push(v); api.on.videoCreated?.(copy(v)); return copy(v)},
  },
};
