import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hookHarness, nodes, textOf } from './helpers/hooks.js';

test('SEC-01 missing email delivery disables registration while leaving social sign-in available', async () => {
    let calls = 0;
    const h = hookHarness('../../src/pages/auth/Register.jsx', {
        'react-router-dom': { Link: 'Link', useLocation: () => ({}), useNavigate: () => () => {} },
        '../../components/ui.jsx': { Button: 'Button', Checkbox: 'Checkbox', TextField: 'TextField' },
        '../../context/AuthContext.jsx': { useAuth: () => ({ register: async () => { calls++; } }) },
        '../../context/ToastContext.jsx': { useToast: () => () => {} },
        './shared.jsx': { FormAlert: 'FormAlert', SocialLogin: 'SocialLogin', isEmail: () => true, validatePassword: () => '' },
        '../../hooks/useMeta.js': { __esModule: true, default: () => ({ emailRegistration: false }) },
    });
    const tree = h.render();
    assert.equal(nodes(tree, (n) => n.type === 'Button' && n.props.type === 'submit')[0].props.disabled, true);
    assert.equal(nodes(tree, (n) => n.type === 'SocialLogin').length, 1);
    assert.match(textOf(tree), /tạm thời chưa khả dụng/);
    await nodes(tree, (n) => n.type === 'form')[0].props.onSubmit({ preventDefault() {} });
    assert.equal(calls, 0);
    h.unmount();
});
