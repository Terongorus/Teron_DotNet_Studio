import * as assert from 'assert';
import { classifyTemplate, parseTemplateLanguages, primaryTemplateLanguage, parseTemplateTags, DotnetTemplate } from '../utils/templates';

function template(overrides: Partial<DotnetTemplate>): DotnetTemplate {
    return { name: 'Test', shortName: 'test', language: '[C#]', tags: '', ...overrides };
}

suite('templateClassification', () => {
    test('parseTemplateLanguages strips brackets and splits multi-language lists', () => {
        assert.deepStrictEqual(parseTemplateLanguages('[C#],F#,VB'), ['C#', 'F#', 'VB']);
        assert.deepStrictEqual(parseTemplateLanguages('[C#]'), ['C#']);
    });

    test('primaryTemplateLanguage returns the bracketed language, not just the first one', () => {
        assert.strictEqual(primaryTemplateLanguage('F#,[C#],VB'), 'C#');
        assert.strictEqual(primaryTemplateLanguage('[C#],F#,VB'), 'C#');
    });

    test('primaryTemplateLanguage falls back to the first language when nothing is bracketed', () => {
        assert.strictEqual(primaryTemplateLanguage('C#,F#'), 'C#');
    });

    test('parseTemplateTags splits the "/"-joined Tags column', () => {
        assert.deepStrictEqual(parseTemplateTags('Web/gRPC/API/Service'), ['Web', 'gRPC', 'API', 'Service']);
    });

    test('classifyTemplate splits real MAUI tags into platforms vs types', () => {
        const t = classifyTemplate(template({
            name: '.NET MAUI App',
            shortName: 'maui',
            language: '[C#]',
            tags: 'MAUI/Android/iOS/macOS/Mac Catalyst/Windows/Mobile/Tizen'
        }));

        assert.deepStrictEqual(t.platforms.sort(), ['Android', 'Mac Catalyst', 'Tizen', 'Windows', 'iOS', 'macOS'].sort());
        assert.deepStrictEqual(t.types.sort(), ['MAUI', 'Mobile'].sort());
        assert.strictEqual(t.primaryLanguage, 'C#');
        assert.deepStrictEqual(t.languages, ['C#']);
    });

    test('classifyTemplate finds no platform tags for a real ASP.NET Core template (Web/API/Service are all types)', () => {
        const t = classifyTemplate(template({ tags: 'Web/gRPC/API/Service' }));
        assert.deepStrictEqual(t.platforms, []);
        assert.deepStrictEqual(t.types.sort(), ['API', 'Service', 'Web', 'gRPC'].sort());
    });

    test('classifyTemplate injects Windows for known WinForms/WPF short names despite dotnet new list not tagging them', () => {
        const winforms = classifyTemplate(template({ shortName: 'winforms', tags: 'Common/WinForms' }));
        assert.deepStrictEqual(winforms.platforms, ['Windows']);
        assert.deepStrictEqual(winforms.types.sort(), ['Common', 'WinForms'].sort());

        const wpf = classifyTemplate(template({ shortName: 'wpf', tags: 'Common/WPF' }));
        assert.deepStrictEqual(wpf.platforms, ['Windows']);

        // A template that just happens to have "Common" in its tags but isn't a known
        // Windows-only short name should NOT get the Windows override.
        const console_ = classifyTemplate(template({ shortName: 'console', tags: 'Common/Console' }));
        assert.deepStrictEqual(console_.platforms, []);
    });

    test('classifyTemplate resolves shortName via the first comma-separated short name', () => {
        const t = classifyTemplate(template({ shortName: 'webapp,razor' }));
        assert.strictEqual(t.shortName, 'webapp');
    });
});
