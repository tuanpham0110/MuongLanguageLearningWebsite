import test from 'node:test';
import assert from 'node:assert/strict';
import { hookHarness, nodes, textOf } from './helpers/hooks.js';

const resource = {
    id: 'public-lesson', title: 'Bài học tiếng Mường', provider: 'Đài địa phương',
    type: 'Bài học', url: 'https://example.org/bai-hoc', description: 'Học từ bài giảng công khai.',
    dialect: 'Mường Bi', access: 'Xem miễn phí', steps: ['Nghe và ghi lại từ quen.'],
    relatedArticleId: 'learn-with-sources',
};
const article = {
    id: 'learn-with-sources', category: 'Kiến thức', title: 'Học cùng nguồn công khai',
    excerpt: 'Đọc và đối chiếu tài liệu.', minutes: 3, body: [{ p: 'Ghi rõ vùng tiếng khi học.' }],
};

function handbookHarness(query = '', overrides = {}) {
    let params = new URLSearchParams(query);
    const state = {
        data: { resources: [resource, { ...resource, id: 'dictionary', title: 'Từ vựng so sánh', type: 'Tra cứu', provider: 'Tư liệu nghiên cứu', dialect: '30 thổ ngữ', relatedArticleId: undefined }], articles: [article], vocabulary: [], sentences: [] },
        error: null, loading: false, reload: () => {}, ...overrides,
    };
    const h = hookHarness('../../src/pages/Handbook.jsx', {
        'react-router-dom': { useSearchParams: () => [params, (next) => { params = new URLSearchParams(next); }] },
        '../components/ui.jsx': { Button: 'Button', EmptyState: 'EmptyState', ErrorState: 'ErrorState', Skeleton: 'Skeleton', TextField: 'TextField' },
        '../components/Icon.jsx': { __esModule: true, default: 'Icon' },
        '../components/SourceCitation.jsx': { __esModule: true, default: 'SourceCitation' },
        '../components/learn/SpeakButton.jsx': { __esModule: true, default: 'SpeakButton' },
        '../services/api.js': { learning: {} },
        '../hooks/useAsync.js': { __esModule: true, default: () => state },
        '../styles/resources.css': {},
    });
    return { ...h, params: () => params, state };
}
const cards = (tree) => nodes(tree, (n) => typeof n.type === 'function' && n.type.name === 'PublicResourceCard');
const button = (tree, label) => nodes(tree, (n) => ['button', 'Button'].includes(n.type) && textOf(n).trim() === label)[0];

test('public resources can be opened directly, filtered by type, and searched without accents', () => {
    const h = handbookHarness('muc=hoc-lieu');
    let tree = h.render({});
    assert.equal(cards(tree).length, 2);
    assert.match(textOf(tree), /2\/2 học liệu/);
    button(tree, 'Tra cứu').props.onClick();
    tree = h.render({});
    assert.equal(cards(tree).length, 1);
    assert.equal(cards(tree)[0].props.resource.id, 'dictionary');
    button(tree, 'Tất cả').props.onClick();
    nodes(tree, (n) => n.type === 'TextField')[0].props.onChange({ target: { value: 'DAI DIA PHUONG' } });
    tree = h.render({});
    assert.equal(cards(tree).length, 1);
    assert.equal(cards(tree)[0].props.resource.id, 'public-lesson');
    nodes(tree, (n) => n.type === 'TextField')[0].props.onChange({ target: { value: '30 tho ngu' } });
    tree = h.render({});
    assert.equal(cards(tree)[0].props.resource.id, 'dictionary');
    h.unmount();
});

test('related articles retain the resource catalog as their back destination and old article links work', () => {
    const h = handbookHarness('muc=hoc-lieu');
    let tree = h.render({});
    cards(tree)[0].props.onRead();
    assert.equal(h.params().get('bai'), article.id);
    tree = h.render({});
    assert.equal(nodes(tree, (n) => n.type === 'h1').map(textOf)[0], article.title);
    button(tree, 'Học liệu công khai').props.onClick();
    assert.equal(h.params().get('muc'), 'hoc-lieu');
    assert.equal(h.params().get('bai'), null);
    assert.equal(cards(h.render({})).length, 2);
    h.unmount();

    const old = handbookHarness(`bai=${article.id}`);
    tree = old.render({});
    assert.equal(nodes(tree, (n) => n.type === 'h1').map(textOf)[0], article.title);
    button(tree, 'Tất cả bài viết').props.onClick();
    assert.equal(old.params().toString(), '');
    old.unmount();
});

test('resource cards show attribution and study steps and only link to HTTPS sources', () => {
    const h = handbookHarness();
    let tree = h.render({ resource }, 'PublicResourceCard');
    const link = nodes(tree, (n) => n.type === 'a')[0];
    assert.equal(link.props.href, resource.url);
    assert.equal(link.props.target, '_blank');
    assert.equal(link.props.rel, 'noopener noreferrer');
    assert.match(link.props['aria-label'], /tab mới/);
    assert.match(textOf(tree), /Đài địa phương/);
    assert.match(textOf(tree), /Mường Bi/);
    assert.match(textOf(tree), /Nghe và ghi lại từ quen/);
    for (const url of ['javascript:alert(1)', 'data:text/html,test', 'http://example.org', 'invalid']) {
        tree = h.render({ resource: { ...resource, url } }, 'PublicResourceCard');
        assert.equal(nodes(tree, (n) => n.type === 'a').length, 0);
    }
    h.unmount();
});

test('resource search reports no results, loading and recoverable fetch errors clearly', () => {
    const h = handbookHarness('muc=hoc-lieu');
    let tree = h.render({});
    nodes(tree, (n) => n.type === 'TextField')[0].props.onChange({ target: { value: 'not-a-source' } });
    tree = h.render({});
    assert.equal(cards(tree).length, 0);
    assert.equal(nodes(tree, (n) => n.type === 'EmptyState')[0].props.title, 'Chưa tìm thấy học liệu');
    h.state.loading = true;
    tree = h.render({});
    assert.equal(nodes(tree, (n) => n.type === 'Skeleton').length, 3);
    let retries = 0;
    h.state.loading = false;
    h.state.error = new Error('offline');
    h.state.reload = () => { retries++; };
    tree = h.render({});
    nodes(tree, (n) => n.type === 'ErrorState')[0].props.onRetry();
    assert.equal(retries, 1);
    h.unmount();
});
