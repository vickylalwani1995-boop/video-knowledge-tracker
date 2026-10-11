import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  extractUrl, extractUrls, detectPlatform, normalizeUrl, suggestTopics, createVideo, advance, createExperiment,
  setExperimentStatus, emptyState, periodStats, topicStats, blindSpots, learningStreak, todaysPicks,
  projectPlaybook, totalXp, levelFor, findDuplicate, mergeState,
} from '../core.js';

const DAY = 86400000;
const NOW = new Date('2026-10-11T15:00:00').getTime();

test('extractUrl pulls the link out of Instagram share text', () => {
  assert.equal(
    extractUrl('Check out this reel https://www.instagram.com/reel/C9abc_12/?igsh=MTV4 via @someone'),
    'https://www.instagram.com/reel/C9abc_12/?igsh=MTV4',
  );
  assert.equal(extractUrl('no link here'), '');
  assert.equal(extractUrl('(https://youtu.be/xyz).'), 'https://youtu.be/xyz');
});

test('detectPlatform', () => {
  assert.equal(detectPlatform('https://www.instagram.com/reel/abc/'), 'instagram');
  assert.equal(detectPlatform('https://youtu.be/abc'), 'youtube');
  assert.equal(detectPlatform('https://m.youtube.com/shorts/abc'), 'youtube');
  assert.equal(detectPlatform('https://example.com/x'), 'web');
});

test('normalizeUrl collapses share variants to one key', () => {
  const ig = 'https://www.instagram.com/reel/C9abc_12/';
  assert.equal(normalizeUrl('https://instagram.com/reel/C9abc_12/?igsh=MTV4'), ig);
  assert.equal(normalizeUrl('https://www.instagram.com/reels/C9abc_12'), ig);
  assert.equal(normalizeUrl('https://www.instagram.com/someuser/reel/C9abc_12/?utm_source=ig'), ig);
  const yt = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
  assert.equal(normalizeUrl('https://youtu.be/dQw4w9WgXcQ?si=abc'), yt);
  assert.equal(normalizeUrl('https://www.youtube.com/shorts/dQw4w9WgXcQ'), yt);
  assert.equal(normalizeUrl('https://m.youtube.com/watch?v=dQw4w9WgXcQ&t=10'), yt);
});

test('suggestTopics finds the right buckets without false "ai" hits', () => {
  assert.deepEqual(suggestTopics('How to get cited in AI Overviews and Perplexity').slice(0, 1), ['geo']);
  assert.ok(suggestTopics('Meta Ads Andromeda update: stop using ABO').includes('meta'));
  assert.ok(suggestTopics('PMax negative keywords trick').includes('google'));
  assert.ok(!suggestTopics('Training your team to maintain quality').includes('ai'));
  assert.ok(suggestTopics('This AI tool writes scripts').includes('ai'));
  assert.deepEqual(suggestTopics(''), []);
});

test('video lifecycle timestamps', () => {
  let v = createVideo({ url: 'https://youtu.be/a', topics: ['seo', 'seo'] }, NOW);
  assert.deepEqual(v.topics, ['seo']);
  assert.equal(v.stage, 'saved');
  v = advance(v, 'learned', { insight: 'x' }, NOW + 5);
  assert.equal(v.watchedAt, NOW + 5);
  assert.equal(v.learnedAt, NOW + 5);
  v = advance(v, 'saved', {}, NOW + 10);
  assert.equal(v.watchedAt, null);
  assert.equal(v.learnedAt, null);
});

