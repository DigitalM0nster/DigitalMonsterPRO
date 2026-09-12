import test from 'node:test';
import assert from 'node:assert/strict';
import {api} from './mockApi.js';

test('the complete tree remains at 52 visible wishes after repeated submissions', async () => {
  const rendered = await api.wishtree.getLastWishes();
  assert.equal(rendered.length, 52);
  assert.equal(new Set(rendered.map(w => w.user.id)).size, 52);
  assert.equal(new Set(rendered.map(w => w.user.avatar.url)).size, 6);
  api.on.wishDeleted = id => rendered.splice(rendered.findIndex(w => w.id === id), 1);
  api.on.wishCreated = wish => rendered.push(wish);
  for (let i = 0; i < 55; i++) await api.socket.addWish(`Пожелание ${i}`);
  assert.equal(rendered.length, 52);
  assert.equal(rendered.at(-1).text, 'Пожелание 54');
  assert.deepEqual(rendered, await api.wishtree.getLastWishes());
});

test('demo games, regional video rewards and contest likes update the original UI contract', async () => {
  const before = await api.auth.getProfile();
  await api.activity.finishQuiz({score: 9});
  await api.activity.finishXylophone({score: 6});
  await api.activity.checkCityVideo({city_id: 1});
  const after = await api.auth.getProfile();
  assert.equal(after.score, before.score + 18);
  assert.equal(after.received_bonuses.quiz_score, 9);
  assert.equal(after.received_bonuses.xylophone_score, 6);
  assert.equal(after.received_bonuses.city_video[1], true);
  const video = (await api.wishvideo.getLastWishes())[0];
  const liked = await api.socket.likeWishvideo(video.id);
  assert.equal(liked.likes.length, video.likes.length + 1);
  assert.equal((await api.socket.unlikeWishvideo(video.id)).likes.length, video.likes.length);
  assert.ok((await api.activity.spinFortuneWheel()).firstname);
  assert.equal((await api.user.getLeaders({city_id: 2})).length, 1);
});
