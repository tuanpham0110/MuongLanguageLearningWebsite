import test from 'node:test';
import assert from 'node:assert/strict';
import { PUBLIC_KNOWLEDGE_ARTICLES, PUBLIC_RESOURCES, publicHandbook } from '../src/modules/content/public-resources.js';

test('resource guides preserve existing articles, edits and live vocabulary without duplication', () => {
    const original = { id: 'existing', title: 'Existing article', body: [{ p: 'Existing content' }] };
    const edited = { ...PUBLIC_KNOWLEDGE_ARTICLES[0], title: 'Administrator version' };
    const content = { HANDBOOK: [original, edited], VOCABULARY: [{ id: 'word' }], SENTENCES: [{ id: 'sentence' }] };
    const before = structuredClone(content);
    const result = publicHandbook(content);
    assert.equal(result.articles.length, 4);
    assert.equal(result.articles[0], original);
    assert.equal(result.articles[1], edited);
    assert.equal(result.vocabulary, content.VOCABULARY);
    assert.equal(result.sentences, content.SENTENCES);
    assert.deepEqual(content, before);
    assert.equal(publicHandbook({}).articles.length, 3);
});

test('catalog points to attributed public HTTPS sources and valid related reading', () => {
    assert.equal(new Set(PUBLIC_RESOURCES.map((r) => r.id)).size, 6);
    assert.equal(new Set(PUBLIC_KNOWLEDGE_ARTICLES.map((a) => a.id)).size, 3);
    for (const resource of PUBLIC_RESOURCES) {
        assert.equal(new URL(resource.url).protocol, 'https:');
        assert.ok(resource.title && resource.provider && resource.dialect && resource.access);
        assert.ok(resource.steps.length > 0);
        assert.ok(PUBLIC_KNOWLEDGE_ARTICLES.some((a) => a.id === resource.relatedArticleId));
    }
    for (const article of PUBLIC_KNOWLEDGE_ARTICLES) {
        assert.equal(article.draft, false);
        const citations = article.body.flatMap((b) => b.references ?? []);
        assert.ok(citations.length > 0);
        for (const ref of citations) assert.equal(new URL(ref.url).protocol, 'https:');
    }
    const dataset = PUBLIC_RESOURCES.find((r) => r.id === 'tu-vung-30-tho-ngu');
    assert.match(dataset.access, /cấm sử dụng thương mại/);
    for (const video of PUBLIC_RESOURCES.filter((r) => r.url.includes('youtube.com'))) assert.match(video.dialect, /chưa nêu rõ/);
    const toneArticle = PUBLIC_KNOWLEDGE_ARTICLES.find((a) => a.id === 'muong-nghe-thanh-dieu-kim-thuong');
    assert.match(JSON.stringify(toneArticle), /Không dùng các con số này/);
    assert.match(JSON.stringify(toneArticle), /_AUD.wav/);
    assert.match(JSON.stringify(toneArticle), /_EGG.wav/);
});

test('anonymous handbook API serves new knowledge and resources with existing database content', async (t) => {
    Object.assign(process.env, {
        NODE_ENV: 'test', DATABASE_URL: 'postgresql://offline:offline@127.0.0.1:1/unit_test',
        JWT_SECRET: 'isolated-public-resources-test-secret-32-characters',
    });
    const { default: express } = await import('express');
    const { prisma } = await import('../src/lib/prisma.js');
    const { contentRoutes } = await import('../src/modules/content/content.routes.js');
    const { invalidateContent } = await import('../src/modules/content/content.service.js');
    for (const name of ['stage', 'lesson', 'lessonItem', 'item', 'vocabulary', 'sentence', 'handbookArticle']) {
        const original = prisma[name];
        prisma[name] = { findMany: async () => name === 'handbookArticle' ? [{ id: 'db-article', title: 'Kept database article', position: 0, body: [] }] : [] };
        t.after(() => { prisma[name] = original; });
    }
    invalidateContent();
    const app = express();
    app.use('/api/content', contentRoutes);
    const server = app.listen(0, '127.0.0.1');
    await new Promise((resolve) => server.once('listening', resolve));
    t.after(() => { invalidateContent(); server.closeAllConnections(); server.close(); });
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/content/handbook`);
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.equal(result.articles[0].id, 'db-article');
    assert.equal(result.articles.length, 4);
    assert.equal(result.resources.length, 6);
    assert.deepEqual(result.vocabulary, []);
    assert.deepEqual(result.sentences, []);
});