function fixture() {
  const s = emptyState();
  s.projects.push({ id: 'p1', name: 'My Website' });
  const mk = (topics, addedDaysAgo, stage, learnedDaysAgo) => {
    let v = createVideo({ url: `https://youtu.be/${Math.random()}`, topics }, NOW - addedDaysAgo * DAY);
    if (stage !== 'saved') v = advance(v, stage, { insight: `insight ${topics}` }, NOW - learnedDaysAgo * DAY);
    s.videos.push(v);
    return v;
  };
  const g1 = mk(['geo'], 12, 'learned', 2);
  mk(['geo'], 9, 'learned', 1);
  mk(['geo'], 8, 'learned', 0);
  mk(['aeo'], 5, 'learned', 3);
  mk(['aeo'], 4, 'watched', 3);
  mk(['meta'], 30, 'learned', 25);
  mk(['meta'], 2, 'saved');
  mk(['google'], 3, 'saved');
  mk(['google'], 1, 'saved');
  let e = createExperiment({ videoId: g1.id, projectId: 'p1', plan: 'Add FAQ block' }, NOW - DAY);
  e = setExperimentStatus(e, 'won', '+3 AI Overview citations', NOW);
  s.experiments.push(e);
  return s;
}

test('periodStats over the last 10 days', () => {
  const st = periodStats(fixture(), 10, NOW);
  assert.equal(st.learned, 4);   // 3 GEO + 1 AEO; the Meta one was 25 days ago
  assert.equal(st.watched, 5);
  assert.equal(st.applied, 1);
  assert.equal(st.won, 1);
  assert.equal(st.backlog, 3);
});

test('topicStats answers "how many GEO vs AEO did I learn"', () => {
  const rows = Object.fromEntries(topicStats(fixture(), 10, NOW).map(r => [r.id, r]));
  assert.equal(rows.geo.learned, 3);
  assert.equal(rows.aeo.learned, 1);
  assert.equal(rows.aeo.watched, 2);
  assert.equal(rows.geo.applied, 1);
  assert.equal(rows.geo.won, 1);
  assert.equal(rows.google.backlog, 2);
});

test('blindSpots flags topics saved but never learned', () => {
  assert.deepEqual(blindSpots(fixture(), 30, NOW).map(r => r.id), ['google']);
});

test('learningStreak counts consecutive days', () => {
  assert.equal(learningStreak(fixture(), NOW), 4); // today, -1, -2, -3
  assert.equal(learningStreak(emptyState(), NOW), 0);
});

test('todaysPicks prefers neglected topics and spreads them out', () => {
  const picks = todaysPicks(fixture(), 3, NOW);
  assert.equal(picks.length, 3);
  assert.equal(picks[0].topics[0], 'google'); // 0 learned recently, oldest first
  assert.ok(picks.every(p => p.stage === 'saved'));
});

test('duplicates are detected across share variants', () => {
  const s = emptyState();
  s.videos.push(createVideo({ url: 'https://www.instagram.com/reel/XYZ/?igsh=1' }));
  assert.ok(findDuplicate(s, 'https://instagram.com/reel/XYZ'));
  assert.equal(findDuplicate(s, 'https://instagram.com/reel/OTHER'), null);
});

test('playbook export and xp', () => {
  const s = fixture();
  const md = projectPlaybook(s, 'p1');
  assert.match(md, /# My Website — Playbook/);
  assert.match(md, /Add FAQ block/);
  assert.match(md, /\+3 AI Overview citations/);
  assert.ok(totalXp(s) > 0);
  assert.equal(levelFor(0).level, 1);
  assert.equal(levelFor(10).level, 2);
});

test('mergeState unions by id', () => {
  const a = fixture();
  const b = emptyState();
  b.projects.push({ id: 'p2', name: 'Client A' });
  const m = mergeState(a, b);
  assert.equal(m.projects.length, 2);
  assert.equal(m.videos.length, a.videos.length);
});

test('extractUrls handles a pasted list of YouTube links and drops duplicates', () => {
  const list = 'https://youtu.be/AAA\nhttps://www.youtube.com/watch?v=BBB&t=5\nhttps://www.youtube.com/watch?v=AAA (dup)';
  assert.deepEqual(extractUrls(list), ['https://youtu.be/AAA', 'https://www.youtube.com/watch?v=BBB&t=5']);
});
