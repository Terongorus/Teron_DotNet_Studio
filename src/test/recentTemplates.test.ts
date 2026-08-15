import * as assert from 'assert';
import { addRecentTemplate, getRecentTemplates, MAX_RECENT_TEMPLATES, MementoLike } from '../newProject/recentTemplates';

class FakeMemento implements MementoLike {
    private store = new Map<string, unknown>();

    get<T>(key: string, defaultValue: T): T {
        return (this.store.has(key) ? this.store.get(key) : defaultValue) as T;
    }

    async update(key: string, value: unknown): Promise<void> {
        this.store.set(key, value);
    }
}

suite('recentTemplates', () => {
    test('addRecentTemplate stores newest first', async () => {
        const state = new FakeMemento();

        await addRecentTemplate(state, { shortName: 'console', name: 'Console App' });
        await addRecentTemplate(state, { shortName: 'classlib', name: 'Class Library' });

        const items = getRecentTemplates(state);
        assert.strictEqual(items.length, 2);
        assert.strictEqual(items[0].shortName, 'classlib');
        assert.strictEqual(items[1].shortName, 'console');
    });

    test('addRecentTemplate dedupes by shortName and moves to front', async () => {
        const state = new FakeMemento();

        await addRecentTemplate(state, { shortName: 'console', name: 'Console App' });
        await addRecentTemplate(state, { shortName: 'classlib', name: 'Class Library' });
        await addRecentTemplate(state, { shortName: 'console', name: 'Console App' });

        const items = getRecentTemplates(state);
        assert.strictEqual(items.length, 2);
        assert.strictEqual(items[0].shortName, 'console');
        assert.strictEqual(items[1].shortName, 'classlib');
    });

    test('addRecentTemplate caps the list at MAX_RECENT_TEMPLATES', async () => {
        const state = new FakeMemento();

        for (let i = 0; i < MAX_RECENT_TEMPLATES + 3; i++) {
            await addRecentTemplate(state, { shortName: `short${i}`, name: `Template ${i}` });
        }

        const items = getRecentTemplates(state);
        assert.strictEqual(items.length, MAX_RECENT_TEMPLATES);
        assert.strictEqual(items[0].shortName, `short${MAX_RECENT_TEMPLATES + 2}`);
    });
});
